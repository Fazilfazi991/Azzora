import { describe, expect, it, vi } from "vitest";
import { createStagingRecovery } from "./auth-recovery";
import type { StagingActor } from "./auth";
function setup(role = "site_staff") {
  const owner: StagingActor = {
    userId: "owner",
    email: "owner@staging.azzora.test",
    companyId: "company",
    role: "owner_admin",
    workspace: "manager",
    sessionHash: "owner-hash",
    assurance: "aal2",
    providerSessionId: "owner-provider",
    capabilities: ["access.manage"],
    projectIds: [],
  };
  let pending: { ciphertext: string; kind: string } | null = null;
  let used = false;
  let handoff = "";
  const provider = vi.fn(
    async (path: string, method: string, _body?: unknown, access?: string) => {
      if (path === "/user" && method === "GET")
        return {
          factors: [
            {
              id:
                access === "owner-original" ? "owner-factor" : "target-factor",
              factor_type: "totp",
              status: "verified",
            },
          ],
        };
      if (path.endsWith("/challenge")) return { id: "challenge" };
      if (path.startsWith("/factors/") && path.endsWith("/verify"))
        return {
          access_token:
            access === "owner-original" ? "owner-fresh" : "target-fresh",
          refresh_token: "private-refresh",
          expires_in: 3600,
        };
      if (path === "/verify")
        return {
          access_token: "target-recovery",
          refresh_token: "private-refresh",
          expires_in: 3600,
        };
      return {};
    },
  );
  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
    if (
      name === "staging_auth_tokens_update" ||
      name === "staging_auth_recovery_complete"
    )
      return null;
    if (name === "staging_auth_rate") return true;
    if (name === "staging_auth_recovery_target") {
      if (params.p_email !== "engineer@staging.azzora.test")
        throw Object.assign(Error("denied"), { status: 403 });
      return { userId: "target" };
    }
    if (name === "staging_auth_recovery_issue") {
      handoff = String(params.p_ciphertext);
      return null;
    }
    if (name === "staging_auth_recovery_take") {
      if (used) throw Object.assign(Error("used"), { status: 401 });
      used = true;
      return { ciphertext: handoff, userId: "target", role };
    }
    if (name === "staging_auth_recovery_pending_put") {
      pending = {
        ciphertext: String(params.p_ciphertext),
        kind: role === "accountant" ? "pending" : "verified",
      };
      return null;
    }
    if (
      name === "staging_auth_recovery_pending_get" ||
      name === "staging_auth_recovery_claim"
    )
      return {
        ...pending,
        userId: "target",
        role,
        workspace: "manager",
        providerSessionId: "target-provider",
      };
    if (name === "staging_auth_recovery_mfa") {
      pending = { ciphertext: String(params.p_ciphertext), kind: "verified" };
      return null;
    }
    throw Error("Unexpected recovery fixture RPC");
  });
  const transport = vi.fn(async () =>
    Response.json({
      hashed_token: "sensitive-provider-recovery",
      id: "target",
    }),
  );
  const context = {
    rpc: rpc as never,
    load: vi.fn(async () => ({
      actor: owner,
      token: "owner-cookie",
      t: {
        access_token: "owner-original",
        refresh_token: "owner-refresh",
        expires_at: 1800003600,
      },
      version: 1,
    })),
    provider: provider as never,
    verifyToken: vi.fn(async (token: string) => ({
      userId: token.startsWith("owner") ? "owner" : "target",
      providerSessionId: token.startsWith("owner")
        ? "owner-provider"
        : "target-provider",
      assurance: token === "target-recovery" ? "aal1" : "aal2",
    })),
    tokens: (value: object) => ({ ...value, expires_at: 1800003600 }) as never,
    encrypt: (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url"),
    decrypt: <T>(value: string) =>
      JSON.parse(Buffer.from(value, "base64url").toString()) as T,
    csrf: () => "csrf-proof",
    requireCsrf: (request: Request) => {
      if (request.headers.get("X-Azzora-CSRF") !== "csrf-proof")
        throw Object.assign(Error("csrf"), { status: 403 });
    },
    boundary: (request: Request) => {
      if (request.headers.get("Origin") !== "https://staging.test")
        throw Object.assign(Error("origin"), { status: 403 });
    },
    input: async (request: Request) => request.json(),
    transport: transport as typeof fetch,
    url: "https://hkhomrrvxtcxnxvdlkoh.supabase.co",
    serviceKey: () => "sb_secret_fixture",
  };
  const recovery = createStagingRecovery(context);
  const req = (path: string, body: unknown, cookie?: string, csrf?: string) =>
    new Request("https://staging.test" + path, {
      method: "POST",
      headers: {
        Origin: "https://staging.test",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-Azzora-CSRF": csrf } : {}),
      },
      body: JSON.stringify(body),
    });
  async function start() {
    const response = await recovery.handle(
      req("/auth/recovery/start", {
        email: "engineer@staging.azzora.test",
        code: "123456",
      }),
      "/auth/recovery/start",
    );
    return { response, body: await response.json() };
  }
  async function exchange(code: string) {
    const response = await recovery.handle(
      req("/auth/recovery/verify", { handoffCode: code, workspace: "manager" }),
      "/auth/recovery/verify",
    );
    return {
      response,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  return {
    recovery,
    context,
    owner,
    rpc,
    provider,
    transport,
    req,
    start,
    exchange,
  };
}
describe("manual fictional recovery security boundary", () => {
  it("requires a fresh genuine Owner MFA verification before generating a private handoff", async () => {
    const f = setup();
    const result = await f.start();
    expect(result.response.status).toBe(200);
    expect(
      f.provider.mock.calls.some(
        ([path]) => path === "/factors/owner-factor/verify",
      ),
    ).toBe(true);
    expect(result.body.handoffCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.body.emailSent).toBe(false);
    expect(JSON.stringify(result.body)).not.toContain(
      "sensitive-provider-recovery",
    );
    expect(JSON.stringify(f.transport.mock.calls)).toContain("recovery");
    expect(JSON.stringify(f.transport.mock.calls)).not.toContain("/recover");
  });
  it("does not treat an old aal2 session as sufficient without a new valid code", async () => {
    const f = setup();
    f.provider.mockRejectedValueOnce(
      Object.assign(Error("invalid"), { status: 401 }),
    );
    const result = await f.start();
    expect(result.response.status).toBe(401);
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("denies a non-Owner despite a privileged MFA session", async () => {
    const f = setup();
    f.owner.role = "accountant";
    const result = await f.start();
    expect(result.response.status).toBe(403);
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("requires an explicit access-management capability", async () => {
    const f = setup();
    f.owner.capabilities = [];
    expect((await f.start()).response.status).toBe(403);
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("exchanges the genuine provider token without returning it or creating an ordinary app session", async () => {
    const f = setup();
    const issued = await f.start();
    const result = await f.exchange(issued.body.handoffCode);
    expect(result.response.status).toBe(200);
    expect(result.body.status).toBe("reset-password");
    expect(result.response.headers.get("set-cookie")).toContain(
      "__Host-azzora_recovery=",
    );
    expect(JSON.stringify(result.body)).not.toMatch(
      /private-refresh|target-recovery|sensitive-provider/,
    );
    expect(
      f.rpc.mock.calls.some(([name]) => name === "staging_auth_session_put"),
    ).toBe(false);
  });
  it("does not replay a consumed handoff code", async () => {
    const f = setup();
    const issued = await f.start();
    expect((await f.exchange(issued.body.handoffCode)).response.status).toBe(
      200,
    );
    expect((await f.exchange(issued.body.handoffCode)).response.status).toBe(
      401,
    );
  });
  it("requires privileged targets to verify their existing factor again", async () => {
    const f = setup("accountant");
    const issued = await f.start();
    const exchanged = await f.exchange(issued.body.handoffCode);
    expect(exchanged.body.status).toBe("mfa-challenge");
    const result = await f.recovery.handle(
      f.req(
        "/auth/recovery/mfa",
        { code: "123456" },
        exchanged.cookie,
        exchanged.body.csrf,
      ),
      "/auth/recovery/mfa",
    );
    expect(result.status).toBe(200);
    expect((await result.json()).status).toBe("reset-password");
    expect(
      f.rpc.mock.calls.some(([name]) => name === "staging_auth_recovery_mfa"),
    ).toBe(true);
  });
  it("does not bypass CSRF when changing a password", async () => {
    const f = setup();
    const issued = await f.start();
    const exchanged = await f.exchange(issued.body.handoffCode);
    const result = await f.recovery.handle(
      f.req(
        "/auth/recovery/password",
        { newPassword: "FictionalPassword9!" },
        exchanged.cookie,
      ),
      "/auth/recovery/password",
    );
    expect(result.status).toBe(403);
    expect(
      f.provider.mock.calls.some(
        ([path, method]) => path === "/user" && method === "PUT",
      ),
    ).toBe(false);
  });
  it("changes password through the provider then revokes app sessions and signs out globally", async () => {
    const f = setup();
    const issued = await f.start();
    const exchanged = await f.exchange(issued.body.handoffCode);
    const result = await f.recovery.handle(
      f.req(
        "/auth/recovery/password",
        { newPassword: "FictionalPassword9!" },
        exchanged.cookie,
        exchanged.body.csrf,
      ),
      "/auth/recovery/password",
    );
    expect(result.status).toBe(200);
    expect(
      f.provider.mock.calls.some(
        ([path, method]) => path === "/user" && method === "PUT",
      ),
    ).toBe(true);
    expect(
      f.rpc.mock.calls.some(
        ([name]) => name === "staging_auth_recovery_complete",
      ),
    ).toBe(true);
    expect(
      f.provider.mock.calls.some(([path]) => path === "/logout?scope=global"),
    ).toBe(true);
    expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("does not claim success when provider password change fails", async () => {
    const f = setup();
    const issued = await f.start();
    const exchanged = await f.exchange(issued.body.handoffCode);
    f.provider.mockImplementationOnce(async () => {
      throw Object.assign(Error("provider unavailable"), { status: 503 });
    });
    const result = await f.recovery.handle(
      f.req(
        "/auth/recovery/password",
        { newPassword: "FictionalPassword9!" },
        exchanged.cookie,
        exchanged.body.csrf,
      ),
      "/auth/recovery/password",
    );
    expect(result.status).toBe(503);
    expect(
      f.rpc.mock.calls.some(
        ([name]) => name === "staging_auth_recovery_complete",
      ),
    ).toBe(false);
  });
  it("does not replace a lost privileged factor through the password recovery flow", async () => {
    const f = setup("accountant");
    const original = f.provider.getMockImplementation()!;
    f.provider.mockImplementation(async (path, method, body, access) => {
      if (path === "/user" && method === "GET" && access === "target-recovery")
        return { factors: [] };
      return original(path, method, body, access);
    });
    const issued = await f.start();
    const exchanged = await f.exchange(issued.body.handoffCode);
    expect(exchanged.response.status).toBe(403);
    expect(
      f.rpc.mock.calls.some(
        ([name]) => name === "staging_auth_recovery_pending_put",
      ),
    ).toBe(false);
    expect(
      f.provider.mock.calls.some(
        ([path, method]) => path === "/factors" && method === "POST",
      ),
    ).toBe(false);
  });
  it("still attempts provider global revocation when durable app revocation fails, and reports unconfirmed", async () => {
    const f = setup();
    const issued = await f.start();
    const exchanged = await f.exchange(issued.body.handoffCode);
    const original = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation(async (name, params) => {
      if (name === "staging_auth_recovery_complete")
        throw Object.assign(Error("database unavailable"), { status: 503 });
      return original(name, params);
    });
    const result = await f.recovery.handle(
      f.req(
        "/auth/recovery/password",
        { newPassword: "FictionalPassword9!" },
        exchanged.cookie,
        exchanged.body.csrf,
      ),
      "/auth/recovery/password",
    );
    expect(result.status).toBe(503);
    expect(
      f.provider.mock.calls.some(([path]) => path === "/logout?scope=global"),
    ).toBe(true);
    expect((await result.json()).error).toContain(
      "could not be fully confirmed",
    );
  });
});
