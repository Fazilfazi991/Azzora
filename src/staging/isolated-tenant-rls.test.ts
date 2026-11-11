import { expect, it } from "vitest";
import { freshRehearsalDatabase } from "../backend/launch-backup-rehearsal";

it("enforces company, finance and assignment RLS using real restricted role in isolated PGlite", async () => {
  const { db } = await freshRehearsalDatabase();
  const companies = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  const roles = ["owner_admin", "project_manager", "accountant", "site_staff"];
  try {
    // This setup is restricted to the newly created local in-memory DB. No
    // hosted users, sessions, grants or records are altered.
    await db.query("insert into azzora.companies(id,name,data_mode) values($1,'Fictional B','fictional-staging')", [companies[1]]);
    for (const [i, company] of companies.entries()) {
      await db.query("insert into azzora.parties(company_id,id,kind,payload) values($1,$2,'customer','{}')", [company, `party-${i}`]);
      await db.query("insert into azzora.projects(company_id,id,customer_id,payload) values($1,$2,$3,'{}')", [company, `project-${i}`, `party-${i}`]);
      await db.query("insert into azzora.records(company_id,entity_type,id,project_id,payload,status) values($1,'sales_invoice',$2,$3,'{}','draft'),($1,'task',$4,$3,'{}','draft')", [company, `invoice-${i}`, `project-${i}`, `task-${i}`]);
      await db.query("insert into azzora.accounts(company_id,id,code,name,type) values($1,$2,$3,'Fictional','Asset')", [company, `account-${i}`, `10${i}`]);
      for (const [j, role] of roles.entries()) {
        const user = `0000000${i + 1}-0000-4000-8000-00000000000${j + 1}`;
        const provider = `1000000${i + 1}-0000-4000-8000-00000000000${j + 1}`;
        const hash = `${i}${j}`.repeat(32), assurance = [0, 2].includes(j) ? "aal2" : "aal1";
        await db.query("insert into auth.users(id,email) values($1,$2)", [user, `fixture-${i}-${j}@example.invalid`]);
        await db.query("insert into auth.sessions(id,user_id,aal,not_after) values($1,$2,$3,now()+interval '1 day')", [provider, user, assurance]);
        await db.query("insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,$2,$3,true,$4,ARRAY['manager'],ARRAY[]::text[])", [company, user, role, [0, 2].includes(j)]);
        await db.query("insert into azzora.sessions(token_hash,user_id,provider_session_id,company_id,csrf_hash,expires_at,assurance,workspace) values($1,$2,$3,$4,$5,now()+interval '1 hour',$6,'manager')", [hash,user,provider,company,"f".repeat(64),assurance]);
        if ([1,3].includes(j)) await db.query("insert into azzora.project_assignments(company_id,user_id,project_id,active) values($1,$2,$3,true)", [company,user,`project-${i}`]);
      }
    }
    for (const [i] of companies.entries()) for (const [j] of roles.entries()) {
      const user = `0000000${i + 1}-0000-4000-8000-00000000000${j + 1}`, hash = `${i}${j}`.repeat(32);
      await db.exec("begin");
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('azzora.session_token_hash',$2,true)", [user,hash]);
        await db.exec("set local role azzora_api");
        const records=(await db.query<{id:string}>("select id from azzora.records order by id")).rows.map(x=>x.id);
        const parties=(await db.query<{id:string}>("select id from azzora.parties order by id")).rows.map(x=>x.id);
        const accounts=(await db.query<{id:string}>("select id from azzora.accounts order by id")).rows.map(x=>x.id);
        expect(records.includes(`invoice-${1-i}`)).toBe(false);
        expect(records.includes(`task-${1-i}`)).toBe(false);
        expect(records.includes(`invoice-${i}`)).toBe([0,2].includes(j));
        expect(records.includes(`task-${i}`)).toBe([0,1,3].includes(j));
        expect(parties.includes(`party-${1-i}`)).toBe(false);
        expect(parties.includes(`party-${i}`)).toBe([0,2].includes(j));
        expect(accounts.includes(`account-${1-i}`)).toBe(false);
        expect(accounts.includes(`account-${i}`)).toBe([0,2].includes(j));
        await expect(db.query("insert into azzora.parties(company_id,id,kind,payload) values($1,'forbidden','customer','{}')",[companies[i]])).rejects.toThrow(/permission denied/i);
      } finally { await db.exec("rollback"); }
    }
  } finally { await db.close(); }
}, 60_000);
