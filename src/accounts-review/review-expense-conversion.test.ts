import { describe, expect, it } from "vitest";
import {
  applyReviewAction,
  attachment,
  createReviewState,
  reviewSnapshot,
  type ReviewAction,
  type ReviewState,
} from "./domain";
import { blankFields, type EntryFields } from "./documents/model";

function reviewedExpense(
  kind: "company-expense" | "project-expense" = "company-expense",
) {
  const state = createReviewState();
  const fields: EntryFields = {
    ...blankFields(),
    supplier: "Sample Supplier B",
    date: "2026-10-22",
    reference: "Fictional receipt R-NEW",
    currency: "AED",
    kind,
    categoryId:
      kind === "project-expense" ? "project-materials" : "company-expenses",
    projectId: kind === "project-expense" ? "demo-apartment" : "",
    items: [
      {
        description: "Site supply",
        quantity: "1",
        unit: "Nos",
        unitRate: "25.01",
        tax: "0.00",
        total: "25.01",
        productId: "",
      },
    ],
    subtotal: "25.01",
    tax: "0.00",
    total: "25.01",
  };
  attachment(state, "FILE-1", {
    name: "fictional.pdf",
    mime: "application/pdf",
    data: btoa("%PDF-1.4\n%%EOF"),
  });
  state.documentEntries = {
    version: 1,
    defaults: [],
    reviews: [
      {
        id: "REVIEW-1",
        attachmentId: "FILE-1",
        sha256: "fictional-sha",
        createdAt: "2026-10-22T00:00:00.000Z",
        extraction: {
          fields: structuredClone(fields),
          uncertain: [],
          provider: "Manual entry",
          mode: "manual",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: 0,
          retries: 0,
        },
        fields,
        status: "Review",
        revision: 0,
        corrections: [],
        warnings: [],
      },
    ],
  };
  return applyReviewAction(state, {
    kind: "document-draft",
    id: "SAVE",
    reviewId: "REVIEW-1",
    revision: 0,
    fields,
    confirmed: true,
    rememberSupplier: false,
  });
}
const convert = (id = "EXP-FROM-REVIEW"): ReviewAction => ({
  kind: "create-expense-from-review",
  id,
  reviewId: "REVIEW-1",
  revision: 1,
  confirmed: true,
  account: "bank",
});

