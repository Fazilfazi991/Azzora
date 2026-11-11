import { expect, it, vi } from "vitest";
import {
  productionRuntime,
  assertProductionIdentity,
  assertProductionActor,
} from "./runtime-production.js";
import {
  createProductionCandidate,
  resolveProductionBackupKey,
} from "./runtime-handler.js";
import { createProductionRpc } from "../staging/supabase.js";
import { serializeCanonical, hydrateCanonical } from "../staging/canonical.js";
import { createSharedCompanyState } from "../staging/domain.js";
import { createStagingHandler } from "../staging/server.js";
import { createStagingAuth, type StagingActor } from "../staging/auth.js";
import { StagingServiceError, type StagingRpc } from "../staging/supabase.js";
import { createEmptyProductionCompany } from "../finance/production-policy.js";
import { emptyOperations } from "../operations/migration.js";
import { blankFields } from "../accounts-review/documents/model.js";
import { ReviewRecordingError } from "../accounts-review/domain.js";
import {
  createProtectedProductionBackup,
  decryptBusinessBackup,
} from "./launch-backup.js";
import { verifyProductionBusinessBackup } from "../staging/backup.js";
import { isDistinctBackupKey } from "./backup-key-policy.js";

export const productionEnv = () => ({
  AZZORA_DEPLOYMENT_MODE: "production-candidate",
  AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL: "OWNER-APPROVAL-FIXTURE",
  AZZORA_PRODUCTION_SUPABASE_PROJECT_REF: "zwjiztnsxenluqybxhhz",
  AZZORA_PRODUCTION_SUPABASE_URL: "https://zwjiztnsxenluqybxhhz.supabase.co",
  AZZORA_PRODUCTION_COMPANY_ID: "22222222-2222-4222-8222-222222222222",
  AZZORA_PRODUCTION_DATABASE_REGION: "ap-southeast-1",
  AZZORA_PRODUCTION_VERCEL_PROJECT_ID: "prj_ProductionFixture",
  AZZORA_PRODUCTION_PUBLISHABLE_KEY: "sb_publishable_production-fixture",
  AZZORA_PRODUCTION_SERVICE_KEY: "sb_secret_production-fixture",
  AZZORA_PRODUCTION_AUTH_KEY: Buffer.alloc(32, 9).toString("base64url"),
  AZZORA_PRODUCTION_ALLOWED_ORIGINS: "https://candidate.example.test",
  AZZORA_PRODUCTION_FINANCIAL_POSTING: "false",
  AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING: "false",
});
const proof = () => {
  const c = productionRuntime(productionEnv());
  return {
    schemaVersion: 1,
    contractVersion: "azzora-canonical-production-v1",
    environment: "production",
    projectRef: c.projectRef,
    companyId: c.companyId,
    region: c.databaseRegion,
    vercelProjectId: c.vercelProjectId,
    configurationApprovalId: c.configurationApprovalId,
    financialPostingEnabled: false,
    realDocumentProcessingEnabled: false,
    fictionalData: false,
    privateStorageBucket: "azzora-private",
    backendCommandsInstalled: true,
    allowedOrigins: [...c.allowedOrigins],
  };
};
it("requires a distinct explicitly approved project, company, secrets and origins; cannot activate real accounting from an environment flag", () => {
  const env = productionEnv();
  expect(productionRuntime(env).financialPostingEnabled).toBe(false);
  for (const patch of [
    { AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL: "" },
    {
      AZZORA_PRODUCTION_SUPABASE_PROJECT_REF: "hkhomrrvxtcxnxvdlkoh",
      AZZORA_PRODUCTION_SUPABASE_URL:
        "https://hkhomrrvxtcxnxvdlkoh.supabase.co",
    },
    { AZZORA_PRODUCTION_COMPANY_ID: "11111111-1111-4111-8111-111111111111" },
    { AZZORA_STAGING_SERVICE_KEY: env.AZZORA_PRODUCTION_SERVICE_KEY },
    { AZZORA_STAGING_AUTH_KEY: env.AZZORA_PRODUCTION_AUTH_KEY },
    { AZZORA_PRODUCTION_ALLOWED_ORIGINS: "https://azzora-seven.vercel.app" },
    {
      AZZORA_PRODUCTION_ALLOWED_ORIGINS:
        "https://candidate.example.test/unapproved",
    },
    { AZZORA_PRODUCTION_FINANCIAL_POSTING: "true" },
    { AZZORA_AI_ENABLED: "true" },
    {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_ID: env.AZZORA_PRODUCTION_VERCEL_PROJECT_ID,
    },
  ])
    expect(() => productionRuntime({ ...env, ...patch })).toThrow();
});
it("binds remote database proof to every approved identity/configuration boundary and disabled flags", () => {
  const c = productionRuntime(productionEnv());
  expect(() => assertProductionIdentity(proof(), c)).not.toThrow();
  for (const patch of [
    { companyId: "foreign" },
    { projectRef: "foreign" },
    { region: "eu-west-1" },
    { vercelProjectId: "foreign" },
    { configurationApprovalId: "foreign" },
    { financialPostingEnabled: true },
    { fictionalData: true },
    { backendCommandsInstalled: false },
    { allowedOrigins: ["https://evil.example"] },
    { privateStorageBucket: "public" },
    { contractVersion: "wrong" },
  ])
    expect(() => assertProductionIdentity({ ...proof(), ...patch }, c)).toThrow(
      "production_database_contract_required",
    );
});
it("categorically rejects the review identity and foreign company rather than widening finance.draft", () => {
  const c = productionRuntime(productionEnv()),
    actor = {
      userId: "real-user",
      companyId: c.companyId,
      email: "person@example.test",
    };
  expect(() => assertProductionActor(actor, c)).not.toThrow();
  for (const patch of [
    { companyId: "foreign" },
    { userId: "52f925bd-8744-48cc-8781-d20109387d14" },
    { email: "client-review@staging.azzora.test" },
    { authenticationPolicy: "client-review-password-only" },
  ])
    expect(() => assertProductionActor({ ...actor, ...patch }, c)).toThrow();
});
it("maps only established production RPC names and never routes recovery or arbitrary functions to staging", async () => {
  const transport = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(new URL(String(url)).origin).toBe(
          productionEnv().AZZORA_PRODUCTION_SUPABASE_URL,
        );
        expect(init?.method).toBe("POST");
        return Response.json({ ok: true });
      },
    ),
    rpc = createProductionRpc(productionRuntime(productionEnv()), transport);
  await rpc("staging_company_read", { p_session_hash: "opaque" });
  await rpc("azzora_runtime_identity", {
    p_company_id: productionEnv().AZZORA_PRODUCTION_COMPANY_ID,
  });
  expect(String(transport.mock.calls[0][0])).toBe(
    "https://zwjiztnsxenluqybxhhz.supabase.co/rest/v1/rpc/azzora_production_company_read",
  );
  expect(String(transport.mock.calls[1][0])).toContain(
    "/azzora_runtime_identity",
  );
  await expect(rpc("staging_auth_recovery_issue")).rejects.toThrow();
  await expect(rpc("arbitrary")).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(2);
});
it("fails before any request when production configuration is missing, or before auth when database proof fails", async () => {
  const transport = vi.fn(async () =>
    Response.json({ ...proof(), fictionalData: true }),
  );
  expect(
    (
      await createProductionCandidate({ env: {}, fetch: transport })(
        new Request("https://candidate.example.test/api/staging/auth/session"),
      )
    ).status,
  ).toBe(503);
  expect(transport).not.toHaveBeenCalled();
  expect(
    (
      await createProductionCandidate({
        env: productionEnv(),
        fetch: transport,
      })(new Request("https://candidate.example.test/api/staging/auth/session"))
    ).status,
  ).toBe(503);
  expect(transport).toHaveBeenCalledTimes(1);
});
it("production canonical hydration never reintroduces fixture records or silently relabels staging metadata", () => {
  const data = serializeCanonical(createSharedCompanyState());
  const m = data.records.find((r) => r.entity_type === "workspace_metadata")!;
  m.id = "__production_metadata";
  (m.payload.metadata as Record<string, unknown>).mode = "production";
  const empty = {
    ...data,
    records: [m],
    parties: [],
    projects: [],
    accounts: [],
    periods: [],
    journals: [],
    snapshots: [],
  };
  const state = hydrateCanonical(empty);
  expect(String(state.mode)).toBe("production");
  expect(state.manager.projects).toEqual([]);
  expect(state.manager.clients).toEqual([]);
  expect(state.finance.invoices).toEqual([]);
  expect(state.finance.accounting.journals).toEqual([]);
  expect(state.finance.cashAccounts).toEqual([]);
  expect(
    serializeCanonical(state).records.find(
      (r) => r.entity_type === "workspace_metadata",
    )!.id,
  ).toBe("__production_metadata");
  expect(() =>
    hydrateCanonical({
      ...empty,
      records: [m, { ...m, id: "__staging_metadata" }],
    }),
  ).toThrow();
});
it("cannot construct a production handler that would accidentally use default staging auth, RPC or storage", () => {
  expect(() =>
    createStagingHandler({ production: productionRuntime(productionEnv()) }),
  ).toThrow("explicitly isolated");
});

