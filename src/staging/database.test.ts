import { afterAll, beforeAll, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { createSharedCompanyState } from "./domain";
import { hydrateCanonical, serializeCanonical } from "./canonical";
import type { Person } from "../domain/model";
import {reverseJournal} from "../accounting/core";

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
async function commit(
  expected: number,
  key: string,
  data = serializeCanonical(createSharedCompanyState(people)),
  bootstrap = false,
) {
  return (
    await db.query(
      "select public.staging_company_commit($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) result",
      [
        hash,
        expected,
        key,
        "b".repeat(64),
        bootstrap ? "fixture.initialize" : "customer.save",
        JSON.stringify({ workspace: "manager", financial: false }),
        JSON.stringify(data),
        bootstrap,
      ],
    )
  ).rows[0].result as { version: number; replayed: boolean };
}
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

it("applies the actual shared schema with no browser-callable auth or command RPC", async () => {
  const rows = (
    await db.query(
      "select p.proname,has_function_privilege('anon',p.oid,'execute') a,has_function_privilege('authenticated',p.oid,'execute') b from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'staging_auth_%' or p.proname like 'staging_company_%')",
    )
  ).rows;
  expect(rows.length).toBeGreaterThan(10);
  expect(rows.every((row) => !row.a && !row.b)).toBe(true);
  const guard = (
    await db.query(
      "select p.prosecdef,has_function_privilege('service_role',p.oid,'execute') callable from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='azzora' and p.proname='assert_journal_balance'",
    )
  ).rows[0];
  expect(guard.prosecdef).toBe(true);
  expect(guard.callable).toBe(false);
});
it("initializes fictional canonical records and one opening journal through one atomic transaction", async () => {
  await db.exec("set role service_role");
  let result;
  try {
    result = await commit(0, "fixture-init-00000001", undefined, true);
  } finally {
    await db.exec("reset role");
  }
  expect(result).toEqual({ version: 1, replayed: false });
  const value = (
    await db.query("select public.staging_company_read($1,'manager') result", [
      hash,
    ])
  ).rows[0].result as {
    version: number;
    data: Parameters<typeof hydrateCanonical>[0];
  };
  const restored = hydrateCanonical(value.data);
  expect(restored.mode).toBe("fictional-staging");
  expect(restored.finance.accounting.journals).toHaveLength(1);
  expect(restored.manager.people[0].id).toBe(owner);
});
it("captures staging-only provenance for the verified Owner and denies browser roles or revoked sessions", async () => {
  const recoveryHash = "9".repeat(64);
  await db.query("insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id) values($1,$2,'recovery.issued','identity',$2::uuid::text,$3)", [company, owner, recoveryHash]);
  const capture = (await db.query("select public.staging_owner_backup($1) result", [hash])).rows[0].result as { companyId: string; provenance: { memberships: unknown[]; journals: unknown[]; auditEvents: unknown[] } };
  expect(capture.companyId).toBe(company);
  expect(capture.provenance.memberships.length).toBeGreaterThan(0);
  expect(capture.provenance.journals.length).toBeGreaterThan(0);
  expect(JSON.stringify(capture)).not.toContain(hash);
  expect(JSON.stringify(capture)).not.toContain(session);
  expect(JSON.stringify(capture)).not.toContain(recoveryHash);
  expect(JSON.stringify(capture.provenance.auditEvents)).toContain('recovery.issued');
  await expect(db.query("select public.staging_owner_backup($1)", ["f".repeat(64)])).rejects.toThrow(/expired or revoked/);
  const privileges = (await db.query("select has_function_privilege('anon','public.staging_owner_backup(text)','execute') a,has_function_privilege('authenticated','public.staging_owner_backup(text)','execute') b,has_function_privilege('service_role','public.staging_owner_backup(text)','execute') c")).rows[0];
  expect(privileges).toEqual({ a: false, b: false, c: true });
});
it("replays the same actor-bound command without posting or auditing twice", async () => {
  expect(await commit(0, "fixture-init-00000001", undefined, true)).toEqual({
    version: 1,
    replayed: true,
  });
  expect(
    (await db.query("select count(*)::int n from azzora.journals")).rows[0].n,
  ).toBe(1);
  expect(
    (
      await db.query(
        "select count(*)::int n from azzora.audit_events where action='fixture.initialize'",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("rejects stale writes and preserves the exact canonical state", async () => {
  await expect(commit(0, "stale-command-0000001")).rejects.toThrow(
    "version conflict",
  );
  expect(
    (
      await db.query(
        "select version::int n from azzora.companies where id=$1",
        [company],
      )
    ).rows[0].n,
  ).toBe(1);
});
it("retains immutable journal history on subsequent nonfinancial writes", async () => {
  const value = (
    await db.query("select public.staging_company_read($1,'manager') result", [
      hash,
    ])
  ).rows[0].result as { data: Parameters<typeof hydrateCanonical>[0] };
  const data = serializeCanonical(hydrateCanonical(value.data));
  expect(await commit(1, "unchanged-record-00001", data)).toEqual({
    version: 2,
    replayed: false,
  });
  data.journals[0].memo = "tampered";
  await expect(commit(2, "tampered-record-00001", data)).rejects.toThrow(
    "Immutable journal changed",
  );
  expect(
    (
      await db.query(
        "select version::int n from azzora.companies where id=$1",
        [company],
      )
    ).rows[0].n,
  ).toBe(2);
});

async function reversalData(){
 const value=(await db.query("select public.staging_company_read($1,'manager') result",[hash])).rows[0].result as {data:Parameters<typeof hydrateCanonical>[0]};
 const state=hydrateCanonical(value.data);
 state.finance.accounting=reverseJournal(state.finance.accounting,{id:"reverse-opening-test",postingKey:"staging:reverse-opening-test",originalId:"staging-opening",date:"2026-11-04",recordedAt:"2026-11-04T12:00:00.000Z",reason:"Fictional rollback guard test"}).state;
 return serializeCanonical(state);
}
async function commitReversal(data:ReturnType<typeof serializeCanonical>,key:string){
 return db.query("select public.staging_company_commit($1,2,$2,$3,'invoice.cancel',$4::jsonb,$5::jsonb,false) result",[hash,key,"d".repeat(64),JSON.stringify({workspace:"manager",financial:true}),JSON.stringify(data)]);
}
it("rolls back a balanced reversal that does not mirror its immutable original",async()=>{
 const data=await reversalData(),reversal=data.journals.find(v=>v.reversal_of)!;
 for(const line of reversal.lines){if(line.debit_fils!=="0")line.debit_fils=(BigInt(line.debit_fils)-1n).toString();if(line.credit_fils!=="0")line.credit_fils=(BigInt(line.credit_fils)-1n).toString();}
 await expect(commitReversal(data,"bad-mirror-test-0001")).rejects.toThrow("mirror immutable");
 expect((await db.query("select version::int n from azzora.companies where id=$1",[company])).rows[0].n).toBe(2);
 expect((await db.query("select count(*)::int n from azzora.journals")).rows[0].n).toBe(1);
});
it("persists one exact append-only reversal and its original across SQL JSONB reload",async()=>{
 const result=await commitReversal(await reversalData(),"valid-mirror-test-001");
 expect(result.rows[0].result).toEqual({version:3,replayed:false});
 const raw=(await db.query("select public.staging_company_read($1,'manager') result",[hash])).rows[0].result as {data:Parameters<typeof hydrateCanonical>[0]};
 const identity=(row:unknown)=>{const v=row as Record<string,unknown>;return [v.entity_type||"",v.id||v.entity_id||"",v.revision||""].join(":");};
 const normalize=(data:typeof raw.data)=>Object.fromEntries(Object.entries(data).map(([key,rows])=>[key,[...rows].sort((a,b)=>identity(a).localeCompare(identity(b)))]));
 expect(normalize(serializeCanonical(hydrateCanonical(raw.data)))).toEqual(normalize(raw.data));
 expect(hydrateCanonical(raw.data).finance.accounting.journals.find(v=>v.id==="reverse-opening-test")?.reversalOf).toBe("staging-opening");
});

it("gives verified Owner company administration while PM remains assignment-scoped",async()=>{
 await db.query("insert into azzora.projects(company_id,id,payload) values($1,'owner-unassigned','{\"manager\":{\"id\":\"owner-unassigned\"}}')",[company]);
 await db.query("insert into azzora.companies(id,name) values('22222222-2222-4222-8222-222222222222','Other fictional tenant')");
 await db.query("insert into azzora.projects(company_id,id,payload) values('22222222-2222-4222-8222-222222222222','foreign-project','{}')");
 const o=(await db.query("select public.staging_auth_actor($1) a",[hash])).rows[0].a as {projectIds:string[]};
 expect(o.projectIds).toContain("owner-unassigned");expect(o.projectIds).not.toContain("foreign-project");
 const pm="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",ps="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",ph="f".repeat(64);
 await db.query("insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'manager@staging.azzora.test','{\"azzora_scope\":\"fictional-staging\"}',now())",[pm]);
 await db.query("insert into auth.sessions values($1,$2,'aal1',now()+interval '1 day')",[ps,pm]);
 await db.query("select public.staging_auth_fixture_membership($1,$2,'project_manager')",[pm,company]);
 await db.query("select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal1','local-fixture-encrypted')",[ph,"e".repeat(64),pm,ps,company]);
 const m=(await db.query("select public.staging_auth_actor($1) a",[ph])).rows[0].a as {projectIds:string[];capabilities:string[]};
 expect(m.projectIds).toEqual([]);expect(m.capabilities).toContain("document.submit");
 await expect(db.query("select public.staging_owner_backup($1)",[ph])).rejects.toThrow(/Owner MFA/);
 const ownerBackup=(await db.query("select public.staging_owner_backup($1) result",[hash])).rows[0].result;
 expect(JSON.stringify(ownerBackup)).not.toContain("foreign-project");
 expect(JSON.stringify(ownerBackup)).toContain("owner-unassigned");
 await expect(db.query("select public.staging_company_commit($1,3,'unassigned-command-01',$2,'site.save',$3::jsonb,'{}'::jsonb,false)",[ph,"d".repeat(64),JSON.stringify({workspace:"manager",projectId:"owner-unassigned",financial:false})])).rejects.toThrow("Assigned project required");
});
