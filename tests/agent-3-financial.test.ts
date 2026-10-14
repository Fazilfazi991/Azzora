import { afterEach, describe, expect, it, vi } from "vitest";
import { seed } from "../src/domain/seed";
import { localRepository } from "../src/domain/repository";
import { today, uid } from "../src/domain/logic";
import { blankLine, changeQuotationStatus } from "../src/quotation/repository";
import { totals } from "../src/quotation/calculations";
import { initializeCommercial } from "../src/commercial/migration";
import {
  emptyFilter,
  type Payment,
  type Expense,
} from "../src/commercial/model";
import {
  blankInvoice,
  saveInvoice,
  issueInvoice,
  invoiceFromQuotation,
  convertQuotation,
  postPayment,
  reversePayment,
  saveExpense,
} from "../src/commercial/repository";
import {
  invoiceTotals,
  balanceDue,
  financials,
  amountString,
} from "../src/commercial/calculations";
import { reportData, statementData } from "../src/commercial/reports-data";

afterEach(() => vi.unstubAllGlobals());

function fitout() {
  const db = seed();
  initializeCommercial(db);
  const q = db.quotations[0];
  q.date = today();
  q.customer.name = "QA Al Quoz Architectural Interiors LLC";
  q.project.name = "QA DIFC Executive Office Fit-Out";
  q.sections = [
    {
      id: uid(),
      number: "1",
      title: "Interior fit-out",
      rows: [
        {
          ...blankLine(),
          number: "1.1",
          description: "Supply and install bespoke joinery",
          quantity: "120",
          rate: "2100",
        },
      ],
    },
  ];
  q.discount = "12000";
  q.vatEnabled = true;
  q.vatPercentage = "5";
  q.payments = [
    {
      id: uid(),
      number: "1",
      description: "Full scope",
      percentage: "100",
      notes: "",
    },
  ];
  changeQuotationStatus(db, q.id, "Finalized");
  changeQuotationStatus(db, q.id, "Accepted");
  convertQuotation(db, q.id, q.projectId);
  const draft = invoiceFromQuotation(db, q.id);
  saveInvoice(db, draft);
  issueInvoice(db, draft.id);
  const invoice = db.invoices.find((i) => i.id === draft.id)!;
  const payment = (amount: string): Payment => ({
    id: uid(),
    number: "",
    customerId: q.customerId,
    projectId: q.projectId,
    invoiceId: invoice.id,
    amount,
    date: today(),
    method: "Bank Transfer",
    reference: `QA-ENBD-${uid()}`,
    bank: "QA Emirates NBD",
    notes: "Fictional QA transaction",
    postingKey: uid(),
    attachments: [],
    createdAt: new Date().toISOString(),
  });
  return { db, q, invoice, payment };
}

