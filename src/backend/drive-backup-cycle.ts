/** Offline composition only. No deployed endpoint, scheduler or secrets are configured. */
import { checkProductionBackupHealth } from "./backup-health.js";
import { uploadAndVerifyDriveBackup } from "./drive-backup.js";
import {
  createUnattendedBackupCandidate,
  type UnattendedBackupDependencies,
} from "./unattended-backup.js";

export async function runVerifiedDriveBackupCandidate(input: {
  request: {
    companyId: string;
    grantId: string;
    requestId: string;
    credential: string;
  };
  capture: UnattendedBackupDependencies;
  drive: {
    accessToken: string;
    expectedOwnerEmail: string;
    folderId: string;
    fetchImpl?: typeof fetch;
  };
  maxAgeSeconds: number;
}) {
  const envelope = await createUnattendedBackupCandidate(
    input.request,
    input.capture,
  );
  const archive = Buffer.from(JSON.stringify(envelope));
  const expected = {
    companyId: input.request.companyId,
    keyId: input.capture.keyId,
  };
  const result = await uploadAndVerifyDriveBackup({
    ...input.drive,
    archive,
    verifyArchive: async (bytes) => {
      const value: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
      checkProductionBackupHealth(value, input.capture.backupKey, expected, {
        now: input.capture.now(),
        maxAgeSeconds: input.maxAgeSeconds,
      });
    },
  });
  return {
    ...result,
    capturedAt: envelope.capturedAt,
    coverage: "business-archive-only" as const,
  };
}
