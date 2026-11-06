import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const company = "11111111-1111-4111-8111-111111111111";
const client = "52f925bd-8744-48cc-8781-d20109387d14";
const migration = "20261106063844_ai_client_review_identity.sql";
const fixtures = [
  [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "owner@staging.azzora.test",
    "owner_admin",
  ],
  [
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "manager@staging.azzora.test",
    "project_manager",
  ],
  [
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "accountant@staging.azzora.test",
    "accountant",
  ],
  [
    "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    "engineer@staging.azzora.test",
    "site_staff",
  ],
];
let countsUnchanged = false;
async function grant(id = client) {
  return (
    await db.query<{
      g: {
        userId: string;
        companyId: string;
        role: string;
        workspaces: string[];
        capabilities: string[];
      };
    }>("select public.staging_auth_grant($1) g", [id])
  ).rows[0].g;
}
async function totals() {
  return (
    await db.query(
      "select (select count(*) from azzora.memberships) memberships,(select count(*) from auth.users) users,(select count(*) from azzora.records) records,(select count(*) from azzora.journals) journals,(select count(*) from azzora.policy_approvals) policies,(select version from azzora.companies where id=$1) version",
      [company],
    )
  ).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);
 create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(dir))
    .filter((x) => x.endsWith(".sql") && x !== migration)
    .sort())
    await db.exec(await readFile(new URL(name, dir), "utf8"));
  for (const [id, email, role] of fixtures) {
    await db.query(
      'insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,$2,\'{"azzora_scope":"fictional-staging"}\',now())',
      [id, email],
    );
    await db.query("select public.staging_auth_fixture_membership($1,$2,$3)", [
      id,
      company,
      role,
    ]);
  }
  await db.query(
    'insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,\'client-review@staging.azzora.test\',\'{"azzora_scope":"fictional-staging","azzora_purpose":"client-review-draft-only"}\',now())',
    [client],
  );
  await db.query(
    "insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,$2,'accountant',true,true,array['accountant'],array['finance.read','finance.draft'])",
    [company, client],
  );
  const before = await totals();
  await db.exec(await readFile(new URL(migration, dir), "utf8"));
  countsUnchanged = JSON.stringify(before) === JSON.stringify(await totals());
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});
it("changes only the grant function, preserving users, memberships and business/policy counts", () =>
  expect(countsUnchanged).toBe(true));
