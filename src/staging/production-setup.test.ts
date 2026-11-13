import { expect, it, vi } from "vitest";
import { createStagingHandler } from "./server.js";
import { hydrateCanonical, type CanonicalData } from "./canonical.js";
import { productionRuntime } from "../backend/runtime-production.js";
import type { createStagingAuth, StagingActor } from "./auth.js";
import { StagingServiceError, type StagingRpc } from "./supabase.js";

function fixture(patch: Partial<StagingActor> = {}) {
  const runtime = productionRuntime({
    AZZORA_DEPLOYMENT_MODE: "production-candidate",
    AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL: "owner-approved-setup-test",
    AZZORA_PRODUCTION_SUPABASE_PROJECT_REF: "zwjiztnsxenluqybxhhz",
    AZZORA_PRODUCTION_SUPABASE_URL: "https://zwjiztnsxenluqybxhhz.supabase.co",
    AZZORA_PRODUCTION_COMPANY_ID: "22222222-2222-4222-8222-222222222222",
    AZZORA_PRODUCTION_DATABASE_REGION: "ap-southeast-1",
    AZZORA_PRODUCTION_VERCEL_PROJECT_ID: "prj_IsolatedSetup",
    AZZORA_PRODUCTION_PUBLISHABLE_KEY: "sb_publishable_test",
    AZZORA_PRODUCTION_SERVICE_KEY: "sb_secret_test",
    AZZORA_PRODUCTION_AUTH_KEY: Buffer.alloc(32, 29).toString("base64url"),
    AZZORA_PRODUCTION_ALLOWED_ORIGINS: "https://setup.example.test",
    AZZORA_PRODUCTION_FINANCIAL_POSTING: "false",
    AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING: "false",
  });
  const actor: StagingActor = {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companyId: runtime.companyId,
    email: "owner@example.test",
    role: "owner_admin",
    workspace: "manager",
    assurance: "aal2",
    sessionHash: "opaque",
    providerSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    projectIds: [],
    capabilities: ["access.manage", "project.read", "project.write"],
    ...patch,
  };
  const people = [
    {
      id: actor.userId,
      name: "Owner",
      role: "Project Manager",
      email: actor.email,
      phone: "",
      status: "Active",
      capacity: 100,
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Accountant",
      role: "Project Manager",
      email: "accountant@example.test",
      phone: "",
      status: "Active",
      capacity: 100,
    },
  ];
  let version = 0,
    data: CanonicalData | undefined,
    interrupt = false;
  const receipts = new Map<string, { fingerprint: unknown; result: unknown }>();
  const calls = vi.fn(async (name: string, p: Record<string, unknown>) => {
    if (name === "staging_company_read") return { version, data: data || {} };
    if (name === "staging_company_people") return people;
    if (name !== "staging_company_commit") throw Error("Unexpected RPC");
    const old = receipts.get(String(p.p_idempotency_key));
    if (old) {
      if (old.fingerprint !== p.p_fingerprint)
        throw new StagingServiceError(409, "idempotency_conflict");
      return old.result;
    }
    if (p.p_expected_version !== version)
      throw new StagingServiceError(409, "version_conflict");
    data = structuredClone(p.p_data as CanonicalData);
    const result = { version: ++version, replayed: false };
    receipts.set(String(p.p_idempotency_key), {
      fingerprint: p.p_fingerprint,
      result,
    });
    if (interrupt) {
      interrupt = false;
      throw new StagingServiceError(503, "response_interrupted");
    }
    return result;
  });
  const auth = {
    requireActor: vi.fn(async () => actor),
    handle: vi.fn(),
  } as unknown as ReturnType<typeof createStagingAuth>;
  const handle = createStagingHandler({
    production: runtime,
    rpc: calls as StagingRpc,
    auth,
    storage: { store: vi.fn(), read: vi.fn() },
  });
  const request = (
    body: unknown = { idempotencyKey: "unique-setup-action-0001" },
  ) =>
    new Request("https://setup.example.test/api/staging/manager/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    handle,
    request,
    calls,
    auth,
    actor,
    state: () => data && hydrateCanonical(data),
    version: () => version,
    interruptNextCommit: () => {
      interrupt = true;
    },
  };
}
it("initializes only an unconfigured empty company and verified membership profiles, and replays without duplicate writes", async () => {
  const f = fixture();
  expect((await f.handle(f.request())).status).toBe(200);
  const state = f.state()!;
  expect(state.mode).toBe("production");
  expect(state.manager.people.map((person) => person.email)).toEqual([
    "owner@example.test",
    "accountant@example.test",
  ]);
  expect(state.manager.operations!.settings).toMatchObject({
    vatPercentage: "",
    tax: "Unconfigured",
    invoicePrefix: "",
    company: { trn: "", tradingName: "" },
  });
  expect(state.manager.clients).toEqual([]);
  expect(state.manager.projects).toEqual([]);
  expect(state.finance.accounting).toEqual({
    version: 1,
    accounts: [],
    periods: [],
    journals: [],
  });
  expect(state.finance.invoices).toEqual([]);
  expect(state.finance.bills).toEqual([]);
  expect(state.finance.cashAccounts).toEqual([]);
  const initial = f.calls.mock.calls.find(
    ([name]) => name === "staging_company_commit",
  )![1].p_data as CanonicalData;
  expect(initial.records.map((record) => record.entity_type)).toEqual([
    "workspace_metadata",
  ]);
  expect(f.version()).toBe(3);
  expect((await f.handle(f.request())).status).toBe(200);
  expect(f.version()).toBe(3);
  expect(f.state()).toEqual(state);
});
it("resolves an interrupted bootstrap response using the same receipt and completes missing profiles without financial entries", async () => {
  const f = fixture();
  f.interruptNextCommit();
  expect((await f.handle(f.request())).status).toBe(503);
  expect(f.version()).toBe(1);
  expect(f.state()!.manager.people).toEqual([]);
  expect((await f.handle(f.request())).status).toBe(200);
  expect(f.version()).toBe(3);
  expect(f.state()!.manager.people).toHaveLength(2);
  expect(f.state()!.finance.accounting.journals).toEqual([]);
});
it("denies non-Owners, missing MFA and missing authority before any initialization commit", async () => {
  for (const patch of [
    { role: "accountant" },
    { assurance: "aal1" },
    { capabilities: ["project.read"] },
  ] as Partial<StagingActor>[]) {
    const f = fixture(patch);
    expect((await f.handle(f.request())).status).toBe(403);
    expect(
      f.calls.mock.calls.filter(([name]) => name === "staging_company_commit"),
    ).toHaveLength(0);
  }
});
it("rejects financial records, settings or credentials in the bootstrap envelope", async () => {
  const f = fixture();
  for (const extra of [
    { accounts: [] },
    { settings: {} },
    { openingBalance: "0" },
    { password: "not-accepted" },
  ])
    expect(
      (
        await f.handle(
          f.request({ idempotencyKey: "unique-setup-action-0001", ...extra }),
        )
      ).status,
    ).toBe(422);
  expect(f.version()).toBe(0);
});
it("never overwrites an initialized company with a different setup key", async () => {
  const f = fixture();
  expect((await f.handle(f.request())).status).toBe(200);
  const before = f.state();
  expect(
    (
      await f.handle(
        f.request({ idempotencyKey: "different-setup-action-key" }),
      )
    ).status,
  ).toBe(409);
  expect(f.state()).toEqual(before);
  expect(f.version()).toBe(3);
});
