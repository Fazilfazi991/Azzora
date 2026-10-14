import type { Database } from "../domain/model";
import { getOperations, initializeOperations } from "./migration";
import {
  projectCosts,
  orderReceived,
  supplierBalance,
  invoicePosition,
} from "./calculations";
import { balanceDue, cents } from "../commercial/calculations";
import { taskProgress, today } from "../domain/logic";
import { audit } from "./repository";
export function closureSummary(db: Database, projectId: string) {
  const op = getOperations(db),
    costs = projectCosts(db, projectId);
  const pendingApprovals = op.approvals.filter(
    (a) => a.projectId === projectId && a.status === "Pending Approval",
  ).length;
  const families = new Map<string, (typeof db.documents)[number]>();
  db.documents
    .filter((d) => d.projectId === projectId)
    .forEach((d) => {
      const key = d.familyId || d.id;
      if (!families.has(key) || families.get(key)!.version < d.version)
        families.set(key, d);
    });
  const pendingDocuments = [...families.values()].filter(
    (d) => d.status !== "Approved",
  ).length;
  const openSnags = db.snags.filter(
      (s) => s.projectId === projectId && s.status !== "Closed",
    ).length,
    incompleteTasks = db.tasks.filter(
      (t) => t.projectId === projectId && taskProgress(db, t) < 100,
    ).length;
  const deliveries = op.orders.filter(
    (o) =>
      o.projectId === projectId &&
      o.status === "Approved" &&
      !orderReceived(db, o),
  ).length;
  const payables = op.bills
    .filter((b) => b.projectId === projectId)
    .reduce((s, b) => s + supplierBalance(db, b.id), 0n);
  const receivables = db.invoices
    .filter((i) => i.projectId === projectId)
    .reduce((s, i) => s + balanceDue(db, i), 0n);
  const customerCredit = db.invoices
    .filter((i) => i.projectId === projectId && i.status === "Issued")
    .reduce((s, i) => {
      const p = invoicePosition(db, i);
      return s + (p < 0n ? -p : 0n);
    }, 0n);
  const milestones = db.contracts
    .filter((c) => c.projectId === projectId)
    .reduce((n, c) => {
      const q = db.quotations.find((q) => q.id === c.quotationId)!;
      return (
        n +
        q.payments.filter(
          (p) =>
            !db.invoices.some(
              (i) =>
                i.projectId === projectId &&
                i.quotationId === q.id &&
                i.status === "Issued" &&
                (!i.milestoneId || i.milestoneId === p.id),
            ),
        ).length
      );
    }, 0);
  const variations = op.variations.filter(
    (v) =>
      v.projectId === projectId &&
      v.status === "Approved" &&
      (BigInt(v.gross!) > 0n
        ? !db.invoices.some(
            (i) => i.variationId === v.id && i.status === "Issued",
          )
        : !op.credits.some(
            (c) => c.variationId === v.id && c.status === "Issued",
          )),
  ).length;
  const retention =
    (costs.revisedContract * cents(op.settings.retentionPercentage)) / 10000n;
  return {
    ...costs,
    pendingApprovals,
    pendingDocuments,
    openSnags,
    incompleteTasks,
    deliveries,
    payables,
    receivables,
    customerCredit,
    milestones,
    variations,
    retention,
    commercialClear:
      pendingApprovals === 0 &&
      pendingDocuments === 0 &&
      deliveries === 0 &&
      payables === 0n &&
      receivables === 0n &&
      customerCredit === 0n &&
      milestones === 0 &&
      variations === 0 &&
      costs.openCommitment === 0n &&
      retention === 0n,
  };
}
export function closeCommercial(
  db: Database,
  projectId: string,
  actor: string,
  notes: string,
) {
  const summary = closureSummary(db, projectId);
  if (!summary.commercialClear)
    throw Error(
      "Resolve commercial obligations before recording commercial closure.",
    );
  if (!notes.trim()) throw Error("Enter final account review notes.");
  const op = initializeOperations(db);
  if (op.closures.some((c) => c.projectId === projectId))
    throw Error("Commercial closure is already recorded.");
  const snapshot = JSON.stringify(summary, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  op.closures.push({
    projectId,
    date: today(),
    actorId: actor,
    notes,
    snapshot,
  });
  audit(
    db,
    projectId,
    "Commercial Closure",
    projectId,
    "Commercial closure recorded",
    notes,
    actor,
    snapshot,
  );
}
