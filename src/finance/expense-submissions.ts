/**
 * Review-only expense submissions. These records are deliberately separate from
 * the existing posted/project Expense and supplier-bill cost write paths.
 */
import type { AccountType } from "../accounting/model";
export type ExpenseScope = "project" | "company";
export type ExpenseSubmissionStatus =
  "draft" | "submitted" | "rejected" | "approved";

export interface ExpenseCategoryMapping {
  id: string;
  name: string;
  expenseAccountId: string;
  allowedScopes: readonly ExpenseScope[];
  active: boolean;
}

export interface ExpenseAccountReference {
  id: string;
  classification: AccountType;
  active: boolean;
}

export interface ReceiptMetadata {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Optional digest for duplicate detection; no file bytes live in this model. */
  sha256?: string;
  review: "pending" | "verified" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface ExpenseSubmissionEvent {
  action:
    | "created"
    | "submitted"
    | "receipt-reviewed"
    | "rejected"
    | "revised"
    | "approved";
  actorId: string;
  at: string;
  note?: string;
}

export interface ExpenseSubmission {
  id: string;
  scope: ExpenseScope;
  projectId?: string;
  siteId?: string;
  categoryId: string;
  /** Frozen when submitted; later category edits cannot silently remap it. */
  expenseAccountId?: string;
  payee: string;
  description: string;
  expenseDate: string;
  currency: "AED";
  amountFils: string;
  vatFils: string;
  createdBy: string;
  status: ExpenseSubmissionStatus;
  receipts: ReceiptMetadata[];
  /** Prior revision evidence remains available after a rejected draft is corrected. */
  priorReceipts: ReceiptMetadata[];
  events: ExpenseSubmissionEvent[];
  approvedBy?: string;
  approvedAt?: string;
}

export type ExpenseDraftInput = Omit<
  ExpenseSubmission,
  | "status"
  | "events"
  | "expenseAccountId"
  | "approvedBy"
  | "approvedAt"
  | "receipts"
  | "priorReceipts"
> & {
  receipts?: readonly Omit<
    ReceiptMetadata,
    "review" | "reviewedBy" | "reviewedAt" | "reviewNote"
  >[];
  /** Supplier bills create costs through Procurement, never this manual route. */
  supplierBillId?: never;
};

export interface ExpenseReviewPolicy {
  authorizedReviewerIds: readonly string[];
  /** Deliberate override requires a separately approved business policy. */
  allowSelfApproval?: boolean;
  requireReceipt?: boolean;
}

const nonempty = (value: string, label: string) => {
  if (!value?.trim()) throw Error(`${label} is required.`);
};
const fils = (value: string, label: string) => {
  if (!/^(0|[1-9]\d*)$/.test(value))
    throw Error(`${label} must be a non-negative integer fils amount.`);
  return BigInt(value);
};
const event = (
  action: ExpenseSubmissionEvent["action"],
  actorId: string,
  at: string,
  note?: string,
): ExpenseSubmissionEvent => ({
  action,
  actorId,
  at,
  ...(note ? { note } : {}),
});

function validateContents(record: ExpenseSubmission) {
  nonempty(record.id, "Submission ID");
  nonempty(record.createdBy, "Submitter");
  nonempty(record.categoryId, "Expense category");
  nonempty(record.payee, "Payee");
  nonempty(record.description, "Description");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(record.expenseDate) ||
    Number.isNaN(Date.parse(`${record.expenseDate}T00:00:00.000Z`)) ||
    new Date(`${record.expenseDate}T00:00:00.000Z`)
      .toISOString()
      .slice(0, 10) !== record.expenseDate
  )
    throw Error("Expense date must use YYYY-MM-DD.");
  if (record.currency !== "AED")
    throw Error("Only AED submissions are supported.");
  if (record.scope === "project") nonempty(record.projectId || "", "Project");
  else if (record.scope === "company") {
    if (record.projectId || record.siteId)
      throw Error("Company expenses cannot be assigned to a project or site.");
  } else throw Error("Choose a valid expense scope.");
  if (record.siteId && !record.projectId)
    throw Error("A site requires a project.");
  if (fils(record.amountFils, "Expense amount") <= 0n)
    throw Error("Expense amount must be positive.");
  fils(record.vatFils, "VAT amount");
  if (
    new Set(record.receipts.map((receipt) => receipt.id)).size !==
    record.receipts.length
  )
    throw Error("Receipt IDs must be unique within a submission.");
  for (const receipt of record.receipts) {
    nonempty(receipt.id, "Receipt ID");
    nonempty(receipt.name, "Receipt name");
    nonempty(receipt.mimeType, "Receipt media type");
    if (!Number.isSafeInteger(receipt.sizeBytes) || receipt.sizeBytes <= 0)
      throw Error("Receipt size must be a positive byte count.");
  }
}

