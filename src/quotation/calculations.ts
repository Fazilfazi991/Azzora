import type {
  Quotation,
  QuotationLineItem,
  QuotationPaymentTerm,
  QuotationSection,
} from "./model";
// Decimal strings → integer fractions. BigInt never serializes into persisted records.
export function decimal(value: string): { n: bigint; d: bigint } {
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(value))
    throw Error("Enter a non-negative decimal with up to six decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) };
}
const round = (n: bigint, d: bigint) => (n * 2n + d) / (2n * d);
export function cents(value: string): bigint {
  const v = decimal(value);
  return round(v.n * 100n, v.d);
}
export function lineAmount(row: QuotationLineItem): bigint {
  if (row.pricingType !== "Normal Rate") return 0n;
  if (row.amountOverride !== undefined && row.amountOverride !== "")
    return cents(row.amountOverride);
  const q = decimal(row.quantity),
    r = decimal(row.rate);
  return round(q.n * r.n * 100n, q.d * r.d);
}
export const sectionAmount = (section: QuotationSection) =>
  section.rows.reduce((sum, row) => sum + lineAmount(row), 0n);
export const discountAmount = (q: Quotation) => cents(q.discount || "0");
export function totals(q: Quotation) {
  const subtotal = q.sections.reduce(
    (sum, section) => sum + sectionAmount(section),
    0n,
  );
  const v = decimal(q.vatPercentage || "0");
  const discount = discountAmount(q);
  if (discount > subtotal) throw Error("Discount cannot exceed subtotal.");
  const net = subtotal - discount;
  const vat = q.vatEnabled ? round(net * v.n, v.d * 100n) : 0n;
  return { subtotal, vat, grand: net + vat };
}
export function paymentAmount(term: QuotationPaymentTerm, grand: bigint) {
  if (term.amountOverride !== undefined && term.amountOverride !== "")
    return cents(term.amountOverride);
  const p = decimal(term.percentage || "0");
  return round(grand * p.n, p.d * 100n);
}
/**
 * Align future automatic schedules with the document total without editing any
 * saved term. Legacy/issued records without the opt-in and explicit source
 * overrides retain their recorded payment amounts exactly.
 */
export function paymentScheduleAmounts(q: Quotation, grand: bigint): bigint[] {
  const amounts = q.payments.map((term) => paymentAmount(term, grand));
  if (
    q.paymentRoundingPolicy !== "reconcile-final" ||
    !amounts.length ||
    q.payments.some(
      (term) => term.amountOverride !== undefined && term.amountOverride !== "",
    ) ||
    paymentPercentage(q) !== 100000000n
  )
    return amounts;

  const positive = q.payments.map((term) => decimal(term.percentage).n > 0n);
  const positiveCount = positive.filter(Boolean).length;
  const minimum = grand >= BigInt(positiveCount) ? 1n : 0n;
  for (let index = 0; index < amounts.length; index++)
    if (positive[index] && amounts[index] < minimum) amounts[index] = minimum;

  let difference = grand - amounts.reduce((sum, amount) => sum + amount, 0n);
  const lastPositive = positive.lastIndexOf(true);
  if (difference > 0n && lastPositive >= 0) {
    amounts[lastPositive] += difference;
  } else if (difference < 0n) {
    // Reduce the last rounded line first, but retain one fils per positive
    // milestone whenever the total can fund that many milestones.
    for (
      let index = amounts.length - 1;
      index >= 0 && difference < 0n;
      index--
    ) {
      const floor = positive[index] ? minimum : 0n;
      const available = amounts[index] - floor;
      const reduction = available < -difference ? available : -difference;
      amounts[index] -= reduction;
      difference += reduction;
    }
  }
  return amounts;
}
export function paymentPercentage(q: Quotation) {
  return q.payments.reduce((sum, term) => {
    const p = decimal(term.percentage || "0");
    return sum + (p.n * 1000000n) / p.d;
  }, 0n);
}
export function formatMoney(value: bigint, prefix = false): string {
  if (value < 0n) return (prefix ? "AED " : "") + "−" + formatMoney(-value);
  const s = value.toString().padStart(3, "0");
  return (
    (prefix ? "AED " : "") +
    s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    s.slice(-2)
  );
}
export function amountInWords(value: bigint): string {
  const ones = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  function words(n: bigint): string {
    if (n < 20n) return ones[Number(n)];
    if (n < 100n)
      return tens[Number(n / 10n)] + (n % 10n ? " " + words(n % 10n) : "");
    for (const [scale, label] of [
      [1000000000000n, "Trillion"],
      [1000000000n, "Billion"],
      [1000000n, "Million"],
      [1000n, "Thousand"],
      [100n, "Hundred"],
    ] as const)
      if (n >= scale)
        return (
          words(n / scale) +
          " " +
          label +
          (n % scale ? " " + words(n % scale) : "")
        );
    return "";
  }
  return words(value / 100n) + " Dirhams and " + words(value % 100n) + " Fils";
}
export function displayAmount(row: QuotationLineItem) {
  return row.pricingType === "Normal Rate"
    ? formatMoney(lineAmount(row))
    : ["Heading", "Included"].includes(row.pricingType)
      ? ""
      : row.pricingType;
}

/** Rate labels are presentation only; saved legacy numeric rates remain untouched. */
export function displayRate(row: QuotationLineItem) {
  return row.pricingType === "Normal Rate"
    ? formatMoney(cents(row.rate))
    : ["Heading", "Included"].includes(row.pricingType)
      ? ""
      : row.pricingType;
}
