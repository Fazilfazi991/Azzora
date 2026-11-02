import { describe, expect, it } from "vitest";
import { createReviewState } from "../domain";
import { createExpenseLedger } from "../expense-ledgers";
import { blankFields, emptyEntries, fieldsSchema, type DocumentReview } from "./model";
import { inspectFields, saveDocumentDraft } from "./review";

const setup = () => {
  const state = createExpenseLedger(createReviewState(), "materials-review", "Joinery materials", "Direct Expense");
  const fields = {
    ...blankFields(), supplier: "Sample Supplier B", reference: "SYN-REVIEW-NEW", date: "2026-11-02",
    currency: "AED" as const, kind: "project-expense" as const, projectId: "demo-apartment",
    categoryId: "project-materials", ledgerId: "materials-review", department: "JOINERY" as const,
    discount: "5.00", subtotal: "100.00", tax: "0.00", total: "95.00",
    items: [{ description: "Materials", quantity: "2", unit: "each", unitRate: "55.00", discount: "10.00", tax: "0.00", total: "100.00", productId: "" }],
  };
  const review: DocumentReview = {
    id: "review-new", sha256: "a".repeat(64), attachmentId: "file", createdAt: "2026-11-02T08:00:00Z",
    fields, extraction: { fields: structuredClone(fields), uncertain: [], provider: "Test transport", mode: "manual", inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0, retries: 0 },
    revision: 0, corrections: [], warnings: [], status: "Review",
  };
  state.documentEntries = { ...emptyEntries(), reviews: [review] };
  return { state, fields };
};
describe("reviewed classification and original printed discounts", () => {
  it("keeps valid printed discounts, department and existing ledger in a draft without posting", () => {
    const { state, fields } = setup();
    const next = saveDocumentDraft(state, { kind: "document-draft", reviewId: "review-new", revision: 0, fields, confirmed: true, rememberSupplier: true }, "2026-11-02T09:00:00Z");
    expect(next.accounting).toEqual(state.accounting);
    expect(next.documentEntries!.reviews[0].mapping?.ledgerId).toBe("materials-review");
    expect(next.documentEntries!.reviews[0].fields.department).toBe("JOINERY");
    expect(next.documentEntries!.reviews[0].extraction).toEqual(state.documentEntries!.reviews[0].extraction);
    expect(next.documentEntries!.reviews[0].corrections).toHaveLength(1);
    expect(next.documentEntries!.defaults[0]).toMatchObject({ department: "JOINERY", ledgerId: "materials-review" });
    expect(inspectFields(fields, state).filter(w => /math|totals|discount|missing-dueDate/.test(w.code))).toEqual([]);
  });
  it("flags excessive discount without changing any printed amount", () => {
    const { state, fields } = setup();
    fields.items[0].discount = "200.00";
    const before = structuredClone(fields);
    expect(inspectFields(fields, state).some(w => w.code === "line-discount-0")).toBe(true);
    expect(fields).toEqual(before);
  });
  it("rejects unknown department IDs, ledger posting instructions and missing ledger references", () => {
    const { state, fields } = setup();
    expect(fieldsSchema.safeParse({ ...fields, department: "INVENTED" }).success).toBe(false);
    expect(fieldsSchema.safeParse({ ...fields, journal: {} }).success).toBe(false);
    expect(() => saveDocumentDraft(state, { kind: "document-draft", reviewId: "review-new", revision: 0, fields: { ...fields, ledgerId: "arbitrary-ledger" }, confirmed: true, rememberSupplier: false }, "2026-11-02T09:00:00Z")).toThrow(/existing expense ledger/);
  });
  it("makes an explicitly converted expense review read-only", () => {
    const { state, fields } = setup();
    state.documentEntries!.reviews[0].convertedExpenseId = "EXP-ONCE";
    expect(() => saveDocumentDraft(state, { kind: "document-draft", reviewId: "review-new", revision: 0, fields, confirmed: true, rememberSupplier: false }, "2026-11-02T09:00:00Z")).toThrow(/read-only/);
  });
});