function productionAuthFixture(
  options: { review?: boolean; foreign?: boolean } = {},
) {
  const runtime = productionRuntime(productionEnv()),
    at = 1800000000000,
    uid = options.review
      ? "52f925bd-8744-48cc-8781-d20109387d14"
      : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const jwt = (aal: string) =>
    `e30.${Buffer.from(JSON.stringify({ sub: uid, session_id: sid, iss: runtime.url + "/auth/v1", aud: "authenticated", role: "authenticated", is_anonymous: false, exp: at / 1000 + 3600, iat: at / 1000, aal })).toString("base64url")}.c2ln`;
  const tokens = (aal: string) => ({
    access_token: jwt(aal),
    refresh_token: "fixture-private-refresh",
    expires_in: 3600,
  });
  const actor: StagingActor = {
    userId: uid,
    email: "owner@example.test",
    companyId: options.foreign
      ? "33333333-3333-4333-8333-333333333333"
      : runtime.companyId,
    role: "owner_admin",
    workspace: "manager",
    sessionHash: "",
    assurance: "aal2",
    mfaVerifiedAt: Date.now(),
    providerSessionId: sid,
    projectIds: [],
    capabilities: ["project.read", "project.write", "access.manage"],
  };
  let pending = "",
    session:
      { actor: StagingActor; ciphertext: string; version: number } | undefined,
    revoked = false;
  const calls = vi.fn(async (name: string, params: Record<string, unknown>) => {
    if (name === "staging_auth_rate") return true;
    if (name === "staging_auth_grant")
      return { ...actor, workspaces: ["manager", "accountant"] };
    if (name === "staging_auth_pending_put") {
      pending = String(params.p_ciphertext);
      return null;
    }
    if (name === "staging_auth_pending_get") return { ciphertext: pending };
    if (name === "staging_auth_pending_delete") return null;
    if (name === "staging_auth_session_put") {
      session = {
        actor: {
          ...actor,
          sessionHash: String(params.p_hash),
          assurance: params.p_assurance as "aal2",
        },
        ciphertext: String(params.p_ciphertext),
        version: 1,
      };
      return null;
    }
    if (name === "staging_auth_session_get") {
      if (revoked || !session) throw new StagingServiceError(401, "revoked");
      return session;
    }
    if (name === "staging_auth_actor") return actor;
    if (name === "staging_auth_session_touch") return null;
    if (name === "staging_auth_session_revoke") {
      revoked = true;
      return null;
    }
    throw Error("Unexpected isolated RPC " + name);
  });
  const transport = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/token")) return Response.json(tokens("aal1"));
      if (path.endsWith("/user"))
        return Response.json({
          id: uid,
          is_anonymous: false,
          factors: [{ id: "factor", factor_type: "totp", status: "verified" }],
        });
      if (path.endsWith("/challenge"))
        return Response.json({ id: "challenge" });
      if (path.endsWith("/verify"))
        return JSON.parse(String(init?.body)).code === "123456"
          ? Response.json(tokens("aal2"))
          : Response.json({}, { status: 401 });
      if (path.endsWith("/logout")) return new Response(null, { status: 204 });
      throw Error("Unexpected isolated provider URL");
    },
  );
  const auth = createStagingAuth({
    production: runtime,
    rpc: calls as StagingRpc,
    fetch: transport,
    now: () => at,
  });
  const request = (
    path: string,
    body?: unknown,
    cookie?: string,
    csrf?: string,
  ) =>
    new Request("https://candidate.example.test/api/staging/auth/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "https://candidate.example.test",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-Azzora-CSRF": csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { auth, request, calls, transport, runtime };
}
it("uses individual production identity, privileged MFA and a separate host-only cookie through login/session/logout", async () => {
  const f = productionAuthFixture();
  const login = await f.auth.handle(
    f.request("login", {
      email: "owner@example.test",
      password: "fictional-password",
      workspace: "manager",
    }),
    "/auth/login",
  );
  expect(login.status).toBe(200);
  const pending = await login.json();
  expect(pending.status).toBe("mfa-challenge");
  expect(login.headers.get("set-cookie")).toMatch(/^__Host-azzora_session=/);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const verify = await f.auth.handle(
    f.request("mfa/verify", { code: "123456" }, cookie, pending.csrf),
    "/auth/mfa/verify",
  );
  expect(verify.status).toBe(200);
  const signed = verify.headers.get("set-cookie")!.split(";")[0];
  const session = await f.auth.handle(
    f.request("session", undefined, signed),
    "/auth/session",
  );
  expect(session.status).toBe(200);
  const details = await session.json();
  expect(details.mode).toBe("production-candidate");
  expect(details.assurance).toBe("aal2");
  expect(details.companyId).toBe(f.runtime.companyId);
  expect(
    (
      await f.auth.handle(
        f.request(
          "session",
          undefined,
          signed.replace("__Host-azzora_session", "__Host-azzora_staging"),
        ),
        "/auth/session",
      )
    ).status,
  ).toBe(401);
  const logout = await f.auth.handle(
    f.request("logout", {}, signed, details.csrf),
    "/auth/logout",
  );
  expect(logout.status).toBe(200);
  expect(logout.headers.get("set-cookie")).toContain("__Host-azzora_session=;");
  expect(
    (
      await f.auth.handle(
        f.request("session", undefined, signed),
        "/auth/session",
      )
    ).status,
  ).toBe(401);
});
it("never gives the restricted review identity or another company a production pending/session grant", async () => {
  for (const option of [{ review: true }, { foreign: true }]) {
    const f = productionAuthFixture(option),
      r = await f.auth.handle(
        f.request("login", {
          email: "owner@example.test",
          password: "fictional-password",
          workspace: "manager",
        }),
        "/auth/login",
      );
    expect(r.status).toBe(403);
    expect(
      f.calls.mock.calls.some(([name]) =>
        ["staging_auth_pending_put", "staging_auth_session_put"].includes(name),
      ),
    ).toBe(false);
  }
});
it("rejects staging email before provider login and disables the fictional manual-recovery service", async () => {
  const f = productionAuthFixture();
  expect(
    (
      await f.auth.handle(
        f.request("login", {
          email: "owner@staging.azzora.test",
          password: "fictional-password",
          workspace: "manager",
        }),
        "/auth/login",
      )
    ).status,
  ).toBe(401);
  expect(f.transport).not.toHaveBeenCalled();
  expect(
    (
      await f.auth.handle(
        f.request("recovery/issue", {}),
        "/auth/recovery/issue",
      )
    ).status,
  ).toBe(503);
  expect(f.calls).not.toHaveBeenCalled();
});
function productionServerFixture(
  initialVersion = 1,
  wrongMode = false,
  productionBackup?: NonNullable<
    Parameters<typeof createStagingHandler>[0]
  >["productionBackup"],
) {
  const runtime = productionRuntime(productionEnv());
  const actor: StagingActor = {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "owner@example.test",
    companyId: runtime.companyId,
    role: "owner_admin",
    workspace: "accountant",
    sessionHash: "opaque",
    assurance: "aal2",
    mfaVerifiedAt: Date.now(),
    providerSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    projectIds: [],
    capabilities: [
      "project.read",
      "project.write",
      "finance.read",
      "finance.draft",
      "access.manage",
    ],
  };
  const settings = emptyOperations().settings;
  settings.company.name = "Fictional isolated production-contract harness";
  let data = serializeCanonical(createEmptyProductionCompany({ settings })),
    version = initialVersion;
  if (wrongMode) {
    const metadata = data.records.find(
      (r) => r.entity_type === "workspace_metadata",
    )!;
    metadata.id = "__staging_metadata";
    (metadata.payload.metadata as Record<string, unknown>).mode =
      "fictional-staging";
  }
  const calls = vi.fn(async (name: string, p: Record<string, unknown>) => {
    if (name === "staging_company_read") return { version, data };
    if (name === "staging_company_commit") {
      data = p.p_data as typeof data;
      version++;
      return { version, replayed: false };
    }
    throw Error("Unexpected production fixture call " + name);
  });
  const auth = {
    handle: vi.fn(),
    requireActor: vi.fn(async () => actor),
  } as unknown as ReturnType<typeof createStagingAuth>;
  const storage = {
    store: vi.fn(async () => {
      throw Error("Unexpected storagewrite");
    }),
    read: vi.fn(async () => {
      throw Error("Unexpected storageread");
    }),
  };
  const handle = createStagingHandler({
    rpc: calls as StagingRpc,
    auth,
    storage,
    production: runtime,
    productionBackup,
  });
  const request = (path: string, body?: unknown) =>
    new Request("https://candidate.example.test/api/staging" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "https://candidate.example.test",
        "Content-Type": "application/json",
        "X-Azzora-Expected-Version": String(version),
        "X-Azzora-Idempotency-Key": "production-fixture-key-0001",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { handle, request, calls, storage, actor, getData: () => data };
}
it("never bootstraps sample data on a production first login and rejects wrong-environment canonical records", async () => {
  const fresh = productionServerFixture(0);
  expect((await fresh.handle(fresh.request("/accounts/snapshot"))).status).toBe(
    409,
  );
  expect(fresh.calls.mock.calls.map(([name]) => name)).toEqual([
    "staging_company_read",
  ]);
  const wrong = productionServerFixture(1, true);
  expect((await wrong.handle(wrong.request("/accounts/snapshot"))).status).toBe(
    503,
  );
  expect(wrong.calls.mock.calls.map(([name]) => name)).toEqual([
    "staging_company_read",
  ]);
});
it("reads a zero-balance production workspace and saves an incomplete manual review with no finance or storage fallback", async () => {
  const f = productionServerFixture(),
    r = await f.handle(f.request("/accounts/snapshot"));
  expect(r.status).toBe(200);
  const before = await r.json();
  expect(before.ledger).toEqual([]);
  expect(before.invoices).toEqual([]);
  expect(before.documentAi.enabled).toBe(false);
  const saved = await f.handle(
    f.request("/accounts/action", {
      kind: "document-manual",
      id: "DOC-PRODUCTION-FIXTURE",
      fields: blankFields(),
      confirmed: true,
      rememberSupplier: false,
    }),
  );
  expect(saved.status).toBe(200);
  const body = await saved.json();
  expect(body.snapshot.documentEntries.reviews).toHaveLength(1);
  expect(body.snapshot.documentEntries.reviews[0].status).toBe("Draft");
  expect(body.snapshot.ledger).toEqual([]);
  expect(body.snapshot.metrics).toEqual(before.metrics);
  expect(f.getData().journals).toEqual([]);
  expect(f.storage.store).not.toHaveBeenCalled();
});
it("blocks real financial actions, external extraction and legal PDFs even for the legitimate production Owner", async () => {
  const f = productionServerFixture();
  for (const kind of [
    "invoice",
    "bill",
    "receipt",
    "expense",
    "create-cash-account",
    "create-expense-ledger",
    "transfer",
  ]) {
    const response = await f.handle(
      f.request("/accounts/action", {
        kind,
        id: "NO-REAL-POST",
        amount: "1.00",
      }),
    );
    expect(response.status).toBe(423);
  }
  const extraction = await f.handle(
    f.request("/accounts/documents/extract", {
      mode: "auto",
      file: { name: "fictional.png", mime: "image/png", data: "aGVsbG8=" },
    }),
  );
  expect(extraction.status).toBe(423);
  expect((await f.handle(f.request("/accounts/pdf/pnl"))).status).toBe(423);
  expect(
    f.calls.mock.calls.filter(([name]) => name === "staging_company_commit"),
  ).toHaveLength(0);
  expect(f.storage.store).not.toHaveBeenCalled();
});
it("returns a precise409 for a trusted recording-clock conflict rather than disguising it as a generic validation failure", async () => {
  const rpc = vi.fn();
  const auth = {
    handle: vi.fn(),
    requireActor: vi.fn(async () => {
      throw new ReviewRecordingError(
        "recording_clock_stale",
        "The ledger advanced. Refresh before retrying.",
      );
    }),
  } as unknown as ReturnType<typeof createStagingAuth>;
  const response = await createStagingHandler({ auth, rpc })(
    new Request("https://example.test/api/staging/accounts/snapshot"),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: "recording_clock_stale",
    error: "The ledger advanced. Refresh before retrying.",
  });
  expect(rpc).not.toHaveBeenCalled();
});
it("exports only an encrypted production backup for current Owner MFA, retaining verified hashes and rejecting other roles", async () => {
  const key = Buffer.alloc(32, 7),
    c = productionEnv().AZZORA_PRODUCTION_COMPANY_ID,
    keyId = "fixture-owner-key-v1",
    f = productionServerFixture(1, false, (source, read, actor) =>
      createProtectedProductionBackup(
        source,
        read,
        key,
        { companyId: c, keyId, capturedAt: "2026-11-11T00:00:00.000Z" },
        actor,
      ),
    );
  const r = await f.handle(f.request("/manager/backup"));
  expect(r.status).toBe(200);
  expect(r.headers.get("content-disposition")).toContain("encrypted.json");
  const envelope = await r.json();
  expect(envelope.format).toBe("azzora-encrypted-business-backup-v1");
  expect(JSON.stringify(envelope)).not.toContain(
    "Fictional isolated production-contract harness",
  );
  const original = JSON.parse(
    Buffer.from(
      decryptBusinessBackup(envelope, key, { companyId: c, keyId }),
    ).toString(),
  );
  expect(verifyProductionBusinessBackup(original).mode).toBe("production");
  f.actor.mfaVerifiedAt = Date.now() - 16 * 60_000;
  const stale = await f.handle(f.request("/manager/backup"));
  expect(stale.status).toBe(403);
  expect(await stale.json()).toMatchObject({
    code: "backup_recent_mfa_required",
    error: "A recent authenticator sign-in is required.",
  });
  f.actor.mfaVerifiedAt = Date.now();
  f.actor.role = "project_manager";
  expect((await f.handle(f.request("/manager/backup"))).status).toBe(403);
  const missing = productionServerFixture();
  const missingResponse = await missing.handle(
    missing.request("/manager/backup"),
  );
  expect(missingResponse.status).toBe(503);
  expect(await missingResponse.json()).toMatchObject({
    code: "production_backup_adapter_required",
    error: "Encrypted backup is not configured. No file was downloaded.",
  });
  const missingKey = productionServerFixture(1, false, async () => {
    throw new StagingServiceError(503, "production_owner_backup_key_required");
  });
  const missingKeyResponse = await missingKey.handle(
    missingKey.request("/manager/backup/encrypted"),
  );
  expect(missingKeyResponse.status).toBe(503);
  expect(await missingKeyResponse.json()).toMatchObject({
    code: "production_owner_backup_key_required",
    error: "Encrypted backup is not configured. No file was downloaded.",
  });
  expect(
    f.calls.mock.calls.filter(([name]) => name === "staging_company_commit"),
  ).toHaveLength(0);
});
it("rejects noncanonical or reused owner backup key bytes", () => {
  const key = Buffer.alloc(32, 9).toString("base64url");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const equivalent =
    key.slice(0, -1) + alphabet[alphabet.indexOf(key.at(-1)!) + 1];
  expect(Buffer.from(equivalent, "base64url")).toEqual(
    Buffer.from(key, "base64url"),
  );
  expect(isDistinctBackupKey(equivalent, [])).toBe(false);
  expect(isDistinctBackupKey(key, [equivalent])).toBe(false);
  expect(isDistinctBackupKey(key, [key])).toBe(false);
  expect(
    isDistinctBackupKey(key, [Buffer.alloc(32, 8).toString("base64url")]),
  ).toBe(true);
  const runtime = productionRuntime(productionEnv());
  for (const bad of ["", "invalid", equivalent, key]) {
    expect(() =>
      resolveProductionBackupKey(
        {
          AZZORA_PRODUCTION_BACKUP_KEY: bad,
          AZZORA_PRODUCTION_BACKUP_KEY_ID: "owner-key",
        },
        runtime,
      ),
    ).toThrow("production_owner_backup_key_required");
  }
  expect(
    resolveProductionBackupKey(
      {
        AZZORA_PRODUCTION_BACKUP_KEY: Buffer.alloc(32, 8).toString("base64url"),
        AZZORA_PRODUCTION_BACKUP_KEY_ID: "owner-key",
      },
      runtime,
    ).key,
  ).toEqual(Buffer.alloc(32, 8));
});
it("offers Owner-only synthetic import review without initializing or publishing any company records or echoing source rows", async () => {
  const f = productionServerFixture(0),
    source = {
      companyId: productionEnv().AZZORA_PRODUCTION_COMPANY_ID,
      sourceId: "synthetic-bounded-import",
      dataClass: "synthetic-rehearsal",
      cutoverDate: "2026-11-11",
      originalUtf8: '{"customer":"Synthetic private import original"}',
      rows: [
        {
          kind: "customer",
          sourceId: "c1",
          preservedId: "c1",
          payload: { name: "Synthetic private import original" },
        },
      ],
    };
  const r = await f.handle(f.request("/manager/import/preview", source));
  expect(r.status).toBe(200);
  const review = await r.json();
  expect(review.persisted).toBe(false);
  expect(review.financialPostingAllowed).toBe(false);
  expect(review.targetCompanyVersion).toBe(0);
  expect(review.rows).toBeUndefined();
  expect(review.originalUtf8).toBeUndefined();
  expect(JSON.stringify(review)).not.toContain(
    "Synthetic private import original",
  );
  expect(review.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (
      await f.handle(
        f.request("/manager/import/preview", {
          ...source,
          dataClass: "authorized-company-export",
        }),
      )
    ).status,
  ).toBe(423);
  expect(
    (
      await f.handle(
        f.request("/manager/import/preview", {
          ...source,
          companyId: "foreign",
        }),
      )
    ).status,
  ).toBe(403);
  f.actor.role = "accountant";
  expect(
    (await f.handle(f.request("/manager/import/preview", source))).status,
  ).toBe(403);
  expect(
    f.calls.mock.calls.filter(([name]) => name === "staging_company_commit"),
  ).toHaveLength(0);
});
