import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";

const companyA = "11111111-1111-4111-8111-111111111111";
const companyB = "4b44d384-fbbd-44f3-91fc-abd3ff89a19f";
const roles = [
  {
    role: "owner_admin",
    email: "owner@staging.azzora.test",
    workspace: "manager",
    aal: "aal2",
  },
  {
    role: "project_manager",
    email: "manager@staging.azzora.test",
    workspace: "manager",
    aal: "aal1",
  },
  {
    role: "accountant",
    email: "accountant@staging.azzora.test",
    workspace: "accountant",
    aal: "aal2",
  },
  {
    role: "site_staff",
    email: "engineer@staging.azzora.test",
    workspace: "manager",
    aal: "aal1",
  },
] as const;
let db: PGlite;
const hash = (i: number) => String(i + 1).repeat(64);
const uuid = (n: number) =>
  `${n.toString().padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
    create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);
    create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const name of (
    await readdir(new URL("../../supabase/migrations/", import.meta.url))
  )
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    await readFile(
      new URL(
        "../../tests/fixtures/foreign-company-security.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (let i = 0; i < roles.length; i++) {
    const a = roles[i],
      user = uuid(i + 1),
      provider = uuid(i + 11);
    await db.query(
      'insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,$2,\'{"azzora_scope":"fictional-staging"}\',now())',
      [user, a.email],
    );
    await db.query(
      "insert into auth.sessions values($1,$2,$3,now()+interval '1 hour')",
      [provider, user, a.aal],
    );
    if (a.aal === "aal2")
      await db.query(
        "insert into auth.mfa_factors values($1,$2,'verified','totp')",
        [uuid(i + 21), user],
      );
    await db.query("select public.staging_auth_fixture_membership($1,$2,$3)", [
      user,
      companyA,
      a.role,
    ]);
    await db.query(
      "select public.staging_auth_session_put($1,$2,$3,$4,$5,$6,$7,'fixture-only')",
      [hash(i), "f".repeat(64), user, provider, companyA, a.workspace, a.aal],
    );
  }
}, 30000);
afterAll(async () => {
  await db?.close();
});

it("keeps the additive Company B fixture outside all four Company A canonical reads", async () => {
  for (let i = 0; i < roles.length; i++) {
    const result = await db.query<{ r: unknown }>(
      "select public.staging_company_read($1,$2) r",
      [hash(i), roles[i].workspace],
    );
    expect(JSON.stringify(result.rows[0].r)).not.toContain("SECURITY-B-");
  }
  const data = await db.query<{ n: number }>(
    "select count(*)::int n from azzora.records where company_id=$1",
    [companyB],
  );
  expect(data.rows[0].n).toBe(3);
});
it("keeps company-scoped foreign keys and private-schema access intact", async () => {
  await expect(
    db.query(
      "insert into azzora.projects(company_id,id,customer_id,payload) values($1,'FORGED','SECURITY-B-CUSTOMER','{}')",
      [companyA],
    ),
  ).rejects.toThrow();
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from azzora.projects where company_id=$1 and id='FORGED'",
        [companyA],
      )
    ).rows[0].n,
  ).toBe(0);
  await db.exec("set role authenticated");
  try {
    await expect(
      db.query("select * from azzora.attachments where id='SECURITY-B-FILE'"),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("reset role");
  }
});
it("confirms the deployed single-company grant also denies all four Company B role identities", async () => {
  for (let i = 0; i < roles.length; i++) {
    const a = roles[i],
      user = uuid(i + 31);
    await db.query(
      'insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,$2,\'{"azzora_scope":"fictional-staging"}\',now())',
      [user, `company-b-${a.role}@staging.azzora.test`],
    );
    await db.query(
      "insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,$2,$3,true,$4,$5,ARRAY[]::text[])",
      [
        companyB,
        user,
        a.role,
        a.role === "owner_admin" || a.role === "accountant",
        [a.workspace],
      ],
    );
    await expect(
      db.query("select public.staging_auth_grant($1)", [user]),
    ).rejects.toThrow(/membership denied/i);
  }
});
it("rejects repeated fixture application without overwriting the foreign company", async () => {
  await expect(
    db.exec(
      await readFile(
        new URL(
          "../../tests/fixtures/foreign-company-security.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  ).rejects.toThrow(/already exists/);
});
