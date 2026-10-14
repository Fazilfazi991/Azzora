import type { Database } from "../domain/model";
import type { Invoice, InvoiceLine } from "../commercial/model";
import type { PricedItem, Variation, PurchaseOrder } from "./model";
import { getOperations } from "./migration";
import {
  invoiceTotals,
  cents,
  paidAmount,
  round,
  invoiceCreditLines,
} from "../commercial/calculations";
import { decimal } from "../quotation/calculations";
import { today } from "../domain/logic";
export const quantityUnits = (s: string) => {
  const v = decimal(s);
  return (v.n * 1000000n) / v.d;
};
export const quantityString = (n: bigint) =>
  (n / 1000000n).toString() + "." + (n % 1000000n).toString().padStart(6, "0");
export const price = (items: InvoiceLine[], rate: string, discount = "0") => {
  if (
    items.some(
      (i) =>
        !["Exclusive", "Inclusive", "Zero Rated", "Exempt"].includes(i.tax),
    )
  )
    throw Error("Choose a valid tax treatment.");
  return invoiceTotals({
    lines: items,
    vatPercentage: rate,
    discount,
    status: "Draft",
  } as Invoice);
};
export function variationTotals(v: Variation) {
  const t = price(v.items, v.vatPercentage, v.discount),
    sign = v.direction === "Deduction" ? -1n : 1n;
  return { net: t.net * sign, vat: t.vat * sign, grand: t.grand * sign };
}
export const variationNet = (db: Database, projectId: string) =>
  getOperations(db)
    .variations.filter(
      (v) => v.projectId === projectId && v.status === "Approved",
    )
    .reduce((s, v) => s + BigInt(v.net!), 0n);
export function orderTotals(
  order: Pick<PurchaseOrder, "items" | "deliveryCharge" | "vatPercentage">,
) {
  return price(
    [
      ...order.items,
      {
        id: "delivery",
        description: "Delivery",
        quantity: "1",
        rate: order.deliveryCharge,
        tax: "Exclusive",
      },
    ],
    order.vatPercentage,
  );
}
export const credited = (db: Database, id: string, asOf = today()) =>
  getOperations(db)
    .credits.filter(
      (c) => c.invoiceId === id && c.status === "Issued" && c.date <= asOf,
    )
    .reduce((s, c) => s + cents(c.gross), 0n);
export const refunded = (db: Database, id: string, asOf = today()) =>
  getOperations(db)
    .refunds.filter(
      (r) =>
        r.invoiceId === id &&
        r.date <= asOf &&
        (!r.reversalDate || r.reversalDate > asOf),
    )
    .reduce((s, r) => s + cents(r.amount), 0n);
export function invoicePosition(db: Database, i: Invoice, asOf = today()) {
  return (
    invoiceTotals(i).grand -
    credited(db, i.id, asOf) -
    paidAmount(db, i.id, asOf) +
    refunded(db, i.id, asOf)
  );
}
export function supplierPaid(db: Database, billId: string) {
  return getOperations(db)
    .supplierPayments.filter((p) => p.billId === billId && !p.reversedAt)
    .reduce((s, p) => s + cents(p.amount), 0n);
}
export const supplierBalance = (db: Database, billId: string) => {
  const b = getOperations(db).bills.find((b) => b.id === billId);
  return b?.status === "Issued"
    ? BigInt(b.gross) - supplierPaid(db, billId)
    : 0n;
};
export function deliveredQuantity(db: Database, poId: string, itemId: string) {
  return getOperations(db)
    .deliveries.filter((d) => d.poId === poId && !d.reversedAt)
    .flatMap((d) => d.quantities)
    .filter((q) => q.itemId === itemId)
    .reduce((s, q) => s + quantityUnits(q.quantity), 0n);
}
export function billedQuantity(db: Database, poId: string, itemId: string) {
  return getOperations(db)
    .bills.filter((b) => b.poId === poId && b.status === "Issued")
    .flatMap((b) => b.quantities)
    .filter((q) => q.itemId === itemId)
    .reduce((s, q) => s + quantityUnits(q.quantity), 0n);
}
export function orderReceived(db: Database, po: PurchaseOrder) {
  return po.items.every(
    (i) => deliveredQuantity(db, po.id, i.id) >= quantityUnits(i.quantity),
  );
}
export function projectCosts(db: Database, projectId: string) {
  const op = getOperations(db),
    budget = op.budgets.find((b) => b.projectId === projectId);
  const actual = db.expenses
    .filter((e) => e.projectId === projectId && !e.cancelledAt)
    .reduce((s, e) => s + cents(e.amount), 0n);
  const orders = op.orders.filter(
    (o) => o.projectId === projectId && o.status === "Approved",
  );
  const committed = orders.reduce((s, o) => s + orderTotals(o).net, 0n);
  const billed = op.bills
    .filter(
      (b) =>
        b.projectId === projectId &&
        b.status === "Issued" &&
        orders.some((o) => o.id === b.poId),
    )
    .reduce((s, b) => s + BigInt(b.net), 0n);
  const openCommitment = committed > billed ? committed - billed : 0n;
  const originalBudget =
    budget?.lines.reduce((s, l) => s + cents(l.original), 0n) || 0n;
  const revisedBudget =
    budget?.lines.reduce((s, l) => s + cents(l.revised), 0n) || 0n;
  const estimate = budget ? cents(budget.remainingEstimate) : 0n;
  const toComplete = estimate > openCommitment ? estimate : openCommitment;
  const forecast = actual + toComplete;
  const originalContract = db.contracts
    .filter((c) => c.projectId === projectId)
    .reduce((s, c) => s + BigInt(c.net), 0n);
  const variations = variationNet(db, projectId),
    revisedContract = originalContract + variations,
    profit = revisedContract - forecast;
  return {
    budget,
    originalBudget,
    revisedBudget,
    actual,
    committed,
    openCommitment,
    remainingBudget: revisedBudget - actual,
    estimate,
    toComplete,
    forecast,
    originalContract,
    variations,
    revisedContract,
    profit,
    margin:
      revisedContract > 0n
        ? Number((profit * 10000n) / revisedContract) / 100
        : null,
    overrun: !!budget && forecast > revisedBudget,
  };
}
export function billItems(
  order: PurchaseOrder,
  quantities: { itemId: string; quantity: string }[],
): PricedItem[] {
  return quantities.map((q) => ({
    ...order.items.find((i) => i.id === q.itemId)!,
    quantity: q.quantity,
  }));
}
export function proportionalVat(
  net: bigint,
  vat: bigint,
  gross: bigint,
  credit: bigint,
) {
  const adjustedVat = gross ? round(credit * vat, gross) : 0n;
  return { vat: adjustedVat, net: credit - adjustedVat, originalNet: net };
}
export function invoiceItemTotals(i: Invoice, itemId: string) {
  const index = i.lines.findIndex((line) => line.id === itemId);
  if (index < 0) throw Error("Invoice item not found.");
  return invoiceCreditLines(i)[index];
}
