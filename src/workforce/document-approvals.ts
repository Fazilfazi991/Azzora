import type { Database, DocumentRecord } from "../domain/model";
import type { Approval } from "../operations/model";
import { initializeOperations, getOperations } from "../operations/migration";
import { uid } from "../domain/logic";

// Retain the complete legacy representation before adding canonical workflow fields.
// Loading never writes storage; existing approval snapshots and decisions stay intact.
export function initializeDocumentCompatibility(db: Database) {
  for (const d of db.documents) {
    if (!d.workflowVersion && d.reviewState) {
      if (
        (d.status === "Approved" && d.reviewState !== "Approved") ||
        (d.reviewState === "Approved" && d.status !== "Approved")
      )
        throw Error(
          "Saved document approval states conflict. Export the original data before recovery.",
        );
      d.legacyWorkflowSnapshot ??= JSON.stringify(d);
      d.status =
        d.reviewState === "Draft"
          ? "Draft"
          : d.reviewState === "Submitted"
            ? "Pending"
            : d.reviewState === "Revise & Resubmit"
              ? "Rejected"
              : "Approved";
      d.previousRevisionId ??= d.revisionOf;
      d.workflowVersion = 1;
    }
  }
}

export function latestDocument(db: Database, d: DocumentRecord) {
  return !db.documents.some(
    (x) =>
      (x.familyId || x.id) === (d.familyId || d.id) && x.version > d.version,
  );
}

// Read-model reconciliation preserves historical ledger bytes, including an old
// pending entry whose canonical document was already reviewed by the other branch.
export function approvalView(db: Database): Approval[] {
  return getOperations(db).approvals.map((a) => {
    if (a.kind !== "Document") return a;
    const d = db.documents.find((d) => d.id === a.entityId);
    if (!d) return a;
    const latest = latestDocument(db, d);
    return {
      ...a,
      supersededBy:
        a.supersededBy ||
        (!latest
          ? db.documents.find(
              (x) =>
                (x.familyId || x.id) === (d.familyId || d.id) &&
                x.version > d.version,
            )?.id
          : undefined),
      status:
        a.status === "Pending Approval" &&
        (d.status === "Approved" || d.status === "Rejected")
          ? d.status
          : a.status,
    };
  });
}
export function activeApprovals(db: Database) {
  return approvalView(db).filter((a) => !a.supersededBy);
}

export function submitDocumentApproval(
  db: Database,
  d: DocumentRecord,
  actorId: string,
  reason: string,
  reviewerId?: string,
  timestamp = new Date().toISOString(),
) {
  const op = initializeOperations(db);
  if (
    op.approvals.some(
      (a) =>
        a.kind === "Document" &&
        a.entityId === d.id &&
        a.status === "Pending Approval" &&
        !a.supersededBy,
    )
  )
    throw Error("This revision already has a pending approval.");
  const reviewer =
    reviewerId ||
    d.reviewerId ||
    db.people.find((p) => p.status !== "Inactive" && p.id !== actorId)?.id;
  if (
    !reviewer ||
    reviewer === actorId ||
    !db.people.some((p) => p.id === reviewer && p.status !== "Inactive")
  )
    throw Error("Assign an active reviewer different from the submitter.");
  d.reviewerId = reviewer;
  const a: Approval = {
    id: uid(),
    kind: "Document",
    entityId: d.id,
    projectId: d.projectId,
    stage: "Drawing review",
    requesterId: actorId,
    approverId: reviewer,
    submittedAt: timestamp,
    status: "Pending Approval",
    snapshot: JSON.stringify({
      ...d,
      status: "Pending",
      reviewState: "Submitted",
      submittedBy: actorId,
      submittedAt: timestamp,
    }),
    comments: reason,
  };
  op.approvals.push(a);
  return a;
}

export function finishDocumentApproval(
  db: Database,
  d: DocumentRecord,
  approved: boolean,
  actor: string,
  reason: string,
  timestamp: string,
) {
  for (const a of initializeOperations(db).approvals.filter(
    (a) =>
      a.kind === "Document" &&
      a.entityId === d.id &&
      a.status === "Pending Approval" &&
      !a.supersededBy,
  )) {
    if (a.approverId !== actor)
      throw Error("Select the assigned document reviewer.");
    a.status = approved ? "Approved" : "Rejected";
    a.actorId = actor;
    a.decisionAt = timestamp;
    a.comments = reason;
  }
}
