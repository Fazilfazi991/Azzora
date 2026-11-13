import { initialOpeningDigest } from "../accounting/initial-opening.js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { freshRehearsalDatabase } from "../backend/launch-backup-rehearsal.js";
import {
  assertProductionIdentity,
  productionRuntime,
} from "../backend/runtime-production.js";
import { createStagingHandler } from "./server.js";
import type { createStagingAuth, StagingActor } from "./auth.js";
import { StagingServiceError, type StagingRpc } from "./supabase.js";
import {
  hydrateCanonical,
  serializeCanonical,
  type CanonicalData,
} from "./canonical.js";
import { createEmptyProductionCompany } from "../finance/production-policy.js";
import { emptyOperations } from "../operations/migration.js";

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
  const data = serializeCanonical(
    createEmptyProductionCompany({
      settings,
      people: [
        {
          id: owner,
          name: "Owner",
          role: "Owner",
          email: "info@azzora.ae",
          phone: "",
          status: "Active",
          capacity: 0,
        },
        {
          id: accountant,
          name: "Accountant",
          role: "Accountant",
          email: "accounts@azzora.ae",
          phone: "",
          status: "Active",
          capacity: 0,
        },
      ],
    }),
  );
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
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/production-migrations/20261113205315_production_initial_financial_authority.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    "create or replace function azzora.initial_finance_now() returns timestamptz language sql stable set search_path='' as $$ select '2026-11-15T08:00:00Z'::timestamptz $$",
  );
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
    AZZORA_PRODUCTION_FINANCIAL_POSTING: "true",
    AZZORA_PRODUCTION_FINANCIAL_APPROVAL: "owner-live-20261115-v1",
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
  const proof = await rpc("azzora_runtime_identity", { p_company_id: company });
  const authority = assertProductionIdentity(proof, runtime);
  const handler = createStagingHandler({
    initialFinance: authority,
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
    authority,
  };
}

