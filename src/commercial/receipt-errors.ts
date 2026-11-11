/** Fixed, safe-to-display validation messages. Never include receipt data. */
export class DuplicateReceiptError extends Error {
  readonly status = 400;
  readonly code: "duplicate_receipt" | "duplicate_payment_reference";

  constructor(kind: "identity" | "reference") {
    super(
      kind === "reference"
        ? "Duplicate payment reference for this account. Open the existing receipt or enter a different reference."
        : "Duplicate receipt. Open the existing receipt instead of posting it again.",
    );
    this.name = "DuplicateReceiptError";
    this.code =
      kind === "reference"
        ? "duplicate_payment_reference"
        : "duplicate_receipt";
  }
}
