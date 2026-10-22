import type { ReferenceCatalog } from "./documents/model";

export interface ReviewLineInput {
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  productId?: string;
  details?: string;
}

export interface ReviewStoredLine extends ReviewLineInput {
  amountFils: string;
}

export const MAX_REVIEW_LINES = 80;
export const blankReviewLine = (): ReviewLineInput => ({
  description: "",
  quantity: "1",
  unit: "Nos",
  rate: "",
});

type LineField = keyof ReviewLineInput;
export class ItemLinesValidationError extends Error {
  constructor(
    message: string,
    readonly lineIndex: number,
    readonly field?: LineField,
  ) {
    super(message);
    this.name = "ItemLinesValidationError";
  }
}

function decimal(value: string, field: "quantity" | "rate", index: number) {
  // Limit input length as well as decimal precision before converting to BigInt.
  if (
    typeof value !== "string" ||
    !/^\d{1,18}(?:\.\d{1,4})?$/.test(value.trim())
  ) {
    throw new ItemLinesValidationError(
      `Item ${index + 1}: enter a nonnegative ${field} with up to four decimal places.`,
      index,
      field,
    );
  }
  const cleaned = value.trim();
  const [whole, fraction = ""] = cleaned.split(".");
  return {
    value: BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0")),
    text: cleaned,
  };
}

function lineText(
  value: unknown,
  field: "description" | "unit" | "details" | "productId",
  max: number,
  index: number,
  required = false,
) {
  if (
    (value !== undefined && typeof value !== "string") ||
    (required && !String(value ?? "").trim()) ||
    String(value ?? "").trim().length > max
  ) {
    throw new ItemLinesValidationError(
      `Item ${index + 1}: ${field} ${required ? "is required and " : ""}must be at most ${max} characters.`,
      index,
      field,
    );
  }
  return typeof value === "string" ? value.trim() : "";
}

/** Each line is rounded half-up to integer fils; the subtotal sums those rounded lines. */
export function calculateItemLines(inputs: ReviewLineInput[]): {
  items: ReviewStoredLine[];
  subtotalFils: string;
} {
  if (
    !Array.isArray(inputs) ||
    inputs.length < 1 ||
    inputs.length > MAX_REVIEW_LINES
  ) {
    throw new ItemLinesValidationError(
      `Enter between 1 and ${MAX_REVIEW_LINES} items.`,
      -1,
    );
  }
  let subtotal = 0n;
  const items = inputs.map((input, index) => {
    if (!input || typeof input !== "object")
      throw new ItemLinesValidationError(
        `Item ${index + 1}: invalid item.`,
        index,
      );
    const description = lineText(
      input.description,
      "description",
      500,
      index,
      true,
    );
    const unit = lineText(input.unit, "unit", 40, index, true);
    const details = lineText(input.details, "details", 1000, index);
    const productId = lineText(input.productId, "productId", 200, index);
    const quantity = decimal(input.quantity, "quantity", index);
    const rate = decimal(input.rate, "rate", index);
    if (quantity.value <= 0n)
      throw new ItemLinesValidationError(
        `Item ${index + 1}: quantity must be greater than zero.`,
        index,
        "quantity",
      );
    // Four decimal places in both inputs yield 8 in their product; convert to 2.
    const amount = (quantity.value * rate.value + 500000n) / 1000000n;
    subtotal += amount;
    return {
      description,
      quantity: quantity.text,
      unit,
      rate: rate.text,
      ...(details ? { details } : {}),
      ...(productId ? { productId } : {}),
      amountFils: amount.toString(),
    };
  });
  return { items, subtotalFils: subtotal.toString() };
}

export function reviewFilsToDecimal(value: string): string {
  const fils = BigInt(value);
  const negative = fils < 0n;
  const abs = negative ? -fils : fils;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

const comparableText = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
export interface CatalogPriceNotice {
  referenceRate: string;
  currentRate: string;
  direction: "increase" | "decrease";
}

/** A catalog reference is not purchase history. Ambiguous or non-comparable entries are ignored. */
export function comparableCatalogPrice(
  line: ReviewLineInput,
  supplier: string,
  products: ReferenceCatalog["products"],
): CatalogPriceNotice | undefined {
  if (!supplier.trim() || !line.unit.trim()) return;
  const candidates = products.filter(
    (product) =>
      (line.productId
        ? product.id === line.productId
        : comparableText(product.name) === comparableText(line.description)) &&
      comparableText(product.unit) === comparableText(line.unit) &&
      comparableText(product.supplier) === comparableText(supplier),
  );
  if (candidates.length !== 1) return;
  try {
    const current = decimal(line.rate, "rate", 0);
    const reference = decimal(candidates[0].rate, "rate", 0);
    if (current.value === reference.value) return;
    return {
      currentRate: current.text,
      referenceRate: reference.text,
      direction: current.value > reference.value ? "increase" : "decrease",
    };
  } catch {
    return;
  }
}
