import type { Database } from "../domain/model";
import type { CommercialFilter } from "../commercial/model";
import type { ReportData } from "../commercial/reports-data";
import { getOperations } from "./migration";
import {
  projectCosts,
  orderTotals,
  quantityString,
  deliveredQuantity,
  quantityUnits,
  supplierBalance,
  supplierPaid,
} from "./calculations";
import { amountString, cents, dubaiDate } from "../commercial/calculations";
import { today } from "../domain/logic";
export const operationalReports = [
  "Variation Register",
  "Purchase Order Register",
  "Material Delivery Status",
  "Supplier Statement",
  "Supplier Outstanding",
  "Purchase Commitment Report",
  "Project Budget vs Actual",
  "Forecast Profitability",
  "Credit Note Register",
  "Approval Pending Report",
] as const;
export function operationalReport(
  db: Database,
  name: string,
  f: CommercialFilter,
): ReportData {
  const op = getOperations(db),
    customer = (projectId: string) =>
      db.projects.find((p) => p.id === projectId)?.clientId,
    pName = (id: string) => db.projects.find((p) => p.id === id)?.code || "—",
    sName = (id: string) => op.suppliers.find((s) => s.id === id)?.name || "—";
  const match = (projectId: string, date = "", supplierId = "") =>
    (!f.projectId || f.projectId === projectId) &&
    (!f.customerId || customer(projectId) === f.customerId) &&
    (!f.supplierId || !supplierId || f.supplierId === supplierId) &&
    (!date || ((!f.from || date >= f.from) && (!f.to || date <= f.to)));
  if (name === "Variation Register")
    return {
      headers: [
        "Variation",
        "Project",
        "Type",
        "Status",
        "Net AED",
        "VAT AED",
        "Total AED",
      ],
      rows: op.variations
        .filter((v) => match(v.projectId, v.date))
        .map((v) => [
          v.number + " Rev " + v.revision,
          pName(v.projectId),
          v.direction,
          v.status,
          v.net ? amountString(BigInt(v.net)) : "Unapproved",
          v.vat ? amountString(BigInt(v.vat)) : "—",
          v.gross ? amountString(BigInt(v.gross)) : "—",
        ]),
    };
  if (
    name === "Purchase Order Register" ||
    name === "Purchase Commitment Report"
  )
    return {
      headers: [
        "PO",
        "Project",
        "Supplier",
        "Date",
        "Delivery",
        "Status",
        "Net Committed AED",
        "VAT AED",
        "Total AED",
        "Open Commitment AED",
      ],
      rows: op.orders
        .filter((o) => match(o.projectId, o.date, o.supplierId))
        .map((o) => {
          const t = orderTotals(o),
            billed = op.bills
              .filter((b) => b.poId === o.id && b.status === "Issued")
              .reduce((s, b) => s + BigInt(b.net), 0n);
          return [
            o.number,
            pName(o.projectId),
            sName(o.supplierId),
            o.date,
            o.deliveryDate,
            o.status,
            amountString(o.status === "Approved" ? t.net : 0n),
            amountString(t.vat),
            amountString(t.grand),
            amountString(o.status === "Approved" ? t.net - billed : 0n),
          ];
        }),
    };
  if (name === "Material Delivery Status")
    return {
      headers: [
        "PO",
        "Project",
        "Supplier",
        "Item",
        "Required",
        "Ordered Quantity",
        "Delivered Quantity",
        "Pending Quantity",
      ],
      rows: op.orders
        .filter(
          (o) =>
            match(o.projectId, o.date, o.supplierId) && o.status === "Approved",
        )
        .flatMap((o) =>
          o.items.map((i) => [
            o.number,
            pName(o.projectId),
            sName(o.supplierId),
            i.description,
            o.deliveryDate,
            i.quantity,
            quantityString(deliveredQuantity(db, o.id, i.id)),
            quantityString(
              quantityUnits(i.quantity) - deliveredQuantity(db, o.id, i.id),
            ),
          ]),
        ),
    };
  if (name === "Supplier Outstanding")
    return {
      headers: [
        "Supplier",
        "Bill",
        "Supplier Invoice",
        "Project",
        "Due",
        "Total AED",
        "Paid AED",
        "Outstanding AED",
      ],
      rows: op.bills
        .filter(
          (b) =>
            match(b.projectId, b.date, b.supplierId) && b.status === "Issued",
        )
        .map((b) => [
          sName(b.supplierId),
          b.number,
          b.reference,
          pName(b.projectId),
          b.due,
          amountString(BigInt(b.gross)),
          amountString(supplierPaid(db, b.id)),
          amountString(supplierBalance(db, b.id)),
        ]),
    };
  if (name === "Supplier Statement") {
    const entries: {
      date: string;
      ref: string;
      supplierId: string;
      description: string;
      debit: bigint;
      credit: bigint;
    }[] = [];
    const bills = op.bills.filter(
      (b) =>
        (!f.projectId || b.projectId === f.projectId) &&
        (!f.customerId || customer(b.projectId) === f.customerId) &&
        (!f.supplierId || b.supplierId === f.supplierId),
    );
    for (const b of bills) {
      entries.push({
        date: b.date,
        ref: b.number,
        supplierId: b.supplierId,
        description: "Supplier invoice " + b.reference,
        debit: 0n,
        credit: BigInt(b.gross),
      });
      if (b.status === "Cancelled") {
        const a = db.activities.find(
          (a) => a.entityId === b.id && a.action === "Supplier bill cancelled",
        );
        entries.push({
          date: a ? dubaiDate(a.timestamp) : today(),
          ref: b.number,
          supplierId: b.supplierId,
          description: "Bill cancelled",
          debit: BigInt(b.gross),
          credit: 0n,
        });
      }
    }
    for (const p of op.supplierPayments.filter((p) =>
      bills.some((b) => b.id === p.billId),
    )) {
      entries.push({
        date: p.date,
        ref: p.number,
        supplierId: p.supplierId,
        description: "Payment " + p.reference,
        debit: cents(p.amount),
        credit: 0n,
      });
      if (p.reversalDate)
        entries.push({
          date: p.reversalDate,
          ref: p.number,
          supplierId: p.supplierId,
          description: "Payment reversal",
          debit: 0n,
          credit: cents(p.amount),
        });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    let balance = entries
      .filter((e) => f.from && e.date < f.from)
      .reduce((s, e) => s + e.credit - e.debit, 0n);
    const rows = [
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
      (e) => (!f.from || e.date >= f.from) && e.date <= (f.to || today()),
    )) {
      balance += e.credit - e.debit;
      rows.push([
        e.date,
        e.ref,
        sName(e.supplierId) + " · " + e.description,
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
        "Payable Balance AED",
      ],
      rows,
    };
  }
  if (name === "Project Budget vs Actual" || name === "Forecast Profitability")
    return {
      headers: [
        "Project",
        "Original Budget AED",
        "Revised Budget AED",
        "Committed AED",
        "Actual AED",
        "Open Commitment AED",
        "Remaining Budget AED",
        "Forecast Cost AED",
        "Revised Contract AED",
        "Forecast Profit AED",
        "Forecast Margin %",
        "Risk",
      ],
      rows: db.projects
        .filter((p) => match(p.id))
        .map((p) => {
          const s = projectCosts(db, p.id);
          return [
            p.code,
            amountString(s.originalBudget),
            amountString(s.revisedBudget),
            amountString(s.committed),
            amountString(s.actual),
            amountString(s.openCommitment),
            amountString(s.remainingBudget),
            amountString(s.forecast),
            amountString(s.revisedContract),
            s.originalContract ? amountString(s.profit) : "No contract",
            s.margin === null ? "—" : s.margin.toFixed(2),
            s.overrun
              ? "Budget Overrun"
              : s.budget
                ? "Within Budget"
                : "Budget Not Set",
          ];
        }),
    };
  if (name === "Credit Note Register")
    return {
      headers: [
        "Credit Note",
        "Invoice",
        "Project",
        "Date",
        "Reason",
        "Status",
        "Net Credit AED",
        "VAT Credit AED",
        "Gross Credit AED",
      ],
      rows: op.credits
        .filter((c) => match(c.projectId, c.date))
        .map((c) => [
          c.number,
          db.invoices.find((i) => i.id === c.invoiceId)?.number || "",
          pName(c.projectId),
          c.date,
          c.reason,
          c.status,
          c.net ? amountString(BigInt(c.net)) : "—",
          c.vat ? amountString(BigInt(c.vat)) : "—",
          c.gross,
        ]),
    };
  return {
    headers: [
      "Record",
      "Project",
      "Stage",
      "Requester",
      "Assigned Approver",
      "Submitted",
      "Status",
    ],
    rows: op.approvals
      .filter(
        (a) =>
          a.status === "Pending Approval" &&
          match(a.projectId, dubaiDate(a.submittedAt)),
      )
      .map((a) => [
        a.kind,
        pName(a.projectId),
        a.stage,
        db.people.find((p) => p.id === a.requesterId)?.name || "",
        db.people.find((p) => p.id === a.approverId)?.name || "",
        a.submittedAt,
        a.status,
      ]),
  };
}
