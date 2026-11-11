import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createBackupMonitorReceipt } from "./backup-monitor";
import {
  runIndependentBackupWatchdog,
  sendBackupFailureEmail,
  signIndependentRestoreProof,
} from "./independent-backup-watchdog";
const key = randomBytes(32),
  restoreProofKey = randomBytes(32),
  companyId = "22222222-2222-4222-8222-222222222222",
  fileId = "archive_0123456789",
  sha256 = "a".repeat(64);
const expected = {
  companyId,
  keyId: "QA",
  maxBackupAgeSeconds: 3600,
  maxMonitorAgeSeconds: 1800,
  now: new Date("2026-11-11T00:10:00Z"),
};
const receipt = createBackupMonitorReceipt(key, {
  companyId,
  keyId: "QA",
  checkedAt: "2026-11-11T00:05:00.000Z",
  maxBackupAgeSeconds: 3600,
  result: "pass",
  backupCapturedAt: "2026-11-11T00:00:00.000Z",
});
const payload = {
  companyId,
  keyId: "QA",
  fileId,
  sha256,
  capturedAt: "2026-11-11T00:00:00.000Z",
  restoredAt: "2026-11-11T00:05:00.000Z",
  verification: "isolated-restore-and-manifest-verified" as const,
};
const common = {
  receipt,
  key,
  restoreProofKey,
  expectedFileId: fileId,
  expectedSha256: sha256,
  maxRestoreAgeSeconds: 1800,
  expected,
};
it("requires independently signed matching file, digest, company and restore", async () => {
  const verifyRemoteAndRestore = vi.fn(async () =>
      signIndependentRestoreProof(payload, restoreProofKey),
    ),
    sendAlert = vi.fn(async () => {});
  expect(
    (
      await runIndependentBackupWatchdog({
        ...common,
        verifyRemoteAndRestore,
        sendAlert,
      })
    ).healthy,
  ).toBe(true);
  expect(sendAlert).not.toHaveBeenCalled();
});
it("alerts on missing output, noop verification, wrong digest, tampering, stale restore and same proof key", async () => {
  const proof = signIndependentRestoreProof(payload, restoreProofKey);
  const cases = [
    { receipt: null, proof },
    { receipt, proof: undefined },
    {
      receipt,
      proof: signIndependentRestoreProof(
        { ...payload, sha256: "b".repeat(64) },
        restoreProofKey,
      ),
    },
    {
      receipt,
      proof: {
        ...proof,
        payload: { ...proof.payload, fileId: "archive_changed123" },
      },
    },
    {
      receipt,
      proof: signIndependentRestoreProof(
        { ...payload, restoredAt: "2026-11-11T00:00:00.000Z" },
        restoreProofKey,
      ),
      maxRestoreAgeSeconds: 1,
    },
    { receipt, proof, restoreProofKey: key },
  ];
  for (const c of cases) {
    const sendAlert = vi.fn(async () => {});
    expect(
      (
        await runIndependentBackupWatchdog({
          ...common,
          receipt: c.receipt,
          restoreProofKey: c.restoreProofKey ?? restoreProofKey,
          maxRestoreAgeSeconds: c.maxRestoreAgeSeconds ?? 1800,
          verifyRemoteAndRestore: async () => c.proof,
          sendAlert,
        })
      ).healthy,
    ).toBe(false);
    expect(sendAlert).toHaveBeenCalledTimes(1);
  }
});
it("propagates failed alert dispatch", async () => {
  await expect(
    runIndependentBackupWatchdog({
      ...common,
      receipt: null,
      verifyRemoteAndRestore: vi.fn(),
      sendAlert: vi.fn(async () => {
        throw Error("down");
      }),
    }),
  ).rejects.toThrow("down");
});
it("sends a generic alert through Gmail and never claims mailbox delivery", async () => {
  const request = vi.fn(
    async () => new Response(JSON.stringify({ id: "fictional" })),
  );
  expect(
    await sendBackupFailureEmail({
      recipient: "owner@example.test",
      accessToken: "test-token",
      fetchImpl: request as unknown as typeof fetch,
    }),
  ).toEqual({ acceptedByProvider: true, mailboxDeliveryVerified: false });
});
