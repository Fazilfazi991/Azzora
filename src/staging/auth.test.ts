import { describe, expect, it, vi } from "vitest";
import { createStagingAuth, type StagingActor } from "./auth.js";
const origin = "https://127.0.0.1:5443";
const sid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function fixture(
  role: StagingActor["role"] = "accountant",
  refreshSoon = false,
  passwordOnly = false,
) {
  const uid = passwordOnly
    ? "52f925bd-8744-48cc-8781-d20109387d14"
    : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const at = 1800000000000;
  let revoked = false;
  let factor = false;
  const flows = new Map<string, Record<string, unknown>>();
  const token = (aal: string) =>
    `e30.${Buffer.from(JSON.stringify({ sub: uid, session_id: sid, iss: "https://hkhomrrvxtcxnxvdlkoh.supabase.co/auth/v1", aud: "authenticated", role: "authenticated", is_anonymous: false, exp: at / 1000 + 3600, iat: at / 1000, aal })).toString("base64url")}.c2ln`;
  const tokens = (aal: string) => ({
    access_token: token(aal),
    refresh_token: "private-provider-refresh",
    expires_in: 3600,
  });
  const actor: StagingActor = {
    userId: uid,
    email: passwordOnly
      ? "client-review@staging.azzora.test"
      : "accountant@staging.azzora.test",
    authenticationPolicy: passwordOnly
      ? "client-review-password-only"
      : undefined,
    companyId: "11111111-1111-4111-8111-111111111111",
    role,
    workspace: role === "accountant" ? "accountant" : "manager",
    sessionHash: "",
    assurance: role === "accountant" && !passwordOnly ? "aal2" : "aal1",
    providerSessionId: sid,
    projectIds: [],
    capabilities: passwordOnly
      ? ["finance.read", "finance.draft"]
      : ["finance.read"],
  };
  const grant = {
    ...actor,
    workspaces: role === "accountant" ? ["accountant"] : ["manager"],
  };
  const rpc = vi.fn(async (name: string, p: Record<string, unknown>) => {
    if (name === "staging_auth_rate") return true;
    if (name === "staging_auth_grant") return grant;
    const key = String(p.p_hash || p.p_session_hash);
    if (
      name === "staging_auth_pending_put" ||
      name === "staging_auth_session_put"
    ) {
      flows.set(key, { ciphertext: p.p_ciphertext, version: 1 });
      actor.sessionHash = key;
      return null;
    }
    if (name === "staging_auth_pending_get") return flows.get(key);
    if (name === "staging_auth_pending_delete") {
      flows.delete(key);
      return null;
    }
    if (name === "staging_auth_session_get" || name === "staging_auth_actor") {
      if (revoked) throw Object.assign(Error("denied"), { status: 401 });
      return name.endsWith("_get") ? { ...flows.get(key), actor } : actor;
    }
    if (name === "staging_auth_session_revoke") {
      revoked = true;
      return null;
    }
    if (name === "staging_auth_session_touch") return null;
    if (name === "staging_auth_tokens_update") {
      const existing = flows.get(key)!;
      if (existing.version !== p.p_expected_version)
        throw Error("Refresh conflict");
      flows.set(key, {
        ciphertext: p.p_ciphertext,
        version: Number(existing.version) + 1,
      });
      return null;
    }
    throw Error("Unsupported fixture RPC " + name);
  });
  const transport = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/token"))
        return Response.json({
          ...tokens("aal1"),
          expires_in:
            refreshSoon && !String(url).includes("refresh_token") ? 1 : 3600,
        });
      if (path.endsWith("/user"))
        return Response.json({
          id: uid,
          is_anonymous: false,
          factors: factor
            ? [{ id: "factor", factor_type: "totp", status: "verified" }]
            : [],
        });
      if (path.endsWith("/factors") && init?.method === "POST")
        return Response.json({
          id: "factor",
          totp: { qr_code: "<svg/>", uri: "otpauth://totp/private" },
        });
      if (path.endsWith("/challenge"))
        return Response.json({ id: "challenge" });
      if (path.endsWith("/verify")) {
        const body = JSON.parse(String(init?.body));
        if (body.code !== "123456") return Response.json({}, { status: 401 });
        factor = true;
        return Response.json(tokens("aal2"));
      }
      if (path.endsWith("/logout")) return new Response(null, { status: 204 });
      throw Error("Unexpected provider fixture URL");
    },
  );
  const auth = createStagingAuth({
    rpc: rpc as never,
    fetch: transport as typeof fetch,
    now: () => at,
    url: "https://hkhomrrvxtcxnxvdlkoh.supabase.co",
    publishableKey: "sb_publishable_test",
    encryptionKey: Buffer.alloc(32, 7).toString("base64url"),
    allowedOrigins: new Set([origin]),
  });
  const request = (
    path: string,
    data?: unknown,
    cookie?: string,
    csrf?: string,
    requestOrigin = origin,
  ) =>
    new Request(origin + "/api/staging" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-Azzora-CSRF": csrf } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  async function login() {
    const response = await auth.handle(
      request("/auth/login", {
        email: actor.email,
        password: "fictional-password",
        workspace: actor.workspace,
      }),
      "/auth/login",
    );
    return {
      response,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")!.split(";")[0],
    };
  }
  return { auth, rpc, transport, flows, actor, request, login };
}
describe("individual staging authentication controlled boundary", () => {
  it("refreshes near-expiry provider tokens and atomically replaces encrypted storage", async () => {
    const f = fixture("project_manager", true);
    const step = await f.login();
    const response = await f.auth.handle(
      f.request("/auth/session", undefined, step.cookie),
      "/auth/session",
    );
    expect(response.status).toBe(200);
    expect(
      f.transport.mock.calls.some(([url]) =>
        String(url).includes("grant_type=refresh_token"),
      ),
    ).toBe(true);
    expect(
      f.rpc.mock.calls.some(([name]) => name === "staging_auth_tokens_update"),
    ).toBe(true);
    expect([...f.flows.values()][0].version).toBe(2);
    expect(JSON.stringify([...f.flows.values()])).not.toContain(
      "private-provider-refresh",
    );
  });
  it("rejects tampered encrypted session material without falling back to demo identity", async () => {
    const f = fixture("project_manager");
    const step = await f.login();
    [...f.flows.values()][0].ciphertext = "corrupted";
    const response = await f.auth.handle(
      f.request("/auth/session", undefined, step.cookie),
      "/auth/session",
    );
    expect(response.status).toBe(401);
  });
  it("fails closed during a provider outage while a local session still exists", async () => {
    const f = fixture("project_manager");
    const step = await f.login();
    f.transport.mockRejectedValueOnce(Error("offline"));
    const response = await f.auth.handle(
      f.request("/auth/session", undefined, step.cookie),
      "/auth/session",
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-provider");
  });
  it("requires real-provider MFA enrollment for Accountant before an active app session exists", async () => {
    const f = fixture();
    const step = await f.login();
    expect(step.response.status).toBe(200);
    expect(step.body.status).toBe("mfa-enroll");
    expect(step.body.qrCode).toBe("<svg/>");
    expect(step.response.headers.get("set-cookie")).toContain(
      "Secure; HttpOnly; SameSite=Strict",
    );
    expect(
      f.rpc.mock.calls.some(([name]) => name === "staging_auth_session_put"),
    ).toBe(false);
    expect(JSON.stringify([...f.flows.values()])).not.toContain(
      "private-provider-refresh",
    );
    expect(JSON.stringify(step.body)).not.toContain("access_token");
  });
  it("rejects verification without pending CSRF before any provider request", async () => {
    const f = fixture();
    const step = await f.login();
    const before = f.transport.mock.calls.length;
    const response = await f.auth.handle(
      f.request("/auth/mfa/verify", { code: "123456" }, step.cookie),
      "/auth/mfa/verify",
    );
    expect(response.status).toBe(403);
    expect(f.transport.mock.calls.length).toBe(before);
  });
  it("completes verified MFA, rotates the opaque cookie and returns only safe session information", async () => {
    const f = fixture();
    const step = await f.login();
    const verified = await f.auth.handle(
      f.request(
        "/auth/mfa/verify",
        { code: "123456" },
        step.cookie,
        step.body.csrf,
      ),
      "/auth/mfa/verify",
    );
    expect(verified.status).toBe(200);
    const cookie = verified.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).not.toBe(step.cookie);
    const session = await f.auth.handle(
      f.request("/auth/session", undefined, cookie),
      "/auth/session",
    );
    expect(session.status).toBe(200);
    const body = await session.json();
    expect(body.assurance).toBe("aal2");
    expect(body.csrf).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(
      /private-provider|access_token|refresh_token/,
    );
  });
  it("does not create an active session for an incorrect MFA code", async () => {
    const f = fixture();
    const step = await f.login();
    const response = await f.auth.handle(
      f.request(
        "/auth/mfa/verify",
        { code: "000000" },
        step.cookie,
        step.body.csrf,
      ),
      "/auth/mfa/verify",
    );
    expect(response.status).toBe(401);
    expect(
      f.rpc.mock.calls.some(([name]) => name === "staging_auth_session_put"),
    ).toBe(false);
  });
  it("permits a nonprivileged Manager identity without bypassing provider verification", async () => {
    const f = fixture("project_manager");
    const step = await f.login();
    expect(step.body.status).toBe("authenticated");
    expect(
      f.transport.mock.calls.filter(([url]) => String(url).endsWith("/user"))
        .length,
    ).toBeGreaterThan(0);
    expect(
      f.rpc.mock.calls.some(([name]) => name === "staging_auth_session_put"),
    ).toBe(true);
  });
  it("revokes the durable app session and rejects subsequent reads", async () => {
    const f = fixture("project_manager");
    const step = await f.login();
    const session = await f.auth.handle(
      f.request("/auth/session", undefined, step.cookie),
      "/auth/session",
    );
    const body = await session.json();
    const logout = await f.auth.handle(
      f.request("/auth/logout", {}, step.cookie, body.csrf),
      "/auth/logout",
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(
      (
        await f.auth.handle(
          f.request("/auth/session", undefined, step.cookie),
          "/auth/session",
        )
      ).status,
    ).toBe(401);
  });
  it("rejects a different workspace even with a valid current session", async () => {
    const f = fixture("project_manager");
    const step = await f.login();
    await expect(
      f.auth.requireActor(
        f.request("/finance", undefined, step.cookie),
        "accountant",
      ),
    ).rejects.toThrow("workspace");
  });
  it("rejects cross-origin login without provider or database effects", async () => {
    const f = fixture();
    const response = await f.auth.handle(
      f.request(
        "/auth/login",
        {
          email: f.actor.email,
          password: "fictional",
          workspace: "accountant",
        },
        undefined,
        undefined,
        "https://evil.test",
      ),
      "/auth/login",
    );
    expect(response.status).toBe(403);
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
});

it("owner-approved restricted client signs in and refreshes at real aal1 without MFA enrollment", async () => {
  const f = fixture("accountant", true, true),
    l = await f.login();
  expect(l.body.status).toBe("authenticated");
  expect(
    f.transport.mock.calls.some(([u]) => /factors|challenge/.test(String(u))),
  ).toBe(false);
  const r = await f.auth.handle(
    f.request("/auth/session", undefined, l.cookie),
    "/auth/session",
  );
  expect(r.status).toBe(200);
  expect((await r.json()).assurance).toBe("aal1");
});
