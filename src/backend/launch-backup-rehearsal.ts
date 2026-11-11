/** OFFLINE REHEARSAL ONLY. Always creates a new in-memory PostgreSQL instance; cannot connect to a cloud database. */
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  verifyStagingBackup,
  verifyProductionBusinessBackup,
  canonicalBusinessSha256,
} from "../staging/backup.js";
import { hydrateCanonical, type CanonicalData } from "../staging/canonical.js";
import {
  buildTrialBalance,
  buildBalanceSheet,
  buildProfitAndLoss,
} from "../accounting/reports.js";
import {
  decryptBusinessBackup,
  verifyAuthoritativeProductionArchive,
  verifyAuthoritativeStagingArchive,
  verifyStagingSchemaBundle,
  type EncryptedBusinessBackup,
} from "./launch-backup.js";
const companyId = "11111111-1111-4111-8111-111111111111",
  ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Restore originals before reversals without mutating the archive or its
 * canonical order. A missing parent or a cycle is always a hard failure. */
export function orderRestoreJournals(journals: CanonicalData["journals"]) {
  const byId = new Map<string, CanonicalData["journals"][number]>();
  const children = new Map<string, string[]>();
  const pending = new Map<string, number>();
  for (const journal of journals) {
    if (byId.has(journal.id)) throw Error("Duplicate journal in backup.");
    byId.set(journal.id, journal);
  }
  for (const journal of journals) {
    if (journal.reversal_of) {
      if (!byId.has(journal.reversal_of))
        throw Error("Backup reversal original is missing.");
      pending.set(journal.id, 1);
      const list = children.get(journal.reversal_of) || [];
      list.push(journal.id);
      children.set(journal.reversal_of, list);
    } else pending.set(journal.id, 0);
  }
  const ready = journals.filter((journal) => pending.get(journal.id) === 0);
  const ordered: CanonicalData["journals"] = [];
  for (let i = 0; i < ready.length; i++) {
    const journal = ready[i];
    ordered.push(journal);
    for (const child of children.get(journal.id) || []) {
      pending.set(child, 0);
      ready.push(byId.get(child)!);
    }
  }
  if (ordered.length !== journals.length)
    throw Error("Backup reversal references contain a cycle.");
  return ordered;
}

