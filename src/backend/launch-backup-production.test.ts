import { expect, it } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createEmptyProductionCompany } from "../finance/production-policy";
import { emptyOperations } from "../operations/migration";
import { serializeCanonical } from "../staging/canonical";
import {
  verifyProductionBusinessBackup,
  verifyStagingBackup,
  createStagingBackup,
} from "../staging/backup";
import {
  createProtectedProductionBackup,
  decryptBusinessBackup,
} from "./launch-backup";
import { rehearseEncryptedBusinessRestore } from "./launch-backup-rehearsal";
import type { AuthorizedActor } from "./permissions";
const company = "22222222-2222-4222-8222-222222222222",
  owner = "33333333-3333-4333-8333-333333333333";
const actor: AuthorizedActor = {
  userId: owner,
  companyId: company,
  sessionId: "QA-ONLY",
  assurance: "aal2",
  grant: {
    userId: owner,
    companyId: company,
    active: true,
    roles: ["owner"],
    workspaces: ["manager", "accountant"],
    projectIds: [],
    capabilities: ["access.manage"],
  },
};
function fixture() {
  const settings = emptyOperations().settings;
  settings.company = {
    ...settings.company,
    name: "SYNTHETIC PRODUCTION BACKUP QA ONLY",
    phone: "",
    email: "",
    location: "",
    trn: "",
    bank: "",
  };
  const state = createEmptyProductionCompany({ settings });
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
    digest = createHash("sha256").update(bytes).digest("hex");
  state.finance.attachments.push({
    id: "qa-private-original",
    name: "synthetic-qa.png",
    mime: "image/png",
    size: bytes.length,
    data: "",
    storageObjectKey: company + "/" + digest + ".png",
  } as (typeof state.finance.attachments)[number]);
  return {
    source: { version: 1, data: serializeCanonical(state), companyId: company },
    bytes,
  };
}
it("production capture is a distinct verifiedformat, encryptedonly at protectedwrapper and denied to nonOwner/AAL1/foreign scope", async () => {
  const { source, bytes } = fixture(),
    key = randomBytes(32),
    scope = {
      companyId: company,
      keyId: "QA-ONLY",
      capturedAt: "2026-11-11T00:00:00.000Z",
    };
  const envelope = await createProtectedProductionBackup(
    source,
    async () => bytes,
    key,
    scope,
    actor,
  );
  const parsed = JSON.parse(
    Buffer.from(decryptBusinessBackup(envelope, key, scope)).toString(),
  );
  expect(parsed.mode).toBe("production");
  expect(parsed.format).toBe("azzora-production-business-backup");
  expect(verifyProductionBusinessBackup(parsed).manifest.counts.originals).toBe(
    1,
  );
  expect(() => verifyStagingBackup(parsed)).toThrow();
  await expect(createStagingBackup(source, async () => bytes)).rejects.toThrow(
    /mode/,
  );
  for (const changed of [
    { ...actor, assurance: "aal1" as const },
    { ...actor, companyId: owner },
    { ...actor, grant: { ...actor.grant, roles: ["accountant" as const] } },
    { ...actor, grant: { ...actor.grant, active: false } },
  ])
    await expect(
      createProtectedProductionBackup(
        source,
        async () => bytes,
        key,
        scope,
        changed,
      ),
    ).rejects.toThrow();
});
it("production-format capture restores exactly through the seedless reviewed productionmigrationsequence without Auth export", async () => {
  const { source, bytes } = fixture(),
    key = randomBytes(32),
    scope = {
      companyId: company,
      keyId: "QA-ONLY",
      capturedAt: "2026-11-11T00:00:00.000Z",
    },
    envelope = await createProtectedProductionBackup(
      source,
      async () => bytes,
      key,
      scope,
      actor,
    ),
    report = await rehearseEncryptedBusinessRestore(envelope, key, scope);
  expect(report.archiveMode).toBe("production");
  expect(report.migrationCount).toBe(3);
  expect(report.businessSha256).toBe(report.restoredSha256);
  expect(report.originals).toBe(1);
  expect(report.journals).toBe(0);
  expect(report.financialReportsMatch).toBe(true);
  expect(report.trialDebitFils).toBe("0");
  expect(report.trialCreditFils).toBe("0");
  expect(report.cloudDatabaseUsed).toBe(false);
  await mkdir("tmp", { recursive: true });
  await writeFile(
    "tmp/production-encrypted-restore-evidence.json",
    JSON.stringify(report, null, 2),
  );
}, 30000);
