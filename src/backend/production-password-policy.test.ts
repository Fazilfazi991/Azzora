import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { freshRehearsalDatabase } from "./launch-backup-rehearsal.js";
import {
  isProductionPasswordOnly,
  productionPasswordCompany as company,
} from "./production-password-policy.js";
import { authorize, type AuthorizedActor } from "./permissions.js";
import { createStagingHandler } from "../staging/server.js";
import { productionRuntime } from "./runtime-production.js";
import type { createStagingAuth, StagingActor } from "../staging/auth.js";
import type { StagingRpc } from "../staging/supabase.js";
import {
  createAuthoritativeProductionBackup,
  decryptBusinessBackup,
  verifyAuthoritativeProductionArchive,
} from "./launch-backup.js";

const owner = "86d914dd-1f39-4860-87d0-b671dd39eb00",
  accountant = "c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3";
const configuration =
  "../../supabase/production-migrations/20261113161658_production_initial_company_configuration.sql";
const passwordPolicy =
  "../../supabase/production-migrations/20261113161711_production_initial_password_policy.sql";
it("does not grant a password exception to a marker without the approved identity, company and current authority", () => {
  const actor: AuthorizedActor = {
    userId: owner,
    companyId: company,
    authenticationPolicy: "production-password-only",
    assurance: "aal1",
    sessionId: "opaque",
    grant: {
      userId: owner,
      companyId: company,
      active: true,
      roles: ["owner"],
      workspaces: ["manager", "accountant"],
      capabilities: ["access.manage", "finance.read", "finance.draft"],
      projectIds: [],
    },
  };
  expect(isProductionPasswordOnly(actor)).toBe(true);
  expect(() =>
    authorize(actor, "access.manage", { companyId: company }),
  ).not.toThrow();
  for (const patch of [
    { userId: accountant },
    { companyId: "foreign" },
    { authenticationPolicy: undefined },
    { email: "other@example.invalid" },
    { grant: { ...actor.grant, active: false } },
    { grant: { ...actor.grant, capabilities: ["finance.post" as const] } },
  ])
    expect(isProductionPasswordOnly({ ...actor, ...patch })).toBe(false);
  expect(() =>
    authorize(actor, "finance.post", { companyId: company }),
  ).toThrow();
});

