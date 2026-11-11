import { expect, it } from "vitest";
import { createEmptyProductionCompany } from "../finance/production-policy";
import { emptyOperations } from "../operations/migration";
import { serializeCanonical } from "../staging/canonical";
import { createAuthoritativeProductionBackup, decryptBusinessBackup } from "./launch-backup";
import { rehearseEncryptedBusinessRestore } from "./launch-backup-rehearsal";
import type { AuthorizedActor } from "./permissions";
const companyId = "22222222-2222-4222-8222-222222222222", ownerId = "33333333-3333-4333-8333-333333333333";
const actor: AuthorizedActor = { userId: ownerId, companyId, sessionId: "fictional", assurance: "aal2", grant: { userId: ownerId, companyId, active: true, roles: ["owner"], workspaces: ["manager"], projectIds: [], capabilities: ["access.manage"] } };
const scope = { companyId, keyId: "fixture-key", capturedAt: "2026-11-11T00:00:00.000Z" }, key = Buffer.alloc(32, 9);
function capture() {
  const settings = emptyOperations().settings;
  settings.company = { ...settings.company, name: "Synthetic company", phone: "", email: "", location: "", trn: "", bank: "" };
  return { version: 1, companyId, data: serializeCanonical(createEmptyProductionCompany({ settings })), provenance: { memberships: [{ userId: ownerId, role: "owner_admin", active: true, financeAccess: true, workspaces: ["manager"], capabilities: ["access.manage"] }], assignments: [], journals: [], snapshots: [], auditEvents: [{ id: "4", actorId: ownerId, action: "approve", entityType: "company", entityId: companyId, requestId: "fixture", recordedAt: "2026-11-11T00:00:00Z", metadata: { synthetic: true } }], commandReceipts: [] } };
}
it("encrypts and independently restores owner-only authoritative provenance without changing the existing envelope", async () => {
  const envelope = await createAuthoritativeProductionBackup(capture(), async () => new Uint8Array(), key, scope, actor);
  expect(envelope.format).toBe("azzora-encrypted-business-backup-v1");
  expect(JSON.stringify(envelope)).not.toContain("Synthetic company");
  const archive = JSON.parse(Buffer.from(decryptBusinessBackup(envelope, key, scope)).toString());
  expect(archive.format).toBe("azzora-authoritative-production-backup-v2");
  expect(archive.provenance.auditEvents[0].actorId).toBe(ownerId);
  expect(archive.provenance.memberships[0].userId).toBe(ownerId);
  const report = await rehearseEncryptedBusinessRestore(envelope, key, scope);
  expect(report).toMatchObject({ isolated: true, cloudDatabaseUsed: false, auditIdentityRestored: false, auditActorReferencesRestored: true, identityUsersRestored: false, membershipsRestored: false, commandReceiptsRestored: true, financialReportsMatch: true });
}, 30000);
it("fails closed for credentials, missing provenance, wrong scope and downgraded authority", async () => {
  const c = capture();
  await expect(createAuthoritativeProductionBackup({ ...c, provenance: { ...c.provenance, auditEvents: [{ ...c.provenance.auditEvents[0], metadata: { password: "fictional" } }] } }, async () => new Uint8Array(), key, scope, actor)).rejects.toThrow(/Credentials/);
  for (const field of ["provider_session_id", "session_token_hash", "private_key", "jwt"])
    await expect(createAuthoritativeProductionBackup({ ...c, provenance: { ...c.provenance, auditEvents: [{ ...c.provenance.auditEvents[0], metadata: { nested: { [field]: "fictional" } } }] } }, async () => new Uint8Array(), key, scope, actor)).rejects.toThrow(/Credentials/);
  await expect(createAuthoritativeProductionBackup({ ...c, provenance: undefined }, async () => new Uint8Array(), key, scope, actor)).rejects.toThrow();
  await expect(createAuthoritativeProductionBackup(c, async () => new Uint8Array(), key, { ...scope, companyId: ownerId }, actor)).rejects.toThrow();
  await expect(createAuthoritativeProductionBackup(c, async () => new Uint8Array(), key, scope, { ...actor, assurance: "aal1" })).rejects.toThrow();
});
