import type { Database } from "../domain/model";
import type { CommercialFilter, Invoice, InvoiceLine } from "./model";
import { cents, decimal, formatMoney } from "../quotation/calculations";
import { today, days } from "../domain/logic";
import {
  credited,
  refunded,
  invoicePosition,
} from "../operations/calculations";
import { getOperations } from "../operations/migration";

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
/** Proportional floors; allocate residual fils from the final row backwards,
 * bounded by each row's remaining value. Keeps the historic final-row policy
 * wherever it fits, including zero-value trailing rows, without negative bases. */
export function allocateDiscount(values: bigint[], discount: bigint) {
  const subtotal = values.reduce((sum, value) => sum + value, 0n);
  if (discount < 0n || values.some((value) => value < 0n))
    throw Error("Discount and line values must be non-negative.");
  if (discount > subtotal) throw Error("Discount cannot exceed subtotal.");
  const shares = values.map((value) =>
    subtotal ? (discount * value) / subtotal : 0n,
  );
  let remaining = discount - shares.reduce((sum, value) => sum + value, 0n);
  for (let index = values.length - 1; index >= 0 && remaining > 0n; index--) {
    const capacity = values[index] - shares[index];
    const extra = remaining < capacity ? remaining : capacity;
    shares[index] += extra;
    remaining -= extra;
  }
  return shares;
}
export function invoiceLineTotals(
  i: Pick<Invoice, "lines" | "discount" | "vatPercentage">,
) {
  const values = i.lines.map(lineGross),
    shares = allocateDiscount(values, cents(i.discount || "0")),
    rate = decimal(i.vatPercentage);
  if (rate.n > 100n * rate.d) throw Error("VAT must be between 0 and 100%.");
  return i.lines.map((line, index) => {
    const value = values[index] - shares[index];
    if (!["Inclusive", "Exclusive", "Zero Rated", "Exempt"].includes(line.tax))
      throw Error("Choose a valid tax treatment.");
    const net =
      line.tax === "Inclusive"
        ? round(value * rate.d * 100n, rate.d * 100n + rate.n)
        : value;
    const vat =
      line.tax === "Inclusive"
        ? value - net
        : line.tax === "Exclusive"
          ? round(value * rate.n, rate.d * 100n)
          : 0n;
    if (value < 0n || net < 0n || vat < 0n)
      throw Error("Invoice taxable bases and VAT must be non-negative.");
    return {
      subtotal: values[index],
      discount: shares[index],
      net,
      vat,
      grand: net + vat,
    };
  });
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
  return invoiceLineTotals(i).reduce(
    (total, line) => ({
      subtotal: total.subtotal + line.subtotal,
      discount: total.discount + line.discount,
      net: total.net + line.net,
      vat: total.vat + line.vat,
      grand: total.grand + line.grand,
    }),
    { subtotal: 0n, discount: 0n, net: 0n, vat: 0n, grand: 0n },
  );
}
/** Credit eligibility must use the posted line basis, never a new tax allocation. */
export function invoiceCreditLines(i: Invoice) {
  const review = () => {
    throw Error(
      "Original invoice allocation requires explicit review before credit adjustments.",
    );
  };
  if (i.status === "Draft")
    return invoiceLineTotals(i).map((line, index) => ({
      ...line,
      itemId: i.lines[index].id,
    }));
  const snapshot = i.snapshot;
  if (!snapshot) return review();
  if (new Set(i.lines.map((line) => line.id)).size !== i.lines.length)
    return review();
  let rows;
  if (
    snapshot.allocationVersion !== undefined ||
    snapshot.lineAllocations !== undefined
  ) {
    if (
      snapshot.allocationVersion !== 1 ||
      !Array.isArray(snapshot.lineAllocations) ||
      snapshot.lineAllocations.length !== i.lines.length
    )
      return review();
    const ids = new Set<string>();
    rows = snapshot.lineAllocations.map((line) => {
      if (
        ids.has(line.itemId) ||
        !i.lines.some((item) => item.id === line.itemId) ||
        !["Inclusive", "Exclusive", "Exempt", "Zero Rated"].includes(line.tax)
      )
        return review();
      ids.add(line.itemId);
      const money = (value: string) =>
        /^\d+$/.test(value) ? BigInt(value) : review();
      const row = {
        itemId: line.itemId,
        subtotal: money(line.subtotal),
        discount: money(line.discount),
        net: money(line.net),
        vat: money(line.vat),
        grand: money(line.grand),
      };
      const entered = row.subtotal - row.discount;
      if (
        entered < 0n ||
        row.net + row.vat !== row.grand ||
        (line.tax === "Inclusive" ? row.grand : row.net) !== entered ||
        (["Exempt", "Zero Rated"].includes(line.tax) && row.vat !== 0n)
      )
        return review();
      return row;
    });
  } else {
    // A legacy invoice was issued with the old final-row remainder policy.
    // Its allocation is reconstructible only when that policy had valid capacity.
    const values = i.lines.map(lineGross),
      subtotal = values.reduce((s, n) => s + n, 0n),
      discount = cents(i.discount || "0");
    let last = -1,
      assigned = 0n;
    values.forEach((n, index) => {
      if (n > 0n) last = index;
    });
    values.forEach((n, index) => {
      const share =
        index === last
          ? discount - assigned
          : subtotal
            ? (discount * n) / subtotal
            : 0n;
      if (share < 0n || share > n) review();
      assigned += share;
    });
    rows = invoiceLineTotals(i).map((line, index) => ({
      ...line,
      itemId: i.lines[index].id,
    }));
  }
  for (const key of ["subtotal", "discount", "net", "vat", "grand"] as const)
    if (rows.reduce((sum, row) => sum + row[key], 0n) !== BigInt(snapshot[key]))
      return review();
  return i.lines.map((item) => rows.find((row) => row.itemId === item.id)!);
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
  const value = i.status === "Issued" ? invoicePosition(db, i, asOf) : 0n;
  return value > 0n ? value : 0n;
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
  const expenses = db.expenses.filter(
    (e) =>
      !e.cancelledAt &&
      matches(
        db.projects.find((p) => p.id === e.projectId)?.clientId || "",
        e.projectId,
        e.date,
        f,
      ),
  );
  const approvedVariations = getOperations(db)
    .variations.filter(
      (v) =>
        v.status === "Approved" &&
        matches(v.customerId, v.projectId, dubaiDate(v.approvedAt!), f),
    )
    .reduce((s, v) => s + BigInt(v.net!), 0n);
  const originalContract = contracts.reduce((s, c) => s + BigInt(c.net), 0n);
  const contract = originalContract + approvedVariations;
  const invoiced = invoices.reduce((s, i) => s + invoiceTotals(i).grand, 0n);
  const collected = payments.reduce((s, p) => s + cents(p.amount), 0n);
  const outstanding = invoices.reduce((s, i) => s + balanceDue(db, i), 0n);
  const credits = invoices.reduce((s, i) => s + credited(db, i.id), 0n);
  const refunds = invoices.reduce((s, i) => s + refunded(db, i.id), 0n);
  const customerCredit = invoices.reduce((s, i) => {
    const value = invoicePosition(db, i);
    return s + (value < 0n ? -value : 0n);
  }, 0n);
  const overdue = invoices
    .filter((i) => i.due < today())
    .reduce((s, i) => s + balanceDue(db, i), 0n);
  const costs = expenses.reduce((s, e) => s + cents(e.amount), 0n);
  const paidCosts = expenses.reduce((s, e) => s + cents(e.paidAmount), 0n);
  const profit = contract - costs;
  return {
    contract,
    originalContract,
    approvedVariations,
    credits,
    refunds,
    customerCredit,
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
