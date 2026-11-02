import { describe, expect, it } from "vitest";
import { applyReviewAction, createReviewState, reviewSnapshot } from "./domain";
import { reviewPdf } from "./pdf";

const pdfText = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);

describe("posted settlement voucher exports", () => {
  it("exports the exact customer receipt and supplier payment without financial mutation", () => {
    let state = createReviewState();
    state = applyReviewAction(state, {
      kind: "receipt",
      id: "RECEIPT-QA",
      documentId: "INV-26041",
      date: "2026-10-22",
      amount: "12.34",
      account: "bank",
      reference: "CUSTOMER-REFERENCE",
    });
    state = applyReviewAction(state, {
      kind: "supplier-payment",
      id: "PAYMENT-QA",
      documentId: "BILL-26031",
      date: "2026-10-22",
      amount: "5.67",
      account: "bank",
      reference: "SUPPLIER-REFERENCE",
    });
    const before = structuredClone(state);
    const receipt = pdfText(reviewPdf(state, "receipt:RECEIPT-QA"));
    const payment = pdfText(reviewPdf(state, "payment:PAYMENT-QA"));
    for (const value of [
      "Customer receipt voucher",
      "Sample Client A",
      "INV-26041",
      "12.34",
      "CUSTOMER-REFERENCE",
      "Business bank",
      "2026-10-22",
    ])
      expect(receipt).toContain(value);
    for (const value of [
      "Supplier payment voucher",
      "Sample Supplier B",
      "BILL-26031",
      "5.67",
      "SUPPLIER-REFERENCE",
      "Business bank",
      "2026-10-22",
    ])
      expect(payment).toContain(value);
    for (const text of [receipt, payment]) {
      expect(text).toContain("FICTIONAL CLIENT REVIEW");
      expect(text).toContain("VAT - policy pending");
      expect(text).toContain("no new posting");
    }
    expect(state).toEqual(before);
    expect(reviewSnapshot(state).trial.balanced).toBe(true);
    expect(reviewSnapshot(state).balance.balanced).toBe(true);
  });

  it("uses the actual settlement date/account even when report selections differ", () => {
    let state = applyReviewAction(createReviewState(), {
      kind: "create-cash-account",
      id: "SECOND-BANK",
      name: "Second bank",
      type: "bank",
    });
    state = applyReviewAction(state, {
      kind: "receipt",
      id: "CUSTOM-BANK-RECEIPT",
      documentId: "INV-26041",
      date: "2026-10-22",
      amount: "9.87",
      account: "SECOND-BANK",
    });
    const text = pdfText(
      reviewPdf(state, "receipt:CUSTOM-BANK-RECEIPT", {
        from: "2026-01-01",
        to: "2026-09-01",
        asOf: "2026-09-01",
      }),
    );
    expect(text).toContain("Second bank");
    expect(text).toContain("2026-10-22");
    expect(text).toContain("9.87");
    expect(text).not.toContain("Open balance as of");
  });

  it("rejects missing, draft and wrong-kind settlement IDs instead of exporting another record", () => {
    const state = applyReviewAction(createReviewState(), {
      kind: "receipt",
      id: "RECEIPT-ONLY",
      documentId: "INV-26041",
      date: "2026-10-22",
      amount: "1.00",
      account: "bank",
    });
    for (const name of [
      "payment:RECEIPT-ONLY",
      "receipt:missing",
      "receipt:INV-26041",
      "payment:",
    ])
      expect(() => reviewPdf(state, name)).toThrow(
        "Posted settlement document was not found",
      );
  });
});