it("allows the exact restricted client subject", async () => {
  const g = await grant();
  expect(g.userId).toBe(client);
  expect(g.companyId).toBe(company);
  expect(g.role).toBe("accountant");
  expect(g.workspaces).toEqual(["accountant"]);
  expect(g.capabilities).toEqual(["finance.read", "finance.draft"]);
});
it.each(fixtures)(
  "preserves existing fixture subject %s",
  async (id, _email, role) => expect((await grant(id)).role).toBe(role),
);
it.each([
  ["update auth.users set email='other@staging.azzora.test' where id=$1"],
  ["update auth.users set email='owner@staging.azzora.test' where id=$1"],
  [
    "update auth.users set raw_app_meta_data=raw_app_meta_data-'azzora_purpose' where id=$1",
  ],
  [
    "update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{azzora_purpose}','\"other\"') where id=$1",
  ],
  [
    "update auth.users set raw_app_meta_data=raw_app_meta_data-'azzora_scope' where id=$1",
  ],
  ["update auth.users set email_confirmed_at=null where id=$1"],
  ["update auth.users set banned_until=now()+interval '1 hour' where id=$1"],
  ["update auth.users set is_anonymous=true where id=$1"],
  ["update azzora.memberships set active=false where user_id=$1"],
  ["update azzora.memberships set role='owner_admin' where user_id=$1"],
  ["update azzora.memberships set finance_access=false where user_id=$1"],
  [
    "update azzora.memberships set workspaces=array['accountant','manager'] where user_id=$1",
  ],
  [
    "update azzora.memberships set capabilities=capabilities||array['finance.simulate'] where user_id=$1",
  ],
  [
    "update azzora.memberships set capabilities=capabilities||array['finance.post'] where user_id=$1",
  ],
  [
    "update azzora.memberships set capabilities=array['finance.read'] where user_id=$1",
  ],
  [
    "update azzora.memberships set capabilities=array['finance.read','finance.draft','finance.draft'] where user_id=$1",
  ],
])("denies restricted identity when boundary drifts: %s", async (sql) => {
  await db.query(sql, [client]);
  await expect(grant()).rejects.toMatchObject({ code: "PT403" });
});
it("rejects the same client email and metadata on a different UUID", async () => {
  const other = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await db.query(
    "insert into auth.users select $1,email,raw_app_meta_data,email_confirmed_at,banned_until,is_anonymous from auth.users where id=$2",
    [other, client],
  );
  await db.query(
    "insert into azzora.memberships select company_id,$1,role,active,finance_access,workspaces,capabilities from azzora.memberships where user_id=$2",
    [other, client],
  );
  await expect(grant(other)).rejects.toMatchObject({ code: "PT403" });
});
it("requires MFA2 for the new privileged subject before an application session", async () => {
  await db.query(
    "insert into auth.sessions values('ffffffff-ffff-4fff-8fff-ffffffffffff',$1,'aal1',now()+interval '1 day')",
    [client],
  );
  await expect(
    db.query(
      "select public.staging_auth_session_put($1,$2,$3,'ffffffff-ffff-4fff-8fff-ffffffffffff',$4,'accountant','aal1','cipher')",
      ["a".repeat(64), "b".repeat(64), client, company],
    ),
  ).rejects.toMatchObject({ code: "PT403" });
});
it("rejects a restricted identity whose membership was moved to another company", async () => {
  const otherCompany = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await db.query(
    "insert into azzora.companies(id,name) values($1,'Fictional other company')",
    [otherCompany],
  );
  await db.query(
    "update azzora.memberships set company_id=$1 where user_id=$2",
    [otherCompany, client],
  );
  await expect(grant()).rejects.toMatchObject({ code: "PT403" });
});
it("resolves an MFA2 client session with only draft/read rights and immediately denies revoked membership", async () => {
  const provider = "ffffffff-ffff-4fff-8fff-ffffffffffff",
    token = "a".repeat(64);
  await db.query(
    "insert into auth.sessions values($1,$2,'aal2',now()+interval '1 day')",
    [provider, client],
  );
  await db.query(
    "insert into auth.mfa_factors values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',$1,'verified','totp')",
    [client],
  );
  await db.query(
    "select public.staging_auth_session_put($1,$2,$3,$4,$5,'accountant','aal2','cipher')",
    [token, "b".repeat(64), client, provider, company],
  );
  const actor = (
    await db.query<{
      g: { workspace: string; assurance: string; capabilities: string[] };
    }>("select public.staging_auth_actor($1) g", [token])
  ).rows[0].g;
  expect(actor).toMatchObject({
    workspace: "accountant",
    assurance: "aal2",
    capabilities: ["finance.read", "finance.draft"],
  });
  await db.query(
    "update azzora.memberships set active=false where user_id=$1",
    [client],
  );
  await expect(
    db.query("select public.staging_auth_actor($1)", [token]),
  ).rejects.toMatchObject({ code: "PT403" });
});
it("keeps the grant RPC service-only", async () => {
  const row = (
    await db.query<{ browser: boolean; api: boolean; service: boolean }>(
      "select has_function_privilege('anon','public.staging_auth_grant(uuid)','execute') or has_function_privilege('authenticated','public.staging_auth_grant(uuid)','execute') browser,has_function_privilege('azzora_api','public.staging_auth_grant(uuid)','execute') api,has_function_privilege('service_role','public.staging_auth_grant(uuid)','execute') service",
    )
  ).rows[0];
  expect(row).toEqual({ browser: false, api: false, service: true });
});
