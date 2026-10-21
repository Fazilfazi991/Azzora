import type { Invoice } from "../commercial/model";

/** Metadata contract for future invoices; existing records have no inferred type. */
export type InvoiceKind = "Tax" | "Normal" | "Proforma";
export type ResolvedInvoiceKind = InvoiceKind | "Legacy";
export type FinalInvoiceKind = Exclude<InvoiceKind, "Proforma">;

export interface TypedInvoiceIdentity {
  id: string;
  kind: InvoiceKind;
  status: Invoice["status"];
  sourceProformaId?: string;
}

export interface InvoiceSeries {
  prefix: string;
  next: number;
}

export type InvoiceSeriesByKind = Record<InvoiceKind, InvoiceSeries>;

export function invoiceKind(
  invoice: Invoice & { kind?: InvoiceKind },
): ResolvedInvoiceKind {
  if (invoice.kind && !["Tax", "Normal", "Proforma"].includes(invoice.kind))
    throw Error("Invoice type is incompatible and requires recovery review.");
  return invoice.kind ?? "Legacy";
}

export function invoiceHeading(kind: ResolvedInvoiceKind): string {
  switch (kind) {
    case "Tax":
      return "Tax Invoice";
    case "Normal":
    case "Legacy":
      return "Invoice";
    case "Proforma":
      return "Proforma Invoice";
  }
}

export function recognitionGate(
  kind: ResolvedInvoiceKind,
): "prohibited" | "policy-required" | "legacy-unchanged" {
  if (kind === "Proforma") return "prohibited";
  if (kind === "Legacy") return "legacy-unchanged";
  return "policy-required";
}

/** Pure reservation preview; caller must persist the returned counter atomically. */
export function reserveInvoiceNumber(
  kind: InvoiceKind,
  series: InvoiceSeriesByKind,
  usedNumbers: ReadonlySet<string>,
): { number: string; series: InvoiceSeriesByKind } {
  const prefixes = Object.values(series).map((item) =>
    item.prefix.trim().toLowerCase(),
  );
  if (
    prefixes.some((prefix) => !prefix) ||
    new Set(prefixes).size !== prefixes.length
  )
    throw Error("Each invoice type needs a distinct non-empty prefix.");
  const selected = series[kind];
  if (!selected || !Number.isSafeInteger(selected.next) || selected.next < 1)
    throw Error("Invoice numbering counter is invalid.");
  const used = new Set([...usedNumbers].map((number) => number.toLowerCase()));
  let next = selected.next;
  let number = `${selected.prefix}${String(next).padStart(5, "0")}`;
  while (used.has(number.toLowerCase())) {
    next++;
    if (!Number.isSafeInteger(next))
      throw Error("Invoice numbering counter is exhausted.");
    number = `${selected.prefix}${String(next).padStart(5, "0")}`;
  }
  if (!Number.isSafeInteger(next + 1))
    throw Error("Invoice numbering counter is exhausted.");
  return {
    number,
    series: { ...series, [kind]: { ...selected, next: next + 1 } },
  };
}

/** A conversion is a new final document linked to an immutable proforma. */
export function validateProformaConversion(
  source: TypedInvoiceIdentity,
  targetKind: FinalInvoiceKind,
  existing: readonly TypedInvoiceIdentity[],
): { sourceProformaId: string; kind: FinalInvoiceKind } {
  if (targetKind !== "Tax" && targetKind !== "Normal")
    throw Error("A proforma must convert to a final invoice type.");
  if (source.kind !== "Proforma" || source.status !== "Issued")
    throw Error("Only an issued proforma can be converted.");
  if (
    existing.some(
      (invoice) =>
        invoice.id !== source.id &&
        invoice.sourceProformaId === source.id &&
        invoice.status !== "Cancelled",
    )
  )
    throw Error("A live final invoice already references this proforma.");
  return { sourceProformaId: source.id, kind: targetKind };
}
