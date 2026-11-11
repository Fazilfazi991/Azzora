import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import {
  checkBackupMonitorReceipt,
  createBackupMonitorReceipt,
} from "./backup-monitor";

const key = randomBytes(32),
  companyId = "22222222-2222-4222-8222-222222222222";
const baseline = {
  companyId,
  keyId: "qa",
  checkedAt: "2026-11-11T00:10:00.000Z",
  maxBackupAgeSeconds: 900,
  result: "pass" as const,
  backupCapturedAt: "2026-11-11T00:00:00.000Z",
};
const expected = {
  companyId,
  keyId: "qa",
  maxBackupAgeSeconds: 900,
  maxMonitorAgeSeconds: 300,
  now: new Date("2026-11-11T00:12:00.000Z"),
};

it("validates a signed recent monitor receipt without claiming notification or cloud recovery", () => {
  const receipt = createBackupMonitorReceipt(key, baseline);
  expect(checkBackupMonitorReceipt(receipt, key, expected)).toMatchObject({
    healthy: true,
    notificationDelivered: false,
    cloudRecoveryVerified: false,
  });
});
it("rejects changed status, changed policy, wrong key and wrong company", () => {
  const receipt = createBackupMonitorReceipt(key, baseline);
  expect(() =>
    checkBackupMonitorReceipt(
      {
        ...receipt,
        payload: { ...receipt.payload, checkedAt: "2026-11-11T00:11:00.000Z" },
      },
      key,
      expected,
    ),
  ).toThrow(/integrity/);
  expect(() =>
    checkBackupMonitorReceipt(receipt, randomBytes(32), expected),
  ).toThrow(/integrity/);
  expect(() =>
    checkBackupMonitorReceipt(receipt, key, {
      ...expected,
      maxBackupAgeSeconds: 1800,
    }),
  ).toThrow(/scope or policy/);
  expect(() =>
    checkBackupMonitorReceipt(receipt, key, {
      ...expected,
      companyId: "33333333-3333-4333-8333-333333333333",
    }),
  ).toThrow(/scope or policy/);
});
it("rejects failed, expired or future monitor runs and archives that have since become stale", () => {
  const receipt = createBackupMonitorReceipt(key, baseline);
  expect(() =>
    checkBackupMonitorReceipt(
      createBackupMonitorReceipt(key, {
        ...baseline,
        result: "fail",
        backupCapturedAt: null,
      }),
      key,
      expected,
    ),
  ).toThrow(/reported failure/);
  expect(() =>
    checkBackupMonitorReceipt(receipt, key, {
      ...expected,
      now: new Date("2026-11-11T00:16:00.000Z"),
    }),
  ).toThrow(/stale/);
  expect(() =>
    checkBackupMonitorReceipt(receipt, key, {
      ...expected,
      now: new Date("2026-11-11T00:09:00.000Z"),
    }),
  ).toThrow(/check time/);
  expect(() =>
    checkBackupMonitorReceipt(receipt, key, {
      ...expected,
      maxMonitorAgeSeconds: 3600,
      now: new Date("2026-11-11T00:15:01.000Z"),
    }),
  ).toThrow(/backup is stale/);
  expect(() =>
    checkBackupMonitorReceipt(receipt, key, {
      ...expected,
      maxMonitorAgeSeconds: 0,
    }),
  ).toThrow(/stale/);
});
