/** SERVER/OFFLINE ONLY. Owner-managed key material is supplied by the operator, never embedded/exported. */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  stableBackupJson,
  createProductionBusinessBackup,
  verifyProductionBusinessBackup,
  createStagingBackup,
  verifyStagingBackup,
  type ReadBackupOriginal,
} from "../staging/backup.js";
import type { CanonicalData } from "../staging/canonical.js";
import { authorize, type AuthorizedActor } from "./permissions.js";
import { stagingSchemaBundle } from "./staging-schema-bundle.generated.js";
// Retain each reviewed historical bundle in this catalog when migrations evolve.
// An unknown version fails closed instead of executing archive-supplied SQL.
const supportedStagingSchemaBundles = [stagingSchemaBundle] as const;
export function verifyStagingSchemaBundle(input: unknown) {
  const bundle = z.object({format:z.literal('azzora-staging-schema-bundle-v1'),files:z.array(z.object({name:z.string(),sql:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict())}).strict().parse(input);
  const trusted = supportedStagingSchemaBundles.find(candidate => candidate.files.length === bundle.files.length && candidate.files.every((file,index) => file.name === bundle.files[index].name && file.sha256 === bundle.files[index].sha256));
  if (!trusted) throw Error('Untrusted staging migration catalog.');
  bundle.files.forEach((file,index) => {
    const expected=trusted.files[index];
    if (file.name !== expected.name || file.sha256 !== expected.sha256 || createHash('sha256').update(file.sql).digest('hex') !== expected.sha256)
      throw Error('Untrusted staging migration bundle.');
  });
  return bundle;
}
const envelopeSchema = z
  .object({
    format: z.literal("azzora-encrypted-business-backup-v1"),
    algorithm: z.literal("AES-256-GCM"),
    companyId: z.uuid(),
    keyId: z.string().min(1).max(200),
    capturedAt: z.string().datetime(),
    plaintextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    plaintextBytes: z
      .number()
      .int()
      .min(1)
      .max(128 * 1024 * 1024),
    nonce: z.string(),
    tag: z.string(),
    ciphertext: z.string(),
  })
  .strict();
export type EncryptedBusinessBackup = z.infer<typeof envelopeSchema>;
const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
function keyBytes(key: Uint8Array) {
  if (key.byteLength !== 32)
    throw Error("Supply an owner-managed32-byte backup key.");
  return Buffer.from(key);
}
function metadata(
  e: Pick<
    EncryptedBusinessBackup,
    | "format"
    | "algorithm"
    | "companyId"
    | "keyId"
    | "capturedAt"
    | "plaintextSha256"
    | "plaintextBytes"
  >,
) {
  return {
    format: e.format,
    algorithm: e.algorithm,
    companyId: e.companyId,
    keyId: e.keyId,
    capturedAt: e.capturedAt,
    plaintextSha256: e.plaintextSha256,
    plaintextBytes: e.plaintextBytes,
  };
}
/** The caller authorizes/export-validates the business archive first. Encryption is not a database/PITR backup service. */
export function encryptBusinessBackup(
  plaintext: Uint8Array,
  key: Uint8Array,
  scope: { companyId: string; keyId: string; capturedAt: string },
): EncryptedBusinessBackup {
  if (!plaintext.byteLength || plaintext.byteLength > 128 * 1024 * 1024)
    throw Error("Backup archive must be1byte to128MiB.");
  const clear = Buffer.from(plaintext),
    nonce = randomBytes(12),
    header = envelopeSchema
      .omit({ nonce: true, tag: true, ciphertext: true })
      .parse({
        format: "azzora-encrypted-business-backup-v1",
        algorithm: "AES-256-GCM",
        ...scope,
        plaintextSha256: sha(clear),
        plaintextBytes: clear.length,
      });
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), nonce);
  cipher.setAAD(Buffer.from(stableBackupJson(metadata(header))));
  const ciphertext = Buffer.concat([cipher.update(clear), cipher.final()]);
  return {
    ...header,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
function base64(value: string, maximum: number): Buffer {
  if (
    value.length > (maximum * 4) / 3 + 8 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw Error("Invalid backup encoding.");
  const b = Buffer.from(value, "base64");
  if (b.toString("base64") !== value || b.length > maximum)
    throw Error("Invalid backup encoding.");
  return b;
}
export function decryptBusinessBackup(
  input: unknown,
  key: Uint8Array,
  expected: { companyId: string; keyId: string },
): Uint8Array {
  const e = envelopeSchema.parse(input);
  if (e.companyId !== expected.companyId || e.keyId !== expected.keyId)
    throw Error("Backup company or owner-key identity does not match.");
  const nonce = base64(e.nonce, 12),
    tag = base64(e.tag, 16),
    ciphertext = base64(e.ciphertext, 128 * 1024 * 1024);
  if (
    nonce.length !== 12 ||
    tag.length !== 16 ||
    ciphertext.length !== e.plaintextBytes
  )
    throw Error("Backup length/nonce/tag is invalid.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), nonce);
    decipher.setAAD(Buffer.from(stableBackupJson(metadata(e))));
    decipher.setAuthTag(tag);
    const clear = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]),
      actual = Buffer.from(sha(clear), "hex"),
      wanted = Buffer.from(e.plaintextSha256, "hex");
    if (clear.length !== e.plaintextBytes || !timingSafeEqual(actual, wanted))
      throw Error("Hash mismatch");
    return clear;
  } catch {
    throw Error("Backup integrity or owner-managed key verification failed.");
  }
}

/** Actual protected capture API: only verified Owner/Admin AAL2 may export, and production output is always encrypted. */
export async function createProtectedProductionBackup(
  source: { version: number; data: CanonicalData; companyId: string },
  readOriginal: ReadBackupOriginal,
  key: Uint8Array,
  scope: { companyId: string; keyId: string; capturedAt: string },
  actor: AuthorizedActor,
): Promise<EncryptedBusinessBackup> {
  if (
    !actor.grant.roles.some((role) => role === "owner" || role === "admin") ||
    actor.assurance !== "aal2" ||
    source.companyId !== scope.companyId
  )
    throw Error(
      "Current Owner/Admin MFA and exact company scope are required for production backup.",
    );
  authorize(actor, "access.manage", { companyId: source.companyId });
  keyBytes(key);
  const backup = await createProductionBusinessBackup(
    source,
    readOriginal,
    scope.capturedAt,
  );
  return encryptBusinessBackup(Buffer.from(JSON.stringify(backup)), key, scope);
}

function validateAuthoritativeCapture(capture: unknown, companyId: string) {
  const id = z.string().min(1).max(200), uuid = z.uuid();
  const provenanceSchema = z.object({
    memberships: z.array(z.object({ userId: uuid, role: id, active: z.boolean(), financeAccess: z.boolean(), workspaces: z.array(id), capabilities: z.array(id) }).strict()),
    assignments: z.array(z.object({ user_id: uuid, project_id: id, active: z.boolean() }).strict()),
    journals: z.array(z.object({ id, actorId: uuid }).strict()),
    snapshots: z.array(z.object({ entityType: id, entityId: id, revision: z.number().int().positive(), capturedBy: uuid, capturedAt: id }).strict()),
    auditEvents: z.array(z.object({ id: z.string().regex(/^[1-9]\d{0,18}$/), actorId: uuid, action: id, entityType: id, entityId: id, requestId: id, recordedAt: id, metadata: z.record(z.string(), z.unknown()) }).strict()),
    commandReceipts: z.array(z.object({ idempotencyKey: id, requestSha256: z.string().regex(/^[a-f0-9]{64}$/), actorId: uuid, result: z.record(z.string(), z.unknown()), createdAt: id }).strict()),
  }).strict();
  const row = z.object({ version: z.number().int().positive(), companyId: uuid, data: z.unknown(), provenance: provenanceSchema }).strict().parse(capture);
  if (row.companyId !== companyId) throw Error("Backup company mismatch.");
  const forbid = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(forbid); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      if (/^(password|passwordhash|encryptedpassword|secret|apikey|servicekey|privatekey|totpsecret|mfa|mfasecret|recoverycode|accesstoken|refreshtoken|session|sessionid|providersessionid|sessionhash|sessiontokenhash|tokenhash|jwt|cookie|csrf|credentials)$/i.test(k.replace(/[_-]/g, ""))) throw Error("Credentials are forbidden in provenance.");
      forbid(x);
    }
  };
  forbid(row.provenance);
  const data = row.data as CanonicalData;
  const equalKeys = (left: string[], right: string[]) => {
    if (left.length !== right.length || new Set(left).size !== left.length || new Set(right).size !== right.length) return false;
    const ordered = [...right].sort();
    return [...left].sort().every((value, index) => value === ordered[index]);
  };
  if (!Array.isArray(data?.journals) || !Array.isArray(data?.snapshots) ||
    !equalKeys(data.journals.map(j=>j.id), row.provenance.journals.map(j=>j.id)) ||
    !equalKeys(data.snapshots.map(s=>JSON.stringify([s.entity_type,s.entity_id,s.revision])), row.provenance.snapshots.map(s=>JSON.stringify([s.entityType,s.entityId,s.revision]))) ||
    new Set(row.provenance.auditEvents.map(e=>e.id)).size !== row.provenance.auditEvents.length ||
    new Set(row.provenance.memberships.map(m=>m.userId)).size !== row.provenance.memberships.length)
    throw Error("Backup provenance is incomplete or duplicated.");
  return { ...row, data };
}

