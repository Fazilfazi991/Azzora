import { createHash } from "node:crypto";
import { z } from "zod";
import { stableBackupJson } from "../staging/backup.js";

/** Offline review only: this does not read Auth, grant access, restore data or invite users. */
const uuid = z.uuid();
const label = z.string().min(1).max(200);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const member = z.object({
  originalUserId: uuid,
  proposedNewUserId: uuid.nullable(),
  sourceRole: z.enum(["owner_admin", "project_manager", "accountant", "site_staff"]),
  wasActive: z.boolean(),
  hadFinanceAccess: z.boolean(),
}).strict();
const inputSchema = z.object({
  companyId: uuid,
  inventorySha256: sha,
  expectedCounts: z.object({ members: z.number().int().nonnegative(), journals: z.number().int().nonnegative(), snapshots: z.number().int().nonnegative(), auditEvents: z.number().int().nonnegative() }).strict(),
  members: z.array(member),
  journals: z.array(z.object({ id: label, originalActorId: uuid }).strict()),
  snapshots: z.array(z.object({ entityType: label, entityId: label, revision: z.number().int().positive(), originalCapturedBy: uuid }).strict()),
  auditEvents: z.array(z.object({ originalEventId: z.string().regex(/^[1-9]\d*$/), originalActorId: uuid, contentSha256: sha }).strict()),
}).strict();

/** Keeps historical actor UUIDs unchanged and records proposed new sign-in IDs separately. */
export function prepareIdentityRecoveryReview(input: unknown) {
  const s = inputSchema.parse(input), issues: string[] = [];
  for (const [name, actual] of Object.entries({ members: s.members.length, journals: s.journals.length, snapshots: s.snapshots.length, auditEvents: s.auditEvents.length }))
    if (actual !== s.expectedCounts[name as keyof typeof s.expectedCounts]) issues.push(`count:${name}`);
  const oldIds = new Set<string>(), newIds = new Set<string>();
  for (const m of s.members) {
    if (oldIds.has(m.originalUserId)) issues.push("duplicate-original-user");
    oldIds.add(m.originalUserId);
    if (m.proposedNewUserId) {
      if (newIds.has(m.proposedNewUserId)) issues.push("duplicate-new-user");
      newIds.add(m.proposedNewUserId);
    } else if (m.wasActive) issues.push("missing-reprovision-mapping");
    if (m.hadFinanceAccess && !["owner_admin", "accountant"].includes(m.sourceRole)) issues.push("invalid-finance-role");
  }
  const distinct = (values: string[], error: string) => { if (new Set(values).size !== values.length) issues.push(error); };
  distinct(s.journals.map(v => v.id), "duplicate-journal");
  distinct(s.snapshots.map(v => JSON.stringify([v.entityType, v.entityId, v.revision])), "duplicate-snapshot");
  distinct(s.auditEvents.map(v => v.originalEventId), "duplicate-audit-event");
  for (const actor of [...s.journals.map(v => v.originalActorId), ...s.snapshots.map(v => v.originalCapturedBy), ...s.auditEvents.map(v => v.originalActorId)])
    if (!oldIds.has(actor)) issues.push("unknown-historical-actor");
  const result = {
    format: "azzora-identity-recovery-review-v1" as const,
    companyId: s.companyId,
    inventorySha256: s.inventorySha256,
    expectedCounts: s.expectedCounts,
    members: s.members,
    journals: s.journals,
    snapshots: s.snapshots,
    auditEvents: s.auditEvents,
    issues: [...new Set(issues)].sort(),
    publication: "review-only" as const,
    grantsApplied: false as const,
    historicalActorsRewritten: false as const,
    identityAndAuditRestoreVerified: false as const,
  };
  return { ...result, sha256: createHash("sha256").update(stableBackupJson(result)).digest("hex") };
}
