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
  type ReadBackupOriginal,
} from "../staging/backup.js";
import type { CanonicalData } from "../staging/canonical.js";
import { authorize, type AuthorizedActor } from "./permissions.js";
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
