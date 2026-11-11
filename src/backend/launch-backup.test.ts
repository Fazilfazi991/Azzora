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
import {
  freshRehearsalDatabase,
  orderRestoreJournals,
  rehearseEncryptedBusinessRestore,
  restoreIntoFreshRehearsal,
} from "./launch-backup-rehearsal";
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
it("restores a reversal sorted before its original without changing archive or financial history", async () => {
  const input = fixture();
  const original = input.data.journals.find((j) => j.id === "staging-opening")!;
  const reversal = {
    ...structuredClone(original),
    id: "aaa-reversal",
    posting_key: "fictional-reversal",
    source_action: "reverse",
    reversal_of: original.id,
    lines: original.lines.map((line) => ({
      ...line,
      debit_fils: line.credit_fils,
      credit_fils: line.debit_fils,
    })),
  };
  input.data.journals.unshift(reversal);
  const before = JSON.stringify(input.data);
  const backup = await createStagingBackup(
    input,
    async () => bytes,
    scope.capturedAt,
  );
  const key = randomBytes(32),
    encrypted = encryptBusinessBackup(
      Buffer.from(JSON.stringify(backup)),
      key,
      scope,
    );
  const report = await rehearseEncryptedBusinessRestore(encrypted, key, scope);
  expect(JSON.stringify(input.data)).toBe(before);
  expect(report.journals).toBe(3);
  expect(report.businessSha256).toBe(report.restoredSha256);
  expect(report.financialReportsMatch).toBe(true);
}, 30000);
it("rejects missing, cyclic or duplicate reversal dependencies before restore", () => {
  const original = fixture().data.journals[0];
  expect(() =>
    orderRestoreJournals([{ ...original, reversal_of: "missing" }]),
  ).toThrow(/missing/);
  expect(() =>
    orderRestoreJournals([{ ...original, reversal_of: original.id }]),
  ).toThrow(/cycle/);
  expect(() => orderRestoreJournals([original, original])).toThrow(/Duplicate/);
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
  expect(report.financialReportsMatch).toBe(true);
  expect(report.trialDebitFils).toBe(report.trialCreditFils);
  expect(report.totalAssetsFils).toBe(report.liabilitiesAndEquityFils);
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
it("preserves supplied fictional historical actor IDs and audit events in a disabled isolated restore", async () => {
  const backup = await createStagingBackup(fixture(), async () => bytes, "2026-11-11T00:00:00.000Z");
  expect(backup.data.snapshots.length).toBeGreaterThan(0);
  const historical = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const provenance = {
    fictionalOnly: true as const, companyId,
    journals: backup.data.journals.map(j => ({ id: j.id, actorId: historical })),
    snapshots: backup.data.snapshots.map(s => ({ entityType: s.entity_type, entityId: s.entity_id, revision: s.revision, capturedBy: historical })),
    auditEvents: [{ id: "83", actorId: historical, action: "invoice.issue", entityType: "invoice", entityId: "invoice", requestId: "synthetic-request", recordedAt: "2026-11-04T10:00:00.000Z", metadata: { fictional: true } }],
  };
  const { db } = await freshRehearsalDatabase();
  try {
    await restoreIntoFreshRehearsal(db, backup, "fictional-staging", provenance);
    const journals = await db.query<{actor_id: string}>("select actor_id::text from azzora.journals");
    expect(journals.rows.every(row => row.actor_id === historical)).toBe(true);
    const snapshots = await db.query<{captured_by: string}>("select captured_by::text from azzora.snapshots");
    expect(snapshots.rows).toHaveLength(provenance.snapshots.length);
    expect(snapshots.rows.every(row => row.captured_by === historical)).toBe(true);
    const events = await db.query<{ id: string; actor_id: string; action: string; entity_type: string; entity_id: string; request_id: string; metadata: unknown }>("select id::text,actor_id::text,action,entity_type,entity_id,request_id,metadata from azzora.audit_events");
    expect(events.rows).toEqual([{ id: "83", actor_id: historical, action: "invoice.issue", entity_type: "invoice", entity_id: "invoice", request_id: "synthetic-request", metadata: { fictional: true } }]);
    const identities = await db.query<{ email: string | null; email_confirmed_at: string | null }>("select email,email_confirmed_at from auth.users where id=$1", [historical]);
    expect(identities.rows[0]).toMatchObject({ email: null, email_confirmed_at: null });
    const grants = await db.query<{ n: number }>("select count(*)::int n from azzora.memberships where user_id=$1", [historical]);
    expect(grants.rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 30000);
it("rejects synthetic provenance with incomplete actor inventory before restoring", async () => {
  const backup = await createStagingBackup(fixture(), async () => bytes, "2026-11-11T00:00:00.000Z");
  const { db } = await freshRehearsalDatabase();
  try {
    await expect(restoreIntoFreshRehearsal(db, backup, "fictional-staging", { fictionalOnly: true, companyId, journals: [], snapshots: [], auditEvents: [] })).rejects.toThrow(/inventory/);
  } finally { await db.close(); }
}, 30000);
