import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("reuses one immutable production journal projection without changing denial, replay, or rollback", async () => {
  const db = new PGlite();
  const company = "22222222-2222-4222-8222-222222222222";
  const owner = "33333333-3333-4333-8333-333333333333";
  const provider = "99999999-9999-4999-8999-999999999999";
  const token = "a".repeat(64);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
      create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);
      create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for (const file of [
      "../../supabase/migrations/20261104081228_canonical_backend_foundation.sql",
      "../../supabase/production-migrations/20261111090000_runtime_identity.sql",
    ])
      await db.exec(await readFile(new URL(file, import.meta.url), "utf8"));
    await db.query(
      "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'qa-owner@example.invalid','{\"azzora_scope\":\"production\"}',now())",
      [owner],
    );
    await db.query(
      "insert into azzora.companies(id,name) values($1,'SYNTHETIC QA ONLY')",
      [company],
    );
    await db.exec(
      "insert into storage.buckets values('azzora-private','azzora-private',false,2097152,array['application/pdf','image/png','image/jpeg'])",
    );
    await db.query(
      "insert into azzora.production_environment(company_id,project_ref,region,vercel_project_id,configuration_approval_id,allowed_origins,storage_bucket,approved_by,approval_evidence_sha256,approved_at) values($1,'zwjiztnsxenluqybxhhz','ap-southeast-1','prj_QAonly','QA-ONLY',array['https://candidate-qa.invalid'],'azzora-private',$2,$3,now())",
      [company, owner, "d".repeat(64)],
    );
    await db.query(
      "insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,$2,'owner_admin',true,true,array['manager','accountant'],array['project.read','project.write','finance.read','finance.draft','access.manage'])",
      [company, owner],
    );
    await db.query(
      "insert into auth.sessions values($1,$2,'aal2',now()+interval '1 hour')",
      [provider, owner],
    );
    await db.query(
      "insert into auth.mfa_factors values('88888888-8888-4888-8888-888888888888',$1,'verified','totp')",
      [owner],
    );
    await db.query(
      "select public.azzora_production_auth_session_put($1,$2,$3,$4,$5,'manager','aal2','encrypted-QA-only')",
      [token, "b".repeat(64), owner, provider, company],
    );
    // Seed an isolated synthetic pre-existing history; production posting stays disabled.
    await db.exec(`begin;
      insert into azzora.records(company_id,entity_type,id,payload,status) values('${company}','workspace_metadata','__production_metadata','{"metadata":{"mode":"production","version":1}}','current');
      insert into azzora.records(company_id,entity_type,id,payload,status) select '${company}','cash_account','source-'||n,'{}','draft' from generate_series(1,72) n;
      insert into azzora.records(company_id,entity_type,id,payload,status) select '${company}','task','task-'||n,'{}','draft' from generate_series(1,825) n;
      insert into azzora.accounting_periods values('${company}','period','2026-01-01','2026-12-31',false);
      insert into azzora.accounts(company_id,id,code,name,type,postable,active) values('${company}','cash','1000','Cash','Asset',true,true),('${company}','equity','3000','Equity','Equity',true,true);
      insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,posting_date,period_id,memo,currency,actor_id,domain_source) select '${company}','journal-'||n,'posting-'||n,'cash_account','source-'||n,'opening','2026-01-01','period','QA','AED','${owner}','{}' from generate_series(1,72) n;
      insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils,domain_dimensions) select '${company}','journal-'||n,1,'cash',100,0,'{}' from generate_series(1,72) n;
      insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils,domain_dimensions) select '${company}','journal-'||n,2,'equity',0,100,'{}' from generate_series(1,72) n;
      update azzora.companies set version=1 where id='${company}'; commit;`);
    const definition = String(
      (
        await db.query<{ def: string }>(
          "select pg_get_functiondef('public.azzora_production_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure) def",
        )
      ).rows[0].def,
    ).replace(/\r\n/g, "\n");
    const cache =
      "  -- The company row remains locked for the whole transaction. Reuse its\n  -- authoritative journal projection until this transaction inserts a journal.\n  if cached_journals is null then\n   cached_journals:=azzora.production_canonical_data(c)->'journals';\n  end if;\n  select value into old_j from jsonb_array_elements(cached_journals) where value->>'id'=j->>'id';";
    expect(definition).toContain(cache);
    const baseline = definition.replace(
      cache,
      "  select value into old_j from jsonb_array_elements(azzora.production_canonical_data(c)->'journals') where value->>'id'=j->>'id';",
    );
    await db.exec(`alter function azzora.production_canonical_data(uuid) rename to production_canonical_data_original;
      create sequence public.qa_projection_counter;
      create function azzora.production_canonical_data(p_company uuid) returns jsonb language plpgsql volatile set search_path='' as $$begin perform nextval('public.qa_projection_counter'); return azzora.production_canonical_data_original(p_company); end$$;`);
    const data = (
      await db.query<{
        data: { journals: Array<{ memo: string }>; records: unknown[] };
      }>("select azzora.production_canonical_data_original($1) data", [company])
    ).rows[0].data;
    const call = async (
      version: number,
      key: string,
      payload: unknown,
      financial = false,
    ) =>
      (
        await db.query<{ result: unknown }>(
          "select public.azzora_production_company_commit($1,$2,$3,$4,'customer.save',$5::jsonb,$6::jsonb,false) result",
          [
            token,
            version,
            key,
            "c".repeat(64),
            JSON.stringify({ workspace: "manager", financial }),
            JSON.stringify(payload),
          ],
        )
      ).rows[0].result;
    await db.exec(baseline);
    await db.exec("select setval('public.qa_projection_counter',1,false)");
    const startBaseline = performance.now();
    await call(1, "qa-baseline-0000001", data);
    const baselineMs = performance.now() - startBaseline;
    const baselineCalls = Number(
      (
        await db.query<{ last_value: number }>(
          "select last_value from public.qa_projection_counter",
        )
      ).rows[0].last_value,
    );
    await db.exec(definition);
    await db.exec("select setval('public.qa_projection_counter',1,false)");
    const startOptimized = performance.now();
    expect(await call(2, "qa-optimized-000001", data)).toEqual({
      version: 3,
      replayed: false,
    });
    const optimizedMs = performance.now() - startOptimized;
    const optimizedCalls = Number(
      (
        await db.query<{ last_value: number }>(
          "select last_value from public.qa_projection_counter",
        )
      ).rows[0].last_value,
    );
    expect(baselineCalls).toBeGreaterThanOrEqual(72);
    expect(optimizedCalls).toBe(1);
    expect(await call(2, "qa-optimized-000001", data)).toEqual({
      version: 3,
      replayed: true,
    });
    const tampered = structuredClone(data);
    tampered.journals[0].memo = "tampered";
    await expect(call(3, "qa-tampered-0000001", tampered)).rejects.toThrow(
      /Immutable journal changed/,
    );
    const missing = structuredClone(data);
    missing.journals.pop();
    await expect(call(3, "qa-missing-00000001", missing)).rejects.toThrow(
      /Journal history cannot be discarded/,
    );
    await expect(call(3, "qa-financial-000001", data, true)).rejects.toThrow(
      /Approved accounting policy/,
    );
    expect(
      (
        await db.query<{ version: number }>(
          "select version::int version from azzora.companies where id=$1",
          [company],
        )
      ).rows[0].version,
    ).toBe(3);
    expect(
      (
        await db.query<{ data: unknown }>(
          "select azzora.production_canonical_data_original($1) data",
          [company],
        )
      ).rows[0].data,
    ).toEqual(data);
    process.stdout.write(
      JSON.stringify({
        synthetic: true,
        records: data.records.length,
        journals: data.journals.length,
        baselineCalls,
        optimizedCalls,
        baselineMs: Math.round(baselineMs),
        optimizedMs: Math.round(optimizedMs),
      }) + "\n",
    );
  } finally {
    await db.close();
  }
}, 180_000);
