/** Candidate only: invoke from a separately hosted scheduler. Gmail acceptance is not mailbox-delivery proof. */
import { checkBackupMonitorReceipt } from "./backup-monitor.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const proofPayload = z
  .object({
    companyId: z.uuid(),
    keyId: z.string().min(1).max(200),
    fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.string().datetime(),
    restoredAt: z.string().datetime(),
    verification: z.literal("isolated-restore-and-manifest-verified"),
  })
  .strict();
type ProofPayload = z.infer<typeof proofPayload>;
const proofSchema = z
  .object({ payload: proofPayload, signature: z.string() })
  .strict();
const sign = (payload: ProofPayload, key: Uint8Array) =>
  createHmac("sha256", key)
    .update("AZZORA independent offsite restore proof v1\0")
    .update(JSON.stringify(payload))
    .digest();
/** Called only by independently protected restoration verifier after its actual drill. */
export function signIndependentRestoreProof(
  payload: ProofPayload,
  restoreProofKey: Uint8Array,
) {
  if (restoreProofKey.byteLength !== 32)
    throw Error("Restore proof key is invalid.");
  const checked = proofPayload.parse(payload);
  return {
    payload: checked,
    signature: sign(checked, restoreProofKey).toString("base64url"),
  };
}

export async function sendBackupFailureEmail(input: {
  accessToken: string;
  recipient: string;
  fetchImpl?: typeof fetch;
}) {
  if (
    !input.accessToken ||
    /[\r\n]/.test(input.accessToken) ||
    !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(input.recipient)
  )
    throw Error("Alert authorization or recipient invalid.");
  const message = [
    `To: ${input.recipient}`,
    "Subject: AZZORA backup requires attention",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "The independent backup watchdog could not verify the latest backup. Please inspect the backup system.",
  ].join("\r\n");
  const response = await (input.fetchImpl ?? globalThis.fetch)(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: Buffer.from(message).toString("base64url") }),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw Error("Alert provider did not accept the notification.");
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id)
    throw Error("Alert provider returned an invalid response.");
  return {
    acceptedByProvider: true as const,
    mailboxDeliveryVerified: false as const,
  };
}

/** The remote check must actually download, decrypt and validate the latest archive and restore evidence. */
export async function runIndependentBackupWatchdog(input: {
  receipt: unknown;
  key: Uint8Array;
  restoreProofKey: Uint8Array;
  expectedFileId: string;
  expectedSha256: string;
  maxRestoreAgeSeconds: number;
  expected: {
    companyId: string;
    keyId: string;
    maxBackupAgeSeconds: number;
    maxMonitorAgeSeconds: number;
    now: Date;
  };
  verifyRemoteAndRestore: (backupCapturedAt: string) => Promise<unknown>;
  sendAlert: () => Promise<void>;
}) {
  try {
    const checked = checkBackupMonitorReceipt(
      input.receipt,
      input.key,
      input.expected,
    );
    if (
      input.key.byteLength !== 32 ||
      input.restoreProofKey.byteLength !== 32 ||
      timingSafeEqual(input.key, input.restoreProofKey)
    )
      throw Error("Independent proof key required.");
    if (
      !Number.isSafeInteger(input.maxRestoreAgeSeconds) ||
      input.maxRestoreAgeSeconds < 1 ||
      input.maxRestoreAgeSeconds > 31536000
    )
      throw Error("Invalid restore age.");
    const proof = proofSchema.parse(
      await input.verifyRemoteAndRestore(checked.backupCapturedAt),
    );
    const actual = Buffer.from(proof.signature, "base64url"),
      wanted = sign(proof.payload, input.restoreProofKey);
    const restored = Date.parse(proof.payload.restoredAt),
      captured = Date.parse(proof.payload.capturedAt),
      now = input.expected.now.getTime();
    if (
      actual.length !== wanted.length ||
      actual.toString("base64url") !== proof.signature ||
      !timingSafeEqual(actual, wanted) ||
      proof.payload.companyId !== input.expected.companyId ||
      proof.payload.keyId !== input.expected.keyId ||
      proof.payload.fileId !== input.expectedFileId ||
      proof.payload.sha256 !== input.expectedSha256 ||
      proof.payload.capturedAt !== checked.backupCapturedAt ||
      !Number.isFinite(restored) ||
      restored < captured ||
      restored > now ||
      now - restored > input.maxRestoreAgeSeconds * 1000
    )
      throw Error("Independent restore proof is invalid or stale.");
    return { healthy: true as const, alertRequested: false as const };
  } catch {
    // Alert failures propagate: a caller must not report a notification as delivered.
    await input.sendAlert();
    return {
      healthy: false as const,
      alertRequested: true as const,
      mailboxDeliveryVerified: false as const,
    };
  }
}
