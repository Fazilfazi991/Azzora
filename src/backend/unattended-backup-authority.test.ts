import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createIsolatedSqlBackupAuthority } from "./unattended-backup-authority";
import { createUnattendedBackupCandidate } from "./unattended-backup";
import { createHash, randomBytes } from "node:crypto";
import { createEmptyProductionCompany } from "../finance/production-policy";
import { emptyOperations } from "../operations/migration";
import { serializeCanonical } from "../staging/canonical";
import { decryptBusinessBackup } from "./launch-backup";
import { verifyProductionBusinessBackup } from "../staging/backup";

const companyId = "22222222-2222-4222-8222-222222222222";
const other = "55555555-5555-4555-8555-555555555555";
const grantId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const credentialHash = "a".repeat(64);
let db: PGlite;
const input = {
  companyId,
  grantId,
  requestId,
  credentialHash,
  now: "1990-01-01T00:00:00.000Z",
};

beforeEach(async () => {
  db = new PGlite();
  await db.exec(
    "create role azzora_backup_executor nologin; create role ordinary_user nologin;",
  );
  await db.exec(
    await readFile(
      "tests/fixtures/unattended-backup-authority.candidate.sql",
      "utf8",
    ),
  );
  await db.query(
    "insert into azzora_backup_candidate.grants(id,company_id,credential_hash,capability,expires_at) values ($1,$2,$3,'backup.capture',clock_timestamp()+interval '1 day')",
    [grantId, companyId, credentialHash],
  );
  await db.exec("set role azzora_backup_executor");
}, 30_000);
afterEach(async () => {
  await db.close();
}, 30_000);

it(
  "persists audited starts and terminal results; duplicate request IDs cannot run again",
  { timeout: 30_000 },
  async () => {
    const authority = createIsolatedSqlBackupAuthority(db);
    const race = await Promise.all([
      authority.begin(input),
      authority.begin(input),
    ]);
    expect(race.sort()).toEqual([false, true]);
    expect(await authority.finish({ ...input, outcome: "success" })).toBe(true);
    expect(await authority.finish({ ...input, outcome: "success" })).toBe(
      false,
    );
    expect(await authority.begin(input)).toBe(false);
    await db.exec("reset role");
    const audit = await db.query<{ event: string }>(
      "select event from azzora_backup_candidate.audit order by id",
    );
    expect(audit.rows.map((x) => x.event)).toEqual(["start", "success"]);
  },
);

it(
  "prevents foreign scope, invalid secret, expired grants and request-time clock spoofing",
  { timeout: 30_000 },
  async () => {
    const authority = createIsolatedSqlBackupAuthority(db);
    expect(await authority.begin({ ...input, companyId: other })).toBe(false);
    expect(
      await authority.begin({ ...input, credentialHash: "b".repeat(64) }),
    ).toBe(false);
    await db.exec("reset role");
    await db.query(
      "update azzora_backup_candidate.grants set expires_at=clock_timestamp()-interval '1 second' where id=$1",
      [grantId],
    );
    await db.exec("set role azzora_backup_executor");
    expect(await authority.begin(input)).toBe(false);
  },
);

it(
  "withholds output and durably audits denial after revocation during capture",
  { timeout: 30_000 },
  async () => {
    const authority = createIsolatedSqlBackupAuthority(db);
    expect(await authority.begin(input)).toBe(true);
    await db.exec("reset role");
    await db.query(
      "update azzora_backup_candidate.grants set revoked_at=clock_timestamp() where id=$1",
      [grantId],
    );
    await db.exec("set role azzora_backup_executor");
    expect(await authority.finish({ ...input, outcome: "success" })).toBe(
      false,
    );
    await db.exec("reset role");
    const audit = await db.query<{ event: string }>(
      "select event from azzora_backup_candidate.audit order by id",
    );
    expect(audit.rows.map((x) => x.event)).toEqual(["start", "denied"]);
  },
);