/** Synthetic-only provenance fixture. Never a production restore interface. */
export interface IsolatedAuditProvenance {
  isolatedOnly: true;
  companyId: string;
  journals: { id: string; actorId: string }[];
  snapshots: { entityType: string; entityId: string; revision: number; capturedBy: string; capturedAt: string }[];
  auditEvents: { id: string; actorId: string; action: string; entityType: string; entityId: string; requestId: string; recordedAt: string; metadata: Record<string, unknown> }[];
  commandReceipts?: { idempotencyKey: string; requestSha256: string; actorId: string; result: Record<string, unknown>; createdAt: string }[];
}
export async function freshRehearsalDatabase(
  mode: "production" | "fictional-staging" = "fictional-staging",
  bundledSchema?: unknown,
) {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  let migrations: string[] = [];
  if (mode === "production") {
    const manifest = JSON.parse(
      await readFile(
        new URL(
          "../../supabase/production-migrations/manifest.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { files: { path: string; sha256: string }[] };
    const allowed = [
      "supabase/migrations/20261104081228_canonical_backend_foundation.sql",
      "supabase/production-migrations/20261111090000_runtime_identity.sql",
      "supabase/production-migrations/20261111122552_production_owner_backup_provenance.sql",
    ];
    if (
      JSON.stringify(manifest.files.map((f) => f.path)) !==
      JSON.stringify(allowed)
    )
      throw Error("Unreviewed production migration sequence.");
    for (const file of manifest.files) {
      const sql = await readFile(
        new URL("../../" + file.path, import.meta.url),
        "utf8",
      );
      if (
        createHash("sha256")
          .update(sql.replaceAll("\r\n", "\n"))
          .digest("hex") !== file.sha256
      )
        throw Error("Production migration hash differs.");
      await db.exec(sql);
      migrations.push(file.path);
    }
  } else if (bundledSchema) {
    const bundle=verifyStagingSchemaBundle(bundledSchema);
    for (const file of bundle.files) { await db.exec(file.sql); migrations.push(file.name); }
  } else {
    migrations = (
      await readdir(new URL("../../supabase/migrations/", import.meta.url))
    )
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const file of migrations)
      await db.exec(
        await readFile(
          new URL("../../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
  }
  return { db, migrations };
}
/** Test-only fresh restore. Never exported by the application or connected to a cloud client. */
export async function restoreIntoFreshRehearsal(
  db: PGlite,
  input: unknown,
  mode: "production" | "fictional-staging" = "fictional-staging",
  provenance?: IsolatedAuditProvenance,
) {
  const backup =
      mode === "production"
        ? verifyProductionBusinessBackup(input)
        : verifyStagingBackup(input),
    data = backup.data,
    company = backup.companyId || companyId;
  if (provenance) {
    if (provenance.isolatedOnly !== true || provenance.companyId !== company)
      throw Error("Audit provenance requires matching isolated rehearsal scope.");
    if (provenance.journals.length !== data.journals.length || provenance.snapshots.length !== data.snapshots.length ||
      new Set(provenance.journals.map(v => v.id)).size !== data.journals.length ||
      new Set(provenance.snapshots.map(v => JSON.stringify([v.entityType,v.entityId,v.revision]))).size !== data.snapshots.length ||
      new Set(provenance.auditEvents.map(v => v.id)).size !== provenance.auditEvents.length ||
      data.journals.some(v => !provenance.journals.some(p => p.id === v.id)) ||
      data.snapshots.some(v => !provenance.snapshots.some(p => p.entityType === v.entity_type && p.entityId === v.entity_id && p.revision === v.revision)))
      throw Error("Audit fixture inventory does not match business history.");
    const safe = JSON.stringify(provenance);
    if (/"(?:password|passwordHash|totpSecret|secret|access_token|refresh_token|session|cookie)"\s*:/i.test(safe))
      throw Error("Credentials and sessions are forbidden in audit fixtures.");
  }
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
    if (!provenance)
      await execute(
        "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'offline-owner@rehearsal.test','{\"azzora_scope\":\"fictional-staging\"}',now()) on conflict do nothing",
        [ownerId],
      );
    if (provenance) {
      const ids = new Set([...provenance.journals.map(v => v.actorId), ...provenance.snapshots.map(v => v.capturedBy), ...provenance.auditEvents.map(v => v.actorId), ...(provenance.commandReceipts || []).map(v => v.actorId)]);
      for (const id of ids)
        await execute("insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at,banned_until) values($1,NULL,'{}',NULL,'infinity') on conflict do nothing", [id]);
    }
    await execute(
      "insert into azzora.companies(id,name,data_mode,version) values($1,'ISOLATED RESTORE REHEARSAL',$2,$3) on conflict(id) do update set version=excluded.version",
      [company, mode, backup.capturedCompanyVersion],
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
    for (const v of orderRestoreJournals(data.journals)) {
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
          provenance?.journals.find(p => p.id === v.id)?.actorId || ownerId,
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
        "insert into azzora.snapshots(company_id,entity_type,entity_id,revision,payload,sha256,captured_by,captured_at) values($1,$2,$3,$4,$5::jsonb,$6,$7,$8)",
        [
          company,
          v.entity_type,
          v.entity_id,
          v.revision,
          JSON.stringify(v.payload),
          v.sha256,
          provenance?.snapshots.find(p => p.entityType === v.entity_type && p.entityId === v.entity_id && p.revision === v.revision)?.capturedBy || ownerId,
          provenance?.snapshots.find(p => p.entityType === v.entity_type && p.entityId === v.entity_id && p.revision === v.revision)?.capturedAt || "2020-01-01T00:00:00Z",
        ],
      );
    for (const event of provenance?.auditEvents || [])
      await execute("insert into azzora.audit_events(id,company_id,actor_id,action,entity_type,entity_id,request_id,recorded_at,metadata) overriding system value values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)", [event.id, company, event.actorId, event.action, event.entityType, event.entityId, event.requestId, event.recordedAt, JSON.stringify(event.metadata)]);
    if (provenance?.auditEvents.length)
      await db.exec("select setval(pg_get_serial_sequence('azzora.audit_events','id'), (select max(id) from azzora.audit_events), true)");
    for (const receipt of provenance?.commandReceipts || [])
      await execute("insert into azzora.command_receipts(company_id,idempotency_key,request_sha256,actor_id,result,created_at) values($1,$2,$3,$4,$5::jsonb,$6)", [company, receipt.idempotencyKey, receipt.requestSha256, receipt.actorId, JSON.stringify(receipt.result), receipt.createdAt]);
    const allocationProjector = (
      await db.query<{ present: boolean }>(
        "select to_regprocedure($1) is not null present",
        [
          mode === "production"
            ? "azzora.project_production_allocations(uuid)"
            : "azzora.project_staging_allocations(uuid)",
        ],
      )
    ).rows[0].present;
    if (allocationProjector)
      await execute(
        mode === "production"
          ? "select azzora.project_production_allocations($1)"
          : "select azzora.project_staging_allocations($1)",
        [company],
      );
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

/** Reuses the existing canonical business export/SQL schema. This is not an infrastructure/Auth/PITR restore. */
export async function rehearseEncryptedBusinessRestore(
  encrypted: EncryptedBusinessBackup,
  key: Uint8Array,
  expected: { companyId: string; keyId: string },
) {
  const raw = decryptBusinessBackup(encrypted, key, expected),
    parsed = JSON.parse(Buffer.from(raw).toString("utf8")),
    authoritative = parsed.format === "azzora-authoritative-production-backup-v2" ? verifyAuthoritativeProductionArchive(parsed, expected.companyId) : parsed.format === "azzora-authoritative-staging-backup-v2" || parsed.format === "azzora-authoritative-staging-backup-v3" ? verifyAuthoritativeStagingArchive(parsed, expected.companyId) : undefined,
    business = authoritative?.business || parsed,
    mode =
      business.format === "azzora-production-business-backup"
        ? "production"
        : "fictional-staging",
    backup =
      mode === "production"
        ? verifyProductionBusinessBackup(business)
        : verifyStagingBackup(business);
  if (backup.companyId !== expected.companyId)
    throw Error("Inner backup scope differs from encrypted company scope.");
  const bundledSchema=authoritative && 'schemaBundle' in authoritative ? authoritative.schemaBundle : undefined;
  const { db, migrations } = await freshRehearsalDatabase(mode,bundledSchema);
  try {
    const p = authoritative?.provenance;
    const restored = await restoreIntoFreshRehearsal(db, backup, mode, p ? {
      isolatedOnly: true, companyId: expected.companyId, journals: p.journals, snapshots: p.snapshots,
      auditEvents: p.auditEvents, commandReceipts: p.commandReceipts,
    } : undefined);
    const data = (
      await db.query<{ data: CanonicalData }>(
        mode === "production"
          ? "select azzora.production_canonical_data($1) data"
          : "select azzora.staging_canonical_data($1) data",
        [expected.companyId],
      )
    ).rows[0].data;
    const before = canonicalBusinessSha256(backup.data),
      after = canonicalBusinessSha256(data);
    if (before !== after)
      throw Error("Restored logical business hash differs.");
    const accounting = hydrateCanonical(data).finance.accounting,
      sourceAccounting = hydrateCanonical(backup.data).finance.accounting,
      asOf =
        data.journals
          .map((j) => j.posting_date)
          .sort()
          .at(-1) || "2020-01-01",
      trial = buildTrialBalance(accounting, asOf),
      balance = buildBalanceSheet(accounting, asOf),
      sourceTrial = buildTrialBalance(sourceAccounting, asOf),
      sourceBalance = buildBalanceSheet(sourceAccounting, asOf),
      profit = buildProfitAndLoss(accounting, "0001-01-01", asOf),
      sourceProfit = buildProfitAndLoss(sourceAccounting, "0001-01-01", asOf);
    if (!trial.balanced || !balance.balanced)
      throw Error("Restored statements do not reconcile.");
    if (
      JSON.stringify(trial) !== JSON.stringify(sourceTrial) ||
      JSON.stringify(balance) !== JSON.stringify(sourceBalance) ||
      JSON.stringify(profit) !== JSON.stringify(sourceProfit)
    )
      throw Error("Restored financial reports differ from the source archive.");
    return {
      archiveMode: mode,
      isolated: true,
      cloudDatabaseUsed: false,
      migrationCount: migrations.length,
      schemaFromArchive: Boolean(bundledSchema),
      liveSchemaVerified: false,
      records: data.records.length,
      journals: data.journals.length,
      originals: restored.originals.size,
      capturedVersion: restored.capturedVersion,
      businessSha256: before,
      restoredSha256: after,
      trialBalanceBalanced: trial.balanced,
      balanceSheetBalanced: balance.balanced,
      financialReportsMatch: true,
      trialDebitFils: trial.totalDebitFils,
      trialCreditFils: trial.totalCreditFils,
      totalAssetsFils: balance.assets.totalFils,
      liabilitiesAndEquityFils: balance.liabilitiesAndEquityFils,
      netProfitFils: profit.netProfitFils,
      identityUsersRestored: false,
      auditIdentityRestored: false,
      auditActorReferencesRestored: Boolean(p),
      actorsReplacedForOfflineRehearsal: !p,
      membershipsRestored: false,
      commandReceiptsRestored: Boolean(p),
      infrastructureBackupVerified: false,
    };
  } finally {
    await db.close();
  }
}