it("initial authority prepares real empty company without openings and gates actual first invoice SQL", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T08:00:00Z"));
  const f = await fixture();
  try {
    let s = hydrateCanonical((await f.snapshot()).data);
    expect(s.finance.accounting.accounts).toHaveLength(5);
    expect(s.finance.accounting.journals).toHaveLength(0);
    expect(s.finance.accounting.periods).toHaveLength(0);
    expect(s.finance.openingSetup).toBeUndefined();
    expect(s.manager.operations!.settings.tax).toBe("No VAT");
    const invoice = {
      kind: "invoice",
      id: "FIRST-TECHNICAL-ID",
      invoiceReference: "OWNER-ENTERED-001",
      party: "Fictional isolated fixture",
      date: "2026-11-15",
      due: "2026-11-15",
      description: "Actual engine fixture",
      amount: "125.00",
      invoiceType: "Normal Invoice",
      issue: true,
    };
    f.user(owner);
    expect((await f.act(invoice)).status).toBe(423);
    f.user(accountant);
    vi.setSystemTime(new Date("2026-11-14T08:00:00Z"));
    expect((await f.act(invoice)).status).toBe(423);
    vi.setSystemTime(new Date("2026-11-15T08:00:00Z"));
    const before = await f.snapshot();
    const r = await f.act(invoice, "first-actual-invoice");
    expect(
      r.status,
      f.lastError() + JSON.stringify(await r.clone().json()),
    ).toBe(200);
    s = hydrateCanonical((await f.snapshot()).data);
    expect(s.finance.accounting.journals).toHaveLength(1);
    expect(s.finance.accounting.periods).toHaveLength(1);
    expect(
      (await f.act(invoice, "first-actual-invoice", before.version)).status,
      f.lastError(),
    ).toBe(200);
    expect(
      hydrateCanonical((await f.snapshot()).data).finance.accounting.journals,
    ).toHaveLength(1);
    for (const bad of [
      { ...invoice, id: "NO-NUMBER", invoiceReference: "" },
      { ...invoice, id: "DUPLICATE", invoiceReference: " owner-entered-001 " },
    ])
      expect((await f.act(bad)).status).toBe(423);
    for (const [type, code, name] of [
      ["Asset", "1250", "Equipment fixture"],
      ["Equity", "3000", "Contributed capital fixture"],
    ]) {
      const r = await f.act({
        kind: "create-ledger-account",
        code,
        name,
        type,
        postable: true,
      });
      expect(
        r.status,
        f.lastError() + JSON.stringify(await r.clone().json()),
      ).toBe(200);
    }
    s = hydrateCanonical((await f.snapshot()).data);
    const asset = s.finance.accounting.accounts.find((a) => a.code === "1250")!,
      equity = s.finance.accounting.accounts.find((a) => a.code === "3000")!;
    const row = { reference: "", documentDate: "", dueDate: "", notes: "" };
    const draft = {
      date: "2026-11-14",
      notes: "Synthetic isolated reconciliation",
      rows: [
        {
          ...row,
          id: "one",
          kind: "ledger",
          accountOrParty: asset.id,
          debit: "100.00",
          credit: "",
        },
        {
          ...row,
          id: "two",
          kind: "ledger",
          accountOrParty: equity.id,
          debit: "",
          credit: "100.00",
        },
      ],
    };
    let r2 = await f.act({
      kind: "opening-setup-draft",
      id: "opening-setup",
      draft,
    });
    expect(
      r2.status,
      f.lastError() + JSON.stringify(await r2.clone().json()),
    ).toBe(200);
    s = hydrateCanonical((await f.snapshot()).data);
    const stamp = {
      id: "opening-setup",
      revision: s.finance.openingReview!.revision,
      digest: initialOpeningDigest(s),
      confirmed: true,
    };
    expect((await f.act({ kind: "opening-post", ...stamp })).status).toBe(423);
    const check = await f.snapshot(),
      forged = structuredClone(check.data);
    const meta = forged.records.find(
      (v) => v.entity_type === "workspace_metadata",
    )!;
    const finance = (
      meta.payload as {
        metadata: { finance: { openingReview: Record<string, unknown> } };
      }
    ).metadata.finance;
    finance.openingReview.ownerApproval = {
      by: owner,
      at: "2026-11-15T08:00:00Z",
      digest: stamp.digest,
      revision: stamp.revision,
    };
    await expect(
      f.rpc("staging_company_commit", {
        p_session_hash: f.hash.get(accountant),
        p_expected_version: check.version,
        p_idempotency_key: "forged-owner-opening-approval",
        p_fingerprint: digest(forged),
        p_command: "accounts.action",
        p_scope: {
          workspace: "accountant",
          financial: false,
          openingOperation: "opening-approve",
          openingDigest: stamp.digest,
          openingRevision: stamp.revision,
        },
        p_data: forged,
        p_bootstrap: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await f.snapshot()).toEqual(check);

    r2 = await f.act({ kind: "opening-reconcile", ...stamp, complete: true });
    expect(
      r2.status,
      f.lastError() + JSON.stringify(await r2.clone().json()),
    ).toBe(200);
    expect((await f.act({ kind: "opening-approve", ...stamp })).status).toBe(
      423,
    );
    f.user(owner);
    r2 = await f.act({ kind: "opening-approve", ...stamp });
    expect(
      r2.status,
      f.lastError() + JSON.stringify(await r2.clone().json()),
    ).toBe(200);
    f.user(accountant);
    expect(
      (
        await f.act({
          kind: "opening-post",
          ...stamp,
          revision: stamp.revision - 1,
        })
      ).status,
    ).toBe(423);
    vi.setSystemTime(new Date("2026-11-15T08:00:01Z"));
    r2 = await f.act({ kind: "opening-post", ...stamp });
    expect(
      r2.status,
      f.lastError() + JSON.stringify(await r2.clone().json()),
    ).toBe(200);
    s = hydrateCanonical((await f.snapshot()).data);
    expect(s.finance.accounting.journals).toHaveLength(2);
    expect(s.finance.openingReview?.posted?.by).toBe(accountant);
    expect((await f.act({ kind: "opening-post", ...stamp })).status).toBe(423);
    expect(
      hydrateCanonical((await f.snapshot()).data).finance.accounting.journals,
    ).toHaveLength(2);
  } finally {
    await f.db.close();
    vi.useRealTimers();
  }
}, 60000);

it("provider financial guard independently rejects Owner, pre-start dates and invented invoice numbering with no writes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T08:00:00Z"));
  const f = await fixture();
  try {
    const before = await f.snapshot();
    let sequence = 0;
    const direct = (data: CanonicalData, actor = accountant, extra = {}) =>
      f.rpc("staging_company_commit", {
        p_session_hash: f.hash.get(actor),
        p_expected_version: before.version,
        p_idempotency_key: "direct-sql-negative-" + ++sequence,
        p_fingerprint: digest(data),
        p_command: "accounts.action",
        p_scope: {
          workspace: "accountant",
          financial: true,
          financialAction: "invoice",
          ...extra,
        },
        p_data: data,
        p_bootstrap: false,
      });
    await expect(direct(before.data, owner)).rejects.toMatchObject({
      status: 403,
    });
    await f.db.exec(
      "create or replace function azzora.initial_finance_now() returns timestamptz language sql stable set search_path='' as $time$ select '2026-11-14T08:00:00Z'::timestamptz $time$",
    );
    await expect(direct(before.data)).rejects.toMatchObject({ status: 423 });
    expect(f.lastError()).toContain("starts on 15");
    await f.db.exec(
      "create or replace function azzora.initial_finance_now() returns timestamptz language sql stable set search_path='' as $time$ select '2026-11-15T08:00:00Z'::timestamptz $time$",
    );
    const data = structuredClone(before.data);
    data.records.push({
      entity_type: "sales_invoice",
      id: "forged-document",
      status: "Issued",
      project_id: null,
      party_id: null,
      department_id: null,
      payload: {
        finance: {
          id: "forged-document",
          status: "Issued",
          invoiceType: "Normal Invoice",
          invoiceReference: "",
          date: "2026-11-15",
          due: "2026-11-15",
          amountFils: "10000",
          party: "Fictional isolation",
          description: "No approved number",
        },
      },
    });
    await expect(direct(data)).rejects.toMatchObject({ status: 423 });
    expect(f.lastError()).toContain("invoice number required");
    const source = data.records[data.records.length - 1];
    (source.payload.finance as Record<string, unknown>).invoiceReference =
      "DUP-001";
    data.records.push({
      ...structuredClone(source),
      id: "forged-second",
      payload: {
        finance: {
          ...(source.payload.finance as Record<string, unknown>),
          id: "forged-second",
        },
      },
    });
    await expect(direct(data)).rejects.toMatchObject({ status: 409 });
    expect(f.lastError()).toContain("already issued");
    await expect(
      direct(before.data, accountant, { financialAction: "expense" }),
    ).rejects.toMatchObject({ status: 423 });
    await expect(
      direct(before.data, accountant, { financialAction: "transfer" }),
    ).rejects.toMatchObject({ status: 423 });
    expect(await f.snapshot()).toEqual(before);
  } finally {
    await f.db.close();
    vi.useRealTimers();
  }
}, 60000);