/** The owner-only RPC returns one PostgreSQL snapshot; provenance never goes to an unencrypted response. */
export async function createAuthoritativeProductionBackup(
  capture: unknown,
  readOriginal: ReadBackupOriginal,
  key: Uint8Array,
  scope: { companyId: string; keyId: string; capturedAt: string },
  actor: AuthorizedActor,
): Promise<EncryptedBusinessBackup> {
  authorize(actor, "access.manage", { companyId: scope.companyId });
  if (actor.assurance !== "aal2" || !actor.grant.roles.includes("owner"))
    throw Error("Current Owner MFA is required for authoritative backup.");
  const row = validateAuthoritativeCapture(capture, scope.companyId);
  const business = await createProductionBusinessBackup({ version: row.version, companyId: row.companyId, data: row.data }, readOriginal, scope.capturedAt);
  const archive = { format: "azzora-authoritative-production-backup-v2", companyId: row.companyId, business, provenance: row.provenance };
  return encryptBusinessBackup(Buffer.from(JSON.stringify(archive)), key, scope);
}

/** Offline verifier; legacy business-only archives remain handled by the existing verifier. */
export function verifyAuthoritativeProductionArchive(input: unknown, companyId: string) {
  const outer = z.object({ format: z.literal("azzora-authoritative-production-backup-v2"), companyId: z.uuid(), business: z.unknown(), provenance: z.unknown() }).strict().parse(input);
  const business = verifyProductionBusinessBackup(outer.business);
  const checked = validateAuthoritativeCapture({ version: business.capturedCompanyVersion, companyId: outer.companyId, data: business.data, provenance: outer.provenance }, companyId);
  if (business.companyId !== checked.companyId) throw Error("Backup company mismatch.");
  return { business, provenance: checked.provenance };
}

