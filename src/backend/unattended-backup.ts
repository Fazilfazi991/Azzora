/**
 * Offline candidate only. This module is not exposed by the runtime or any API.
 * A production repository must implement the atomic authorization/audit contract
 * below before this candidate can be wired to a scheduler.
 */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createProductionBusinessBackup,
  type ReadBackupOriginal,
} from "../staging/backup.js";
import type { CanonicalData } from "../staging/canonical.js";
import {
  encryptBusinessBackup,
  type EncryptedBusinessBackup,
} from "./launch-backup.js";

const requestSchema = z
  .object({
    companyId: z.uuid(),
    grantId: z.uuid(),
    requestId: z.uuid(),
    credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

/**
 * Each method must transact against durable, independently protected storage.
 * begin atomically checks hash, grant/company scope, expiry, enabled state and
 * capability exactly `backup.capture`, reserves unique requestId and appends an
 * audit start. finish atomically rechecks revocation/expiry and appends an audit
 * result (recording denial if revoked or expired). Only a true finish permits
 * release. Never log the credential or data.
 * A stale started request must be alerted on, not silently retried or overwritten.
 */
export interface CaptureAuthority {
  begin(input: {
    companyId: string;
    grantId: string;
    requestId: string;
    credentialHash: string;
    now: string;
  }): Promise<boolean>;
  finish(input: {
    companyId: string;
    grantId: string;
    requestId: string;
    outcome: "success" | "failure";
    now: string;
  }): Promise<boolean>;
}

export interface UnattendedBackupDependencies {
  authority: CaptureAuthority;
  readSnapshot(
    companyId: string,
  ): Promise<{ companyId: string; version: number; data: CanonicalData }>;
  readOriginal: ReadBackupOriginal;
  backupKey: Uint8Array;
  keyId: string;
  now(): Date;
}

/** This function cannot grant access to another API, mutate journals, or send data externally. */
export async function createUnattendedBackupCandidate(
  request: unknown,
  dependencies: UnattendedBackupDependencies,
): Promise<EncryptedBusinessBackup> {
  const input = requestSchema.parse(request);
  // Reject non-canonical encodings of the 32-byte randomly generated secret.
  const credential = Buffer.from(input.credential, "base64url");
  if (
    credential.length !== 32 ||
    credential.toString("base64url") !== input.credential
  )
    throw Error("Backup authorization failed.");
  const credentialHash = createHash("sha256").update(credential).digest("hex");
  credential.fill(0);
  const startedAt = dependencies.now().toISOString();
  const scope = {
    companyId: input.companyId,
    grantId: input.grantId,
    requestId: input.requestId,
  };
  let accepted = false;
  try {
    accepted = await dependencies.authority.begin({
      ...scope,
      credentialHash,
      now: startedAt,
    });
  } catch {
    throw Error("Backup authorization unavailable.");
  }
  if (!accepted) throw Error("Backup authorization failed.");
  let result: EncryptedBusinessBackup;
  try {
    const source = await dependencies.readSnapshot(input.companyId);
    if (source.companyId !== input.companyId)
      throw Error("Backup scope mismatch.");
    const archive = await createProductionBusinessBackup(
      source,
      dependencies.readOriginal,
      startedAt,
    );
    result = encryptBusinessBackup(
      Buffer.from(JSON.stringify(archive)),
      dependencies.backupKey,
      {
        companyId: input.companyId,
        keyId: dependencies.keyId,
        capturedAt: startedAt,
      },
    );
  } catch {
    try {
      await dependencies.authority.finish({
        ...scope,
        outcome: "failure",
        now: dependencies.now().toISOString(),
      });
    } catch {
      /* deny and alert on stale start */
    }
    throw Error("Backup capture failed.");
  }
  let released = false;
  try {
    released = await dependencies.authority.finish({
      ...scope,
      outcome: "success",
      now: dependencies.now().toISOString(),
    });
  } catch {
    throw Error("Backup audit unavailable; no archive was released.");
  }
  if (!released) throw Error("Backup authorization expired or was revoked.");
  return result;
}

/** Caller may use a unique ID for an audited run; no retry reuses an ID. */
export const newBackupRequestId = (): string => randomUUID();
