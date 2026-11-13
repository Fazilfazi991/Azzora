import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { freshRehearsalDatabase } from "../backend/launch-backup-rehearsal.js";
import { productionRuntime } from "../backend/runtime-production.js";
import { createStagingHandler } from "./server.js";
import type { createStagingAuth, StagingActor } from "./auth.js";
import { StagingServiceError, type StagingRpc } from "./supabase.js";
import {
  hydrateCanonical,
  serializeCanonical,
  type CanonicalData,
} from "./canonical.js";
import {
  createSharedCompanyState,
  applySharedCommand,
  type SharedActor,
} from "./domain.js";
import { createEmptyProductionCompany } from "../finance/production-policy.js";
import { emptyOperations } from "../operations/migration.js";
import {
  createProductionBusinessBackup,
  verifyProductionBusinessBackup,
} from "./backup.js";
import { ledgerAccountTypes } from "../accounts-review/ledger-accounts.js";

const company = "fc525d78-bc83-4845-96f1-fb402bb07465",
  owner = "86d914dd-1f39-4860-87d0-b671dd39eb00",
  accountant = "c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function fixture() {
  const { db } = await freshRehearsalDatabase("production");
  await db.query(
    "insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'info@azzora.ae','{\"azzora_scope\":\"production\"}',now()),($2,'accounts@azzora.ae','{\"azzora_scope\":\"production\"}',now())",
    [owner, accountant],
  );
  for (const name of [
    "20261113161658_production_initial_company_configuration.sql",
    "20261113161711_production_initial_password_policy.sql",
    "20261113174923_production_crm_hostname.sql",
    "20261113182509_production_catalog_setup.sql",
  ])
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/production-migrations/" + name,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  const settings = emptyOperations().settings;
  settings.company.name = "Isolated catalog QA";
  settings.vatPercentage = "";
  settings.tax = "Unconfigured";
  const data = serializeCanonical(createEmptyProductionCompany({ settings }));
  for (const department of data.departments)
    await db.query(
      "insert into azzora.departments(company_id,id,name) values($1,$2,$3)",
      [company, department.id, department.name],
    );
  for (const record of data.records)
    await db.query(
      "insert into azzora.records(company_id,entity_type,id,payload,status) values($1,$2,$3,$4,$5)",
      [company, record.entity_type, record.id, record.payload, record.status],
    );
  await db.query("update azzora.companies set version=1 where id=$1", [
    company,
  ]);
  const actorHashes = new Map<string, string>();
  for (const [id, provider, hash] of [
    [owner, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "a".repeat(64)],
    [accountant, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "b".repeat(64)],
  ]) {
    await db.query(
      "insert into auth.sessions(id,user_id,aal,not_after) values($1,$2,'aal1',now()+interval '1 hour')",
      [provider, id],
    );
    await db.query(
      "select public.azzora_production_auth_session_put($1,$2,$3,$4,$5,'accountant','aal1','isolated-encrypted-fixture')",
      [hash, "c".repeat(64), id, provider, company],
    );
    actorHashes.set(id, hash);
  }
  const runtime = productionRuntime({
    AZZORA_DEPLOYMENT_MODE: "production-candidate",
    AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL:
      "owner-production-hostname-20261113",
    AZZORA_PRODUCTION_SUPABASE_PROJECT_REF: "zwjiztnsxenluqybxhhz",
    AZZORA_PRODUCTION_SUPABASE_URL: "https://zwjiztnsxenluqybxhhz.supabase.co",
    AZZORA_PRODUCTION_COMPANY_ID: company,
    AZZORA_PRODUCTION_DATABASE_REGION: "ap-southeast-1",
    AZZORA_PRODUCTION_VERCEL_PROJECT_ID: "prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV",
    AZZORA_PRODUCTION_PUBLISHABLE_KEY: "sb_publishable_catalog-test",
    AZZORA_PRODUCTION_SERVICE_KEY: "sb_secret_catalog-test",
    AZZORA_PRODUCTION_AUTH_KEY: Buffer.alloc(32, 19).toString("base64url"),
    AZZORA_PRODUCTION_ALLOWED_ORIGINS:
      "https://azzora-accounts-live.vercel.app,https://azzoracrm.vercel.app",
    AZZORA_PRODUCTION_FINANCIAL_POSTING: "false",
    AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING: "false",
  });
  let user = owner;
  let lastError = "";
  const rpc: StagingRpc = async <T>(
    name: string,
    params: Record<string, unknown> = {},
  ) => {
    const keys = Object.keys(params);
    try {
      return (
        await db.query<{ value: T }>(
          `select public.${name.replace(/^staging_/, "azzora_production_")}(${keys.map((key, i) => `${key}=>$${i + 1}`).join(",")}) value`,
          keys.map((key) => params[key]),
        )
      ).rows[0].value;
    } catch (error) {
      lastError = (error as Error).message;
      if (
        params.p_data &&
        (params.p_scope as { catalogAction?: string })?.catalogAction
      ) {
        const rows = await db.query<{ changed: string }>(
          "select key changed from jsonb_each(azzora.catalog_nonaccount_projection($1)) where value is distinct from azzora.catalog_nonaccount_projection(azzora.production_canonical_data($2))->key",
          [params.p_data, company],
        );
        lastError +=
          " changed sections: " + rows.rows.map((v) => v.changed).join(",");
        const counts = await db.query(
          "select jsonb_array_length(($1::jsonb)->'accounts') proposed,jsonb_array_length(azzora.production_canonical_data($2)->'accounts') existing",
          [params.p_data, company],
        );
        lastError += " " + JSON.stringify(counts.rows);
      }
      const code = (error as { code?: string }).code || "";
      throw new StagingServiceError(
        /^PT\d{3}$/.test(code) ? Number(code.slice(2)) : 503,
        code,
      );
    }
  };
  const auth = {
    handle: vi.fn(),
    requireActor: async () =>
      rpc<StagingActor>("staging_auth_actor", {
        p_session_hash: actorHashes.get(user),
      }),
  } as unknown as ReturnType<typeof createStagingAuth>;
  const handler = createStagingHandler({
    production: runtime,
    rpc,
    auth,
    storage: { store: vi.fn(), read: vi.fn() },
  });
  const snapshot = async () =>
    rpc<{ version: number; data: CanonicalData }>("staging_company_read", {
      p_session_hash: actorHashes.get(owner),
      p_workspace: "accountant",
    });
  let sequence = 0;
  const act = async (
    action: Record<string, unknown>,
    key?: string,
    expected?: number,
  ) =>
    handler(
      new Request("https://azzoracrm.vercel.app/api/staging/accounts/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Azzora-Expected-Version": String(
            expected ?? (await snapshot()).version,
          ),
          "X-Azzora-Idempotency-Key": key || `catalog-qa-action-${++sequence}`,
        },
        body: JSON.stringify(action),
      }),
    );
  return {
    db,
    rpc,
    handler,
    act,
    snapshot,
    user: (id: string) => {
      user = id;
    },
    hash: actorHashes,
    lastError: () => lastError,
  };
}
const account = (code = "1200", name = "Receivables") => ({
  kind: "create-ledger-account",
  code,
  name,
  type: "Asset",
  postable: true,
});
it("rejects real-document AI at the production API before any provider call when evidence or budget is missing", async () => {
  const f = await fixture();
  const request = vi.spyOn(globalThis, "fetch");
  try {
    f.user(accountant);
    const before = await f.snapshot();
    const response = await f.handler(
      new Request(
        "https://azzoracrm.vercel.app/api/staging/accounts/documents/extract",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Azzora-Expected-Version": String(before.version),
            "X-Azzora-Idempotency-Key": "business-ai-disabled-qa",
          },
          body: JSON.stringify({
            file: { name: "fictional.png", mime: "image/png", data: "aA==" },
            mode: "auto",
            processing: {
              dataClass: "business",
              consent: true,
              policyVersion: "ai-business-v1",
            },
          }),
        },
      ),
    );
    expect(response.status).toBe(423);
    expect((await response.json()).code).toBe(
      "production_document_processing_disabled",
    );
    expect(request).not.toHaveBeenCalled();
    expect(await f.snapshot()).toEqual(before);
  } finally {
    request.mockRestore();
    await f.db.close();
  }
}, 60000);
it("Owner and Accountant create every explicit account type through the real API and SQL commit boundary, without balances or journals", async () => {
  const f = await fixture();
  try {
    for (const [index, type] of ledgerAccountTypes.entries()) {
      f.user(index % 2 ? accountant : owner);
      const r = await f.act({
        ...account(String(1200 + index), `Explicit ${type}`),
        type,
        postable: index !== 2,
      });
      expect(r.status, f.lastError()).toBe(200);
      expect((await r.json()).id).toMatch(/^GL-[A-F0-9]{20}$/);
    }
    const read = await f.snapshot(),
      state = hydrateCanonical(read.data);
    expect(state.finance.accounting.accounts).toHaveLength(6);
    expect(state.finance.accounting.journals).toEqual([]);
    expect(state.finance.accounting.periods).toEqual([]);
    expect(state.finance.openingSetup).toBeUndefined();
    expect(state.finance.invoices).toEqual([]);
    expect(state.finance.bills).toEqual([]);
    expect(serializeCanonical(state).accounts).toEqual(read.data.accounts);
    const backup = verifyProductionBusinessBackup(
      await createProductionBusinessBackup(
        { version: read.version, data: read.data, companyId: company },
        async () => {
          throw Error("No originals expected");
        },
        "2026-11-13T18:00:00.000Z",
      ),
    );
    expect(backup.data.accounts).toEqual(read.data.accounts);
    expect(hydrateCanonical(backup.data).finance.accounting.accounts).toEqual(
      state.finance.accounting.accounts,
    );
  } finally {
    await f.db.close();
  }
}, 60000);
it("duplicate, invalid or unexpected financial fields are rejected and same-key replay creates only one account", async () => {
  const f = await fixture();
  try {
    const before = await f.snapshot(),
      key = "catalog-same-key-replay";
    const first = await f.act(account(), key, before.version);
    expect(first.status).toBe(200);
    const id = (await first.json()).id;
    const replay = await f.act(account(), key, before.version);
    expect(replay.status).toBe(200);
    expect((await replay.json()).id).toBe(id);
    for (const input of [
      { ...account(), name: "Another name" },
      { ...account("1201"), name: " receivables " },
      { ...account(""), name: "Blank code" },
      { ...account("1202"), type: "Revenue" },
      { ...account("1202"), balance: "100" },
      { ...account("1202"), postable: "true" },
      { ...account("1202"), code: "<bad>" },
    ])
      expect((await f.act(input)).status).toBe(400);
    const after = await f.snapshot();
    expect(after.version).toBe(before.version + 1);
    expect(after.data.accounts).toHaveLength(1);
    expect(after.data.journals).toEqual([]);
  } finally {
    await f.db.close();
  }
}, 60000);
it("the SQL catalog guard rejects record, existing-account, period or journal tampering without changing data", async () => {
  const f = await fixture();
  try {
    expect((await f.act(account())).status).toBe(200);
    const before = await f.snapshot();
    for (const mutation of ["record", "account", "period", "journal"]) {
      const data = structuredClone(before.data);
      data.accounts.push({
        id: "test-new",
        code: "2200",
        name: "New payable",
        type: "Liability",
        postable: true,
        active: true,
      });
      if (mutation === "record") data.records[0].status = "tampered";
      if (mutation === "account") data.accounts[0].name = "Changed existing";
      if (mutation === "period")
        data.periods.push({
          id: "not-approved",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          locked: false,
        });
      if (mutation === "journal")
        data.journals.push({
          id: "not-posted",
        } as CanonicalData["journals"][number]);
      await expect(
        f.rpc("staging_company_commit", {
          p_session_hash: f.hash.get(accountant),
          p_expected_version: before.version,
          p_idempotency_key: `catalog-tamper-${mutation}-key`,
          p_fingerprint: digest(data),
          p_command: "accounts.action",
          p_scope: {
            workspace: "accountant",
            financial: false,
            catalogAction: "create-ledger-account",
          },
          p_data: data,
          p_bootstrap: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(await f.snapshot()).toEqual(before);
  } finally {
    await f.db.close();
  }
}, 60000);
it("a production Accountant without current draft authority and the restricted staging reviewer cannot create a general account", async () => {
  const f = await fixture();
  try {
    f.user(accountant);
    await f.db.query(
      "update azzora.memberships set capabilities=array['finance.read'] where user_id=$1",
      [accountant],
    );
    expect((await f.act(account())).status).toBe(403);
    expect((await f.snapshot()).data.accounts).toEqual([]);
  } finally {
    await f.db.close();
  }
  const state = createSharedCompanyState();
  const actor: SharedActor = {
    userId: "52f925bd-8744-48cc-8781-d20109387d14",
    companyId: "11111111-1111-4111-8111-111111111111",
    sessionId: "review",
    assurance: "aal1",
    authenticationPolicy: "client-review-password-only",
    grant: {
      userId: "52f925bd-8744-48cc-8781-d20109387d14",
      companyId: "11111111-1111-4111-8111-111111111111",
      active: true,
      roles: ["accountant"],
      workspaces: ["accountant"],
      projectIds: [],
      capabilities: ["finance.read", "finance.draft"],
    },
  };
  expect(() =>
    applySharedCommand(
      state,
      {
        kind: "accounts.action",
        payload: { action: { ...account(), id: "GL-restricted" } },
      },
      actor,
    ),
  ).toThrow();
}, 60000);