it("executes reviewed production setup and honest password sessions through SQL, preserving tenant, revocation, backup and posting restrictions", async () => {
  const { db } = await freshRehearsalDatabase("production");
  try {
    await db.query(
      "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'info@azzora.ae','{\"azzora_scope\":\"production\"}',now()),($2,'accounts@azzora.ae','{\"azzora_scope\":\"production\"}',now())",
      [owner, accountant],
    );
    const configSql = await readFile(
      new URL(configuration, import.meta.url),
      "utf8",
    );
    await db.exec(configSql);
    await db.exec(configSql); // Reapplication may verify, never overwrite authority.
    await db.exec(
      await readFile(new URL(passwordPolicy, import.meta.url), "utf8"),
    );
    for (const role of ["anon", "authenticated"]) {
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,'public.azzora_production_auth_actor(text)','execute') allowed",
            [role],
          )
        ).rows[0].allowed,
      ).toBe(false);
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,'azzora.production_password_only(jsonb)','execute') allowed",
            [role],
          )
        ).rows[0].allowed,
      ).toBe(false);
    }
    const ownerProvider = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      accountantProvider = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await db.query(
      "insert into auth.sessions(id,user_id,aal,not_after) values($1,$2,'aal1',now()+interval '1 hour'),($3,$4,'aal1',now()+interval '1 hour')",
      [ownerProvider, owner, accountantProvider, accountant],
    );
    const ownerHash = "a".repeat(64),
      accountantHash = "b".repeat(64);
    for (const [user, provider, hash, workspace] of [
      [owner, ownerProvider, ownerHash, "manager"],
      [accountant, accountantProvider, accountantHash, "accountant"],
    ]) {
      const grant = (
        await db.query<{ g: Record<string, unknown> }>(
          "select public.azzora_production_auth_grant($1) g",
          [user],
        )
      ).rows[0].g;
      expect(grant.authenticationPolicy).toBe("production-password-only");
      await db.query(
        "select public.azzora_production_auth_session_put($1,$2,$3,$4,$5,$6,'aal1','opaque-encrypted-fixture')",
        [hash, "c".repeat(64), user, provider, company, workspace],
      );
      const actor = (
        await db.query<{ a: StagingActor }>(
          "select public.azzora_production_auth_actor($1) a",
          [hash],
        )
      ).rows[0].a;
      expect(actor.assurance).toBe("aal1");
      expect(actor.passwordVerifiedAt).toBeGreaterThan(0);
      expect(actor.mfaVerifiedAt).toBeUndefined();
    }
    await expect(
      db.query(
        "select public.azzora_production_auth_session_put($1,$2,$3,$4,$5,'manager','aal2','opaque')",
        ["d".repeat(64), "e".repeat(64), owner, ownerProvider, company],
      ),
    ).rejects.toThrow("Provider assurance does not match");
    const runtime = productionRuntime({
      AZZORA_DEPLOYMENT_MODE: "production-candidate",
      AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL: "owner-production-setup-20261113",
      AZZORA_PRODUCTION_SUPABASE_PROJECT_REF: "zwjiztnsxenluqybxhhz",
      AZZORA_PRODUCTION_SUPABASE_URL:
        "https://zwjiztnsxenluqybxhhz.supabase.co",
      AZZORA_PRODUCTION_COMPANY_ID: company,
      AZZORA_PRODUCTION_DATABASE_REGION: "ap-southeast-1",
      AZZORA_PRODUCTION_VERCEL_PROJECT_ID: "prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV",
      AZZORA_PRODUCTION_PUBLISHABLE_KEY: "sb_publishable_isolated",
      AZZORA_PRODUCTION_SERVICE_KEY: "sb_secret_isolated",
      AZZORA_PRODUCTION_AUTH_KEY: Buffer.alloc(32, 23).toString("base64url"),
      AZZORA_PRODUCTION_ALLOWED_ORIGINS:
        "https://azzora-accounts-live.vercel.app",
      AZZORA_PRODUCTION_FINANCIAL_POSTING: "false",
      AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING: "false",
    });
    const rpc: StagingRpc = async <T>(
      name: string,
      p: Record<string, unknown> = {},
    ) => {
      const keys = Object.keys(p);
      const result = await db.query<{ value: T }>(
        `select public.${name.replace(/^staging_/, "azzora_production_")}(${keys.map((key, i) => `${key}=>$${i + 1}`).join(",")}) value`,
        keys.map((key) => p[key]),
      );
      return result.rows[0].value;
    };
    const auth = {
      handle: vi.fn(),
      requireActor: async () =>
        (
          await db.query<{ a: StagingActor }>(
            "select public.azzora_production_auth_actor($1) a",
            [ownerHash],
          )
        ).rows[0].a,
    } as unknown as ReturnType<typeof createStagingAuth>;
    const handler = createStagingHandler({
      production: runtime,
      rpc,
      auth,
      storage: { store: vi.fn(), read: vi.fn() },
      productionBackup: async (_source, read, actor) =>
        createAuthoritativeProductionBackup(
          await rpc("staging_owner_backup", { p_session_hash: ownerHash }),
          read,
          Buffer.alloc(32, 25),
          {
            companyId: company,
            keyId: "isolated-test-backup-key",
            capturedAt: new Date().toISOString(),
          },
          actor,
        ),
    });
    const response = await handler(
      new Request(
        "https://azzora-accounts-live.vercel.app/api/staging/manager/setup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: "isolated-password-setup-key",
          }),
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from azzora.journals",
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from azzora.records where entity_type='employee'",
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.query<{ v: number }>(
          "select version::int v from azzora.companies where id=$1",
          [company],
        )
      ).rows[0].v,
    ).toBe(3);
    const backup = await handler(
      new Request(
        "https://azzora-accounts-live.vercel.app/api/staging/manager/backup/encrypted",
      ),
    );
    expect(backup.status).toBe(200);
    const envelope = await backup.json();
    const archive = verifyAuthoritativeProductionArchive(
      JSON.parse(
        Buffer.from(
          decryptBusinessBackup(envelope, Buffer.alloc(32, 25), {
            companyId: company,
            keyId: "isolated-test-backup-key",
          }),
        ).toString("utf8"),
      ),
      company,
    );
    expect(archive.business.data.journals).toEqual([]);
    expect(archive.provenance.memberships).toHaveLength(2);
    expect(
      (
        await db.query<{ b: Record<string, unknown> }>(
          "select public.azzora_production_owner_backup($1) b",
          [ownerHash],
        )
      ).rows[0].b.companyId,
    ).toBe(company);
    await expect(
      db.query("select public.azzora_production_owner_backup($1)", [
        accountantHash,
      ]),
    ).rejects.toThrow("Owner MFA required");
    await expect(
      db.query(
        "select public.azzora_production_company_commit($1,3,$2,$3,'accounts.action','{\"workspace\":\"accountant\",\"financial\":true}','{}',false)",
        [accountantHash, "isolated-financial-blocked-key", "f".repeat(64)],
      ),
    ).rejects.toThrow("Approved accounting policy and cutover required");
    await db.query(
      "update azzora.sessions set created_at=now()-interval '16 minutes' where token_hash=$1",
      [ownerHash],
    );
    await expect(
      db.query("select public.azzora_production_owner_backup($1)", [ownerHash]),
    ).rejects.toThrow("Recent password sign-in required");
    const expiredBackup = await handler(
      new Request(
        "https://azzora-accounts-live.vercel.app/api/staging/manager/backup/encrypted",
      ),
    );
    expect(expiredBackup.status).toBe(403);
    expect((await expiredBackup.json()).code).toBe(
      "backup_recent_sign_in_required",
    );
    // The explicit two-user exception does not disable MFA for a later or
    // unapproved privileged production identity, even with an active role.
    const other = "ffffffff-ffff-4fff-8fff-ffffffffffff",
      otherProvider = "abababab-abab-4bab-8bab-abababababab";
    await db.query(
      "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'other@example.invalid','{\"azzora_scope\":\"production\"}',now())",
      [other],
    );
    await db.query(
      "insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities) values($1,$2,'owner_admin',true,true,array['manager','accountant'],array['access.manage','finance.read','finance.draft'])",
      [company, other],
    );
    await db.query(
      "insert into auth.sessions(id,user_id,aal,not_after) values($1,$2,'aal1',now()+interval '1 hour')",
      [otherProvider, other],
    );
    await expect(
      db.query(
        "select public.azzora_production_auth_session_put($1,$2,$3,$4,$5,'manager','aal1','opaque')",
        ["1".repeat(64), "2".repeat(64), other, otherProvider, company],
      ),
    ).rejects.toThrow("Verified MFA is required");
    await db.query(
      "update azzora.memberships set active=false where user_id=$1",
      [accountant],
    );
    await expect(
      db.query("select public.azzora_production_auth_actor($1)", [
        accountantHash,
      ]),
    ).rejects.toThrow("Production membership denied");
    await db.query("delete from auth.sessions where id=$1", [ownerProvider]);
    await expect(
      db.query("select public.azzora_production_auth_actor($1)", [ownerHash]),
    ).rejects.toThrow("Provider session revoked");
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from azzora.journals",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await db.close();
  }
}, 60_000);
