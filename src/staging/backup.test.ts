import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  createStagingBackup,
  verifyStagingBackup,
  stableBackupJson,
  canonicalBusinessSha256,
  type StagingBackup,
} from "./backup";
import {
  createSharedCompanyState,
  applySharedCommand,
  type SharedActor,
} from "./domain";
import {
  serializeCanonical,
  hydrateCanonical,
  type CanonicalData,
} from "./canonical";
import { blankCustomer } from "../commercial/customer-domain";
import { blankInvoice, newProjectDetails } from "../commercial/repository";
import { buildTrialBalance } from "../accounting/reports";
import { createStagingHandler } from "./server";
import type { createStagingAuth, StagingActor } from "./auth";
import type { StagingRpc } from "./supabase";
import { decryptBusinessBackup, encryptBusinessBackup, verifyAuthoritativeStagingArchive } from "../backend/launch-backup";
import { freshRehearsalDatabase as freshAuthoritativeDatabase, rehearseEncryptedBusinessRestore, restoreIntoFreshRehearsal as restoreAuthoritative } from "../backend/launch-backup-rehearsal";

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
export async function freshRehearsalDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  const migrations = (
    await readdir(new URL("../../supabase/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of migrations)
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  return { db, migrations };
}
/** Test-only fresh restore. Never exported by the application or connected to a cloud client. */
export async function restoreIntoFreshRehearsal(db: PGlite, input: unknown) {
  const backup = verifyStagingBackup(input),
    data = backup.data,
    company = backup.companyId || companyId;
  const existing = await db.query<{ n: number }>(
    "select count(*)::int n from azzora.records",
  );
  if (existing.rows[0].n !== 0)
    throw Error(
      "Restore rehearsal requires an empty business database; never overwrite history.",
    );
  const execute = (sql: string, params: unknown[]) => db.query(sql, params);
  await db.exec("begin");
  try {
    // Fresh offline fixture identity only: no exported Auth user, password or session is restored.
    await execute(
      "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'offline-owner@rehearsal.test','{\"azzora_scope\":\"fictional-staging\"}',now()) on conflict do nothing",
      [ownerId],
    );
    await execute(
      "insert into azzora.companies(id,name,data_mode,version) values($1,'Fictional offline restore','fictional-staging',$2) on conflict(id) do update set version=excluded.version",
      [company, backup.capturedCompanyVersion],
    );
    for (const v of data.parties)
      await execute(
        "insert into azzora.parties(company_id,id,kind,payload) values($1,$2,$3,$4::jsonb)",
        [company, v.id, v.kind, JSON.stringify(v.payload)],
      );
    for (const v of data.departments)
      await execute(
        "insert into azzora.departments(company_id,id,name) values($1,$2,$3)",
        [company, v.id, v.name],
      );
    for (const v of data.projects)
      await execute(
        "insert into azzora.projects(company_id,id,customer_id,payload) values($1,$2,$3,$4::jsonb)",
        [company, v.id, v.customer_id, JSON.stringify(v.payload)],
      );
    for (const v of data.records)
      await execute(
        "insert into azzora.records(company_id,entity_type,id,project_id,party_id,department_id,payload,status) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",
        [
          company,
          v.entity_type,
          v.id,
          v.project_id,
          v.party_id,
          v.department_id,
          JSON.stringify(v.payload),
          v.status,
        ],
      );
    for (const v of data.accounts)
      await execute(
        "insert into azzora.accounts(company_id,id,code,name,type,postable,active) values($1,$2,$3,$4,$5,$6,$7)",
        [company, v.id, v.code, v.name, v.type, v.postable, v.active],
      );
    for (const v of data.periods)
      await execute(
        "insert into azzora.accounting_periods(company_id,id,start_date,end_date,locked) values($1,$2,$3,$4,$5)",
        [company, v.id, v.start_date, v.end_date, v.locked],
      );
    const hasReversal =
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from information_schema.columns where table_schema='azzora' and table_name='journals' and column_name='reversal_of'",
        )
      ).rows[0].n > 0;
    for (const v of data.journals) {
      if (v.reversal_of && !hasReversal)
        throw Error("Reversal migration required before restore.");
      await execute(
        `insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,domain_source,posting_date,period_id,memo,currency,recorded_at,actor_id${hasReversal ? ",reversal_of" : ""}) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13${hasReversal ? ",$14" : ""})`,
        [
          company,
          v.id,
          v.posting_key,
          v.source_type,
          v.source_id,
          v.source_action,
          JSON.stringify(v.domain_source),
          v.posting_date,
          v.period_id,
          v.memo,
          v.currency,
          v.recorded_at,
          ownerId,
          ...(hasReversal ? [v.reversal_of || null] : []),
        ],
      );
      for (const l of v.lines)
        await execute(
          "insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils,project_id,party_id,department_id,domain_dimensions) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
          [
            company,
            v.id,
            l.line_no,
            l.account_id,
            l.debit_fils,
            l.credit_fils,
            l.project_id,
            l.party_id,
            l.department_id,
            JSON.stringify(l.domain_dimensions || {}),
          ],
        );
    }
    for (const v of data.snapshots)
      await execute(
        "insert into azzora.snapshots(company_id,entity_type,entity_id,revision,payload,sha256,captured_by) values($1,$2,$3,$4,$5::jsonb,$6,$7)",
        [
          company,
          v.entity_type,
          v.entity_id,
          v.revision,
          JSON.stringify(v.payload),
          v.sha256,
          ownerId,
        ],
      );
    const allocationProjector = (
      await db.query<{ present: boolean }>(
        "select to_regprocedure('azzora.project_staging_allocations(uuid)') is not null present",
      )
    ).rows[0].present;
    if (allocationProjector)
      await execute("select azzora.project_staging_allocations($1)", [company]);
    else if (backup.manifest.counts.allocations)
      throw Error("Allocation migration required before restore.");
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
  // Offline file map represents restored private originals, never a public object URL.
  return {
    originals: new Map(
      backup.originals.map((file) => [
        file.objectKey,
        Buffer.from(file.base64, "base64"),
      ]),
    ),
    capturedVersion: backup.capturedCompanyVersion,
  };
}
describe("fictional business backup integrity and isolated restore", () => {
  it("refuses missing, malformed, noncanonical or reused staging keys without returning plaintext", async () => {
    const source = fixture();
    const identity: StagingActor = {
      userId: ownerId,
      companyId,
      email: "owner@staging.azzora.test",
      role: "owner_admin",
      workspace: "manager",
      sessionHash: "fixture",
      assurance: "aal2",
      mfaVerifiedAt: Date.now(),
      providerSessionId: "fixture",
      projectIds: [],
      capabilities: ["access.manage"],
    };
    const auth = {
      requireActor: async () => identity,
      handle: vi.fn(),
    } as unknown as ReturnType<typeof createStagingAuth>;
    const rpc = vi.fn(async () => ({
      version: source.version,
      data: source.data,
    })) as unknown as StagingRpc;
    const read = vi.fn(async () => bytes);
    const storage = { read, store: vi.fn() } as unknown as NonNullable<
      Parameters<typeof createStagingHandler>[0]
    >["storage"];
    const handler = createStagingHandler({ auth, rpc, storage });
    const request = () =>
      new Request("https://staging.test/api/staging/manager/backup/encrypted");
    const canonical = Buffer.alloc(32, 9).toString("base64url");
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const equivalent =
      canonical.slice(0, -1) +
      alphabet[alphabet.indexOf(canonical.at(-1)!) + 1];
    expect(Buffer.from(equivalent, "base64url")).toEqual(
      Buffer.from(canonical, "base64url"),
    );
    try {
      for (const [key, authKey] of [
        ["", ""],
        ["bad", ""],
        [equivalent, ""],
        [canonical, canonical],
        [canonical, equivalent],
      ]) {
        vi.stubEnv("AZZORA_STAGING_MANUAL_BACKUP_KEY", key);
        vi.stubEnv("AZZORA_STAGING_AUTH_KEY", authKey);
        const response = await handler(request());
        expect(response.status).toBe(503);
        const body = await response.text();
        expect(body).toContain("staging_owner_backup_key_required");
        expect(body).toContain(
          "Encrypted backup is not configured. No file was downloaded.",
        );
        expect(body).not.toContain("Fictional Backup Client");
        if (key) expect(body).not.toContain(key);
      }
      expect(read).not.toHaveBeenCalled();
      expect(vi.mocked(rpc).mock.calls.every(([name]) => name !== "staging_owner_backup")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("downloads encrypted owner backup and restores the actual returned archive with verified original bytes", async () => {
    const source = fixture();
    const key = Buffer.alloc(32, 7);
    const identity: StagingActor = {
      userId: ownerId,
      companyId,
      email: "owner@staging.azzora.test",
      role: "owner_admin",
      workspace: "manager",
      sessionHash: "fixture",
      assurance: "aal2",
      mfaVerifiedAt: Date.now(),
      providerSessionId: "fixture",
      projectIds: [],
      capabilities: ["access.manage"],
    };
    const auth = {
      requireActor: async () => identity,
      handle: vi.fn(),
    } as unknown as ReturnType<typeof createStagingAuth>;
    const rpc = vi.fn(async (name: string) => {
      if (name === "staging_company_read")
        return { version: source.version, data: source.data };
      if (name === "staging_owner_backup")
        return { ...source, provenance: {
          memberships: [{ userId: ownerId, role: "owner_admin", active: true, financeAccess: true, workspaces: ["manager"], capabilities: ["access.manage"] }], assignments: [],
          journals: source.data.journals.map(j => ({ id: j.id, actorId: ownerId })),
          snapshots: source.data.snapshots.map(s => ({ entityType: s.entity_type, entityId: s.entity_id, revision: s.revision, capturedBy: ownerId, capturedAt: "2026-11-11T00:00:00Z" })),
          auditEvents: [{ id: "3", actorId: ownerId, action: "invoice.issue", entityType: "invoice", entityId: "invoice", requestId: "fictional", recordedAt: "2026-11-11T00:00:00Z", metadata: {} }], commandReceipts: [],
        } };
      throw Error("Unexpected RPC");
    }) as unknown as StagingRpc;
    const storage = {
      read: vi.fn(async () => bytes),
      store: vi.fn(),
    } as unknown as NonNullable<
      Parameters<typeof createStagingHandler>[0]
    >["storage"];
    const handler = createStagingHandler({
      auth,
      rpc,
      storage,
      stagingManualBackupKey: key,
    });
    const request = () =>
      new Request("https://staging.test/api/staging/manager/backup/encrypted");
    const response = await handler(request());
    expect(response.status).toBe(200);
    const envelope = await response.json();
    expect(envelope.format).toBe("azzora-encrypted-business-backup-v1");
    expect(JSON.stringify(envelope)).not.toContain("Fictional Backup Client");
    const clear = decryptBusinessBackup(envelope, key, {
      companyId,
      keyId: "fictional-staging-owner-key-v1",
    });
    const parsed = verifyAuthoritativeStagingArchive(JSON.parse(Buffer.from(clear).toString()), companyId);
    expect(parsed.schemaBundle?.files).toHaveLength(12);
    const altered = JSON.parse(Buffer.from(clear).toString());
    altered.schemaBundle.files[0].sql += '\n-- tampered';
    expect(() => verifyAuthoritativeStagingArchive(altered, companyId)).toThrow(/Untrusted staging migration/);
    altered.schemaBundle.files[0].sha256 = createHash('sha256').update(altered.schemaBundle.files[0].sql).digest('hex');
    expect(() => verifyAuthoritativeStagingArchive(altered, companyId)).toThrow(/Untrusted staging migration/);
    const legacy = JSON.parse(Buffer.from(clear).toString());
    legacy.format = 'azzora-authoritative-staging-backup-v2';
    delete legacy.schemaBundle;
    delete legacy.schemaScope;
    expect(verifyAuthoritativeStagingArchive(legacy, companyId).schemaBundle).toBeUndefined();
    const legacyEnvelope = encryptBusinessBackup(Buffer.from(JSON.stringify(legacy)), key, { companyId, keyId: 'fictional-staging-owner-key-v1', capturedAt: new Date().toISOString() });
    const legacyProof = await rehearseEncryptedBusinessRestore(legacyEnvelope, key, {companyId, keyId:'fictional-staging-owner-key-v1'});
    expect(legacyProof).toMatchObject({schemaFromArchive:false, liveSchemaVerified:false, auditActorReferencesRestored:true, financialReportsMatch:true});
    const reordered = JSON.parse(Buffer.from(clear).toString());
    reordered.schemaBundle.files.reverse();
    expect(() => verifyAuthoritativeStagingArchive(reordered, companyId)).toThrow(/Untrusted staging migration/);
    const archive = parsed.business;
    expect(parsed.provenance.journals).toHaveLength(2);
    const proof = await rehearseEncryptedBusinessRestore(envelope, key, { companyId, keyId: "fictional-staging-owner-key-v1" });
    expect(proof).toMatchObject({ schemaFromArchive: true, liveSchemaVerified: false, auditActorReferencesRestored: true, identityUsersRestored: false, membershipsRestored: false, financialReportsMatch: true });
    const { db } = await freshAuthoritativeDatabase();
    try {
      const restored = await restoreAuthoritative(db, archive, "fictional-staging", { isolatedOnly: true, companyId, journals: parsed.provenance.journals, snapshots: parsed.provenance.snapshots, auditEvents: parsed.provenance.auditEvents, commandReceipts: parsed.provenance.commandReceipts });
      expect(restored.capturedVersion).toBe(source.version);
      expect(restored.originals.get(objectKey)).toEqual(Buffer.from(bytes));
      expect(archive.manifest.counts.journals).toBe(2);
      // Deliberate synthetic-only reprovision: archived identities are not activated.
      await expect(db.query("select public.staging_auth_grant($1)", [ownerId])).rejects.toThrow(/membership denied/);
      const replacement = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", provider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", token = "a".repeat(64);
      await db.query("insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'owner@staging.azzora.test','{\"azzora_scope\":\"fictional-staging\"}',now())", [replacement]);
      await db.query("insert into auth.sessions values($1,$2,'aal2',now()+interval '1 hour')", [provider, replacement]);
      await db.query("select public.staging_auth_fixture_membership($1,$2,'owner_admin')", [replacement, companyId]);
      await expect(db.query("select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal1','synthetic')", [token, "b".repeat(64), replacement, provider, companyId])).rejects.toThrow(/MFA/);
      await db.query("insert into auth.mfa_factors values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',$1,'verified','totp')", [replacement]);
      await db.query("select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal2','synthetic')", [token, "b".repeat(64), replacement, provider, companyId]);
      const opened = (await db.query<{data: {companyId?: string}}>("select public.staging_company_read($1,'manager') data", [token])).rows[0].data;
      expect(opened).toMatchObject({ version: source.version });
      await db.query("select public.staging_auth_session_revoke($1)", [token]);
      await expect(db.query("select public.staging_company_read($1,'manager')", [token])).rejects.toThrow(/expired or revoked/);
    } finally {
      await db.close();
    }
    identity.mfaVerifiedAt = Date.now() - 16 * 60_000;
    expect((await handler(request())).status).toBe(403);
    identity.role = "accountant";
    identity.mfaVerifiedAt = Date.now();
    expect((await handler(request())).status).toBe(403);
  }, 30_000);
  it("preserves historical snapshot bytes while verifying inline originals against private pointers", async () => {
    const source = fixture();
    const record = source.data.records.find(
      (row) => row.id === "manager-document",
    )!;
    const historical = JSON.stringify({
      attachment: {
        id: "manager-original",
        name: "Fictional Manager original.png",
        type: "image/png",
        size: bytes.length,
        dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
      },
    });
    (record.payload as Record<string, unknown>).snapshot = historical;
    const backup = await createStagingBackup(source, async () => bytes);
    expect(
      backup.data.records.find((row) => row.id === record.id)!.payload.snapshot,
    ).toBe(historical);
    expect(backup.originals).toHaveLength(1);
    expect(verifyStagingBackup(backup)).toEqual(backup);
    const tampered = fixture();
    const altered = new Uint8Array(bytes);
    altered[altered.length - 1] ^= 1;
    (
      tampered.data.records.find((row) => row.id === record.id)!
        .payload as Record<string, unknown>
    ).snapshot = historical.replace(
      Buffer.from(bytes).toString("base64"),
      Buffer.from(altered).toString("base64"),
    );
    await expect(
      createStagingBackup(tampered, async () => bytes),
    ).rejects.toThrow(/matching private pointer/);
    (record.payload as Record<string, unknown>).snapshot = undefined;
    (record.payload as Record<string, unknown>).unexpectedCurrentAttachment =
      JSON.parse(historical).attachment;
    await expect(
      createStagingBackup(source, async () => bytes),
    ).rejects.toThrow(/inline originals/);
  });
  it("captures raw canonical rows, immutable snapshots, version and deduplicated originals", async () => {
    const source = fixture(),
      read = vi.fn(async () => bytes),
      backup = await createStagingBackup(
        source,
        read,
        "2026-11-04T14:00:00.000Z",
      );
    expect(read).toHaveBeenCalledTimes(1);
    expect(backup.originals[0].references).toHaveLength(2);
    expect(backup.capturedCompanyVersion).toBe(42);
    expect(backup.data).toEqual(source.data);
    expect(verifyStagingBackup(JSON.parse(JSON.stringify(backup)))).toEqual(
      backup,
    );
    expect(JSON.stringify(backup)).not.toContain("not-exported");
    expect(backup.manifest.counts.journals).toBe(2);
    const reordered = structuredClone(backup.data);
    reordered.records.reverse();
    expect(canonicalBusinessSha256(reordered)).toBe(
      canonicalBusinessSha256(backup.data),
    );
    const changed = structuredClone(backup.data);
    changed.records[0].status = "tampered";
    expect(canonicalBusinessSha256(changed)).not.toBe(
      canonicalBusinessSha256(backup.data),
    );
  });
  it("rejects changed records, corrupted originals, omitted files, credentials and nonfictional scope", async () => {
    const backup = await createStagingBackup(fixture(), async () => bytes);
    const changed = structuredClone(backup);
    changed.data.records[0].status = "tampered";
    expect(() => verifyStagingBackup(changed)).toThrow(/manifest/);
    const corrupt = structuredClone(backup);
    corrupt.originals[0].base64 = "YmFk";
    expect(() => verifyStagingBackup(corrupt)).toThrow(/content/);
    const omitted = structuredClone(backup);
    omitted.originals = [];
    expect(() => verifyStagingBackup(omitted)).toThrow(/originals/);
    expect(() => verifyStagingBackup({ ...backup, sessions: [] })).toThrow(
      /unexpected/,
    );
    const secrets = fixture();
    (secrets.data.records[0].payload as Record<string, unknown>).apiKey =
      "never export";
    await expect(
      createStagingBackup(secrets, async () => bytes),
    ).rejects.toThrow(/credential/);
    const production = structuredClone(backup);
    production.mode = "production" as StagingBackup["mode"];
    expect(() => verifyStagingBackup(production)).toThrow(/scope/);
  });
  it("fails closed on missing, cross-company or hash-mismatched original bytes", async () => {
    await expect(
      createStagingBackup(fixture(), async () => new Uint8Array([1])),
    ).rejects.toThrow(/hash or size/);
    await expect(
      createStagingBackup(fixture(), async () => {
        throw Error("storage unavailable");
      }),
    ).rejects.toThrow(/unavailable/);
    await expect(
      createStagingBackup(
        { ...fixture(), companyId: "22222222-2222-4222-8222-222222222222" },
        async () => bytes,
      ),
    ).rejects.toThrow(/cross-company/);
  });
  it("restores into fresh local PostgreSQL constraints with exact counts, version, histories and file hashes", async () => {
    const backup = await createStagingBackup(fixture(), async () => bytes),
      { db, migrations } = await freshRehearsalDatabase();
    try {
      const restored = await restoreIntoFreshRehearsal(db, backup);
      expect(migrations.length).toBeGreaterThanOrEqual(6);
      expect(restored.capturedVersion).toBe(42);
      expect(restored.originals.get(objectKey)).toEqual(Buffer.from(bytes));
      for (const [name, section] of [
        ["parties", "parties"],
        ["projects", "projects"],
        ["records", "records"],
        ["accounts", "accounts"],
        ["accounting_periods", "periods"],
        ["journals", "journals"],
        ["snapshots", "snapshots"],
      ] as const)
        expect(
          (
            await db.query<{ n: number }>(
              `select count(*)::int n from azzora.${name}`,
            )
          ).rows[0].n,
        ).toBe(backup.data[section].length);
      expect(
        (
          await db.query<{ version: number }>(
            "select version::int from azzora.companies where id=$1",
            [companyId],
          )
        ).rows[0].version,
      ).toBe(42);
      const loaded = (
        await db.query<{ data: CanonicalData }>(
          "select azzora.staging_canonical_data($1) data",
          [companyId],
        )
      ).rows[0].data;
      const normalize = (data: CanonicalData) => ({
        ...data,
        parties: [...data.parties].sort((a, b) => a.id.localeCompare(b.id)),
        projects: [...data.projects].sort((a, b) => a.id.localeCompare(b.id)),
        departments: [...data.departments].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
        records: [...data.records].sort(
          (a, b) =>
            a.entity_type.localeCompare(b.entity_type) ||
            a.id.localeCompare(b.id),
        ),
        accounts: [...data.accounts].sort((a, b) => a.id.localeCompare(b.id)),
        periods: [...data.periods].sort((a, b) => a.id.localeCompare(b.id)),
        journals: data.journals.map((v) => ({
          ...v,
          recorded_at: new Date(v.recorded_at).toISOString(),
        })),
      });
      expect(
        stableBackupJson(
          normalize(serializeCanonical(hydrateCanonical(loaded))),
        ),
      ).toBe(stableBackupJson(normalize(backup.data)));
      expect(
        buildTrialBalance(
          hydrateCanonical(loaded).finance.accounting,
          "2026-11-04",
        ).balanced,
      ).toBe(true);
      await expect(restoreIntoFreshRehearsal(db, backup)).rejects.toThrow(
        /empty business database/,
      );
    } finally {
      await db.close();
    }
  }, 30_000);
  it("rolls back an FK-invalid restore without leaving partial business records", async () => {
    const source = fixture();
    source.data.projects[0].customer_id = "missing-party";
    const backup = await createStagingBackup(source, async () => bytes),
      { db } = await freshRehearsalDatabase();
    try {
      await expect(restoreIntoFreshRehearsal(db, backup)).rejects.toThrow();
      expect(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from azzora.records",
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from azzora.parties",
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from azzora.journals",
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await db.close();
    }
  }, 30_000);
});