describe("explicit expense conversion from a reviewed document", () => {
  it.each(["company-expense", "project-expense"] as const)(
    "keeps %s review draft unposted, then posts through the existing expense path only",
    (kind) => {
      const initial = createReviewState(),
        saved = reviewedExpense(kind),
        savedBefore = structuredClone(saved);
      expect(saved.accounting.journals).toEqual(initial.accounting.journals);
      expect(saved.expenses).toEqual([]);
      const next = applyReviewAction(saved, convert());
      expect(next.expenses.at(-1)).toMatchObject({
        id: "EXP-FROM-REVIEW",
        amountFils: "2501",
        attachmentId: "FILE-1",
        sourceReviewId: "REVIEW-1",
        invoiceReference: "Fictional receipt R-NEW",
        scope: kind === "project-expense" ? "project" : "company",
      });
      expect(next.accounting.journals).toHaveLength(
        initial.accounting.journals.length + 1,
      );
      expect(next.bills).toEqual(initial.bills);
      expect(next.receipts).toEqual(initial.receipts);
      expect(next.supplierPayments).toEqual(initial.supplierPayments);
      expect(next.documentEntries!.reviews[0].extraction).toEqual(
        saved.documentEntries!.reviews[0].extraction,
      );
      expect(next.documentEntries!.reviews[0].corrections).toEqual(
        saved.documentEntries!.reviews[0].corrections,
      );
      expect(next.documentEntries!.reviews[0]).toMatchObject({
        convertedExpenseId: "EXP-FROM-REVIEW",
        revision: 2,
      });
      expect(saved).toEqual(savedBefore);
      expect(reviewSnapshot(next).trial.balanced).toBe(true);
    },
  );

  it("retains known custom ledger and department mapping without arbitrary postings", () => {
    let saved = reviewedExpense("project-expense");
    saved = applyReviewAction(saved, {
      kind: "create-expense-ledger",
      id: "TOOLS",
      name: "Project tool supplies",
      group: "Direct Expense",
    });
    Object.assign(saved.documentEntries!.reviews[0].fields, {
      ledgerId: "TOOLS",
      department: "MEP",
    });
    const next = applyReviewAction(saved, convert());
    expect(next.expenses.at(-1)).toMatchObject({
      ledgerId: "TOOLS",
      departmentId: "MEP",
      projectId: "demo-apartment",
    });
    expect(next.accounting.journals.at(-1)!.lines[0].accountId).toBe(
      "expense-TOOLS",
    );
    expect(
      reviewSnapshot(next).expenseSummary.byDepartment.find(
        (item) => item.id === "MEP",
      )!.totalFils,
    ).toBe("2501");
  });

  it("blocks repeated conversion with a new action ID and cross-conversion to a supplier bill", () => {
    const posted = applyReviewAction(reviewedExpense(), convert()),
      before = structuredClone(posted);
    expect(() => applyReviewAction(posted, convert("ANOTHER-ID"))).toThrow(
      /already been converted/,
    );
    expect(() =>
      applyReviewAction(posted, {
        kind: "create-bill-from-review",
        id: "BILL",
        reviewId: "REVIEW-1",
        revision: 2,
        confirmed: true,
      }),
    ).toThrow(/already been converted/);
    expect(posted).toEqual(before);
  });

  it.each([
    (state: ReviewState) => {
      state.documentEntries!.reviews[0].status = "Review";
    },
    (state: ReviewState) => {
      state.documentEntries!.reviews[0].revision = 2;
    },
    (state: ReviewState) => {
      state.documentEntries!.reviews[0].fields.kind = "supplier-bill";
    },
    (state: ReviewState) => {
      state.documentEntries!.reviews[0].fields.total = "24.00";
    },
    (state: ReviewState) => {
      state.documentEntries!.reviews[0].fields.projectId = "invented-project";
    },
    (state: ReviewState) => {
      Object.assign(state.documentEntries!.reviews[0].fields, {
        ledgerId: "bank",
      });
    },
    (state: ReviewState) => {
      Object.assign(state.documentEntries!.reviews[0].fields, {
        department: "INVENTED",
      });
    },
    (state: ReviewState) => {
      Object.assign(state.documentEntries!.reviews[0].fields, {
        discount: "1.00",
      });
    },
    (state: ReviewState) => {
      Object.assign(state.documentEntries!.reviews[0].fields.items[0], {
        discount: "1.00",
      });
    },
    (state: ReviewState) => {
      state.documentEntries!.reviews[0].fields.tax = "1.00";
      state.documentEntries!.reviews[0].fields.total = "26.01";
      state.documentEntries!.reviews[0].fields.items[0].tax = "1.00";
      state.documentEntries!.reviews[0].fields.items[0].total = "26.01";
    },
  ])(
    "rejects unresolved, stale, inconsistent and unsupported expense drafts atomically %#",
    (mutate) => {
      const saved = reviewedExpense(),
        before = structuredClone(saved);
      mutate(saved);
      const altered = structuredClone(saved);
      expect(() => applyReviewAction(saved, convert())).toThrow();
      expect(saved).toEqual(altered);
      expect(saved.accounting).toEqual(before.accounting);
    },
  );

  it("requires explicit confirmation and a valid payment account", () => {
    const saved = reviewedExpense();
    expect(() =>
      applyReviewAction(saved, {
        ...convert(),
        confirmed: false,
      } as unknown as ReviewAction),
    ).toThrow(/Confirm/);
    expect(() =>
      applyReviewAction(saved, {
        ...convert(),
        account: "receivables",
      } as ReviewAction),
    ).toThrow(/active bank/);
  });
});
