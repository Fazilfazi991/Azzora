import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { freshRehearsalDatabase } from "../backend/launch-backup-rehearsal";

const migration = new URL("../../supabase/migrations/20261111133235_staging_owner_backup_provenance.sql", import.meta.url);
const rollback = new URL("../../docs/production/staging-owner-backup-rollback.sql", import.meta.url);

it("rejects the staging migration before CREATE on an isolated production-schema database", async () => {
  const { db } = await freshRehearsalDatabase("production");
  try {
    await expect(db.exec(await readFile(migration, "utf8"))).rejects.toThrow();
    await db.exec("rollback");
    const row = (await db.query<{present: boolean}>("select to_regprocedure('public.staging_owner_backup(text)') is not null present")).rows[0];
    expect(row.present).toBe(false);
  } finally { await db.close(); }
}, 30000);

it("refuses duplicate install and removes only the verified candidate RPC on isolated staging", async () => {
  const { db } = await freshRehearsalDatabase();
  try {
    const before = (await db.query<{n: number}>("select count(*)::int n from azzora.companies")).rows[0].n;
    await expect(db.exec(await readFile(migration, "utf8"))).rejects.toThrow();
    await db.exec("rollback");
    await db.exec("create role unexpected_backup_grantee; grant execute on function public.staging_owner_backup(text) to unexpected_backup_grantee");
    await expect(db.exec(await readFile(rollback, "utf8"))).rejects.toThrow(/unexpected function grant/);
    await db.exec("rollback");
    await db.exec("revoke execute on function public.staging_owner_backup(text) from unexpected_backup_grantee");
    await db.exec("alter function public.staging_owner_backup(text) set search_path=public");
    await expect(db.exec(await readFile(rollback, "utf8"))).rejects.toThrow(/security mode differs/);
    await db.exec("rollback");
    expect((await db.query<{present: boolean}>("select to_regprocedure('public.staging_owner_backup(text)') is not null present")).rows[0].present).toBe(true);
    await db.exec("alter function public.staging_owner_backup(text) set search_path=''");
    await db.exec(await readFile(rollback, "utf8"));
    expect((await db.query<{present: boolean}>("select to_regprocedure('public.staging_owner_backup(text)') is not null present")).rows[0].present).toBe(false);
    expect((await db.query<{n: number}>("select count(*)::int n from azzora.companies")).rows[0].n).toBe(before);
  } finally { await db.close(); }
}, 30000);
