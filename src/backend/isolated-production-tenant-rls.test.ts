import { expect, it } from "vitest";
import { freshRehearsalDatabase } from "../backend/launch-backup-rehearsal";

it("enforces company, finance and assignment RLS using production migration policies and restricted role in isolated PGlite", async () => {
  const { db } = await freshRehearsalDatabase("production");
  const companies = ["33333333-3333-4333-8333-333333333333", "22222222-2222-4222-8222-222222222222"];
  const roles = ["owner_admin", "project_manager", "accountant", "site_staff"];
  try {
    // This setup is restricted to the newly created local in-memory DB. No
    // hosted users, sessions, grants or records are altered.
    await db.query("insert into azzora.companies(id,name,data_mode) values($1,'Fictional A','production'),($2,'Fictional B','production')", companies);
    for (const [i, company] of companies.entries()) {
      await db.query("insert into azzora.parties(company_id,id,kind,payload) values($1,$2,'customer','{}')", [company, `party-${i}`]);
      await db.query("insert into azzora.projects(company_id,id,customer_id,payload) values($1,$2,$3,'{}')", [company, `project-${i}`, `party-${i}`]);
      await db.query("insert into azzora.records(company_id,entity_type,id,project_id,payload,status) values($1,'sales_invoice',$2,$3,'{}','draft'),($1,'task',$4,$3,'{}','draft'),($1,'expense',$5,$3,'{}','draft'),($1,'receipt',$6,$3,'{}','draft'),($1,'supplier_payment',$7,$3,'{}','draft')", [company, `invoice-${i}`, `project-${i}`, `task-${i}`, `expense-${i}`, `receipt-${i}`, `payment-${i}`]);
      await db.query("insert into azzora.accounts(company_id,id,code,name,type,active,postable) values($1,$2,$3,'Fictional','Asset',true,true),($1,$4,$5,'Fictional Revenue','Income',true,true)", [company, `account-${i}`, `10${i}`, `income-${i}`, `40${i}`]);
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
      await db.query("insert into azzora.accounting_periods(company_id,id,start_date,end_date,locked) values($1,$2,'2026-01-01','2026-12-31',false)",[company,`period-${i}`]);
      await db.exec("begin");
      await db.query("insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,posting_date,period_id,memo,currency,actor_id) values($1,$2,$2,'sales_invoice',$3,'issued','2026-11-11',$4,'fictional','AED',$5)",[company,`journal-${i}`,`invoice-${i}`,`period-${i}`,`0000000${i + 1}-0000-4000-8000-000000000001`]);
      await db.query("insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils) values($1,$2,1,$3,100,0),($1,$2,2,$4,0,100)",[company,`journal-${i}`,`account-${i}`,`income-${i}`]);
      await db.exec("commit");
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
        const journals=(await db.query<{id:string}>("select id from azzora.journals order by id")).rows.map(x=>x.id);
        expect(records.includes(`invoice-${1-i}`)).toBe(false);
        expect(records.includes(`task-${1-i}`)).toBe(false);
        expect(records.includes(`invoice-${i}`)).toBe([0,2].includes(j));
        for(const kind of ["expense","receipt","payment"]) {
          expect(records.includes(`${kind}-${1-i}`)).toBe(false);
          expect(records.includes(`${kind}-${i}`)).toBe([0,2].includes(j));
        }
        expect(records.includes(`task-${i}`)).toBe([0,1,3].includes(j));
        expect(parties.includes(`party-${1-i}`)).toBe(false);
        expect(parties.includes(`party-${i}`)).toBe([0,2].includes(j));
        expect(accounts.includes(`account-${1-i}`)).toBe(false);
        expect(accounts.includes(`account-${i}`)).toBe([0,2].includes(j));
        expect(journals.includes(`journal-${1-i}`)).toBe(false);
        expect(journals.includes(`journal-${i}`)).toBe([0,2].includes(j));
        for(const sql of ["insert into azzora.parties(company_id,id,kind,payload) values($1,'forbidden','customer','{}')", "update azzora.parties set payload='{}' where company_id=$1", "delete from azzora.parties where company_id=$1"]) {
          await db.exec("savepoint attempted_write");
          await expect(db.query(sql,[companies[i]])).rejects.toThrow(/permission denied/i);
          await db.exec("rollback to savepoint attempted_write");
        }
      } finally { await db.exec("rollback"); }
      expect((await db.query<{n:number}>("select count(*)::int n from azzora.parties where company_id=$1",[companies[i]])).rows[0].n).toBe(1);
    }
  } finally { await db.close(); }
}, 60_000);
