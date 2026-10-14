import type { Database } from "../domain/model";
import type { CommercialFilter, Invoice, InvoiceLine } from "./model";
import { cents, decimal, formatMoney } from "../quotation/calculations";
import { today, days } from "../domain/logic";

export { cents };
export const aed = (n: bigint) => formatMoney(n, true);
export const dubaiDate = (timestamp: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
export const amountString = (n: bigint): string =>
  n < 0n
    ? "-" + amountString(-n)
    : `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
export const round = (n: bigint, d: bigint) => (n * 2n + d) / (2n * d);
export function lineGross(line: InvoiceLine) {
  const q = decimal(line.quantity),
    r = decimal(line.rate);
  return round(q.n * r.n * 100n, q.d * r.d);
}
export function invoiceTotals(i: Invoice) {
  if (i.snapshot && i.status !== "Draft")
    return Object.fromEntries(
      ["subtotal", "discount", "net", "vat", "grand"].map((k) => [
        k,
        BigInt(i.snapshot![k as "subtotal"]),
      ]),
    ) as {
      subtotal: bigint;
      discount: bigint;
      net: bigint;
      vat: bigint;
      grand: bigint;
    };
  const values = i.lines.map(lineGross);
  const subtotal = values.reduce((s, v) => s + v, 0n);
  const discount = cents(i.discount || "0");
  if (discount > subtotal) throw Error("Discount cannot exceed subtotal.");
  const rate = decimal(i.vatPercentage);
  if (rate.n > 100n * rate.d) throw Error("VAT must be between 0 and 100%.");
  // Allocate the invoice discount proportionately. Last non-zero row absorbs fils.
  let last = -1;
  values.forEach((v, index) => {
    if (v > 0n) last = index;
  });
  let assigned = 0n,
    net = 0n,
    vat = 0n;
  i.lines.forEach((line, index) => {
    const share =
      index === last
        ? discount - assigned
        : subtotal
          ? (discount * values[index]) / subtotal
          : 0n;
    assigned += share;
    const value = values[index] - share;
    if (line.tax === "Inclusive") {
      const base = round(value * rate.d * 100n, rate.d * 100n + rate.n);
      net += base;
      vat += value - base;
    } else {
      net += value;
      if (line.tax === "Exclusive") vat += round(value * rate.n, rate.d * 100n);
    }
  });
  return { subtotal, discount, net, vat, grand: net + vat };
}
export function paidAmount(db: Database, id: string, asOf = today()) {
  return db.payments
    .filter(
      (p) =>
        p.invoiceId === id &&
        p.date <= asOf &&
        (!p.reversalDate || p.reversalDate > asOf),
    )
    .reduce((s, p) => s + cents(p.amount), 0n);
}
export function balanceDue(db: Database, i: Invoice, asOf = today()) {
  return i.status === "Issued"
    ? invoiceTotals(i).grand - paidAmount(db, i.id, asOf)
    : 0n;
}
export function invoiceStatus(db: Database, i: Invoice, asOf = today()) {
  if (i.status !== "Issued") return i.status;
  const balance = balanceDue(db, i, asOf),
    paid = paidAmount(db, i.id, asOf);
  return balance === 0n
    ? "Paid"
    : i.due < asOf
      ? "Overdue"
      : paid > 0n
        ? "Partially Paid"
        : "Issued";
}
export const effectiveProject = (db: Database, quotationId: string) =>
  db.contracts.find((c) => c.quotationId === quotationId)?.projectId ||
  db.quotations.find((q) => q.id === quotationId)?.projectId ||
  "";
export const matches = (
  customerId: string,
  projectId: string,
  date: string,
  f: CommercialFilter,
) =>
  (!f.customerId || customerId === f.customerId) &&
  (!f.projectId || projectId === f.projectId) &&
  (!f.from || date >= f.from) &&
  (!f.to || date <= f.to);
export function financials(db: Database, f: CommercialFilter) {
  const invoices = db.invoices.filter(
    (i) =>
      i.status === "Issued" &&
      matches(i.customerId, i.projectId, i.date, f) &&
      (!f.status || invoiceStatus(db, i) === f.status),
  );
  const contracts = db.contracts.filter((c) =>
    matches(c.customerId, c.projectId, dubaiDate(c.acceptedAt), f),
  );
  const payments = db.payments.filter(
    (p) =>
      !p.reversedAt &&
      p.date <= today() &&
      matches(p.customerId, p.projectId, p.date, f) &&
      (!f.status ||
        db.invoices.some(
          (i) => i.id === p.invoiceId && invoiceStatus(db, i) === f.status,
        )),
  );
  const expenses = db.expenses.filter((e) =>
    matches(
      db.projects.find((p) => p.id === e.projectId)?.clientId || "",
      e.projectId,
      e.date,
      f,
    ),
  );
  const contract = contracts.reduce((s, c) => s + BigInt(c.net), 0n);
  const invoiced = invoices.reduce((s, i) => s + invoiceTotals(i).grand, 0n);
  const collected = payments.reduce((s, p) => s + cents(p.amount), 0n);
  const outstanding = invoices.reduce((s, i) => s + balanceDue(db, i), 0n);
  const overdue = invoices
    .filter((i) => i.due < today())
    .reduce((s, i) => s + balanceDue(db, i), 0n);
  const costs = expenses.reduce((s, e) => s + cents(e.amount), 0n);
  const paidCosts = expenses.reduce((s, e) => s + cents(e.paidAmount), 0n);
  const profit = contract - costs;
  return {
    contract,
    invoiced,
    collected,
    outstanding,
    overdue,
    costs,
    paidCosts,
    profit,
    margin: contract ? Number((profit * 10000n) / contract) / 100 : null,
    invoices,
    payments,
    expenses,
    contracts,
  };
}
export function ageingBucket(due: string, asOf = today()) {
  const late = days(due, asOf);
  return late <= 0
    ? "Current"
    : late <= 30
      ? "1–30 days"
      : late <= 60
        ? "31–60 days"
        : late <= 90
          ? "61–90 days"
          : "90+ days";
}
