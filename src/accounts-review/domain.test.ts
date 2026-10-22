import { describe, expect, it } from "vitest";
import { applyReviewAction, createReviewState, reviewSnapshot } from "./domain";

describe("local Accountant review ledger", () => {
  it("reconciles the fictional opening journal and all eight dashboard metrics", () => {
    const data = reviewSnapshot(createReviewState());
    expect(data.metrics).toEqual({
      revenueFils: "2000000",
      costOfSalesFils: "800000",
      operatingExpensesFils: "100000",
      grossProfitFils: "1200000",
      netProfitFils: "1100000",
      receivablesFils: "1500000",
      payablesFils: "600000",
      bankFils: "5200000",
      cashFils: "0",
    });
    expect(data.trial.balanced).toBe(true);
    expect(data.balance.balanced).toBe(true);
  });

  it("keeps invoice drafts out of revenue until issued, then posts once", () => {
    const initial = createReviewState();
    const draft = applyReviewAction(initial, {
      kind: "invoice",
      id: "D-1",
      party: "Sample Client D",
      date: "2026-10-22",
      due: "2026-10-22",
      description: "Design service",
      amount: "100.01",
      issue: false,
    });
    expect(reviewSnapshot(draft).metrics.revenueFils).toBe("2000000");
    const issued = applyReviewAction(draft, {
      kind: "issue-invoice",
      id: "D-1",
    });
    expect(reviewSnapshot(issued).metrics.revenueFils).toBe("2010001");
    expect(reviewSnapshot(issued).metrics.receivablesFils).toBe("1510001");
    expect(() =>
      applyReviewAction(issued, { kind: "issue-invoice", id: "D-1" }),
    ).toThrow(/Only a draft/);
    expect(reviewSnapshot(initial).metrics.revenueFils).toBe("2000000");
  });

  it("keeps proformas outside receivables and revenue even when issued", () => {
    const initial = createReviewState();
    const draft = applyReviewAction(initial, {
      kind: "invoice",
      id: "PRO-NEW",
      party: "Sample Client D",
      date: "2026-10-22",
      due: "2026-10-22",
      description: "Concept proposal",
      amount: "450.00",
      issue: false,
      invoiceType: "Proforma",
    });
    const issued = applyReviewAction(draft, {
      kind: "issue-invoice",
      id: "PRO-NEW",
    });
    const snapshot = reviewSnapshot(issued);
    expect(snapshot.metrics.revenueFils).toBe("2000000");
    expect(snapshot.metrics.receivablesFils).toBe("1500000");
    expect(
      snapshot.invoices.find((item) => item.id === "PRO-NEW"),
    ).toMatchObject({
      status: "Issued",
      invoiceType: "Proforma",
      outstandingFils: "0",
      ageing: null,
    });
    expect(snapshot.trial.balanced).toBe(true);
  });

  it("keeps legacy invoice records readable as tax invoices", () => {
    const state = createReviewState();
    delete state.invoices[0].invoiceType;
    expect(reviewSnapshot(state).invoices[0].invoiceType).toBe("Tax Invoice");
  });

  it("posts a purchase bill, partial receipt, supplier payment, and paid expense through one journal", () => {
    let state = createReviewState();
    state = applyReviewAction(state, {
      kind: "bill",
      id: "B-1",
      party: "Sample Supplier D",
      date: "2026-10-22",
      due: "2026-10-22",
      description: "Site material",
      amount: "200.25",
      category: "Cost of Sales",
      poReference: "DEMO-PO-44",
    });
    state = applyReviewAction(state, {
      kind: "receipt",
      id: "R-1",
      documentId: "INV-26041",
      date: "2026-10-22",
      amount: "100.00",
      account: "bank",
    });
    state = applyReviewAction(state, {
      kind: "supplier-payment",
      id: "P-1",
      documentId: "B-1",
      date: "2026-10-22",
      amount: "50.25",
      account: "bank",
    });
    state = applyReviewAction(state, {
      kind: "expense",
      id: "E-1",
      payee: "Sample Vendor",
      date: "2026-10-22",
      description: "Office consumables",
      amount: "25.00",
      account: "bank",
    });
    const data = reviewSnapshot(state);
    expect(data.metrics.receivablesFils).toBe("1490000");
    expect(data.metrics.payablesFils).toBe("615000");
    expect(data.metrics.costOfSalesFils).toBe("820025");
    expect(data.metrics.operatingExpensesFils).toBe("102500");
    expect(data.metrics.bankFils).toBe("5202475");
    expect(data.balance.balanced).toBe(true);
    expect(data.trial.balanced).toBe(true);
    expect(
      data.invoices.find((item) => item.id === "INV-26041")?.ageing
        ?.daysOverdue,
    ).toBe(52);
  });

  it("rejects overpayment without mutating source documents", () => {
    const state = createReviewState();
    expect(() =>
      applyReviewAction(state, {
        kind: "receipt",
        id: "R-over",
        documentId: "INV-26042",
        date: "2026-10-22",
        amount: "3000.01",
        account: "bank",
      }),
    ).toThrow(/exceeds/);
    expect(reviewSnapshot(state).metrics.receivablesFils).toBe("1500000");
  });

  it("rejects a mislabeled upload before creating a bill or journal", () => {
    const state = createReviewState();
    expect(() =>
      applyReviewAction(state, {
        kind: "bill",
        id: "B-bad",
        party: "Sample Supplier",
        date: "2026-10-22",
        due: "2026-10-22",
        description: "Bad upload",
        amount: "1.00",
        category: "Operating Expense",
        poReference: "DEMO-PO",
        attachment: {
          name: "bill.pdf",
          mime: "application/pdf",
          data: btoa("not actually a PDF"),
        },
      }),
    ).toThrow(/does not match/);
    expect(state.bills).toHaveLength(2);
    expect(state.accounting.journals).toHaveLength(7);
  });
});
