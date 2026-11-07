import { ZodError } from "zod";
export type ReviewFieldIssue = { field: string; message: string };
export class ReviewDraftError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 422,
    public readonly issues: ReviewFieldIssue[] = [],
  ) {
    super(message);
  }
}
const labels: Record<string, string> = {
  supplier: "Supplier",
  date: "Document date",
  dueDate: "Due date",
  reference: "Invoice/reference",
  quantity: "Quantity",
  unitRate: "Unit rate",
  discount: "Discount",
  tax: "Tax",
  total: "Amount",
  subtotal: "Subtotal",
  description: "Description",
  unit: "Unit",
  items: "Items",
  confirmed: "Review confirmation",
};
export function reviewFieldLabel(path: string): string {
  const p = path.replace(/^fields\./, "");
  const m = /^items\.(\d+)\.(\w+)$/.exec(p);
  return m
    ? "Line " + (Number(m[1]) + 1) + " — " + (labels[m[2]] || "Field")
    : labels[p] || "Review details";
}
export function reviewSchemaError(error: ZodError): ReviewDraftError {
  const issues = error.issues.map((i) => {
    const field = i.path.join(".").replace(/^fields\./, "");
    return {
      field,
      message:
        field === "confirmed"
          ? "Check the review confirmation before saving this draft."
          : i.code === "unrecognized_keys"
            ? "Remove unsupported fields from this review."
            : i.message,
    };
  });
  const first = issues[0];
  return new ReviewDraftError(
    first
      ? reviewFieldLabel(first.field) + ": " + first.message
      : "Check the review fields.",
    "draft-fields-invalid",
    422,
    issues,
  );
}