it(
  "denies raw table access and denies procedure execution to ordinary users",
  { timeout: 30_000 },
  async () => {
    await expect(
      db.query("select * from azzora_backup_candidate.grants"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.query("update azzora_backup_candidate.grants set revoked_at=null"),
    ).rejects.toThrow(/permission denied/i);
    await db.exec("reset role; set role ordinary_user");
    await expect(
      db.query("select azzora_backup_candidate.begin_capture($1,$2,$3,$4)", [
        companyId,
        grantId,
        requestId,
        credentialHash,
      ]),
    ).rejects.toThrow(/permission denied/i);
  },
);

it(
  "rolls back reservation when start audit cannot be written",
  { timeout: 30_000 },
  async () => {
    await db.exec(
      "reset role; create function azzora_backup_candidate.fail_audit() returns trigger language plpgsql as $$ begin raise exception 'test audit failure'; end $$; create trigger fail_audit before insert on azzora_backup_candidate.audit for each row execute function azzora_backup_candidate.fail_audit(); set role azzora_backup_executor;",
    );
    await expect(
      createIsolatedSqlBackupAuthority(db).begin(input),
    ).rejects.toThrow();
    await db.exec("reset role");
    const rows = await db.query<{ count: number }>(
      "select count(*)::int as count from azzora_backup_candidate.runs",
    );
    expect(rows.rows[0].count).toBe(0);
  },
);

it(
  "connects real isolated SQL authorization to an encrypted fictional capture",
  { timeout: 30_000 },
  async () => {
    const credential = randomBytes(32).toString("base64url"),
      key = randomBytes(32);
    const digest = createHash("sha256")
      .update(Buffer.from(credential, "base64url"))
      .digest("hex");
    await db.exec("reset role");
    await db.query(
      "update azzora_backup_candidate.grants set credential_hash=$2 where id=$1",
      [grantId, digest],
    );
    await db.exec("set role azzora_backup_executor");
    const data = serializeCanonical(
      createEmptyProductionCompany({ settings: emptyOperations().settings }),
    );
    const result = await createUnattendedBackupCandidate(
      { companyId, grantId, requestId, credential },
      {
        authority: createIsolatedSqlBackupAuthority(db),
        readSnapshot: async () => ({ companyId, version: 1, data }),
        readOriginal: async () => new Uint8Array(),
        backupKey: key,
        keyId: "QA-ONLY",
        now: () => new Date(),
      },
    );
    const restored = JSON.parse(
      Buffer.from(
        decryptBusinessBackup(result, key, { companyId, keyId: "QA-ONLY" }),
      ).toString(),
    );
    expect(verifyProductionBusinessBackup(restored).companyId).toBe(companyId);
    await db.exec("reset role");
    const audit = await db.query<{ event: string }>(
      "select event from azzora_backup_candidate.audit order by id",
    );
    expect(audit.rows.map((x) => x.event)).toEqual(["start", "success"]);
  },
);

it("retains audit and duplicate protection after a database restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "azzora-backup-synthetic-"));
  let persistent = new PGlite(directory);
  try {
    await persistent.exec("create role azzora_backup_executor nologin;");
    await persistent.exec(
      await readFile(
        "tests/fixtures/unattended-backup-authority.candidate.sql",
        "utf8",
      ),
    );
    await persistent.query(
      "insert into azzora_backup_candidate.grants(id,company_id,credential_hash,capability,expires_at) values ($1,$2,$3,'backup.capture',clock_timestamp()+interval '1 day')",
      [grantId, companyId, credentialHash],
    );
    await persistent.exec("set role azzora_backup_executor");
    expect(
      await createIsolatedSqlBackupAuthority(persistent).begin(input),
    ).toBe(true);
    await persistent.close();
    persistent = new PGlite(directory);
    await persistent.exec("set role azzora_backup_executor");
    expect(
      await createIsolatedSqlBackupAuthority(persistent).begin(input),
    ).toBe(false);
    expect(
      await createIsolatedSqlBackupAuthority(persistent).finish({
        ...input,
        outcome: "failure",
      }),
    ).toBe(false);
    await persistent.exec("reset role");
    const audit = await persistent.query<{ event: string }>(
      "select event from azzora_backup_candidate.audit order by id",
    );
    expect(audit.rows.map((x) => x.event)).toEqual(["start", "failure"]);
  } finally {
    await persistent.close();
  }
}, 30_000);
