import { describe, expect, it } from "vitest";
import {
  approveExpense,
  createExpenseDraft,
  rejectExpense,
  reviewExpenseReceipt,
  reviseRejectedExpense,
  submitExpense,
  type ExpenseDraftInput,
  type ExpenseReviewPolicy,
  type ExpenseAccountReference,
} from "./expense-submissions";

const createdAt = "2026-10-21T08:00:00.000Z";
const later = "2026-10-21T09:00:00.000Z";
const categories = [
  {
    id: "materials",
    name: "Materials",
    expenseAccountId: "cost-materials",
    allowedScopes: ["project"] as const,
    active: true,
  },
  {
    id: "rent",
    name: "Rent",
    expenseAccountId: "expense-rent",
    allowedScopes: ["company"] as const,
    active: true,
  },
];
const accounts: ExpenseAccountReference[] = [
  { id: "cost-materials", classification: "Cost of Sales", active: true },
  { id: "expense-rent", classification: "Expense", active: true },
];
const policy: ExpenseReviewPolicy = {
  authorizedReviewerIds: ["manager"],
  requireReceipt: true,
};
const input = (
  overrides: Partial<ExpenseDraftInput> = {},
): ExpenseDraftInput => ({
  id: "submission-1",
  scope: "project",
  projectId: "project-1",
  siteId: "site-1",
  categoryId: "materials",
  payee: "Supplier A",
  description: "Site consumables",
  expenseDate: "2026-10-21",
  currency: "AED",
  amountFils: "12500",
  vatFils: "625",
  createdBy: "site-person",
  receipts: [
    {
      id: "receipt-1",
      name: "receipt.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 3456,
      sha256: "demo-digest",
    },
  ],
  ...overrides,
});

describe("expense submission boundary", () => {
  it("keeps a project submission review-only and freezes its approved account mapping", () => {
    const draft = createExpenseDraft(input(), createdAt);
    expect(draft.status).toBe("draft");
    expect(draft.expenseAccountId).toBeUndefined();
    const submitted = submitExpense(draft, categories, accounts, later);
    expect(submitted.status).toBe("submitted");
    expect(submitted.expenseAccountId).toBe("cost-materials");
    expect(submitted.receipts[0].review).toBe("pending");
    expect(draft.status).toBe("draft");
    expect(submitted).not.toHaveProperty("postingKey");
    expect(submitted).not.toHaveProperty("journalEntryId");
  });

  it("supports company costs without inventing a project", () => {
    const draft = createExpenseDraft(
      input({
        scope: "company",
        projectId: undefined,
        siteId: undefined,
        categoryId: "rent",
      }),
      createdAt,
    );
    expect(
      submitExpense(draft, categories, accounts, later).expenseAccountId,
    ).toBe("expense-rent");
    expect(() =>
      createExpenseDraft(input({ scope: "company" }), createdAt),
    ).toThrow(/cannot be assigned to a project/);
    expect(() =>
      createExpenseDraft(input({ projectId: undefined }), createdAt),
    ).toThrow(/Project is required/);
  });

  it("requires a live cost/expense account and valid category scope", () => {
    const draft = createExpenseDraft(input(), createdAt);
    expect(() =>
      submitExpense(
        draft,
        categories.filter((c) => c.id === "rent"),
        accounts,
        later,
      ),
    ).toThrow(/category is inactive or unavailable/);
    expect(() =>
      submitExpense(
        draft,
        categories,
        [
          {
            id: "cost-materials",
            classification: "Asset",
            active: true,
          },
        ],
        later,
      ),
    ).toThrow(/active cost or expense account/);
    expect(() =>
      submitExpense(
        draft,
        [{ ...categories[0], active: false }],
        accounts,
        later,
      ),
    ).toThrow(/category is inactive/);
  });

  it("rejects invalid money, missing site/project context, and duplicate receipt IDs", () => {
    expect(() =>
      createExpenseDraft(input({ amountFils: "0" }), createdAt),
    ).toThrow(/must be positive/);
    expect(() =>
      createExpenseDraft(input({ vatFils: "-1" }), createdAt),
    ).toThrow(/non-negative integer fils/);
    expect(() =>
      createExpenseDraft(input({ expenseDate: "2026-02-30" }), createdAt),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      createExpenseDraft(
        input({ projectId: undefined, siteId: "site-1" }),
        createdAt,
      ),
    ).toThrow();
    const receipt = input().receipts![0];
    expect(() =>
      createExpenseDraft(input({ receipts: [receipt, receipt] }), createdAt),
    ).toThrow(/Receipt IDs must be unique/);
  });

  it("cannot use the manual submission route for a linked supplier bill", () => {
    const attempted = {
      ...input(),
      supplierBillId: "bill-1",
    } as unknown as ExpenseDraftInput;
    expect(() => createExpenseDraft(attempted, createdAt)).toThrow(
      /Procurement bill workflow/,
    );
  });
});

