import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createBackupMonitorReceipt } from "./backup-monitor";
import {
  runIndependentBackupWatchdog,
  sendBackupFailureEmail,
} from "./independent-backup-watchdog";

const key = randomBytes(32);
const companyId = "22222222-2222-4222-8222-222222222222";
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
it("reports healthy only after a signed fresh receipt and independent remote verification", async () => {
  const verifyRemoteAndRestore = vi.fn(async () => {}),
    sendAlert = vi.fn(async () => {});
  expect(
    (
      await runIndependentBackupWatchdog({
        receipt,
        key,
        expected,
        verifyRemoteAndRestore,
        sendAlert,
      })
    ).healthy,
  ).toBe(true);
  expect(verifyRemoteAndRestore).toHaveBeenCalledWith(
    "2026-11-11T00:00:00.000Z",
  );
  expect(sendAlert).not.toHaveBeenCalled();
});
it("requests an alert for missing or stale scheduled output and remote verification failure", async () => {
  for (const [candidate, remoteFails] of [
    [null, false],
    [receipt, true],
  ] as const) {
    const sendAlert = vi.fn(async () => {});
    const verifyRemoteAndRestore = vi.fn(async () => {
      if (remoteFails) throw Error("failed");
    });
    expect(
      (
        await runIndependentBackupWatchdog({
          receipt: candidate,
          key,
          expected,
          verifyRemoteAndRestore,
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
      receipt: null,
      key,
      expected,
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
  const result = await sendBackupFailureEmail({
    recipient: "owner@example.test",
    accessToken: "test-token",
    fetchImpl: request as unknown as typeof fetch,
  });
  expect(result).toEqual({
    acceptedByProvider: true,
    mailboxDeliveryVerified: false,
  });
  expect(request).toHaveBeenCalledTimes(1);
});
