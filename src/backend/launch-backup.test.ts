import { expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { createStagingBackup } from "../staging/backup";
import {
  createSharedCompanyState,
  applySharedCommand,
  type SharedActor,
} from "../staging/domain";
import { serializeCanonical } from "../staging/canonical";
import { blankCustomer } from "../commercial/customer-domain";
import { blankInvoice, newProjectDetails } from "../commercial/repository";
import { encryptBusinessBackup, decryptBusinessBackup } from "./launch-backup";
import { rehearseEncryptedBusinessRestore } from "./launch-backup-rehearsal";
const companyId = "11111111-1111-4111-8111-111111111111",
  ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor: SharedActor = {
  userId: ownerId,
  personId: ownerId,
  companyId,
  sessionId: "not-exported",
  assurance: "aal2",
  grant: {
    userId: ownerId,
    companyId,
    active: true,
    roles: ["owner"],
    workspaces: ["manager", "accountant"],
    projectIds: ["project"],
    capabilities: [
      "project.write",
      "finance.simulate",
      "finance.draft",
      "access.manage",
    ],
  },
};
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
  digest = createHash("sha256").update(bytes).digest("hex"),
  objectKey = `${companyId}/${digest}.png`;
function fixture() {
  let state = createSharedCompanyState([
    {
      id: ownerId,
      name: "Fictional backup owner",
      role: "Project Manager",
      demoRole: "Owner",
      email: "owner@staging.azzora.test",
      phone: "",
      status: "Active",
      capacity: 100,
    },
  ]);
  const run = (kind: string, payload: unknown) => {
    state = applySharedCommand(state, { kind, payload }, actor);
  };
  run("customer.save", {
    customer: {
      ...blankCustomer(),
      id: "client",
      name: "Fictional Backup Client",
      contact: "Fictional",
    },
  });
  run("project.create", {
    project: {
      ...newProjectDetails(
        state.manager,
        "client",
        "Fictional Backup Project",
        "Fictional site",
      ),
      id: "project",
      managerId: ownerId,
    },
    standard: false,
    planMode: "empty",
  });
  run("invoice.save", {
    invoice: {
      ...blankInvoice("client", "project"),
      id: "invoice",
      date: "2026-11-04",
      due: "2026-11-30",
      description: "Fictional backup source",
      vatPercentage: "0",
      lines: [
        {
          id: "line",
          description: "Fictional service",
          quantity: "1",
          rate: "100",
          tax: "Zero Rated",
        },
      ],
    },
  });
  run("invoice.issue", { id: "invoice" });
  state.finance.attachments.push({
    id: "finance-original",
    name: "Fictional finance original.png",
    mime: "image/png",
    size: bytes.length,
    data: "",
    storageObjectKey: objectKey,
  } as (typeof state.finance.attachments)[number]);
  state.manager.documents.push({
    id: "manager-document",
    projectId: "project",
    name: "Fictional manager document",
    category: "Design Drawings",
    status: "Draft",
    version: 1,
    uploadedAt: "2026-11-04",
    uploadedBy: ownerId,
    attachment: {
      id: "manager-original",
      name: "Fictional Manager original.png",
      type: "image/png",
      size: bytes.length,
      category: "Drawing",
      dataUrl: "/api/staging/files/manager-original",
      storageObjectKey: objectKey,
    } as NonNullable<(typeof state.manager.documents)[number]["attachment"]>,
  });
  return { version: 42, data: serializeCanonical(state), companyId };
}

const scope = {
  companyId,
  keyId: "QA-ONLY-OWNER-KEY",
  capturedAt: "2026-11-11T00:00:00.000Z",
};
it("encrypts a reviewed archive with owner-managed key, fresh nonce and authenticated company metadata", () => {
  const raw = Buffer.from("SYNTHETIC BUSINESS ARCHIVE ONLY"),
    key = randomBytes(32),
    a = encryptBusinessBackup(raw, key, scope),
    b = encryptBusinessBackup(raw, key, scope);
  expect(a.ciphertext).not.toBe(b.ciphertext);
  expect(a.nonce).not.toBe(b.nonce);
  expect(Buffer.from(decryptBusinessBackup(a, key, scope))).toEqual(raw);
  expect(JSON.stringify(a)).not.toContain(raw.toString());
  expect(JSON.stringify(a)).not.toContain(key.toString("base64"));
});
it("rejects wrong key, company scope, tampered ciphertext/tag/hash/timestamp and malformed lengths", () => {
  const key = randomBytes(32),
    e = encryptBusinessBackup(Buffer.from("SYNTHETIC ONLY"), key, scope);
  expect(() => decryptBusinessBackup(e, randomBytes(32), scope)).toThrow(
    /integrity/,
  );
  expect(() =>
    decryptBusinessBackup(e, key, {
      ...scope,
      companyId: "22222222-2222-4222-8222-222222222222",
    }),
  ).toThrow(/scope|identity|company/);
  for (const changed of [
    { ...e, capturedAt: "2026-11-12T00:00:00.000Z" },
    { ...e, plaintextSha256: "f".repeat(64) },
    { ...e, tag: Buffer.alloc(16).toString("base64") },
    { ...e, ciphertext: Buffer.alloc(e.plaintextBytes).toString("base64") },
    { ...e, nonce: Buffer.alloc(2).toString("base64") },
  ])
    expect(() => decryptBusinessBackup(changed, key, scope)).toThrow();
  expect(() =>
    encryptBusinessBackup(Buffer.from("x"), Buffer.alloc(4), scope),
  ).toThrow(/32-byte/);
});
it("decrypts, verifies and restores a real synthetic business export into isolated PostgreSQL with exact history/originals and reconciled reports", async () => {
  const backup = await createStagingBackup(
      fixture(),
      async () => bytes,
      "2026-11-11T00:00:00.000Z",
    ),
    key = randomBytes(32),
    encrypted = encryptBusinessBackup(
      Buffer.from(JSON.stringify(backup)),
      key,
      scope,
    ),
    report = await rehearseEncryptedBusinessRestore(encrypted, key, scope);
  expect(report.isolated).toBe(true);
  expect(report.cloudDatabaseUsed).toBe(false);
  expect(report.originals).toBe(1);
  expect(report.journals).toBe(2);
  expect(report.capturedVersion).toBe(42);
  expect(report.businessSha256).toBe(report.restoredSha256);
  expect(report.trialBalanceBalanced).toBe(true);
  expect(report.balanceSheetBalanced).toBe(true);
  expect(report.identityUsersRestored).toBe(false);
  await mkdir("tmp", { recursive: true });
  await writeFile(
    "tmp/qa-encrypted-business-backup.json",
    JSON.stringify(encrypted),
  );
  await writeFile("tmp/qa-backup-key.bin", key, { mode: 0o600 });
  await writeFile(
    "tmp/launch-encrypted-restore-evidence.json",
    JSON.stringify(report, null, 2),
  );
}, 30000);
