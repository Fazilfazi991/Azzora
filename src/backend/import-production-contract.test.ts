import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
const company = "22222222-2222-4222-8222-222222222222",
  owner = "33333333-3333-4333-8333-333333333333",
  provider = "99999999-9999-4999-8999-999999999999";
const token = "a".repeat(64),
  csrf = "b".repeat(64);
const empty = () => ({
  parties: [],
  projects: [],
  departments: [],
  accounts: [],
  periods: [],
  journals: [],
  snapshots: [],
  records: [
    {
      entity_type: "workspace_metadata",
      id: "__production_metadata",
      project_id: null,
      party_id: null,
      department_id: null,
      payload: { metadata: { mode: "production", version: 1 } },
      status: "current",
    },
  ],
});
async function call(name: string, args: unknown[]) {
  const placeholders = args.map((_, i) => "$" + (i + 1)).join(",");
  return db.query<{ r: unknown }>(
    `select public.${name}(${placeholders}) r`,
    args,
  );
}
const commit = (
  version: number,
  key: string,
  data: unknown,
  financial = false,
  bootstrap = false,
  command = "customer.save",
  fingerprint = "c".repeat(64),
) =>
  call("azzora_production_company_commit", [
    token,
    version,
    key,
    fingerprint,
    command,
    { workspace: "manager", financial },
    JSON.stringify(data),
    bootstrap,
  ]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const name of [
    "../supabase/migrations/20261104081228_canonical_backend_foundation.sql",
    "../supabase/production-migrations/20261111090000_runtime_identity.sql",
  ])
    await db.exec(
      await readFile(new URL("../" + name, import.meta.url), "utf8"),
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("production migration sequence installs zero company/user/financial fixtures and denies an unregistered environment", async () => {
  for (const table of [
    "companies",
    "memberships",
    "records",
    "journals",
    "production_environment",
  ])
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int n from azzora.${table}`,
        )
      ).rows[0].n,
    ).toBe(0);
  expect(
    (await db.query<{ n: number }>("select count(*)::int n from auth.users"))
      .rows[0].n,
  ).toBe(0);
  await expect(call("azzora_runtime_identity", [company])).rejects.toThrow(
    /Approved production configuration/,
  );
});
it("explicit isolated synthetic onboarding returns an authoritative closed production contract", async () => {
  await db.query(
    "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'qa-owner@example.invalid','{\"azzora_scope\":\"production\"}',now())",
    [owner],
  );
  await db.query(
    "insert into azzora.companies(id,name) values($1,'ISOLATED QA ONLY')",
    [company],
  );
  await db.exec(
    "insert into storage.buckets values('azzora-private','azzora-private',false,2097152,array['application/pdf','image/png','image/jpeg']);",
  );
  await db.query(
    `insert into azzora.production_environment(company_id,project_ref,region,vercel_project_id,configuration_approval_id,allowed_origins,storage_bucket,approved_by,approval_evidence_sha256,approved_at) values($1,'abcdefghijklmnopqrst','ap-southeast-1','prj_QAonly','QA-ONLY-NOT-REAL-APPROVAL',array['https://candidate-qa.invalid'],'azzora-private',$2,$3,now())`,
    [company, owner, "d".repeat(64)],
  );
  const value = (await call("azzora_runtime_identity", [company])).rows[0].r;
  expect(value).toMatchObject({
    schemaVersion: 1,
    contractVersion: "azzora-canonical-production-v1",
    companyId: company,
    environment: "production",
    financialPostingEnabled: false,
    realDocumentProcessingEnabled: false,
    fictionalData: false,
    backendCommandsInstalled: true,
    allowedOrigins: ["https://candidate-qa.invalid"],
  });
  await expect(
    call("azzora_runtime_identity", ["11111111-1111-4111-8111-111111111111"]),
  ).rejects.toThrow(/Approved company/);
});
it("grants use actual membership, approved company and trusted production app metadata", async () => {
  await db.query(
    "insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,$2,'owner_admin',true,true,array['manager','accountant'],array['project.read','project.write','finance.read','finance.draft','access.manage'])",
    [company, owner],
  );
  expect(
    (await call("azzora_production_auth_grant", [owner])).rows[0].r,
  ).toMatchObject({ companyId: company, role: "owner_admin" });
  await db.query(
    "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values('52f925bd-8744-48cc-8781-d20109387d14','client-review@staging.azzora.test','{\"azzora_scope\":\"production\"}',now())",
  );
  await db.query(
    "insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,'52f925bd-8744-48cc-8781-d20109387d14','accountant',true,true,array['accountant'],array['finance.read','finance.draft'])",
    [company],
  );
  await expect(
    call("azzora_production_auth_grant", [
      "52f925bd-8744-48cc-8781-d20109387d14",
    ]),
  ).rejects.toThrow(/membership denied/);
});
it("privileged sessions require live provider session and MFA, then actual session revocation denies reads", async () => {
  await db.query(
    "insert into auth.sessions values($1,$2,'aal2',now()+interval '1 hour')",
    [provider, owner],
  );
  await expect(
    call("azzora_production_auth_session_put", [
      token,
      csrf,
      owner,
      provider,
      company,
      "manager",
      "aal1",
      "encrypted-QA-only",
    ]),
  ).rejects.toThrow(/MFA/);
  await db.query(
    "insert into auth.mfa_factors values('88888888-8888-4888-8888-888888888888',$1,'verified','totp')",
    [owner],
  );
  await call("azzora_production_auth_session_put", [
    token,
    csrf,
    owner,
    provider,
    company,
    "manager",
    "aal2",
    "encrypted-QA-only",
  ]);
  expect(
    (await call("azzora_production_auth_actor", [token])).rows[0].r,
  ).toMatchObject({ assurance: "aal2", workspace: "manager" });
  await call("azzora_production_auth_session_put", [
    "f".repeat(64),
    csrf,
    owner,
    provider,
    company,
    "accountant",
    "aal2",
    "encrypted-QA-only",
  ]);
  await call("azzora_production_auth_session_revoke", ["f".repeat(64)]);
  await expect(
    call("azzora_production_company_read", ["f".repeat(64), "accountant"]),
  ).rejects.toThrow(/expired or revoked/);
});
it("zero initialization preserves one canonical store without creating journals or fixture parties", async () => {
  expect(
    (
      await commit(
        0,
        "qa-production-init-00001",
        empty(),
        false,
        true,
        "production.initialize",
      )
    ).rows[0].r,
  ).toMatchObject({ version: 1, replayed: false });
  const read = (
    await call("azzora_production_company_read", [token, "manager"])
  ).rows[0].r as { data: ReturnType<typeof empty>; version: number };
  expect(read.version).toBe(1);
  expect(read.data.parties).toEqual([]);
  expect(read.data.journals).toEqual([]);
});
it("ordinary commands commit once, replay once, reject mismatched receipts and stale writers", async () => {
  const data = {
    ...empty(),
    parties: [
      {
        id: "qa-customer",
        kind: "customer",
        payload: { manager: { id: "qa-customer", name: "QA ONLY CUSTOMER" } },
      },
    ],
  };
  const r = await commit(1, "qa-customer-create-00001", data);
  expect(r.rows[0].r).toMatchObject({ version: 2, replayed: false });
  expect(
    (await commit(1, "qa-customer-create-00001", data)).rows[0].r,
  ).toMatchObject({ version: 2, replayed: true });
  await expect(
    commit(
      2,
      "qa-customer-create-00001",
      data,
      false,
      false,
      "customer.save",
      "e".repeat(64),
    ),
  ).rejects.toThrow(/Idempotency conflict/);
  await expect(commit(1, "qa-stale-customer-00001", data)).rejects.toThrow(
    /version conflict/,
  );
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from azzora.parties",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("financial scope or a forged issued document cannot bypass the disabled policy even without journals", async () => {
  const base = (
    await call("azzora_production_company_read", [token, "manager"])
  ).rows[0].r as { data: ReturnType<typeof empty> };
  await expect(
    commit(2, "qa-forbidden-post-00001", base.data, true),
  ).rejects.toThrow(/Approved accounting policy/);
  const changed = structuredClone(base.data);
  changed.records.push({
    entity_type: "sales_invoice",
    id: "issued-forbidden",
    project_id: null,
    party_id: null,
    department_id: null,
    payload: { metadata: { mode: "production", version: 1 } },
    status: "Issued",
  });
  await expect(commit(2, "qa-forged-issued-00001", changed)).rejects.toThrow(
    /Financial document transition/,
  );
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from azzora.journals",
      )
    ).rows[0].n,
  ).toBe(0);
});
it("an interrupted foreign-key-invalid write rolls back every preceding record and receipt", async () => {
  const before = (
    await call("azzora_production_company_read", [token, "manager"])
  ).rows[0].r as { data: ReturnType<typeof empty>; version: number };
  const broken = {
    ...before.data,
    parties: [
      ...before.data.parties,
      { id: "rollback-only", kind: "customer", payload: {} },
    ],
    projects: [
      { id: "invalid-project", customer_id: "does-not-exist", payload: {} },
    ],
  };
  await expect(
    commit(before.version, "qa-interrupted-write-00001", broken),
  ).rejects.toThrow();
  const after = (
    await call("azzora_production_company_read", [token, "manager"])
  ).rows[0].r;
  expect(after).toEqual(before);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from azzora.command_receipts where idempotency_key='qa-interrupted-write-00001'",
      )
    ).rows[0].n,
  ).toBe(0);
});
it("anon/authenticated roles cannot execute production RPCs or access private records, runtime config is immutable", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await expect(call("azzora_runtime_identity", [company])).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query("select * from azzora.records")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
  await expect(
    db.query(
      "update azzora.production_environment set real_financial_posting_enabled=true",
    ),
  ).rejects.toThrow(/Immutable history/);
  await db.exec("set role service_role");
  try {
    expect(
      (await call("azzora_runtime_identity", [company])).rows[0].r,
    ).toMatchObject({ financialPostingEnabled: false });
    await expect(
      db.query("select * from azzora.production_environment"),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
