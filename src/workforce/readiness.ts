import type { Database, DocumentRecord } from "../domain/model";

export function latestDocuments(db: Database, projectId?: string) {
  const latest = new Map<string, DocumentRecord>();
  db.documents
    .filter((d) => !projectId || d.projectId === projectId)
    .forEach((d) => {
      const family = d.familyId || d.id;
      if (!latest.has(family) || latest.get(family)!.version < d.version)
        latest.set(family, d);
    });
  return [...latest.values()];
}

/** Operational gates only. Financial checklist/rules remain owned by Accounts. */
export function operationalReadiness(db: Database, projectId: string) {
  const documents = latestDocuments(db, projectId).filter((d) =>
    [
      "Design Drawings",
      "Approvals",
      "Material Submittals",
      "Handover",
      "QA / Inspection",
    ].includes(d.category),
  );
  const pendingDocuments = documents.filter((d) => d.status !== "Approved");
  const updates = db.updates.filter((u) => u.projectId === projectId);
  const pendingUpdates = updates.filter((u) => u.reviewStatus !== "Approved");
  const openSnags = db.snags.filter(
    (s) => s.projectId === projectId && s.status !== "Closed",
  );
  return {
    documents,
    pendingDocuments,
    pendingUpdates,
    openSnags,
    documentsReady: pendingDocuments.length === 0,
    supervisionReady: updates.length > 0 && pendingUpdates.length === 0,
    qaReady: openSnags.length === 0,
  };
}