it("allocated receipts and supplier payments use existing engine and confirmed recorded funding, never assumed openings", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T08:00:00Z"));
  const f = await fixture();
  try {
    f.user(accountant);
    let seconds = 0;
    const act = async (action: Record<string, unknown>) => {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 15, 8, 0, ++seconds)));
      const r = await f.act(action);

      expect(
        r.status,
        f.lastError() + JSON.stringify(await r.clone().json()),
      ).toBe(200);
      return r.json();
    };
    const bank = await act({
      kind: "create-cash-account",
      name: "Isolated test bank",
      type: "bank",
    });
    const invoice = await act({
      kind: "invoice",
      party: "Fictional isolated customer",
      date: "2026-11-15",
      due: "2026-11-15",
      description: "Fixture sale",
      amount: "125.00",
      invoiceReference: "TEST-SALE-002",
      invoiceType: "Normal Invoice",
      issue: true,
    });
    const bill = await act({
      kind: "bill",
      party: "Fictional isolated supplier",
      date: "2026-11-15",
      due: "2026-11-15",
      description: "Fixture purchase",
      amount: "100.00",
      invoiceReference: "TEST-PURCHASE-002",
      category: "Cost of Sales",
      poReference: "ISOLATED-PURCHASE-002",
      issue: true,
    });
    const pay = {
      kind: "supplier-payment",
      documentId: bill.id,
      date: "2026-11-15",
      amount: "100.00",
      account: bank.id,
      reference: "Verified isolated test",
    };
    const noFunding = await f.act(pay);
    expect(noFunding.status).toBe(423);
    expect((await noFunding.json()).code).toBe("cash_funding_not_confirmed");
    await act({
      kind: "receipt",
      documentId: invoice.id,
      date: "2026-11-15",
      amount: "125.00",
      account: bank.id,
      reference: "Isolated receipt",
    });
    await act(pay);
    const s = hydrateCanonical((await f.snapshot()).data);
    expect(s.finance.receipts).toHaveLength(1);
    expect(s.finance.supplierPayments).toHaveLength(1);
    expect(s.finance.accounting.journals).toHaveLength(4);
    expect(s.finance.openingReview?.posted).toBeUndefined();
    const balance = s.finance.accounting.journals
      .flatMap((j) => j.lines)
      .filter((l) => l.accountId === bank.id)
      .reduce((n, l) => n + BigInt(l.debitFils) - BigInt(l.creditFils), 0n);
    expect(balance).toBe(2500n);
  } finally {
    await f.db.close();
    vi.useRealTimers();
  }
}, 60000);