describe("manual review and decision controls", () => {
  const submitted = () =>
    submitExpense(
      createExpenseDraft(input(), createdAt),
      categories,
      accounts,
      later,
    );

  it("blocks self approval and actors outside the configured reviewer set", () => {
    const record = submitted();
    expect(() =>
      approveExpense(
        record,
        "site-person",
        {
          authorizedReviewerIds: ["site-person"],
        },
        later,
      ),
    ).toThrow(/cannot review or approve their own/);
    expect(() =>
      rejectExpense(record, "stranger", policy, later, "Wrong receipt"),
    ).toThrow(/not authorized/);
  });

  it("requires every receipt to be manually verified before approval", () => {
    const record = submitted();
    expect(() => approveExpense(record, "manager", policy, later)).toThrow(
      /manual review/,
    );
    const reviewed = reviewExpenseReceipt(
      record,
      "receipt-1",
      "verified",
      "manager",
      policy,
      later,
    );
    const approved = approveExpense(reviewed, "manager", policy, later);
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("manager");
    expect(approved.events.map((e) => e.action)).toEqual([
      "created",
      "submitted",
      "receipt-reviewed",
      "approved",
    ]);
    expect(record.receipts[0].review).toBe("pending");
    expect(() => approveExpense(approved, "manager", policy, later)).toThrow(
      /Only submitted/,
    );
  });

  it("requires a reason for receipt rejection and does not approve rejected evidence", () => {
    const record = submitted();
    expect(() =>
      reviewExpenseReceipt(
        record,
        "receipt-1",
        "rejected",
        "manager",
        policy,
        later,
      ),
    ).toThrow(/reason/);
    const reviewed = reviewExpenseReceipt(
      record,
      "receipt-1",
      "rejected",
      "manager",
      policy,
      later,
      "Unreadable",
    );
    expect(() => approveExpense(reviewed, "manager", policy, later)).toThrow(
      /manual review/,
    );
    expect(reviewed.receipts[0].reviewNote).toBe("Unreadable");
  });

  it("requires a receipt when configured and preserves prior decisions on revision", () => {
    const noReceipt = submitExpense(
      createExpenseDraft(input({ receipts: [] }), createdAt),
      categories,
      accounts,
      later,
    );
    expect(() => approveExpense(noReceipt, "manager", policy, later)).toThrow(
      /receipt is required/,
    );
    expect(() =>
      rejectExpense(noReceipt, "manager", policy, later, " "),
    ).toThrow(/Rejection reason/);
    const rejected = rejectExpense(
      noReceipt,
      "manager",
      policy,
      later,
      "Missing receipt",
    );
    const revised = reviseRejectedExpense(
      rejected,
      input({ receipts: input().receipts }),
      later,
    );
    expect(revised.status).toBe("draft");
    expect(revised.events.map((e) => e.action)).toEqual([
      "created",
      "submitted",
      "rejected",
      "revised",
    ]);
    expect(revised.expenseAccountId).toBeUndefined();
    expect(revised.receipts[0].review).toBe("pending");
  });

  it("retains original receipt metadata after a rejected submission is revised", () => {
    const original = submitted();
    const reviewed = reviewExpenseReceipt(
      original,
      "receipt-1",
      "rejected",
      "manager",
      policy,
      later,
      "Amount is unreadable",
    );
    const rejected = rejectExpense(
      reviewed,
      "manager",
      policy,
      later,
      "Replace photo",
    );
    const revised = reviseRejectedExpense(
      rejected,
      input({
        receipts: [
          {
            id: "receipt-2",
            name: "clearer.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 5000,
          },
        ],
      }),
      later,
    );
    expect(revised.priorReceipts).toEqual(reviewed.receipts);
    expect(revised.receipts.map((receipt) => receipt.id)).toEqual([
      "receipt-2",
    ]);
  });
});
