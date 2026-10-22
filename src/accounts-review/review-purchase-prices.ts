import type { ReviewDocument } from "./domain";
import { calculateItemLines, type ReviewLineInput } from "./item-lines";

export interface PurchasePriceWarning {
  lineIndex: number;
  productId: string;
  supplier: string;
  unit: string;
  currency: "AED";
  basis: "VAT-free";
  priorBillId: string;
  priorBillDate: string;
  priorRate: string;
  currentRate: string;
  direction: "increase" | "decrease";
}

const normalize = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}
function scaledRate(value: string): bigint | undefined {
  if (!/^\d{1,18}(?:\.\d{1,4})?$/.test(value.trim())) return;
  const [whole, fraction = ""] = value.trim().split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}

/** ReviewDocument uses AED. Only explicit zero-tax itemized issued bills qualify. */
export function purchasePriceWarnings(
  items: ReviewLineInput[],
  supplier: string,
  date: string,
  bills: ReviewDocument[],
  excludeId?: string,
): PurchasePriceWarning[] {
  if (!supplier.trim() || !validDate(date)) return [];
  const comparable = bills.filter((bill) => {
    if (
      bill.id === excludeId ||
      bill.status !== "Issued" ||
      !validDate(bill.date) ||
      bill.date > date ||
      normalize(bill.party) !== normalize(supplier) ||
      bill.taxFils !== "0" ||
      !bill.items?.length
    )
      return false;
    // Future/foreign data must never be compared on an assumed AED basis.
    if ("currency" in bill && bill.currency !== "AED") return false;
    try {
      const calculated = calculateItemLines(bill.items);
      return (
        calculated.subtotalFils === bill.subtotalFils &&
        calculated.subtotalFils === bill.amountFils &&
        calculated.items.every(
          (item, index) => item.amountFils === bill.items![index].amountFils,
        )
      );
    } catch {
      return false;
    }
  });
  return items.flatMap((item, lineIndex) => {
    if (!item.productId?.trim() || !item.unit.trim()) return [];
    const currentRate = scaledRate(item.rate);
    if (currentRate === undefined) return [];
    const matches = comparable.flatMap((bill) =>
      bill
        .items!.filter(
          (previous) =>
            previous.productId === item.productId &&
            normalize(previous.unit) === normalize(item.unit),
        )
        .map((previous) => ({ bill, previous })),
    );
    if (!matches.length) return [];
    const latestDate = matches.reduce(
      (latest, match) => (match.bill.date > latest ? match.bill.date : latest),
      "",
    );
    const latest = matches.filter((match) => match.bill.date === latestDate);
    const rates = new Set(
      latest.map((match) => scaledRate(match.previous.rate)?.toString()),
    );
    // Dates have no time-of-day ordering; conflicting rates on the latest date are ambiguous.
    if (rates.size !== 1 || rates.has(undefined)) return [];
    const selected = latest
      .slice()
      .sort((a, b) => a.bill.id.localeCompare(b.bill.id))[0];
    const priorRate = scaledRate(selected.previous.rate)!;
    if (priorRate === currentRate) return [];
    return [
      {
        lineIndex,
        productId: item.productId,
        supplier: selected.bill.party,
        unit: selected.previous.unit,
        currency: "AED" as const,
        basis: "VAT-free" as const,
        priorBillId: selected.bill.id,
        priorBillDate: selected.bill.date,
        priorRate: selected.previous.rate,
        currentRate: item.rate,
        direction:
          currentRate > priorRate
            ? ("increase" as const)
            : ("decrease" as const),
      },
    ];
  });
}
