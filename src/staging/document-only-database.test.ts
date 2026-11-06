import { afterAll, beforeAll, beforeEach, afterEach, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import {
  createSharedCompanyState,
  applySharedCommand,
  type SharedActor,
} from "./domain";
import { serializeCanonical } from "./canonical";
import type { Person } from "../domain/model";

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
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const session = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const hash = "a".repeat(64);
const people: Person[] = [
  {
    id: owner,
    name: "Fictional Owner",
    role: "Project Manager",
    email: "owner@staging.azzora.test",
    phone: "",
    capacity: 100,
    status: "Active",
  },
];
beforeAll(async () => {
  const path = process.env.AZZORA_PGLITE_MODULE;
  const { PGlite } = path
    ? await import(/* @vite-ignore */ path)
    : await import("@electric-sql/pglite");
  db = new PGlite() as Database;
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
    create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);
    create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const name of (
    await readdir(new URL("../../supabase/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await db.query(
    "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'owner@staging.azzora.test','{\"azzora_scope\":\"fictional-staging\"}',now())",
    [owner],
  );
  await db.query(
    "insert into auth.sessions values($1,$2,'aal2',now()+interval '1 day')",
    [session, owner],
  );
  await db.query(
    "insert into auth.mfa_factors values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',$1,'verified','totp')",
    [owner],
  );
  await db.query(
    "select public.staging_auth_fixture_membership($1,$2,'owner_admin')",
    [owner, company],
  );
  await db.query(
    "select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal2','encrypted-unit-fixture')",
    [hash, "b".repeat(64), owner, session, company],
  );
}, 30_000);
afterAll(async () => {
  if (db) await db.close();
});

const client = "52f925bd-8744-48cc-8781-d20109387d14",
  clientHash = "c".repeat(64);
let original: ReturnType<typeof serializeCanonical>;
beforeAll(async () => {
  original = serializeCanonical(createSharedCompanyState(people));
  await db.query(
    "select public.staging_company_commit($1,0,'init-document-boundary-01',$2,'fixture.initialize','{}',$3::jsonb,true)",
    [hash, "b".repeat(64), JSON.stringify(original)],
  );
  await db.query(
    'insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,\'client-review@staging.azzora.test\',\'{"azzora_scope":"fictional-staging","azzora_purpose":"client-review-draft-only"}\',now())',
    [client],
  );
  await db.query(
    "insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,$2,'accountant',true,true,array['accountant'],array['finance.read','finance.draft'])",
    [company, client],
  );
  await db.query(
    "insert into auth.sessions values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',$1,'aal1',now()+interval '1 day')",
    [client],
  );
  await db.query(
    "select public.staging_auth_session_put($1,$2,$3,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',$4,'accountant','aal1','cipher')",
    [clientHash, "d".repeat(64), client, company],
  );
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});
const current = async () =>
  (
    await db.query("select public.staging_company_read($1,'accountant') r", [
      clientHash,
    ])
  ).rows[0].r as {
    version: number;
    data: ReturnType<typeof serializeCanonical>;
  };
async function write(
  data: unknown,
  command = "accounts.action",
  financial = false,
) {
  await db.exec("savepoint attempted_write");
  try {
    return await db.query(
      "select public.staging_company_commit($1,1,'restricted-write-test-001',$2,$3,$4::jsonb,$5::jsonb,false)",
      [
        clientHash,
        "e".repeat(64),
        command,
        JSON.stringify({ workspace: "accountant", financial }),
        JSON.stringify(data),
      ],
    );
  } catch (e) {
    await db.exec("rollback to savepoint attempted_write");
    throw e;
  }
}
it.each([
  "parties",
  "projects",
  "departments",
  "accounts",
  "periods",
  "journals",
  "snapshots",
] as const)(
  "SQL denies forged nonfinancial changes to %s without changing any state",
  async (key) => {
    const before = await current();
    const data = structuredClone(original);
    (data[key] as unknown[]).push({ ...data[key][0], id: "FORGED" });
    await expect(write(data)).rejects.toMatchObject({ code: "PT403" });
    expect(await current()).toEqual(before);
  },
);
it.each([
  "expense_ledger",
  "cash_account",
  "sales_invoice",
  "supplier_bill",
  "receipt",
  "expense",
  "transfer",
])("SQL denies nonfinancial disguise for %s records", async (entity_type) => {
  const before = await current(),
    data = structuredClone(original);
  data.records.push({
    entity_type,
    id: "FORGED",
    project_id: null,
    party_id: null,
    department_id: null,
    payload: { finance: { name: "forged" } },
    status: "draft",
  });
  await expect(write(data)).rejects.toMatchObject({ code: "PT403" });
  expect(await current()).toEqual(before);
});
it("SQL denies a document record carrying extra financial data", async () => {
  const data = structuredClone(original);
  data.records.push({
    entity_type: "document",
    id: "review:FORGED",
    project_id: null,
    party_id: null,
    department_id: null,
    payload: { review: {}, finance: {} },
    status: "draft",
  });
  await expect(write(data)).rejects.toMatchObject({ code: "PT403" });
});
it("SQL denies workspace metadata modifications outside document defaults", async () => {
  const data = structuredClone(original),
    meta = data.records.find((x) => x.entity_type === "workspace_metadata")!;
  meta.payload.metadata = {
    ...(meta.payload.metadata as object),
    finance: { arbitrary: "write" },
  };
  await expect(write(data)).rejects.toMatchObject({ code: "PT403" });
});
it("SQL rejects Manager/admin command even with unchanged data", async () => {
  await expect(write(original, "settings.save")).rejects.toMatchObject({
    code: "PT403",
  });
});
it("SQL accepts only document drafts and supplier defaults with unchanged financial state", async () => {
  const data = structuredClone(original);
  data.records.push({
    entity_type: "document",
    id: "review:SYNTHETIC",
    project_id: null,
    party_id: null,
    department_id: null,
    payload: { review: { id: "SYNTHETIC", status: "Review" } },
    status: "draft",
  });
  await write(data);
  const after = await current();
  expect(after.version).toBe(2);
  expect(after.data.journals).toEqual(
    (
      await db.query("select azzora.staging_canonical_data($1)->'journals' j", [
        company,
      ])
    ).rows[0].j,
  );
});
it("no direct browser table/function write permissions were introduced; RLS remains enabled", async () => {
  const rows = (
    await db.query(
      "select c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'insert,update,delete') browser from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='azzora' and c.relkind='r'",
    )
  ).rows;
  expect(rows.length).toBeGreaterThan(15);
  expect(rows.every((x) => x.relrowsecurity && !x.browser)).toBe(true);
  const row = (
    await db.query(
      "select has_function_privilege('authenticated','azzora.document_review_projection(jsonb)','execute') allowed",
    )
  ).rows[0];
  expect(row.allowed).toBe(false);
});

it.each(["owner_admin", "accountant"])(
  "SQL preserves legitimate %s master-data creation",
  async (role) => {
    const id =
        role === "owner_admin" ? owner : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      token = role === "owner_admin" ? hash : "f".repeat(64);
    if (role === "accountant") {
      await db.query(
        "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'accountant@staging.azzora.test','{\"azzora_scope\":\"fictional-staging\"}',now())",
        [id],
      );
      await db.query(
        "select public.staging_auth_fixture_membership($1,$2,'accountant')",
        [id, company],
      );
      await db.query(
        "insert into auth.sessions values('99999999-9999-4999-8999-999999999999',$1,'aal2',now()+interval '1 day')",
        [id],
      );
      await db.query(
        "insert into auth.mfa_factors values('88888888-8888-4888-8888-888888888888',$1,'verified','totp')",
        [id],
      );
      await db.query(
        "select public.staging_auth_session_put($1,$2,$3,'99999999-9999-4999-8999-999999999999',$4,'accountant','aal2','cipher')",
        [token, "d".repeat(64), id, company],
      );
    } else
      await db.query(
        "update azzora.sessions set workspace='accountant' where token_hash=$1",
        [token],
      );
    const a: SharedActor = {
      userId: id,
      personId: id,
      companyId: company,
      sessionId: "unit",
      assurance: "aal2",
      grant: {
        userId: id,
        companyId: company,
        active: true,
        roles: [role === "owner_admin" ? "owner" : "accountant"],
        workspaces: ["accountant"],
        projectIds: [],
        capabilities: ["finance.read", "finance.draft", "finance.simulate"],
      },
    };
    let state = createSharedCompanyState(people),
      version = 1;
    for (const action of [
      {
        kind: "create-expense-ledger",
        id: "ALLOWED-LEDGER",
        name: "Fictional ledger",
        group: "Indirect Expense",
      },
      {
        kind: "create-cash-account",
        id: "ALLOWED-CASH",
        name: "Fictional cash",
        type: "cash",
      },
    ]) {
      state = applySharedCommand(
        state,
        { kind: "accounts.action", payload: { action } },
        a,
      );
      await db.query(
        "select public.staging_company_commit($1,$2,$3,$4,'accounts.action',$5::jsonb,$6::jsonb,false)",
        [
          token,
          version++,
          "allowed-creation-" + action.id,
          "a".repeat(64),
          JSON.stringify({ workspace: "accountant", financial: true }),
          JSON.stringify(serializeCanonical(state)),
        ],
      );
    }
    expect(
      (await current()).data.records.some((r) => r.id === "ALLOWED-LEDGER"),
    ).toBe(true);
    expect(
      (await current()).data.records.some((r) => r.id === "ALLOWED-CASH"),
    ).toBe(true);
  },
);

it("restricted password session is aal1, has no MFA factor, and is denied after membership privilege drift", async () => {
  const actor = (
    await db.query("select public.staging_auth_actor($1) a", [clientHash])
  ).rows[0].a as { assurance: string; authenticationPolicy: string };
  expect(actor.assurance).toBe("aal1");
  expect(actor.authenticationPolicy).toBe("client-review-password-only");
  await db.query(
    "update azzora.memberships set capabilities=capabilities||array['finance.simulate'] where user_id=$1",
    [client],
  );
  await expect(current()).rejects.toMatchObject({ code: "PT403" });
});
it("owner session still requires MFA2", async () => {
  await db.query("update auth.sessions set aal='aal1' where id=$1", [session]);
  await expect(
    db.query(
      "select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal1','cipher')",
      ["9".repeat(64), "8".repeat(64), owner, session, company],
    ),
  ).rejects.toMatchObject({ code: "PT403" });
});