describe("Agent 3 independent UAE fit-out financial integrity", () => {
  it("reconciles discounted quotation, accepted contract and invoice net/VAT/gross", () => {
    const { db, q, invoice } = fitout();
    expect(totals(q)).toEqual({
      subtotal: 25200000n,
      vat: 1200000n,
      grand: 25200000n,
    });
    expect(invoiceTotals(invoice)).toMatchObject({
      net: 24000000n,
      vat: 1200000n,
      grand: 25200000n,
    });
    expect(db.contracts[0]).toMatchObject({
      net: "24000000",
      vat: "1200000",
      gross: "25200000",
    });
  });
  it("allocates partial and final receipts without losing fils", () => {
    const { db, invoice, payment } = fitout();
    postPayment(db, payment("75600.25"));
    expect(balanceDue(db, invoice)).toBe(17639975n);
    postPayment(db, payment("176399.75"));
    expect(balanceDue(db, invoice)).toBe(0n);
    expect(financials(db, emptyFilter).collected).toBe(25200000n);
    expect(() => postPayment(db, payment("0.01"))).toThrow("balance");
  });
  it("rejects repeated receipt posting without creating a duplicate", () => {
    const { db, payment } = fitout();
    const receipt = payment("1000");
    postPayment(db, receipt);
    expect(() => postPayment(db, receipt)).toThrow("Duplicate");
    expect(db.payments).toHaveLength(1);
  });
  it("reversal reopens the receivable and reconciles the statement and dashboard source", () => {
    const { db, invoice, payment } = fitout();
    const receipt = postPayment(db, payment("252000"));
    reversePayment(db, receipt.id, "QA fictional transfer rejected");
    expect(balanceDue(db, invoice)).toBe(25200000n);
    expect(financials(db, emptyFilter)).toMatchObject({
      collected: 0n,
      outstanding: 25200000n,
    });
    expect(
      statementData(db, {
        ...emptyFilter,
        customerId: invoice.customerId,
      }).rows.at(-1)?.[5],
    ).toBe("252000.00");
  });
  it("calculates 30% project gross margin from net costs independently of collections", () => {
    const { db, q, payment } = fitout();
    const expense: Expense = {
      id: uid(),
      reference: "",
      projectId: q.projectId,
      category: "Subcontractor",
      supplier: "QA Jebel Ali Joinery LLC",
      date: today(),
      description: "Fictional fabrication and installation",
      amount: "168000",
      vat: "8400",
      paidAmount: "88200",
      method: "Bank Transfer",
      attachmentReference: "QA-BILL-001",
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    saveExpense(db, expense);
    postPayment(db, payment("75600"));
    const summary = financials(db, { ...emptyFilter, projectId: q.projectId });
    expect(summary).toMatchObject({
      contract: 24000000n,
      costs: 16800000n,
      paidCosts: 8820000n,
      profit: 7200000n,
      margin: 30,
      collected: 7560000n,
      outstanding: 17640000n,
    });
    const row = reportData(db, "Project Financial Summary", {
      ...emptyFilter,
      projectId: q.projectId,
    }).rows[0];
    expect(row.slice(2)).toEqual([
      "240000.00",
      "252000.00",
      "75600.00",
      "176400.00",
      "168000.00",
      "72000.00",
      "30.00",
    ]);
  });
  it.each(["Exclusive", "Inclusive", "Zero Rated", "Exempt"] as const)(
    "handles %s invoice lines with a fixed discount",
    (tax) => {
      const db = seed();
      initializeCommercial(db);
      const invoice = blankInvoice(db.clients[0].id, db.projects[0].id);
      invoice.lines[0] = {
        ...invoice.lines[0],
        description: "QA partition work",
        rate: "10500",
        tax,
      };
      invoice.discount = "500";
      const expected =
        tax === "Exclusive"
          ? { net: 1000000n, vat: 50000n, grand: 1050000n }
          : tax === "Inclusive"
            ? { net: 952381n, vat: 47619n, grand: 1000000n }
            : { net: 1000000n, vat: 0n, grand: 1000000n };
      expect(invoiceTotals(invoice)).toMatchObject(expected);
    },
  );
  it("retains snapshot and monetary strings through JSON persistence", () => {
    const { db, invoice, payment } = fitout();
    postPayment(db, payment("75600.25"));
    let raw = "";
    vi.stubGlobal("localStorage", {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    });
    localRepository.save(db);
    const reloaded = localRepository.load();
    expect(reloaded.invoices[0].snapshot).toEqual(invoice.snapshot);
    expect(amountString(balanceDue(reloaded, reloaded.invoices[0]))).toBe(
      "176399.75",
    );
  });
});

// Explicit expected failures keep cross-agent defects executable without editing owned code.
// Remove .fails once the responsible agent fixes the defect; unexpected success fails this suite.
describe("Agent 3 confirmed open defects (expected failures, not feature passes)", () => {
  it.fails(
    "A3-005: discount allocation must never produce negative VAT",
    () => {
      const db = seed();
      initializeCommercial(db);
      const invoice = blankInvoice(db.clients[0].id, db.projects[0].id);
      invoice.lines = Array.from({ length: 3 }, () => ({
        ...invoice.lines[0],
        id: uid(),
        description: "QA rounding adjustment",
        quantity: "1",
        rate: "0.01",
        tax: "Inclusive" as const,
      }));
      invoice.discount = "0.02";
      expect(invoiceTotals(invoice).vat).toBeGreaterThanOrEqual(0n);
    },
  );
  it.fails(
    "A3-006: incomplete persisted operational collections must be rejected before rendering",
    () => {
      const db = seed();
      initializeCommercial(db);
      const malformed: Record<string, unknown> = { ...db };
      delete malformed.people;
      vi.stubGlobal("localStorage", {
        getItem: () => JSON.stringify(malformed),
      });
      expect(() => localRepository.load()).toThrow();
    },
  );
});
