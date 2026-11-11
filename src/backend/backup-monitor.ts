/** Offline monitor evidence only: this is not backup storage or a notification service. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z
  .object({
    format: z.literal("azzora-backup-monitor-v1"),
    companyId: z.uuid(),
    keyId: z.string().min(1).max(200),
    checkedAt: z.string().datetime(),
    maxBackupAgeSeconds: z.number().int().min(1).max(31_536_000),
    result: z.enum(["pass", "fail"]),
    backupCapturedAt: z.string().datetime().nullable(),
  })
  .strict();
const receiptSchema = z
  .object({ payload: payloadSchema, signature: z.string() })
  .strict();
type Payload = z.infer<typeof payloadSchema>;
const payloadBytes = (p: Payload) =>
  Buffer.from(
    JSON.stringify({
      format: p.format,
      companyId: p.companyId,
      keyId: p.keyId,
      checkedAt: p.checkedAt,
      maxBackupAgeSeconds: p.maxBackupAgeSeconds,
      result: p.result,
      backupCapturedAt: p.backupCapturedAt,
    }),
  );
function sign(payload: Payload, key: Uint8Array) {
  if (key.byteLength !== 32)
    throw Error("A 32-byte owner-managed backup key is required.");
  const domainKey = createHmac("sha256", key)
    .update("AZZORA backup monitoring v1")
    .digest();
  return createHmac("sha256", domainKey).update(payloadBytes(payload)).digest();
}
export function createBackupMonitorReceipt(
  key: Uint8Array,
  input: {
    companyId: string;
    keyId: string;
    checkedAt: string;
    maxBackupAgeSeconds: number;
    result: "pass" | "fail";
    backupCapturedAt: string | null;
  },
) {
  const payload = payloadSchema.parse({
    format: "azzora-backup-monitor-v1",
    ...input,
  });
  if ((payload.result === "pass") !== (payload.backupCapturedAt !== null))
    throw Error("A successful check must identify its capture time.");
  return { payload, signature: sign(payload, key).toString("base64url") };
}
export function checkBackupMonitorReceipt(
  input: unknown,
  key: Uint8Array,
  expected: {
    companyId: string;
    keyId: string;
    maxBackupAgeSeconds: number;
    maxMonitorAgeSeconds: number;
    now: Date;
  },
) {
  const { payload, signature } = receiptSchema.parse(input);
  const actual = Buffer.from(signature, "base64url"),
    wanted = sign(payload, key);
  if (
    actual.length !== wanted.length ||
    actual.toString("base64url") !== signature ||
    !timingSafeEqual(actual, wanted)
  )
    throw Error("Backup monitor receipt integrity failed.");
  if (
    payload.companyId !== expected.companyId ||
    payload.keyId !== expected.keyId ||
    payload.maxBackupAgeSeconds !== expected.maxBackupAgeSeconds
  )
    throw Error("Backup monitor scope or policy differs.");
  const now = expected.now.getTime(),
    checked = Date.parse(payload.checkedAt);
  if (
    !Number.isFinite(now) ||
    !Number.isSafeInteger(expected.maxMonitorAgeSeconds) ||
    expected.maxMonitorAgeSeconds < 1 ||
    expected.maxMonitorAgeSeconds > 31_536_000 ||
    !Number.isFinite(checked) ||
    checked > now ||
    now - checked > expected.maxMonitorAgeSeconds * 1000
  )
    throw Error(
      "Backup monitor is missing, stale, or has an invalid check time.",
    );
  if (payload.result !== "pass" || !payload.backupCapturedAt)
    throw Error("The latest backup monitor reported failure.");
  const captured = Date.parse(payload.backupCapturedAt);
  if (
    !Number.isFinite(captured) ||
    captured > checked ||
    now - captured > expected.maxBackupAgeSeconds * 1000
  )
    throw Error("The checked backup is stale or has an invalid capture time.");
  return {
    healthy: true as const,
    checkedAt: payload.checkedAt,
    backupCapturedAt: payload.backupCapturedAt,
    notificationDelivered: false as const,
    cloudRecoveryVerified: false as const,
  };
}
