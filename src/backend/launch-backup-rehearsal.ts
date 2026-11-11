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
import { buildTrialBalance, buildBalanceSheet } from "../accounting/reports.js";
import {
  decryptBusinessBackup,
  type EncryptedBusinessBackup,
} from "./launch-backup.js";
const companyId = "11111111-1111-4111-8111-111111111111",
  ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export async function freshRehearsalDatabase(
  mode: "production" | "fictional-staging" = "fictional-staging",
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
) {
  const backup =
      mode === "production"
        ? verifyProductionBusinessBackup(input)
        : verifyStagingBackup(input),
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
    mode =
      parsed.format === "azzora-production-business-backup"
        ? "production"
        : "fictional-staging",
    backup =
      mode === "production"
        ? verifyProductionBusinessBackup(parsed)
        : verifyStagingBackup(parsed);
  if (backup.companyId !== expected.companyId)
    throw Error("Inner backup scope differs from encrypted company scope.");
  const { db, migrations } = await freshRehearsalDatabase(mode);
  try {
    const restored = await restoreIntoFreshRehearsal(db, backup, mode);
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
      asOf =
        data.journals
          .map((j) => j.posting_date)
          .sort()
          .at(-1) || "2020-01-01",
      trial = buildTrialBalance(accounting, asOf),
      balance = buildBalanceSheet(accounting, asOf);
    if (!trial.balanced || !balance.balanced)
      throw Error("Restored statements do not reconcile.");
    return {
      archiveMode: mode,
      isolated: true,
      cloudDatabaseUsed: false,
      migrationCount: migrations.length,
      records: data.records.length,
      journals: data.journals.length,
      originals: restored.originals.size,
      capturedVersion: restored.capturedVersion,
      businessSha256: before,
      restoredSha256: after,
      trialBalanceBalanced: trial.balanced,
      balanceSheetBalanced: balance.balanced,
      identityUsersRestored: false,
      infrastructureBackupVerified: false,
    };
  } finally {
    await db.close();
  }
}