export function createExpenseDraft(
  input: ExpenseDraftInput,
  at: string,
): ExpenseSubmission {
  if ("supplierBillId" in input)
    throw Error("Supplier-bill costs must use the Procurement bill workflow.");
  const draft: ExpenseSubmission = {
    id: input.id,
    scope: input.scope,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
    categoryId: input.categoryId,
    payee: input.payee,
    description: input.description,
    expenseDate: input.expenseDate,
    currency: input.currency,
    amountFils: input.amountFils,
    vatFils: input.vatFils,
    createdBy: input.createdBy,
    status: "draft",
    receipts: (input.receipts || []).map((receipt) => ({
      ...receipt,
      review: "pending",
    })),
    priorReceipts: [],
    events: [event("created", input.createdBy, at)],
  };
  validateContents(draft);
  return draft;
}

/** Resolve an active category and expense account before the review starts. */
export function submitExpense(
  draft: ExpenseSubmission,
  categories: readonly ExpenseCategoryMapping[],
  accounts: readonly ExpenseAccountReference[],
  at: string,
): ExpenseSubmission {
  if (draft.status !== "draft") throw Error("Only drafts can be submitted.");
  validateContents(draft);
  const category = categories.find((item) => item.id === draft.categoryId);
  if (!category?.active || !category.allowedScopes.includes(draft.scope))
    throw Error("Expense category is inactive or unavailable for this scope.");
  const account = accounts.find(
    (item) => item.id === category.expenseAccountId,
  );
  if (
    !account?.active ||
    !["Cost of Sales", "Expense"].includes(account.classification)
  )
    throw Error(
      "Expense category must map to an active cost or expense account.",
    );
  return {
    ...draft,
    expenseAccountId: account.id,
    status: "submitted",
    events: [...draft.events, event("submitted", draft.createdBy, at)],
  };
}

function reviewer(
  record: ExpenseSubmission,
  actorId: string,
  policy: ExpenseReviewPolicy,
) {
  nonempty(actorId, "Reviewer");
  if (!policy.authorizedReviewerIds.includes(actorId))
    throw Error("Reviewer is not authorized for expense submissions.");
  if (!policy.allowSelfApproval && actorId === record.createdBy)
    throw Error("Submitters cannot review or approve their own expenses.");
  if (record.status !== "submitted")
    throw Error("Only submitted expenses can be reviewed.");
}

export function reviewExpenseReceipt(
  record: ExpenseSubmission,
  receiptId: string,
  decision: "verified" | "rejected",
  actorId: string,
  policy: ExpenseReviewPolicy,
  at: string,
  note = "",
): ExpenseSubmission {
  reviewer(record, actorId, policy);
  if (decision === "rejected") nonempty(note, "Receipt rejection reason");
  const receipt = record.receipts.find((item) => item.id === receiptId);
  if (!receipt) throw Error("Receipt was not found.");
  if (receipt.review !== "pending")
    throw Error("Receipt has already been reviewed.");
  return {
    ...record,
    receipts: record.receipts.map((item) =>
      item.id === receiptId
        ? {
            ...item,
            review: decision,
            reviewedBy: actorId,
            reviewedAt: at,
            reviewNote: note,
          }
        : item,
    ),
    events: [
      ...record.events,
      event(
        "receipt-reviewed",
        actorId,
        at,
        `${decision}: ${receiptId}${note ? ` — ${note}` : ""}`,
      ),
    ],
  };
}

export function approveExpense(
  record: ExpenseSubmission,
  actorId: string,
  policy: ExpenseReviewPolicy,
  at: string,
): ExpenseSubmission {
  reviewer(record, actorId, policy);
  if (!record.expenseAccountId)
    throw Error("A mapped expense account is required.");
  if (policy.requireReceipt && record.receipts.length === 0)
    throw Error("A receipt is required by the review policy.");
  if (record.receipts.some((receipt) => receipt.review !== "verified"))
    throw Error("Every attached receipt must pass manual review.");
  return {
    ...record,
    status: "approved",
    approvedBy: actorId,
    approvedAt: at,
    events: [...record.events, event("approved", actorId, at)],
  };
}

export function rejectExpense(
  record: ExpenseSubmission,
  actorId: string,
  policy: ExpenseReviewPolicy,
  at: string,
  reason: string,
): ExpenseSubmission {
  reviewer(record, actorId, policy);
  nonempty(reason, "Rejection reason");
  return {
    ...record,
    status: "rejected",
    events: [...record.events, event("rejected", actorId, at, reason)],
  };
}

/** Revision preserves prior decisions but requires a fresh category and receipt review. */
export function reviseRejectedExpense(
  rejected: ExpenseSubmission,
  input: ExpenseDraftInput,
  at: string,
): ExpenseSubmission {
  if (rejected.status !== "rejected")
    throw Error("Only rejected submissions can be revised.");
  if (input.id !== rejected.id || input.createdBy !== rejected.createdBy)
    throw Error("Revision must retain submission identity and submitter.");
  const next = createExpenseDraft(input, at);
  return {
    ...next,
    priorReceipts: [...rejected.priorReceipts, ...rejected.receipts],
    events: [...rejected.events, event("revised", rejected.createdBy, at)],
  };
}
