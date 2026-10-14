import { describe, expect, it } from "vitest";
import { seed } from "../domain/seed";
import { initializeCommercial } from "./migration";
import { blankInvoice, saveInvoice, issueInvoice } from "./repository";
import {
  allocateDiscount,
  invoiceLineTotals,
  invoiceTotals,
} from "./calculations";
import { invoiceItemTotals } from "../operations/calculations";
import type { Invoice, TaxTreatment } from "./model";

function draft(rates = ["0.01", "0.01", "0.01"], discount = "0.02") {
  const db = seed();
  initializeCommercial(db);
  const invoice = blankInvoice(db.clients[0].id, db.projects[0].id);
  invoice.lines = rates.map((rate, index) => ({
    id: `discount-${index}`,
    description: "Rounding adjustment",
    quantity: "1",
    rate,
    tax: "Inclusive",
  }));
  invoice.discount = discount;
  return { db, invoice };
}

describe("capacity-bounded invoice discount correction (A3-005)", () => {
  it("calculates and issues three one-fils inclusive rows discounted by two fils", () => {
    const { db, invoice } = draft(),
      quotations = JSON.stringify(db.quotations);
    expect(invoiceTotals(invoice)).toEqual({
      subtotal: 3n,
      discount: 2n,
      net: 1n,
      vat: 0n,
      grand: 1n,
    });
    expect(invoiceLineTotals(invoice).map((line) => line.discount)).toEqual([
      0n,
      1n,
      1n,
    ]);
    saveInvoice(db, invoice);
    issueInvoice(db, invoice.id);
    expect(db.invoices[0].snapshot).toMatchObject({
      net: "1",
      vat: "0",
      grand: "1",
    });
    expect(JSON.stringify(db.quotations)).toBe(quotations);
  });
  it.each([
    { values: [1n, 1n, 1n], discount: 3n, shares: [1n, 1n, 1n] },
    { values: [100n, 100n, 100n], discount: 299n, shares: [99n, 100n, 100n] },
    { values: [1n, 1n, 1n, 0n], discount: 2n, shares: [0n, 1n, 1n, 0n] },
    { values: [1000n, 2000n], discount: 100n, shares: [33n, 67n] },
    { values: [0n, 0n], discount: 0n, shares: [0n, 0n] },
  ])(
    "allocates $discount fils within row capacity for $values",
    ({ values, discount, shares }) => {
      expect(allocateDiscount(values, discount)).toEqual(shares);
    },
  );
  it.each([
    { values: [1n], discount: 2n },
    { values: [-1n], discount: 0n },
    { values: [1n], discount: -1n },
  ])(
    "rejects invalid allocation $values / $discount",
    ({ values, discount }) => {
      expect(() => allocateDiscount(values, discount)).toThrow();
    },
  );
  it("conserves every fils and bounds each row across small amounts and discounts", () => {
    for (let a = 0n; a <= 5n; a++)
      for (let b = 0n; b <= 5n; b++)
        for (let c = 0n; c <= 5n; c++) {
          const values = [a, b, c, 0n],
            subtotal = a + b + c;
          for (let discount = 0n; discount <= subtotal; discount++) {
            const shares = allocateDiscount(values, discount);
            expect(shares.reduce((sum, n) => sum + n, 0n)).toBe(discount);
            expect(
              shares.every((n, index) => n >= 0n && n <= values[index]),
            ).toBe(true);
            expect(allocateDiscount(values, discount)).toEqual(shares);
          }
        }
  });
  it("shares identical discounted tax bases with item credits for mixed taxes and trailing zero", () => {
    const { invoice } = draft(["0.11", "0.09", "0.03", "0.07", "0"], "0.28");
    const taxes: TaxTreatment[] = [
      "Inclusive",
      "Exclusive",
      "Exempt",
      "Zero Rated",
      "Inclusive",
    ];
    invoice.lines.forEach((line, index) => (line.tax = taxes[index]));
    const rows = invoice.lines.map((line) =>
        invoiceItemTotals(invoice, line.id),
      ),
      total = invoiceTotals(invoice);
    expect(total).toMatchObject({ net: 2n, vat: 0n, grand: 2n });
    expect(rows.every((row) => row.net >= 0n && row.vat >= 0n)).toBe(true);
    for (const key of ["net", "vat", "grand"] as const)
      expect(rows.reduce((sum, row) => sum + row[key], 0n)).toBe(total[key]);
    expect(rows.at(-1)?.grand).toBe(0n);
  });
  it("preserves the exact full-discount zero calculation without permitting zero-total invoices", () => {
    const { db, invoice } = draft(undefined, "0.03");
    expect(invoiceTotals(invoice)).toMatchObject({
      net: 0n,
      vat: 0n,
      grand: 0n,
    });
    expect(() => saveInvoice(db, invoice)).toThrow("positive");
  });
  it("rejects invalid taxable input again at issuance before creating a snapshot", () => {
    const { db, invoice } = draft();
    saveInvoice(db, invoice);
    db.invoices[0].lines[0].rate = "-0.01";
    expect(() => issueInvoice(db, invoice.id)).toThrow();
    expect(db.invoices[0].status).toBe("Draft");
    expect(db.invoices[0].snapshot).toBeUndefined();
  });
  it("never recalculates existing issued totals, including a historical malformed snapshot", () => {
    const { db, invoice } = draft();
    saveInvoice(db, invoice);
    issueInvoice(db, invoice.id);
    const issued = db.invoices[0];
    const snapshot = { ...issued.snapshot!, net: "2", vat: "-1", grand: "1" };
    const legacy: Invoice = { ...issued, snapshot };
    expect(invoiceTotals(legacy)).toMatchObject({
      net: 2n,
      vat: -1n,
      grand: 1n,
    });
    expect(legacy.snapshot).toEqual(snapshot);
    expect(() => saveInvoice(db, issued)).toThrow("immutable");
  });
});
