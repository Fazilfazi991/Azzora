import { beforeAll, afterAll, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
interface Database {
  exec(sql: string): Promise<unknown>;
  query(
    sql: string,
    args?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}
let db: Database;
const company = "11111111-1111-4111-8111-111111111111";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  engineer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  accountant = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ownerProvider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  engineerProvider = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  accountantProvider = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ownerHash = "a".repeat(64),
  engineerHash = "b".repeat(64);
async function issue(code: string, email = "engineer@staging.azzora.test") {
  await db.query("select public.staging_auth_recovery_issue($1,$2,$3,$4)", [
    ownerHash,
    email,
    code,
    "encrypted-provider-hash",
  ]);
}
beforeAll(async () => {
  db = new PGlite() as Database;
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);
 create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const file of (
    await readdir(new URL("../../supabase/migrations/", import.meta.url))
  )
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  for (const [id, email, role, provider, assurance] of [
    [owner, "owner@staging.azzora.test", "owner_admin", ownerProvider, "aal2"],
    [
      engineer,
      "engineer@staging.azzora.test",
      "site_staff",
      engineerProvider,
      "aal1",
    ],
    [
      accountant,
      "accountant@staging.azzora.test",
      "accountant",
      accountantProvider,
      "aal1",
    ],
  ]) {
    await db.query(
      `insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,$2,'{"azzora_scope":"fictional-staging"}',now())`,
      [id, email],
    );
    await db.query(
      "insert into auth.sessions values($1,$2,$3,now()+interval '1 day')",
      [provider, id, assurance],
    );
    await db.query("select public.staging_auth_fixture_membership($1,$2,$3)", [
      id,
      company,
      role,
    ]);
  }
  await db.query(
    `insert into auth.mfa_factors values('12345678-1234-4234-8234-123456789012',$1,'verified','totp')`,
    [owner],
  );
  await db.query(
    `select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal2','cipher')`,
    [ownerHash, "0".repeat(64), owner, ownerProvider, company],
  );
  await db.query(
    `select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal1','cipher')`,
    [engineerHash, "0".repeat(64), engineer, engineerProvider, company],
  );
}, 30000);
afterAll(async () => {
  if (db) await db.close();
});
it("keeps recovery table RLS enabled and every recovery RPC service-only", async () => {
  const table = (
    await db.query(
      `select relrowsecurity from pg_class where oid='azzora.recovery_flows'::regclass`,
    )
  ).rows[0];
  expect(table.relrowsecurity).toBe(true);
  const functions = (
    await db.query(
      `select p.proname,has_function_privilege('anon',p.oid,'execute') a,has_function_privilege('authenticated',p.oid,'execute') b,has_function_privilege('service_role',p.oid,'execute') s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'staging_auth_recovery_%'`,
    )
  ).rows;
  expect(functions).toHaveLength(8);
  expect(functions.every((row) => !row.a && !row.b && row.s)).toBe(true);
});
it("denies Engineer issuance and unknown/nonfictional target addresses", async () => {
  await expect(
    db.query("select public.staging_auth_recovery_target($1,$2)", [
      engineerHash,
      "engineer@staging.azzora.test",
    ]),
  ).rejects.toThrow("denied");
  await expect(
    db.query("select public.staging_auth_recovery_target($1,$2)", [
      ownerHash,
      "real@example.com",
    ]),
  ).rejects.toThrow("denied");
});
it("binds the one-time handoff to the target workspace and rejects replay", async () => {
  const code = "1".repeat(64);
  await issue(code);
  await expect(
    db.query(`select public.staging_auth_recovery_take($1,'accountant')`, [
      code,
    ]),
  ).rejects.toThrow("workspace");
  const taken = (
    await db.query(
      `select public.staging_auth_recovery_take($1,'manager') result`,
      [code],
    )
  ).rows[0].result as { userId: string };
  expect(taken.userId).toBe(engineer);
  await expect(
    db.query(`select public.staging_auth_recovery_take($1,'manager')`, [code]),
  ).rejects.toThrow("invalid");
});
it("rejects expired handoffs without changing any financial records", async () => {
  const code = "2".repeat(64);
  await issue(code);
  await db.query(
    `update azzora.recovery_flows set expires_at=now()-interval '1 second' where token_hash=$1`,
    [code],
  );
  await expect(
    db.query(`select public.staging_auth_recovery_take($1,'manager')`, [code]),
  ).rejects.toThrow("expired");
  expect(
    (await db.query("select count(*)::int n from azzora.journals")).rows[0].n,
  ).toBe(0);
});
it("requires actual current provider MFA before a privileged recovery can be claimed", async () => {
  const code = "3".repeat(64),
    pending = "4".repeat(64);
  await issue(code, "accountant@staging.azzora.test");
  await db.query(`select public.staging_auth_recovery_take($1,'accountant')`, [
    code,
  ]);
  await db.query(
    "select public.staging_auth_recovery_pending_put($1,$2,$3,$4)",
    [code, pending, accountantProvider, "encrypted"],
  );
  await expect(
    db.query("select public.staging_auth_recovery_claim($1)", [pending]),
  ).rejects.toThrow("Verified");
  await expect(
    db.query("select public.staging_auth_recovery_mfa($1,$2)", [
      pending,
      "encrypted",
    ]),
  ).rejects.toThrow("MFA");
  await db.query(`update auth.sessions set aal='aal2' where id=$1`, [
    accountantProvider,
  ]);
  await db.query(
    `insert into auth.mfa_factors values('87654321-4321-4321-8321-210987654321',$1,'verified','totp')`,
    [accountant],
  );
  await db.query("select public.staging_auth_recovery_mfa($1,$2)", [
    pending,
    "encrypted-verified",
  ]);
  await db.query(
    `update auth.mfa_factors set status='unverified' where user_id=$1`,
    [accountant],
  );
  await expect(
    db.query("select public.staging_auth_recovery_claim($1)", [pending]),
  ).rejects.toThrow("MFA");
});
it("allows one password claim and atomically revokes all target application sessions exactly once", async () => {
  const code = "5".repeat(64),
    pending = "6".repeat(64);
  await issue(code);
  await db.query(`select public.staging_auth_recovery_take($1,'manager')`, [
    code,
  ]);
  await db.query(
    "select public.staging_auth_recovery_pending_put($1,$2,$3,$4)",
    [code, pending, engineerProvider, "encrypted"],
  );
  await db.query("select public.staging_auth_recovery_claim($1)", [pending]);
  await expect(
    db.query("select public.staging_auth_recovery_claim($1)", [pending]),
  ).rejects.toThrow("expired");
  await db.query("select public.staging_auth_recovery_complete($1)", [pending]);
  await expect(
    db.query("select public.staging_auth_recovery_complete($1)", [pending]),
  ).rejects.toThrow("unavailable");
  const revoked = (
    await db.query(
      "select revoked_at is not null revoked from azzora.sessions where token_hash=$1",
      [engineerHash],
    )
  ).rows[0];
  expect(revoked.revoked).toBe(true);
  expect(
    (await db.query("select public.staging_auth_actor($1) actor", [ownerHash]))
      .rows[0].actor,
  ).toMatchObject({ userId: owner });
  expect(
    (
      await db.query(
        `select count(*)::int n from azzora.audit_events where action='recovery.completed'`,
      )
    ).rows[0].n,
  ).toBe(1);
});
it("caps serialized Owner issuance at five handoffs in a rolling hour", async () => {
  await issue("7".repeat(64));
  await expect(issue("8".repeat(64))).rejects.toThrow("limit reached");
  expect(
    (
      await db.query(
        "select count(*)::int n from azzora.recovery_flows where kind='handoff'",
      )
    ).rows[0].n,
  ).toBe(5);
});
