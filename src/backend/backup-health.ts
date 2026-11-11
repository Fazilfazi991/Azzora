/** Offline, read-only check of one encrypted production business archive.
 * It does not create a backup, test cloud storage, or validate Auth recovery. */
import { decryptBusinessBackup } from "./launch-backup.js";
import { verifyProductionBusinessBackup } from "../staging/backup.js";

export function checkProductionBackupHealth(
  envelope: unknown,
  key: Uint8Array,
  expected: { companyId: string; keyId: string },
  policy: { now: Date; maxAgeSeconds: number },
) {
  const now = policy.now.getTime();
  if (
    !Number.isFinite(now) ||
    !Number.isSafeInteger(policy.maxAgeSeconds) ||
    policy.maxAgeSeconds < 1 ||
    policy.maxAgeSeconds > 31_536_000
  )
    throw Error(
      "Supply a valid check time and an explicit backup age limit of 1 to 31536000 seconds.",
    );

  const clear = decryptBusinessBackup(envelope, key, expected);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(clear).toString("utf8"));
  } catch {
    throw Error("Decrypted backup is not valid JSON.");
  }
  const backup = verifyProductionBusinessBackup(parsed);
  if (backup.companyId !== expected.companyId)
    throw Error("Inner backup company does not match its encrypted scope.");
  const encrypted = envelope as { capturedAt: string };
  if (backup.capturedAt !== encrypted.capturedAt)
    throw Error("Backup capture time does not match its encrypted scope.");
  const captured = Date.parse(backup.capturedAt);
  if (!Number.isFinite(captured) || captured > now)
    throw Error("Backup capture time is invalid or in the future.");
  const ageSeconds = Math.floor((now - captured) / 1000);
  if (now - captured > policy.maxAgeSeconds * 1000)
    throw Error("Backup is older than the configured age limit.");
  return {
    healthy: true as const,
    scope: "encrypted-production-business-archive" as const,
    capturedAt: backup.capturedAt,
    ageSeconds,
    maxAgeSeconds: policy.maxAgeSeconds,
    archiveIntegrityVerified: true as const,
    cloudAccessVerified: false as const,
    authRecoveryVerified: false as const,
    infrastructureRecoveryVerified: false as const,
    notificationConfigurationVerified: false as const,
  };
}
