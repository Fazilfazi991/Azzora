import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { emptyOperations } from "../operations/migration";
import { createEmptyProductionCompany } from "../finance/production-policy";
import { serializeCanonical } from "../staging/canonical";
import { decryptBusinessBackup } from "./launch-backup";
import { verifyProductionBusinessBackup } from "../staging/backup";
import {
  createUnattendedBackupCandidate,
  type CaptureAuthority,
} from "./unattended-backup";

const companyId = "22222222-2222-4222-8222-222222222222";
const grantId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const capturedAt = "2026-11-11T00:00:00.000Z";

function setup() {
  const credential = randomBytes(32).toString("base64url"),
    key = randomBytes(32);
  const expectedHash = createHash("sha256")
    .update(Buffer.from(credential, "base64url"))
    .digest("hex");
  const events: string[] = [],
    used = new Set<string>();
  let enabled = true,
    valid = true;
  const authority: CaptureAuthority = {
    async begin(input) {
      if (
        !enabled ||
        !valid ||
        input.companyId !== companyId ||
        input.grantId !== grantId ||
        input.credentialHash !== expectedHash ||
        used.has(input.requestId)
      )
        return false;
      used.add(input.requestId);
      events.push("start");
      return true;
    },
    async finish(input) {
      const permitted = enabled && valid;
      events.push(permitted ? input.outcome : "denied");
      return permitted;
    },
  };
  const source = {
    companyId,
    version: 1,
    data: serializeCanonical(
      createEmptyProductionCompany({ settings: emptyOperations().settings }),
    ),
  };
  const readSnapshot = vi.fn(async () => source);
  const readOriginal = vi.fn(async () => new Uint8Array());
  return {
    request: { companyId, grantId, requestId, credential },
    deps: {
      authority,
      readSnapshot,
      readOriginal,
      backupKey: key,
      keyId: "QA-ONLY",
      now: () => new Date(capturedAt),
    },
    events,
    revoke: () => {
      enabled = false;
    },
    expire: () => {
      valid = false;
    },
  };
}

describe("unattended capture candidate (offline, not wired)", () => {
  it("releases only an audited encrypted production archive and rejects duplicate runs", async () => {
    const f = setup();
    const envelope = await createUnattendedBackupCandidate(f.request, f.deps);
    expect(f.events).toEqual(["start", "success"]);
    expect(JSON.stringify(envelope)).not.toContain(f.request.credential);
    const plaintext = decryptBusinessBackup(envelope, f.deps.backupKey, {
      companyId,
      keyId: "QA-ONLY",
    });
    expect(
      verifyProductionBusinessBackup(
        JSON.parse(Buffer.from(plaintext).toString()),
      ).companyId,
    ).toBe(companyId);
    await expect(
      createUnattendedBackupCandidate(f.request, f.deps),
    ).rejects.toThrow(/authorization/);
    expect(f.deps.readSnapshot).toHaveBeenCalledTimes(1);
  });
  it("denies wrong company, grant or secret before reading any records", async () => {
    for (const change of [
      { companyId: grantId },
      { grantId: companyId },
      { credential: randomBytes(32).toString("base64url") },
    ]) {
      const f = setup();
      await expect(
        createUnattendedBackupCandidate({ ...f.request, ...change }, f.deps),
      ).rejects.toThrow(/authorization/);
      expect(f.deps.readSnapshot).not.toHaveBeenCalled();
      expect(f.events).toEqual([]);
    }
  });
  it("withholds the archive if the grant is revoked or expires during capture", async () => {
    for (const action of ["revoke", "expire"] as const) {
      const f = setup(),
        read = f.deps.readSnapshot;
      f.deps.readSnapshot = vi.fn(async () => {
        const snapshot = await read();
        f[action]();
        return snapshot;
      });
      await expect(
        createUnattendedBackupCandidate(f.request, f.deps),
      ).rejects.toThrow(/expired|revoked/);
      expect(f.events).toEqual(["start", "denied"]);
    }
  });
  it("fails closed on audit errors, scope mismatch and capture failure", async () => {
    const f = setup();
    f.deps.readSnapshot = vi.fn(async () => {
      throw Error("private data must not escape");
    });
    await expect(
      createUnattendedBackupCandidate(f.request, f.deps),
    ).rejects.toThrow("Backup capture failed.");
    expect(f.events).toEqual(["start", "failure"]);
    const g = setup();
    g.deps.authority.finish = vi.fn(async () => {
      throw Error("audit unavailable");
    });
    await expect(
      createUnattendedBackupCandidate(g.request, g.deps),
    ).rejects.toThrow();
    const h = setup(),
      read = h.deps.readSnapshot;
    h.deps.readSnapshot = vi.fn(async () => ({
      ...(await read()),
      companyId: grantId,
    }));
    await expect(
      createUnattendedBackupCandidate(h.request, h.deps),
    ).rejects.toThrow("Backup capture failed.");
    expect(h.events).toEqual(["start", "failure"]);
  });
});
