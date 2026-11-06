import { expect, it } from "vitest";
import { createReviewState, applyReviewAction } from "../domain";
import { blankFields } from "./model";
import { saveManualDocumentDraft, blankManualReview } from "./review";
const fields = () => ({
  ...blankFields(),
  documentType: "invoice" as const,
  supplier: "Fictional Manual Supplier",
  date: "2026-11-06",
  reference: "MANUAL-TEST-01",
  currency: "AED" as const,
  subtotal: "10.00",
  tax: "0.00",
  total: "10.00",
  kind: "company-expense" as const,
  categoryId: "company-expenses",
  ledgerId: "legacy-operating",
  items: [
    {
      description: "Fictional office materials",
      quantity: "1",
      unit: "each",
      unitRate: "10.00",
      tax: "0.00",
      total: "10.00",
      productId: "",
    },
  ],
});
const action = () => ({
  kind: "document-manual" as const,
  id: "DOC-MANUAL-UNIT",
  fields: fields(),
  confirmed: true as const,
  rememberSupplier: false,
});
it("manual review starts blank without a fabricated file or AI result", () => {
  const d = blankManualReview("DOC-MANUAL", "now");
  expect(d.attachmentId).toBe("");
  expect(d.sha256).toBe("");
  expect(d.extraction).toMatchObject({
    mode: "manual",
    requestedMode: "manual",
    provider: "Manual entry",
    inputTokens: null,
    outputTokens: null,
    reviewPolicy: "draft-only",
  });
  expect(d.fields).toEqual(blankFields());
});
it("saves a reviewed manual draft atomically through the existing action boundary without postings or attachments", () => {
  const state = createReviewState(),
    before = structuredClone(state),
    next = applyReviewAction(state, action());
  expect(state).toEqual(before);
  expect(next.accounting).toEqual(state.accounting);
  expect(next.attachments).toEqual(state.attachments);
  for (const k of [
    "invoices",
    "bills",
    "receipts",
    "supplierPayments",
    "expenses",
    "transfers",
    "cashAccounts",
    "expenseLedgers",
  ] as const)
    expect(next[k]).toEqual(state[k]);
  const d = next.documentEntries!.reviews.find((d) => d.id === action().id)!;
  expect(d.status).toBe("Draft");
  expect(d.corrections).toHaveLength(1);
  expect(d.fields).toEqual(fields());
  expect(d.attachmentId).toBe("");
  expect(d.extraction.fields).toEqual(blankFields());
});
it("does not create an incomplete manual draft on validation failure", () => {
  const s = createReviewState(),
    before = structuredClone(s);
  expect(() =>
    saveManualDocumentDraft(s, { ...action(), fields: blankFields() }, "now"),
  ).toThrow();
  expect(s).toEqual(before);
});
it("does not overwrite an existing review when a manual ID is reused", () => {
  const s = applyReviewAction(createReviewState(), action()),
    before = structuredClone(s);
  expect(() => applyReviewAction(s, action())).toThrow("already exists");
  expect(s).toEqual(before);
});
it("rejects an unconfirmed manual submission", () =>
  expect(() =>
    saveManualDocumentDraft(
      createReviewState(),
      { ...action(), confirmed: false },
      "now",
    ),
  ).toThrow());
it("rejects arbitrary ledger/journal instructions in manual fields", () =>
  expect(() =>
    saveManualDocumentDraft(
      createReviewState(),
      { ...action(), fields: { ...fields(), journal: { post: true } } },
      "now",
    ),
  ).toThrow());
it("manual draft stays review-only even for a later explicit expense conversion", () => {
  const s = applyReviewAction(createReviewState(), action());
  expect(() =>
    applyReviewAction(s, {
      kind: "create-expense-from-review",
      id: "EXP-FORBIDDEN",
      reviewId: action().id,
      revision: 1,
      confirmed: true,
      account: "bank",
    }),
  ).toThrow();
});
