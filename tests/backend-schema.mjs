// Local PostgreSQL/WASM proof only. Does not contact Supabase or create cloud resources.
// AZZORA_PGLITE_MODULE=file:///absolute/path/to/isolated/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const modulePath = process.env.AZZORA_PGLITE_MODULE;
if (!modulePath) throw Error("Set AZZORA_PGLITE_MODULE to the separately installed PGlite module; no automatic download.");
const { PGlite } = await import(modulePath);
const db = new PGlite();
let passed = 0;
const company = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const accountant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const manager = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const provider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const managerProvider = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const hash = "a".repeat(64);
async function check(name, test) {
  await test(); passed++; console.log(`PASS ${name}`);
}
async function asApi(user, token, query) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('azzora.session_token_hash',$2,true)", [user, token]);
    await db.exec("set local role azzora_api");
    return await db.query(query);
  } finally { await db.exec("rollback"); }
}
try {
  // Deliberate auth stand-ins: these do NOT prove Supabase token/session integration.
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid not null,aal text default 'aal2',not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  for (const name of (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter(name => name.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  await check("migration executes on local PostgreSQL", async () => {
    const rows = (await db.query("select tablename,rowsecurity from pg_tables where schemaname='azzora'")).rows;
    assert.ok(rows.length >= 19); assert.ok(rows.every(row => row.rowsecurity));
  });
  await check("anonymous/authenticated cannot use the private schema", async () => {
    const rows = (await db.query("select has_schema_privilege('anon','azzora','usage') a,has_schema_privilege('authenticated','azzora','usage') b")).rows;
    assert.deepEqual(rows, [{ a: false, b: false }]);
  });
  await check("API role cannot mutate company records directly", async () => {
    const rows = (await db.query("select has_table_privilege('azzora_api','azzora.records','insert,update,delete') allowed")).rows;
    assert.equal(rows[0].allowed, false);
  });
  await db.exec(`insert into auth.users values ('${accountant}'),('${manager}');
    insert into auth.sessions(id,user_id) values ('${provider}','${accountant}'),('${managerProvider}','${manager}');
    insert into azzora.companies(id,name) values ('${company}','Fictional A'),('${other}','Fictional B');
    insert into azzora.memberships values ('${company}','${accountant}','accountant',true,true),('${company}','${manager}','project_manager',true,false);
    insert into azzora.sessions(token_hash,user_id,provider_session_id,company_id,csrf_hash,expires_at,assurance)
      values ('${hash}','${accountant}','${provider}','${company}','${hash}',now()+interval '1 hour','aal2'),
      ('${"b".repeat(64)}','${manager}','${managerProvider}','${company}','${hash}',now()+interval '1 hour','aal1');
    insert into azzora.projects(company_id,id,payload) values ('${company}','assigned','{}'),('${company}','unassigned','{}');
    insert into azzora.project_assignments values ('${company}','assigned','${manager}',true);
    insert into azzora.records(company_id,entity_type,id,payload) values ('${company}','sales_invoice','inv-a','{}'),('${other}','sales_invoice','inv-b','{}');`);
  await check("finance reader sees only own company invoices", async () => {
    assert.deepEqual((await asApi(accountant, hash, "select id from azzora.records order by id")).rows, [{ id: "inv-a" }]);
  });
  await check("Manager cannot read Accountant invoice records", async () => {
    assert.equal((await asApi(manager, "b".repeat(64), "select * from azzora.records")).rows.length, 0);
  });
  await check("Manager sees only assigned projects", async () => {
    assert.deepEqual((await asApi(manager, "b".repeat(64), "select id from azzora.projects order by id")).rows, [{ id: "assigned" }]);
  });
  await check("wrong session token denies records", async () => {
    assert.equal((await asApi(accountant, "c".repeat(64), "select * from azzora.records")).rows.length, 0);
  });
  await check("revoked membership denies existing session", async () => {
    await db.exec(`update azzora.memberships set active=false where user_id='${accountant}'`);
    assert.equal((await asApi(accountant, hash, "select * from azzora.records")).rows.length, 0);
    await db.exec(`update azzora.memberships set active=true where user_id='${accountant}'`);
  });
  await check("revoked provider session denies existing app session", async () => {
    await db.exec(`delete from auth.sessions where id='${provider}'`);
    assert.equal((await asApi(accountant, hash, "select * from azzora.records")).rows.length, 0);
    await db.exec(`insert into auth.sessions(id,user_id) values ('${provider}','${accountant}')`);
  });
  await check("privileged stored aal1 session cannot read financial data", async () => {
    await db.exec(`update azzora.sessions set assurance='aal1' where user_id='${accountant}'`);
    assert.equal((await asApi(accountant, hash, "select * from azzora.records")).rows.length, 0);
    await db.exec(`update azzora.sessions set assurance='aal2' where user_id='${accountant}'`);
  });
  await check("issued snapshot rejects update and deletion", async () => {
    await db.exec(`insert into azzora.snapshots(company_id,entity_type,entity_id,revision,payload,sha256,captured_by)
      values ('${company}','sales_invoice','inv-a',1,'{}','${hash}','${accountant}')`);
    await assert.rejects(db.exec("update azzora.snapshots set payload='{}'"), /Immutable/);
    await assert.rejects(db.exec("delete from azzora.snapshots"), /Immutable/);
  });
  await check("source idempotency key is unique within company", async () => {
    const sql = `insert into azzora.command_receipts values ('${company}','request','${hash}','${accountant}','{}',now())`;
    await db.exec(sql); await assert.rejects(db.exec(sql), /duplicate key/);
  });
  await db.exec(`insert into azzora.accounting_periods values ('${company}','open','2026-01-01','2026-12-31',false),('${company}','locked','2025-01-01','2025-12-31',true);
    insert into azzora.accounts values ('${company}','cash','1000','Cash','Asset',true,true),('${company}','revenue','4000','Revenue','Income',true,true),('${company}','disabled','4999','Disabled','Income',false,false);`);
  const journalSql = (id, period = "open", date = "2026-11-04") => `insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,posting_date,period_id,memo,currency,actor_id)
    values ('${company}','${id}','${id}','sales_invoice','inv-a','${id}','${date}','${period}','Fictional local test','AED','${accountant}')`;
  const lineSql = (id, account = "revenue", amount = "100") => `insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils)
    values ('${company}','${id}',1,'cash',${amount},0),('${company}','${id}',2,'${account}',0,${amount})`;
  async function transactionFails(sql, pattern) {
    await db.exec("begin");
    try { await assert.rejects((async () => { await db.exec(sql); await db.exec("commit"); })(), pattern); }
    finally { await db.exec("rollback"); }
  }
  await check("balanced journal and lines commit atomically", async () => {
    await db.exec(`begin; ${journalSql("balanced")}; ${lineSql("balanced")}; commit;`);
    assert.equal((await db.query("select count(*)::int n from azzora.journals")).rows[0].n, 1);
  });
  await check("empty journal rolls back at commit", async () => {
    await transactionFails(journalSql("empty"), /balanced/);
    assert.equal((await db.query("select count(*)::int n from azzora.journals")).rows[0].n, 1);
  });
  await check("unbalanced journal rolls back at commit", async () => {
    await transactionFails(`${journalSql("unbalanced")}; insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils)
      values ('${company}','unbalanced',1,'cash',100,0),('${company}','unbalanced',2,'revenue',0,99)`, /balanced/);
  });
  await check("fractional fils are rejected without rounding", async () => {
    await transactionFails(`${journalSql("fractional")}; ${lineSql("fractional", "revenue", "1.5")}`, /check constraint/);
  });
  await check("locked periods reject new journals", async () => {
    await transactionFails(`${journalSql("locked", "locked", "2025-11-04")}; ${lineSql("locked")}`, /period/i);
  });
  await check("posting outside accounting period is rejected", async () => {
    await transactionFails(`${journalSql("wrong-date", "open", "2027-01-01")}; ${lineSql("wrong-date")}`, /period/i);
  });
  await check("inactive or nonpostable accounts reject journal lines", async () => {
    await transactionFails(`${journalSql("disabled")}; ${lineSql("disabled", "disabled")}`, /account/i);
  });
  await check("posted journal rejects later balanced line additions", async () => {
    await transactionFails(`insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils)
      values ('${company}','balanced',3,'cash',100,0),('${company}','balanced',4,'revenue',0,100)`, /Cannot append lines to an already committed journal/);
  });
  await check("posted journals and lines reject edits", async () => {
    await assert.rejects(db.exec("update azzora.journals set memo='changed'"), /Immutable/);
    await assert.rejects(db.exec("delete from azzora.journal_lines"), /Immutable/);
  });
  await check("relationships cannot reference another company's invoice", async () => {
    await assert.rejects(db.exec(`insert into azzora.snapshots(company_id,entity_type,entity_id,revision,payload,sha256,captured_by)
      values ('${company}','sales_invoice','inv-b',1,'{}','${hash}','${accountant}')`), /foreign key/);
  });
  await check("unscanned attachments remain inaccessible", async () => {
    await db.exec(`insert into azzora.attachments(company_id,id,entity_type,entity_id,object_key,mime,bytes,sha256)
      values ('${company}','scan-pending','sales_invoice','inv-a','${company}/original','image/png',100,'${hash}')`);
    assert.equal((await asApi(accountant, hash, "select * from azzora.attachments")).rows.length, 0);
  });
  console.log(JSON.stringify({ passed, failed: 0, scope: "local PostgreSQL with synthetic auth stand-ins; NOT hosted Supabase verification" }));
} finally { await db.close(); }
