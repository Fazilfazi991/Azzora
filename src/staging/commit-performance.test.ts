import { expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createSharedCompanyState } from "./domain";
import { serializeCanonical } from "./canonical";

it("keeps immutable journals and idempotency while avoiding one full workspace reconstruction per journal", async () => {
  const db = new PGlite();
  const company = "11111111-1111-4111-8111-111111111111";
  const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const provider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const hash = "a".repeat(64);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
      create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);
      create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const files = (
      await readdir(new URL("../../supabase/migrations/", import.meta.url))
    )
      .filter((n) => n.endsWith(".sql"))
      .sort();
    const optimization = files.find((n) =>
      n.endsWith("_optimize_staging_immutable_journals.sql"),
    );
    expect(optimization).toBeDefined();
    for (const name of files.filter((n) => n !== optimization))
      await db.exec(
        await readFile(
          new URL(`../../supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    await db.query<Record<string, unknown>>(
      "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'owner@staging.azzora.test','{\"azzora_scope\":\"fictional-staging\"}',now())",
      [owner],
    );
    await db.query<Record<string, unknown>>(
      "insert into auth.sessions values($1,$2,'aal2',now()+interval '1 day')",
      [provider, owner],
    );
    await db.query<Record<string, unknown>>(
      "insert into auth.mfa_factors values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',$1,'verified','totp')",
      [owner],
    );
    await db.query<Record<string, unknown>>(
      "select public.staging_auth_fixture_membership($1,$2,'owner_admin')",
      [owner, company],
    );
    await db.query<Record<string, unknown>>(
      "select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal2','encrypted-unit-fixture')",
      [hash, "b".repeat(64), owner, provider, company],
    );
    const data = serializeCanonical(
      createSharedCompanyState([
        {
          id: owner,
          name: "Fictional Owner",
          role: "Project Manager",
          email: "owner@staging.azzora.test",
          phone: "",
          capacity: 100,
          status: "Active",
        },
      ]),
    );
    const opening = structuredClone(data.journals[0]);
    for (let i = 0; i < 71; i++) {
      const id = `synthetic-source-${i}`;
      data.records.push({
        entity_type: "cash_account",
        id,
        project_id: null,
        party_id: null,
        department_id: null,
        payload: {},
        status: "draft",
      });
      data.journals.push({
        ...structuredClone(opening),
        id: `synthetic-journal-${i}`,
        posting_key: `synthetic-posting-${i}`,
        source_id: id,
      });
    }
    for (let i = 0; i < 825; i++)
      data.records.push({
        entity_type: "task",
        id: `synthetic-task-${i}`,
        project_id: null,
        party_id: null,
        department_id: null,
        payload: {},
        status: "draft",
      });
    for (let i = 0; i < 32; i++)
      data.snapshots.push({
        entity_type: "task",
        entity_id: `synthetic-task-${i}`,
        revision: 1,
        payload: { fixture: i },
        sha256: "a".repeat(64),
      });
    const commit = async (
      version: number,
      key: string,
      canonical: unknown,
      bootstrap = false,
      financial = false,
    ) =>
      (
        await db.query<Record<string, unknown>>(
          "select public.staging_company_commit($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) result",
          [
            hash,
            version,
            key,
            "b".repeat(64),
            bootstrap ? "fixture.initialize" : "customer.save",
            JSON.stringify({ workspace: "manager", financial }),
            JSON.stringify(canonical),
            bootstrap,
          ],
        )
      ).rows[0].result;
    await commit(0, "benchmark-initialize-01", data, true);
    // Test-only counter wraps the original projection without changing its output.
    await db.exec(`alter function azzora.staging_canonical_data(uuid) rename to staging_canonical_data_original;
      create sequence public.projection_counter;
      create function azzora.staging_canonical_data(p_company uuid) returns jsonb language plpgsql volatile set search_path='' as $$begin perform nextval('public.projection_counter'); return azzora.staging_canonical_data_original(p_company); end$$;`);
    const current = (
      await db.query<Record<string, unknown>>(
        "select azzora.staging_canonical_data_original($1) data",
        [company],
      )
    ).rows[0].data as typeof data;
    await db.exec("select setval('public.projection_counter',1,false)");
    const before = performance.now();
    await commit(1, "benchmark-before-00001", current);
    const beforeMs = performance.now() - before;
    const baselineCalls = Number(
      (
        await db.query<Record<string, unknown>>(
          "select last_value from public.projection_counter",
        )
      ).rows[0].last_value,
    );
    const duplicateNew = structuredClone(current);
    duplicateNew.records.push({
      entity_type: "cash_account",
      id: "duplicate-test-source",
      project_id: null,
      party_id: null,
      department_id: null,
      payload: {},
      status: "draft",
    });
    duplicateNew.records.push({
      entity_type: "cash_account",
      id: "second-test-source",
      project_id: null,
      party_id: null,
      department_id: null,
      payload: {},
      status: "draft",
    });
    const newJournal = {
      ...structuredClone(current.journals[0]),
      id: "duplicate-test-journal",
      posting_key: "duplicate-test-posting",
      source_id: "duplicate-test-source",
    };
    const secondJournal = {
      ...structuredClone(current.journals[0]),
      id: "second-test-journal",
      posting_key: "second-test-posting",
      source_id: "second-test-source",
    };
    duplicateNew.journals.push(
      newJournal,
      structuredClone(newJournal),
      secondJournal,
    );
    const changedDuplicate = structuredClone(duplicateNew);
    changedDuplicate.journals[changedDuplicate.journals.length - 2].memo =
      "changed duplicate";
    // Establish the old function's behavior for duplicate new IDs, then roll back
    // the whole synthetic transaction before installing the optimization.
    await db.exec("begin");
    let duplicateBaseline: unknown;
    try {
      duplicateBaseline = await commit(
        2,
        "duplicate-baseline-001",
        duplicateNew,
        false,
        true,
      );
    } finally {
      await db.exec("rollback");
    }
    await db.exec("begin");
    try {
      await expect(
        commit(2, "duplicate-changed-old01", changedDuplicate, false, true),
      ).rejects.toThrow("Immutable journal changed");
    } finally {
      await db.exec("rollback");
    }
    const identityBefore = (
      await db.query<Record<string, unknown>>(
        "select prosecdef,proconfig,proacl::text,proowner from pg_proc where oid='public.staging_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure",
      )
    ).rows[0];
    const definitionBefore = (
      await db.query<Record<string, unknown>>(
        "select pg_get_functiondef('public.staging_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure) definition",
      )
    ).rows[0].definition;
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${optimization}`, import.meta.url),
        "utf8",
      ),
    );
    const identityAfter = (
      await db.query<Record<string, unknown>>(
        "select prosecdef,proconfig,proacl::text,proowner from pg_proc where oid='public.staging_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure",
      )
    ).rows[0];
    expect(identityAfter).toEqual(identityBefore);
    await db.exec("select setval('public.projection_counter',1,false)");
    const after = performance.now();
    const result = await commit(2, "benchmark-after-000001", current);
    const afterMs = performance.now() - after;
    const optimizedCalls = Number(
      (
        await db.query<Record<string, unknown>>(
          "select last_value from public.projection_counter",
        )
      ).rows[0].last_value,
    );
    expect(baselineCalls).toBeGreaterThanOrEqual(72);
    expect(optimizedCalls).toBeLessThanOrEqual(2);
    expect(result).toEqual({ version: 3, replayed: false });
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select azzora.staging_canonical_data_original($1) data",
          [company],
        )
      ).rows[0].data,
    ).toEqual(current);
    expect(await commit(2, "benchmark-after-000001", current)).toEqual({
      version: 3,
      replayed: true,
    });
    expect(duplicateBaseline).toEqual({ version: 3, replayed: false });
    await expect(
      commit(3, "duplicate-changed-new01", changedDuplicate, false, true),
    ).rejects.toThrow("Immutable journal changed");
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select version::int version from azzora.companies where id=$1",
          [company],
        )
      ).rows[0].version,
    ).toBe(3);
    expect(
      await commit(3, "duplicate-optimized-01", duplicateNew, false, true),
    ).toEqual({ version: 4, replayed: false });
    expect(
      Number(
        (
          await db.query<Record<string, unknown>>(
            "select count(*) from azzora.journals where company_id=$1 and id in ('duplicate-test-journal','second-test-journal')",
            [company],
          )
        ).rows[0].count,
      ),
    ).toBe(2);
    const tampered = structuredClone(current);
    tampered.journals[0].memo = "tampered";
    // Use the refreshed full canonical snapshot to include the new journal.
    const complete = (
      await db.query<Record<string, unknown>>(
        "select azzora.staging_canonical_data_original($1) data",
        [company],
      )
    ).rows[0].data as typeof data;
    tampered.records = complete.records;
    tampered.journals = structuredClone(complete.journals);
    tampered.journals[0].memo = "tampered";
    await expect(commit(4, "benchmark-tampered-001", tampered)).rejects.toThrow(
      "Immutable journal changed",
    );
    const removed = structuredClone(complete);
    removed.journals.pop();
    await expect(commit(4, "benchmark-removed-0001", removed)).rejects.toThrow(
      "Journal history cannot be discarded",
    );
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select version::int version from azzora.companies where id=$1",
          [company],
        )
      ).rows[0].version,
    ).toBe(4);
    await expect(
      db.exec(
        await readFile(
          new URL(`../../supabase/migrations/${optimization}`, import.meta.url),
          "utf8",
        ),
      ),
    ).rejects.toThrow("Reviewed staging commit markers changed");
    await db.exec("rollback");
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/rollbacks/rollback_20261111065734.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select pg_get_functiondef('public.staging_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure) definition",
        )
      ).rows[0].definition,
    ).toBe(definitionBefore);
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select prosecdef,proconfig,proacl::text,proowner from pg_proc where oid='public.staging_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure",
        )
      ).rows[0],
    ).toEqual(identityBefore);
    await expect(
      db.exec(
        await readFile(
          new URL(
            "../../supabase/rollbacks/rollback_20261111065734.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    ).rejects.toThrow("Reviewed optimized staging commit markers changed");
    await db.exec("rollback");
    process.stdout.write(
      JSON.stringify({
        synthetic: true,
        recordCount: data.records.length,
        journalCount: data.journals.length,
        snapshotCount: data.snapshots.length,
        baselineCalls,
        optimizedCalls,
        beforeMs: Math.round(beforeMs),
        afterMs: Math.round(afterMs),
      }) + "\n",
    );
  } finally {
    await db.close();
  }
}, 180_000);
