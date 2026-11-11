import { expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createEmptyProductionCompany } from "../finance/production-policy";
import { emptyOperations } from "../operations/migration";
import { serializeCanonical } from "../staging/canonical";
import { createStagingBackup } from "../staging/backup";
import { createSharedCompanyState } from "../staging/domain";
import { checkProductionBackupHealth } from "./backup-health";
import {
  createProtectedProductionBackup,
  decryptBusinessBackup,
  encryptBusinessBackup,
} from "./launch-backup";
import type { AuthorizedActor } from "./permissions";

const companyId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";
const capturedAt = "2026-11-11T00:00:00.000Z";
const scope = { companyId, keyId: "qa-key", capturedAt };
const actor: AuthorizedActor = {
  userId: ownerId,
  companyId,
  sessionId: "qa",
  assurance: "aal2",
  grant: {
    userId: ownerId,
    companyId,
    active: true,
    roles: ["owner"],
    workspaces: ["manager"],
    projectIds: [],
    capabilities: ["access.manage"],
  },
};
async function fixture() {
  const settings = emptyOperations().settings;
  settings.company = {
    ...settings.company,
    name: "Fictional QA only",
    trn: "",
  };
  const state = createEmptyProductionCompany({ settings });
  const key = randomBytes(32);
  const envelope = await createProtectedProductionBackup(
    { version: 1, data: serializeCanonical(state), companyId },
    async () => {
      throw Error("Unexpected original");
    },
    key,
    scope,
    actor,
  );
  return { key, envelope };
}
const policy = {
  now: new Date("2026-11-11T00:10:00.000Z"),
  maxAgeSeconds: 600,
};

it("authenticates, verifies and reports a current production business backup without claiming full recovery", async () => {
  const { key, envelope } = await fixture();
  expect(
    checkProductionBackupHealth(envelope, key, scope, policy),
  ).toMatchObject({
    healthy: true,
    ageSeconds: 600,
    archiveIntegrityVerified: true,
    cloudAccessVerified: false,
    authRecoveryVerified: false,
    infrastructureRecoveryVerified: false,
    notificationConfigurationVerified: false,
  });
});
it("fails closed for stale, future or unconfigured age limits", async () => {
  const { key, envelope } = await fixture();
  expect(() =>
    checkProductionBackupHealth(envelope, key, scope, {
      ...policy,
      maxAgeSeconds: 599,
    }),
  ).toThrow(/older/);
  expect(() =>
    checkProductionBackupHealth(envelope, key, scope, {
      ...policy,
      now: new Date("2026-11-10T23:59:59Z"),
    }),
  ).toThrow(/future/);
  for (const maxAgeSeconds of [0, -1, 1.5, NaN, 31_536_001])
    expect(() =>
      checkProductionBackupHealth(envelope, key, scope, {
        ...policy,
        maxAgeSeconds,
      }),
    ).toThrow(/age limit/);
});
it("rejects tampering, wrong keys and company scopes", async () => {
  const { key, envelope } = await fixture();
  expect(() =>
    checkProductionBackupHealth(envelope, randomBytes(32), scope, policy),
  ).toThrow();
  expect(() =>
    checkProductionBackupHealth(
      envelope,
      key,
      { ...scope, companyId: ownerId },
      policy,
    ),
  ).toThrow();
  const altered = { ...envelope, tag: Buffer.alloc(16).toString("base64") };
  expect(() =>
    checkProductionBackupHealth(altered, key, scope, policy),
  ).toThrow();
});
it("rejects mismatched capture times and fictional-staging archives", async () => {
  const { key, envelope } = await fixture();
  const clear = decryptBusinessBackup(envelope, key, scope);
  const wrongTime = encryptBusinessBackup(clear, key, {
    ...scope,
    capturedAt: "2026-11-11T00:01:00.000Z",
  });
  expect(() =>
    checkProductionBackupHealth(wrongTime, key, scope, policy),
  ).toThrow(/capture time/);
  const staging = await createStagingBackup(
    {
      version: 1,
      data: serializeCanonical(createSharedCompanyState()),
      companyId,
    },
    async () => {
      throw Error("Unexpected original");
    },
    capturedAt,
  );
  const mislabeled = encryptBusinessBackup(
    Buffer.from(JSON.stringify(staging)),
    key,
    scope,
  );
  expect(() =>
    checkProductionBackupHealth(mislabeled, key, scope, policy),
  ).toThrow();
});
it("exposes an offline status and nonzero failure exit for automation without disclosing its key", async () => {
  const settings = emptyOperations().settings;
  settings.company = { ...settings.company, name: "Fictional CLI QA", trn: "" };
  const key = randomBytes(32);
  const envelope = await createProtectedProductionBackup(
    {
      version: 1,
      data: serializeCanonical(createEmptyProductionCompany({ settings })),
      companyId,
    },
    async () => {
      throw Error("Unexpected original");
    },
    key,
    { ...scope, capturedAt: new Date().toISOString() },
    actor,
  );
  const dir = mkdtempSync(join(tmpdir(), "azzora-backup-qa-"));
  const input = join(dir, "archive.json"),
    keyFile = join(dir, "key.bin");
  writeFileSync(input, JSON.stringify(envelope));
  writeFileSync(keyFile, key, { mode: 0o600 });
  const args = [
    "scripts/launch-import-recovery.mjs",
    "verify-production-backup",
    "--input",
    input,
    "--key-file",
    keyFile,
    "--company",
    companyId,
    "--key-id",
    scope.keyId,
  ];
  const ok = spawnSync(
    process.execPath,
    [...args, "--max-age-seconds", "3600"],
    { encoding: "utf8", timeout: 30000 },
  );
  expect(ok.status).toBe(0);
  expect(JSON.parse(ok.stdout)).toMatchObject({
    healthy: true,
    notificationConfigurationVerified: false,
  });
  expect(ok.stdout).not.toContain(key.toString("base64"));
  const invalid = spawnSync(
    process.execPath,
    [...args, "--max-age-seconds", "0"],
    { encoding: "utf8", timeout: 30000 },
  );
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("positive integer");
  expect(invalid.stderr).not.toContain(key.toString("base64"));
}, 60000);
