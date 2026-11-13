import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { freshRehearsalDatabase } from "./launch-backup-rehearsal.js";
import {
  assertProductionIdentity,
  productionRuntime,
} from "./runtime-production.js";

const company = "fc525d78-bc83-4845-96f1-fb402bb07465";
const oldOrigin = "https://azzora-accounts-live.vercel.app",
  newOrigin = "https://azzoracrm.vercel.app";
const prefix = "../../supabase/production-migrations/";
const migrationPath = prefix + "20261113174923_production_crm_hostname.sql";
async function fixture() {
  const { db } = await freshRehearsalDatabase("production");
  await db.exec(`insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values
  ('86d914dd-1f39-4860-87d0-b671dd39eb00','info@azzora.ae','{"azzora_scope":"production"}',now()),
  ('c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3','accounts@azzora.ae','{"azzora_scope":"production"}',now())`);
  for (const file of [
    "20261113161658_production_initial_company_configuration.sql",
    "20261113161711_production_initial_password_policy.sql",
  ])
    await db.exec(
      await readFile(new URL(prefix + file, import.meta.url), "utf8"),
    );
  return db;
}
const runtime = () =>
  productionRuntime({
    AZZORA_DEPLOYMENT_MODE: "production-candidate",
    AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL:
      "owner-production-hostname-20261113",
    AZZORA_PRODUCTION_SUPABASE_PROJECT_REF: "zwjiztnsxenluqybxhhz",
    AZZORA_PRODUCTION_SUPABASE_URL: "https://zwjiztnsxenluqybxhhz.supabase.co",
    AZZORA_PRODUCTION_COMPANY_ID: company,
    AZZORA_PRODUCTION_DATABASE_REGION: "ap-southeast-1",
    AZZORA_PRODUCTION_VERCEL_PROJECT_ID: "prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV",
    AZZORA_PRODUCTION_PUBLISHABLE_KEY: "sb_publishable_hostname-fixture",
    AZZORA_PRODUCTION_SERVICE_KEY: "sb_secret_hostname-fixture",
    AZZORA_PRODUCTION_AUTH_KEY: Buffer.alloc(32, 9).toString("base64url"),
    AZZORA_PRODUCTION_ALLOWED_ORIGINS: `${oldOrigin},${newOrigin}`,
    AZZORA_PRODUCTION_FINANCIAL_POSTING: "false",
    AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING: "false",
  });
it("adds only the approved hostname with an immutable audit receipt, exact runtime proof, unchanged authority and idempotent replay", async () => {
  const db = await fixture();
  try {
    const sql = await readFile(new URL(migrationPath, import.meta.url), "utf8");
    const manifest = JSON.parse(
      await readFile(
        new URL(prefix + "production-hostname-manifest.json", import.meta.url),
        "utf8",
      ),
    );
    expect(
      createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex"),
    ).toBe(manifest.files[0].sha256);
    const before = (
      await db.query<{ value: Record<string, unknown> }>(
        "select to_jsonb(e) value from azzora.production_environment e",
      )
    ).rows[0].value;
    const grantBefore = (
      await db.query<{ value: unknown }>(
        "select public.azzora_production_auth_grant('86d914dd-1f39-4860-87d0-b671dd39eb00') value",
      )
    ).rows[0].value;
    await db.exec(sql);
    const after = (
      await db.query<{ value: Record<string, unknown> }>(
        "select to_jsonb(e) value from azzora.production_environment e",
      )
    ).rows[0].value;
    for (const field of Object.keys(before).filter(
      (k) =>
        ![
          "allowed_origins",
          "configuration_approval_id",
          "approval_evidence_sha256",
          "approved_at",
        ].includes(k),
    ))
      expect(after[field]).toEqual(before[field]);
    expect(after.allowed_origins).toEqual([oldOrigin, newOrigin]);
    expect(after.configuration_approval_id).toBe(
      "owner-production-hostname-20261113",
    );
    const proof = (
      await db.query<{ value: unknown }>(
        "select public.azzora_runtime_identity($1) value",
        [company],
      )
    ).rows[0].value;
    expect(() => assertProductionIdentity(proof, runtime())).not.toThrow();
    expect(() =>
      assertProductionIdentity(proof, {
        ...runtime(),
        allowedOrigins: new Set([oldOrigin]),
      }),
    ).toThrow();
    expect(() =>
      assertProductionIdentity(proof, {
        ...runtime(),
        allowedOrigins: new Set([oldOrigin, "https://other.example"]),
      }),
    ).toThrow();
    expect(
      (
        await db.query<{ value: unknown }>(
          "select public.azzora_production_auth_grant('86d914dd-1f39-4860-87d0-b671dd39eb00') value",
        )
      ).rows[0].value,
    ).toEqual(grantBefore);
    const audits = await db.query<{
      metadata: { previous: unknown; approved: unknown };
    }>(
      "select metadata from azzora.audit_events where action='production.hostname.approve'",
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0].metadata.previous).toEqual(before);
    expect(audits.rows[0].metadata.approved).toEqual(after);
    await db.exec(sql);
    expect(
      (
        await db.query(
          "select 1 from azzora.audit_events where action='production.hostname.approve'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select 1 from azzora.memberships")).rows,
    ).toHaveLength(2);
    expect((await db.query("select 1 from azzora.journals")).rows).toHaveLength(
      0,
    );
    expect((await db.query("select 1 from azzora.records")).rows).toHaveLength(
      0,
    );
    await expect(
      db.exec(
        "update azzora.production_environment set allowed_origins=array['https://other.example']",
      ),
    ).rejects.toThrow();
    await expect(
      db.exec("delete from azzora.production_environment"),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 60_000);

it("rolls back hostname changes and restores immutability if the approval audit cannot be recorded", async () => {
  const db = await fixture();
  try {
    const before = (
      await db.query(
        "select to_jsonb(e) value from azzora.production_environment e",
      )
    ).rows;
    await db.exec(
      "create function public.hostname_audit_fault() returns trigger language plpgsql as $$begin raise exception 'isolated audit failure';end$$;create trigger hostname_audit_fault before insert on azzora.audit_events for each row execute function public.hostname_audit_fault();",
    );
    await expect(
      db.exec(await readFile(new URL(migrationPath, import.meta.url), "utf8")),
    ).rejects.toThrow(/isolated audit failure/);
    await db.exec("rollback");
    expect(
      (
        await db.query(
          "select to_jsonb(e) value from azzora.production_environment e",
        )
      ).rows,
    ).toEqual(before);
    expect(
      (await db.query("select 1 from azzora.audit_events")).rows,
    ).toHaveLength(0);
    await expect(
      db.exec(
        "update azzora.production_environment set allowed_origins=array['https://other.example']",
      ),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 60_000);
