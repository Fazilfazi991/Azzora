import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createPrivateAttachmentStorage } from "./storage";
import { createStagingHandler } from "./server";
import type { createStagingAuth } from "./auth";
import type { StagingRpc } from "./supabase";

// Offline review of a proposed staging-only admission patch; this does not
// establish hosted authentication, Storage isolation, or production readiness.
const a = "11111111-1111-4111-8111-111111111111";
const b = "4b44d384-fbbd-44f3-91fc-abd3ff89a19f";
const roles = [
  { role: "owner_admin", base: "owner", workspace: "manager", aal: "aal2" },
  {
    role: "project_manager",
    base: "manager",
    workspace: "manager",
    aal: "aal1",
  },
  {
    role: "accountant",
    base: "accountant",
    workspace: "accountant",
    aal: "aal2",
  },
  { role: "site_staff", base: "engineer", workspace: "manager", aal: "aal1" },
] as const;
const uid = (n: number) =>
  `${n.toString().padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const hash = (n: number) => n.toString().repeat(64);
let db: PGlite;
let aGrants: unknown[];
let restrictedGrant: unknown;
let aclBefore: unknown;
let defBefore: string;

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
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i],
      first = uid(i + 1),
      second = uid(i + 11);
    await db.query(
      'insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,$2,\'{"azzora_scope":"fictional-staging"}\',now())',
      [first, `${r.base}@staging.azzora.test`],
    );
    await db.query("select public.staging_auth_fixture_membership($1,$2,$3)", [
      first,
      a,
      r.role,
    ]);
    await db.query(
      'insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,$2,\'{"azzora_scope":"fictional-staging","azzora_purpose":"isolated-company-b-security-test"}\',now())',
      [second, `company-b-${r.base}@staging.azzora.test`],
    );
  }
  await db.query(
    'insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values(\'52f925bd-8744-48cc-8781-d20109387d14\',\'client-review@staging.azzora.test\',\'{"azzora_scope":"fictional-staging","azzora_purpose":"client-review-draft-only"}\',now())',
  );
  await db.query(
    "insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,'52f925bd-8744-48cc-8781-d20109387d14','accountant',true,true,array['accountant'],array['finance.read','finance.draft'])",
    [a],
  );
  restrictedGrant = (
    await db.query<{ r: unknown }>(
      "select public.staging_auth_grant('52f925bd-8744-48cc-8781-d20109387d14') r",
    )
  ).rows[0].r;
  const rows = await db.query<{ r: unknown }>(
    "select public.staging_auth_grant(id) r from auth.users where email in ('owner@staging.azzora.test','manager@staging.azzora.test','accountant@staging.azzora.test','engineer@staging.azzora.test') order by email",
  );
  aGrants = rows.rows;
  const proc = await db.query<{ acl: unknown; definition: string }>(
    "select proacl::text acl,pg_get_functiondef(oid) definition from pg_proc where oid='public.staging_auth_grant(uuid)'::regprocedure",
  );
  aclBefore = proc.rows[0].acl;
  defBefore = proc.rows[0].definition;
  await db.exec(
    await readFile(
      new URL(
        "../../tests/fixtures/company-b-allowlist.review.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

it("preserves Company A grant behavior and ACL while allowing only the four explicit Company B identities", async () => {
  const after = await db.query<{ acl: unknown; definition: string }>(
    "select proacl::text acl,pg_get_functiondef(oid) definition from pg_proc where oid='public.staging_auth_grant(uuid)'::regprocedure",
  );
  expect(after.rows[0].acl).toEqual(aclBefore);
  const added = after.rows[0].definition.match(
    /\n -- ISOLATED-COMPANY-B-GRANT-V1:[\s\S]*? if result is not null then return result; end if;\n/,
  );
  expect(added).not.toBeNull();
  expect(after.rows[0].definition.replace(added![0], "")).toBe(defBefore);
  expect(
    (
      await db.query<{ r: unknown }>(
        "select public.staging_auth_grant(id) r from auth.users where email in ('owner@staging.azzora.test','manager@staging.azzora.test','accountant@staging.azzora.test','engineer@staging.azzora.test') order by email",
      )
    ).rows,
  ).toEqual(aGrants);
  expect(
    (
      await db.query<{ r: unknown }>(
        "select public.staging_auth_grant('52f925bd-8744-48cc-8781-d20109387d14') r",
      )
    ).rows[0].r,
  ).toEqual(restrictedGrant);
  expect(restrictedGrant).toMatchObject({
    authenticationPolicy: "client-review-password-only",
  });
  for (let i = 0; i < roles.length; i++)
    expect(
      (
        await db.query<{ r: unknown }>(
          "select public.staging_auth_grant($1) r",
          [uid(i + 11)],
        )
      ).rows[0].r,
    ).toMatchObject({ companyId: b, role: roles[i].role });
});

it("retains current privileged MFA, session and workspace checks for both companies", async () => {
  for (let i = 0; i < roles.length; i++)
    for (const side of [0, 1]) {
      const r = roles[i],
        user = uid(i + 1 + side * 10),
        provider = uid(i + 31 + side * 10),
        token = hash(i + 1 + side * 4),
        company = side ? b : a;
      await db.query(
        "insert into auth.sessions values($1,$2,$3,now()+interval '1 hour')",
        [provider, user, r.aal],
      );
      if (r.aal === "aal2") {
        await expect(
          db.query(
            "select public.staging_auth_session_put($1,$2,$3,$4,$5,$6,'aal1','fictional-only')",
            [token, "f".repeat(64), user, provider, company, r.workspace],
          ),
        ).rejects.toThrow(/MFA/);
        await db.query(
          "insert into auth.mfa_factors values($1,$2,'verified','totp')",
          [uid(i + 51 + side * 10), user],
        );
      }
      await db.query(
        "select public.staging_auth_session_put($1,$2,$3,$4,$5,$6,$7,'fictional-only')",
        [token, "f".repeat(64), user, provider, company, r.workspace, r.aal],
      );
      expect(
        (
          await db.query<{ r: unknown }>(
            "select public.staging_auth_actor($1) r",
            [token],
          )
        ).rows[0].r,
      ).toMatchObject({ companyId: company, role: r.role, assurance: r.aal });
      const wrong = r.workspace === "manager" ? "accountant" : "manager";
      await expect(
        db.query("select public.staging_company_read($1,$2)", [token, wrong]),
      ).rejects.toThrow(/Workspace denied/);
    }
});

it("bootstraps empty fictional companies independently through the actual staging handler", async () => {
  const rpc = async (name: string, p: Record<string, unknown>) => {
    const keys: Record<string, string[]> = {
      staging_company_read: ["p_session_hash", "p_workspace"],
      staging_company_people: ["p_session_hash"],
      staging_company_commit: [
        "p_session_hash",
        "p_expected_version",
        "p_idempotency_key",
        "p_fingerprint",
        "p_command",
        "p_scope",
        "p_data",
        "p_bootstrap",
      ],
    };
    if (!keys[name]) throw Error("Unexpected offline RPC: " + name);
    const args = keys[name].map((key) =>
      ["p_scope", "p_data"].includes(key) ? JSON.stringify(p[key]) : p[key],
    );
    const placeholders = keys[name]
      .map(
        (key, i) =>
          `$${i + 1}${["p_scope", "p_data"].includes(key) ? "::jsonb" : ""}`,
      )
      .join(",");
    return (
      await db.query<{ r: unknown }>(
        `select public.${name}(${placeholders}) r`,
        args,
      )
    ).rows[0].r;
  };
  const auth = {
    requireActor: async (request: Request) => {
      const token = request.headers.get("x-fictional-test-session");
      return (
        await db.query<{ r: unknown }>(
          "select public.staging_auth_actor($1) r",
          [token],
        )
      ).rows[0].r;
    },
  } as unknown as ReturnType<typeof createStagingAuth>;
  const handle = createStagingHandler({ rpc: rpc as StagingRpc, auth });
  const read = (token: string) =>
    handle(
      new Request("https://fixture.invalid/api/staging/manager/snapshot", {
        headers: { "x-fictional-test-session": token },
      }),
    );
  expect((await read(hash(6))).status).toBe(409); // Company B Manager cannot bootstrap.
  expect((await read(hash(5))).status).toBe(200); // Its MFA Owner initializes Company B only.
  const versions = await db.query<{ id: string; version: number }>(
    "select id,version::int version from azzora.companies where id in ($1,$2) order by id",
    [a, b],
  );
  expect(versions.rows).toEqual([
    { id: a, version: 0 },
    { id: b, version: 1 },
  ]);
  expect((await read(hash(1))).status).toBe(200);
  const ready = await db.query<{ id: string; version: number }>(
    "select id,version::int version from azzora.companies where id in ($1,$2) order by id",
    [a, b],
  );
  expect(ready.rows).toEqual([
    { id: a, version: 1 },
    { id: b, version: 1 },
  ]);
});

it("isolates canonical customers, projects, invoices, receipts and accounts in both directions", async () => {
  for (const [company, tag] of [
    [a, "A"],
    [b, "B"],
  ]) {
    await db.query(
      "insert into azzora.parties(company_id,id,kind,payload) values($1,$2,'customer',$3::jsonb)",
      [company, `P-${tag}`, JSON.stringify({ marker: `PRIVATE-${tag}` })],
    );
    await db.query(
      "insert into azzora.projects(company_id,id,customer_id,payload) values($1,$2,$3,$4::jsonb)",
      [
        company,
        `PROJECT-${tag}`,
        `P-${tag}`,
        JSON.stringify({ marker: `PRIVATE-${tag}` }),
      ],
    );
    await db.query(
      "insert into azzora.accounts(company_id,id,code,name,type,active,postable) values($1,$2,$2,$3,'Asset',false,false)",
      [company, `ACCOUNT-${tag}`, `PRIVATE-${tag}`],
    );
    for (const type of ["sales_invoice", "receipt", "document"])
      await db.query(
        "insert into azzora.records(company_id,entity_type,id,project_id,party_id,payload,status) values($1,$2,$3,$4,$5,$6::jsonb,'draft')",
        [
          company,
          type,
          `${type}-${tag}`,
          `PROJECT-${tag}`,
          `P-${tag}`,
          JSON.stringify({ marker: `PRIVATE-${tag}` }),
        ],
      );
  }
  for (let i = 0; i < roles.length; i++)
    for (const side of [0, 1]) {
      const own = side ? "B" : "A",
        other = side ? "A" : "B";
      const result = await db.query<{ r: unknown }>(
        "select public.staging_company_read($1,$2) r",
        [hash(i + 1 + side * 4), roles[i].workspace],
      );
      expect(JSON.stringify(result.rows[0].r)).toContain(`PRIVATE-${own}`);
      expect(JSON.stringify(result.rows[0].r)).not.toContain(
        `PRIVATE-${other}`,
      );
    }
  await expect(
    db.query(
      "insert into azzora.projects(company_id,id,customer_id,payload) values($1,'FORGED','P-B','{}')",
      [a],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into azzora.projects(company_id,id,customer_id,payload) values($1,'FORGED','P-A','{}')",
      [b],
    ),
  ).rejects.toThrow();
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from azzora.projects where id='FORGED'",
      )
    ).rows[0].n,
  ).toBe(0);
});

it("fails closed for an expanded Company B capability or wrong trusted purpose", async () => {
  await db.query(
    "update azzora.memberships set capabilities=capabilities||array['access.manage'] where company_id=$1 and user_id=$2",
    [b, uid(12)],
  );
  await expect(
    db.query("select public.staging_auth_grant($1)", [uid(12)]),
  ).rejects.toThrow(/membership denied/i);
  await db.query(
    "update auth.users set raw_app_meta_data='{}'::jsonb where id=$1",
    [uid(14)],
  );
  await expect(
    db.query("select public.staging_auth_grant($1)", [uid(14)]),
  ).rejects.toThrow(/membership denied/i);
  expect(
    (
      await db.query<{ r: unknown }>("select public.staging_auth_grant($1) r", [
        uid(1),
      ])
    ).rows[0].r,
  ).toMatchObject({ companyId: a, role: "owner_admin" });
});

it("automatically expires Company B test access after 24 hours without affecting Company A", async () => {
  await db.query(
    "update azzora.companies set created_at=now()-interval '25 hours' where id=$1",
    [b],
  );
  await expect(
    db.query("select public.staging_auth_grant($1)", [uid(11)]),
  ).rejects.toThrow(/membership denied/i);
  await expect(
    db.query("select public.staging_auth_actor($1)", [hash(5)]),
  ).rejects.toThrow(/membership denied/i);
  expect(
    (
      await db.query<{ r: unknown }>("select public.staging_auth_grant($1) r", [
        uid(1),
      ])
    ).rows[0].r,
  ).toMatchObject({ companyId: a, role: "owner_admin" });
});

it("denies browser roles direct access to both tenant records and the service-only grant", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await expect(
        db.query("select * from azzora.records where company_id=$1", [b]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select public.staging_auth_grant($1)", [uid(11)]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
});

it("rejects cross-company private object keys in both directions before contacting storage", async () => {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const transport = vi.fn<typeof fetch>();
  const storage = createPrivateAttachmentStorage(
    {
      url: "https://hkhomrrvxtcxnxvdlkoh.supabase.co",
      serviceKey: "fictional-test-only",
      publishableKey: "fictional-test-only",
    },
    transport,
  );
  for (const [company, foreign] of [
    [a, b],
    [b, a],
  ])
    await expect(
      storage.read(company, {
        id: "file",
        name: "synthetic.png",
        mime: "image/png",
        size: bytes.length,
        data: "",
        storageObjectKey: `${foreign}/${digest}.png`,
      }),
    ).rejects.toThrow("staging_attachment_access_denied");
  expect(transport).not.toHaveBeenCalled();
});
