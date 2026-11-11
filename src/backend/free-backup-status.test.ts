import { describe, expect, it } from "vitest";
import {
  canonicalFreeBackupStatus,
  signFreeBackupStatus,
  verifyFreeBackupStatus,
} from "./free-backup-status";

const payload = {
  format: "azzora-backup-status-v1",
  runId: "synthetic-run-1",
  projectRef: "abcdefghijklmnopqrst",
  capturedAt: "2026-11-10T20:30:00Z",
  completedAt: "2026-11-10T20:31:00Z",
  archiveFileId: "fictional-file-123",
  archiveSha256: "a".repeat(64),
  archiveMd5: "b".repeat(32),
  archiveBytes: 123,
  schemaDump: true,
  dataDump: true,
  rolesDump: true,
  objectCount: 0,
  complete: true,
};
const key = new Uint8Array(32).fill(17);

describe("free backup status", () => {
  it("signs deterministic sorted UTF-8 payloads and verifies unchanged data", () => {
    const signed = signFreeBackupStatus(payload, key);
    expect(canonicalFreeBackupStatus(payload)).toBe(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    );
    expect(verifyFreeBackupStatus(signed, key)).toEqual(payload);
    expect(signed.mac).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects tampered records, keys and invalid or incomplete coverage", () => {
    const signed = signFreeBackupStatus(payload, key);
    expect(() =>
      verifyFreeBackupStatus(
        { ...signed, payload: { ...signed.payload, archiveBytes: 124 } },
        key,
      ),
    ).toThrow();
    expect(() =>
      verifyFreeBackupStatus(signed, new Uint8Array(32).fill(18)),
    ).toThrow();
    expect(() =>
      signFreeBackupStatus({ ...payload, schemaDump: false }, key),
    ).toThrow();
    expect(() =>
      signFreeBackupStatus({ ...payload, complete: false }, key),
    ).toThrow();
    expect(() => signFreeBackupStatus(payload, new Uint8Array(31))).toThrow();
    expect(() =>
      signFreeBackupStatus(
        { ...payload, completedAt: "2026-11-10T20:29:00Z" },
        key,
      ),
    ).toThrow();
  });
});
