import { describe, expect, it } from "vitest";
import { seed } from "../src/domain/seed";
import type { Database } from "../src/domain/model";
import { today, uid } from "../src/domain/logic";
import { initializeCommercial } from "../src/commercial/migration";
import {
  blankInvoice,
  issueInvoice,
  saveInvoice,
} from "../src/commercial/repository";
import type { Invoice } from "../src/commercial/model";
import { invoiceTotals } from "../src/commercial/calculations";
import {
  saveCredit,
  submitApproval,
  decideApproval,
  issueCredit,
} from "../src/operations/repository";
import { invoicePosition } from "../src/operations/calculations";

function issued() {
  const db = seed();
  initializeCommercial(db);
  const draft = blankInvoice(db.clients[0].id, db.projects[0].id);
  draft.lines[0].description = "QA tiny taxable fit-out adjustment";
  draft.lines[0].rate = "1.00";
  saveInvoice(db, draft);
  issueInvoice(db, draft.id);
  return { db, invoice: db.invoices.find((i) => i.id === draft.id)! };
}
function credit(db: Database, invoice: Invoice, amount: string, itemId = "") {
  const draft = saveCredit(
    db,
    {
      id: uid(),
      number: "",
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      projectId: invoice.projectId,
      date: today(),
      reason: "QA independent rounding regression",
      gross: amount,
      itemId,
      status: "Draft",
    },
    "person-0",
  );
  const approval = submitApproval(
    db,
    "Credit Note",
    draft.id,
    "Internal",
    "person-0",
    "person-1",
  );
  decideApproval(
    db,
    approval.id,
    true,
    "QA reviewed issued VAT basis",
    "person-1",
  );
  issueCredit(db, draft.id, "person-0");
  return db.operations!.credits.find((c) => c.id === draft.id)!;
}
describe("Agent 3 independent repeated-credit and historical-basis requirements", () => {
  it.each(["amount only", "mixed item/amount"])(
    "six tiny credits and final remainder reconcile: %s",
    (mode) => {
      const { db, invoice } = issued();
      const before = JSON.stringify(invoice);
      expect(invoiceTotals(invoice)).toMatchObject({
        net: 100n,
        vat: 5n,
        grand: 105n,
      });
      for (let index = 0; index < 6; index++) {
        const c = credit(
          db,
          invoice,
          "0.11",
          mode === "mixed item/amount" && index % 2 === 0
            ? invoice.lines[0].id
            : "",
        );
        expect(BigInt(c.net!)).toBeGreaterThanOrEqual(0n);
        expect(BigInt(c.vat!)).toBeGreaterThanOrEqual(0n);
        expect(
          db.operations!.credits.reduce(
            (sum, row) => sum + BigInt(row.vat!),
            0n,
          ),
        ).toBeLessThanOrEqual(5n);
      }
      expect(
        db.operations!.credits.reduce((sum, row) => sum + BigInt(row.vat!), 0n),
      ).toBe(3n);
      credit(db, invoice, "0.39");
      expect(
        db.operations!.credits.reduce((sum, row) => sum + BigInt(row.vat!), 0n),
      ).toBe(5n);
      expect(
        db.operations!.credits.reduce((sum, row) => sum + BigInt(row.net!), 0n),
      ).toBe(100n);
      expect(invoicePosition(db, invoice)).toBe(0n);
      expect(JSON.stringify(invoice)).toBe(before);
    },
  );
  it("legacy issued item eligibility uses a historical basis or fails closed explicitly without rewriting the invoice", () => {
    const { db, invoice } = issued();
    // Old last-row allocation: 3 one-fils exclusive rows, discount two fils.
    // Historic line 2 retained one fils; bounded redistribution now prices it zero.
    invoice.lines = Array.from({ length: 3 }, (_, n) => ({
      ...invoice.lines[0],
      id: uid(),
      description: `QA legacy billed item ${n}`,
      quantity: "1",
      rate: "0.01",
      tax: "Exclusive" as const,
    }));
    invoice.discount = "0.02";
    invoice.snapshot = {
      customer: invoice.snapshot!.customer,
      company: invoice.snapshot!.company,
      project: invoice.snapshot!.project,
      quotation: invoice.snapshot!.quotation,
      subtotal: "3",
      discount: "2",
      net: "1",
      vat: "0",
      grand: "1",
    };
    const before = JSON.stringify(invoice);
    let failure: unknown;
    try {
      const c = credit(db, invoice, "0.01", invoice.lines[1].id);
      expect(c.status).toBe("Issued");
      expect(c.net).toBe("1");
      expect(c.vat).toBe("0");
    } catch (error) {
      failure = error;
    }
    expect(JSON.stringify(invoice)).toBe(before);
    if (failure) {
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(
        /legacy|historical|snapshot|original|basis/i,
      );
    }
  });
});
