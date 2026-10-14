import type { Database } from "../domain/model";
import type { CommercialFilter } from "./model";
import { emptyFilter } from "./model";
import {
  aed,
  amountString,
  balanceDue,
  paidAmount,
  cents,
  effectiveProject,
  financials,
  invoiceStatus,
  invoiceTotals,
  matches,
  ageingBucket,
  dubaiDate,
} from "./calculations";
import { discountAmount, totals } from "../quotation/calculations";
import { today, projectProgress, health } from "../domain/logic";
import { operationalReports, operationalReport } from "../operations/reports";
import { getOperations } from "../operations/migration";
export interface ReportData {
  headers: string[];
  rows: string[][];
}
export const reportNames = [
  "Customer Statement",
  "Quotation Register",
  "Quotation Conversion Report",
  "Invoice Register",
  "Accounts Receivable Ageing",
  "Payment Collection Report",
  "Project Expense Report",
  "Project Financial Summary",
  "Customer-wise Outstanding Report",
  "Portfolio Delivery",
  ...operationalReports,
] as const;
export type ReportName = (typeof reportNames)[number];
export function statementData(db: Database, f: CommercialFilter): ReportData {
  const cutoff = f.to || today();
  const entries: {
    date: string;
    ref: string;
    details: string;
    debit: bigint;
    credit: bigint;
    order: number;
  }[] = [];
  const related = db.invoices.filter(
    (i) =>
      !!i.issuedAt &&
      (!f.customerId || i.customerId === f.customerId) &&
      (!f.projectId || i.projectId === f.projectId),
  );
  for (const i of related) {
    entries.push({
      date: i.date,
      ref: i.number,
      details: i.description || "Invoice issued",
      debit: invoiceTotals(i).grand,
      credit: 0n,
      order: 0,
    });
    if (i.cancelledAt)
      entries.push({
        date: dubaiDate(i.cancelledAt),
        ref: i.number,
        details: "Invoice cancelled",
        debit: 0n,
        credit: invoiceTotals(i).grand,
        order: 3,
      });
  }
  for (const p of db.payments.filter((p) =>
    related.some((i) => i.id === p.invoiceId),
  )) {
    entries.push({
      date: p.date,
      ref: p.number,
      details: "Receipt · " + p.reference,
      debit: 0n,
      credit: cents(p.amount),
      order: 1,
    });
    if (p.reversalDate)
      entries.push({
        date: p.reversalDate,
        ref: p.number,
        details: "Reversal · " + p.reversalReason,
        debit: cents(p.amount),
        credit: 0n,
        order: 2,
      });
  }
  const op = getOperations(db);
  for (const c of op.credits.filter(
    (c) => c.status === "Issued" && related.some((i) => i.id === c.invoiceId),
  ))
    entries.push({
      date: c.date,
      ref: c.number,
      details: "Credit note · " + c.reason,
      debit: 0n,
      credit: cents(c.gross),
      order: 1,
    });
  for (const r of op.refunds.filter((r) =>
    related.some((i) => i.id === r.invoiceId),
  )) {
    entries.push({
      date: r.date,
      ref: r.number,
      details: "Customer refund · " + r.reference,
      debit: cents(r.amount),
      credit: 0n,
      order: 2,
    });
    if (r.reversalDate)
      entries.push({
        date: r.reversalDate,
        ref: r.number,
        details: "Refund reversal",
        debit: 0n,
        credit: cents(r.amount),
        order: 3,
      });
  }
  entries.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.order - b.order ||
      a.ref.localeCompare(b.ref),
  );
  let balance = entries
    .filter((e) => f.from && e.date < f.from)
    .reduce((s, e) => s + e.debit - e.credit, 0n);
  const rows: string[][] = [
    [
      f.from || "Opening",
      "",
      "Opening balance",
      "0.00",
      "0.00",
      amountString(balance),
    ],
  ];
  for (const e of entries.filter(
    (e) => (!f.from || e.date >= f.from) && e.date <= cutoff,
  )) {
    balance += e.debit - e.credit;
    rows.push([
      e.date,
      e.ref,
      e.details,
      amountString(e.debit),
      amountString(e.credit),
      amountString(balance),
    ]);
  }
  return {
    headers: [
      "Date",
      "Reference",
      "Description",
      "Debit AED",
      "Credit AED",
      "Balance AED",
    ],
    rows,
  };
}
export function reportData(
  db: Database,
  name: ReportName,
  f: CommercialFilter,
): ReportData {
  if ((operationalReports as readonly string[]).includes(name))
    return operationalReport(db, name, f);
  const cName = (id: string) =>
    db.clients.find((c) => c.id === id)?.name || "Unlinked";
  const pName = (id: string) =>
    db.projects.find((p) => p.id === id)?.code || "—";
  const invoices = db.invoices.filter(
    (i) =>
      matches(i.customerId, i.projectId, i.date, f) &&
      (!f.status || invoiceStatus(db, i) === f.status),
  );
  const qs = db.quotations.filter((q) =>
    matches(q.customerId, effectiveProject(db, q.id), q.date, f),
  );
  if (name === "Customer Statement") return statementData(db, f);
  if (name === "Quotation Register")
    return {
      headers: [
        "Quotation",
        "Revision",
        "Date",
        "Customer",
        "Project",
        "Status",
        "Net AED",
        "VAT AED",
        "Total AED",
      ],
      rows: qs.map((q) => {
        const t = totals(q);
        return [
          q.number,
          String(q.revision),
          q.date,
          cName(q.customerId),
          pName(effectiveProject(db, q.id)),
          q.status,
          amountString(t.subtotal - discountAmount(q)),
          amountString(t.vat),
          amountString(t.grand),
        ];
      }),
    };
  if (name === "Quotation Conversion Report")
    return {
      headers: [
        "Quotation",
        "Customer",
        "Status",
        "Accepted",
        "Converted",
        "Project",
        "Contract AED",
      ],
      rows: qs.map((q) => {
        const c = db.contracts.find((c) => c.quotationId === q.id);
        return [
          q.number + " Rev " + q.revision,
          cName(q.customerId),
          q.status,
          q.acceptedAt ? dubaiDate(q.acceptedAt) : "—",
          c ? dubaiDate(c.convertedAt) : "Not converted",
          pName(c?.projectId || q.projectId),
          c ? amountString(BigInt(c.net)) : "—",
        ];
      }),
    };
  if (name === "Invoice Register")
    return {
      headers: [
        "Invoice",
        "Date",
        "Due",
        "Customer",
        "Project",
        "Status",
        "Total AED",
        "Paid AED",
        "Balance AED",
      ],
      rows: invoices.map((i) => [
        i.number,
        i.date,
        i.due,
        i.snapshot?.customer.name || cName(i.customerId),
        pName(i.projectId),
        invoiceStatus(db, i),
        amountString(invoiceTotals(i).grand),
        amountString(i.status === "Issued" ? paidAmount(db, i.id) : 0n),
        amountString(balanceDue(db, i)),
      ]),
    };
  if (name === "Accounts Receivable Ageing") {
    const asOf = f.to || today();
    return {
      headers: [
        "Invoice",
        "Customer",
        "Project",
        "Due",
        "Ageing",
        "Balance AED",
      ],
      rows: db.invoices
        .filter(
          (i) =>
            i.issuedAt &&
            i.date <= asOf &&
            (!i.cancelledAt || dubaiDate(i.cancelledAt) > asOf) &&
            (!f.status ||
              invoiceStatus(db, { ...i, status: "Issued" }, asOf) ===
                f.status) &&
            (!f.customerId || i.customerId === f.customerId) &&
            (!f.projectId || i.projectId === f.projectId),
        )
        .map((i) => {
          const balance = balanceDue(db, { ...i, status: "Issued" }, asOf);
          return [
            i.number,
            cName(i.customerId),
            pName(i.projectId),
            i.due,
            ageingBucket(i.due, asOf),
            amountString(balance),
          ];
        })
        .filter((r) => r[5] !== "0.00"),
    };
  }
  if (name === "Payment Collection Report")
    return {
      headers: [
        "Receipt",
        "Invoice",
        "Date",
        "Customer",
        "Project",
        "Method",
        "Reference",
        "Status",
        "Amount AED",
      ],
      rows: db.payments
        .filter((p) => matches(p.customerId, p.projectId, p.date, f))
        .map((p) => [
          p.number,
          db.invoices.find((i) => i.id === p.invoiceId)?.number || "",
          p.date,
          cName(p.customerId),
          pName(p.projectId),
          p.method,
          p.reference,
          p.reversedAt ? "Reversed" : "Posted",
          amountString(cents(p.amount)),
        ]),
    };
  const s = financials(db, f);
  if (name === "Project Expense Report")
    return {
      headers: [
        "Expense",
        "Project",
        "Date",
        "Category",
        "Supplier",
        "Cost AED",
        "VAT AED",
        "Paid AED",
      ],
      rows: s.expenses.map((e) => [
        e.reference,
        pName(e.projectId),
        e.date,
        e.category,
        e.supplier,
        amountString(cents(e.amount)),
        amountString(cents(e.vat)),
        amountString(cents(e.paidAmount)),
      ]),
    };
  if (name === "Project Financial Summary")
    return {
      headers: [
        "Project",
        "Customer",
        "Contract AED",
        "Invoiced AED",
        "Collected AED",
        "Balance AED",
        "Cost AED",
        "Est. Profit AED",
        "Margin %",
      ],
      rows: db.projects
        .filter(
          (p) =>
            (!f.customerId || p.clientId === f.customerId) &&
            (!f.projectId || p.id === f.projectId),
        )
        .map((p) => {
          const n = financials(db, { ...f, projectId: p.id });
          return [
            p.code,
            cName(p.clientId),
            amountString(n.contract),
            amountString(n.invoiced),
            amountString(n.collected),
            amountString(n.outstanding),
            amountString(n.costs),
            n.contracts.length ? amountString(n.profit) : "No contract",
            n.margin === null ? "—" : n.margin.toFixed(2),
          ];
        }),
    };
  if (name === "Customer-wise Outstanding Report")
    return {
      headers: [
        "Customer",
        "Invoiced AED",
        "Collected AED",
        "Balance AED",
        "Overdue AED",
      ],
      rows: db.clients
        .filter((c) => !f.customerId || c.id === f.customerId)
        .map((c) => {
          const n = financials(db, { ...f, customerId: c.id });
          return [
            c.name,
            amountString(n.invoiced),
            amountString(n.collected),
            amountString(n.outstanding),
            amountString(n.overdue),
          ];
        }),
    };
  return {
    headers: [
      "Project",
      "Customer",
      "Progress %",
      "Health",
      "Target",
      "Status",
      "Estimated Value AED",
    ],
    rows: db.projects
      .filter((p) => matches(p.clientId, p.id, p.start, f))
      .map((p) => [
        p.code + " · " + p.name,
        cName(p.clientId),
        String(projectProgress(db, p.id)),
        health(db, p.id),
        p.due,
        p.status,
        aed(cents(p.value.toFixed(2))),
      ]),
  };
}
export function csv(data: ReportData) {
  // Guard spreadsheet formula injection as well as commas, quotes and newlines.
  const cell = (value: string) =>
    '"' +
    (/^[=+@\-\t\r]/.test(value) ? "'" : "") +
    value.replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    [data.headers, ...data.rows]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
export function downloadCsv(data: ReportData, filename: string) {
  const url = URL.createObjectURL(
    new Blob([csv(data)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const allFinancials = (db: Database) => financials(db, emptyFilter);