/** Fictional-only staging equivalent; never accepts or labels production state. */
export async function createAuthoritativeStagingBackup(
  capture: unknown,
  readOriginal: ReadBackupOriginal,
  key: Uint8Array,
  scope: { companyId: string; keyId: string; capturedAt: string; sourceRevision?: string },
  actor: AuthorizedActor,
): Promise<EncryptedBusinessBackup> {
  authorize(actor, "access.manage", { companyId: scope.companyId });
  if (actor.assurance !== "aal2" || !actor.grant.roles.includes("owner"))
    throw Error("Current Owner MFA is required for staging backup.");
  if (scope.sourceRevision !== undefined && !/^[a-f0-9]{40}$/.test(scope.sourceRevision))
    throw Error("Staging backup source revision must be a full lowercase Git SHA.");
  const row = validateAuthoritativeCapture(capture, scope.companyId);
  const business = await createStagingBackup({ version: row.version, companyId: row.companyId, data: row.data }, readOriginal, scope.capturedAt);
  const archive = { format: "azzora-authoritative-staging-backup-v3", companyId: row.companyId, business, provenance: row.provenance, schemaBundle:stagingSchemaBundle, schemaScope:'reviewed-source-baseline-live-schema-unverified', ...(scope.sourceRevision === undefined ? {} : {sourceRevision:scope.sourceRevision}) };
  return encryptBusinessBackup(Buffer.from(JSON.stringify(archive)), key, {
    companyId:scope.companyId, keyId:scope.keyId, capturedAt:scope.capturedAt,
  });
}

export function verifyAuthoritativeStagingArchive(input: unknown, companyId: string) {
  const outer = z.object({ format: z.enum(["azzora-authoritative-staging-backup-v2","azzora-authoritative-staging-backup-v3"]), companyId: z.uuid(), business: z.unknown(), provenance: z.unknown(), schemaBundle:z.unknown().optional(), schemaScope:z.literal('reviewed-source-baseline-live-schema-unverified').optional(), sourceRevision:z.string().regex(/^[a-f0-9]{40}$/).optional() }).strict().parse(input);
  if (outer.format === 'azzora-authoritative-staging-backup-v3' && !outer.schemaScope) throw Error('Schema scope is required.');
  const schemaBundle = outer.format === 'azzora-authoritative-staging-backup-v3' ? verifyStagingSchemaBundle(outer.schemaBundle) : undefined;
  if (outer.format === 'azzora-authoritative-staging-backup-v2' && (outer.schemaBundle !== undefined || outer.schemaScope !== undefined)) throw Error('Unexpected legacy schema bundle.');
  if (outer.format === 'azzora-authoritative-staging-backup-v2' && outer.sourceRevision !== undefined) throw Error('Unexpected legacy source revision.');
  const business = verifyStagingBackup(outer.business);
  const checked = validateAuthoritativeCapture({ version: business.capturedCompanyVersion, companyId: outer.companyId, data: business.data, provenance: outer.provenance }, companyId);
  if (business.companyId !== checked.companyId) throw Error("Backup company mismatch.");
  return { business, provenance: checked.provenance, schemaBundle, sourceRevision:outer.sourceRevision };
}
