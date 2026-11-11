import { describe, expect, it, vi } from "vitest";
import { createBackendAuth, type AuthSession } from "./auth.js";
import {
  authorize,
  type AccessGrant,
  type AuthorizedActor,
} from "./permissions.js";
import { createSupabaseTokenVerifier } from "./auth-supabase.js";
import { backendCookieName } from "./security.js";

const origin = "https://staging.example.test";
function setup() {
  let time = 1_800_000_000_000;
  const sessions = new Map<string, AuthSession>();
  const grant: AccessGrant = {
    userId: "user",
    companyId: "company",
    active: true,
    roles: ["accountant"],
    workspaces: ["accountant"],
    projectIds: [],
    capabilities: ["finance.read"],
  };
  const identity = {
    verifyAccessToken: vi.fn(async () => ({
      userId: "user",
      providerSessionId: "provider-session",
      assurance: "aal2" as const,
      expiresAt: time + 3_600_000,
    })),
    revokeSession: vi.fn(async () => {}),
  };
  const access = {
    currentGrant: vi.fn(async () => grant),
    providerSessionActive: vi.fn(async () => true),
  };
  const store = {
    create: vi.fn(async (s: AuthSession) => {
      sessions.set(s.tokenHash, { ...s });
    }),
    read: vi.fn(async (hash: string) => sessions.get(hash) || null),
    touch: vi.fn(async (hash: string, at: number) => {
      const s = sessions.get(hash);
      if (!s || s.revokedAt !== null || s.expiresAt <= at) return false;
      s.lastSeenAt = at;
      return true;
    }),
    revoke: vi.fn(async (hash: string, at: number) => {
      const s = sessions.get(hash);
      if (s) s.revokedAt = at;
    }),
  };
  const audit = { append: vi.fn(async () => {}) };
  const auth = createBackendAuth({
    identity,
    sessions: store,
    access,
    audit,
    now: () => time,
    allowedOrigins: new Set([origin]),
  });
  const req = (
    method = "POST",
    cookie?: string,
    csrf?: string,
    requestOrigin = origin,
  ) =>
    new Request(`${origin}/api/session`, {
      method,
      headers: {
        origin: requestOrigin,
        ...(cookie ? { cookie } : {}),
        ...(csrf ? { "x-azzora-csrf": csrf } : {}),
      },
    });
  const login = async () =>
    auth.login(req(), {
      accessToken: "verified-provider-token",
      companyId: "company",
      workspace: "accountant",
    });
  return {
    auth,
    sessions,
    grant,
    identity,
    access,
    store,
    audit,
    req,
    login,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
describe("production authentication boundary (controlled stores, not live Supabase)", () => {
  it("exchanges a verified token for a hashed opaque cookie and never stores the provider token", async () => {
    const s = setup();
    const login = await s.login();
    expect(login.cookie).toContain("Secure; HttpOnly; SameSite=Strict");
    expect([...s.sessions.keys()][0]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify([...s.sessions.values()])).not.toContain(
      "verified-provider-token",
    );
    expect(
      await s.auth.authenticate(s.req("GET", login.cookie), "accountant"),
    ).toMatchObject({ userId: "user", assurance: "aal2" });
  });
  it.each([
    "https://evil.test",
    "null",
    "https://staging.example.test.evil.test",
  ])("rejects foreign login origin %s", async (value) => {
    const s = setup();
    await expect(
      s.auth.login(s.req("POST", undefined, undefined, value), {
        accessToken: "x",
        companyId: "company",
        workspace: "accountant",
      }),
    ).rejects.toThrow("origin_denied");
    expect(s.identity.verifyAccessToken).not.toHaveBeenCalled();
  });
  it("rejects an unapproved host and cleartext transport", async () => {
    const s = setup();
    for (const url of ["https://elsewhere.test", "http://staging.example.test"])
      await expect(
        s.auth.authenticate(new Request(url), "accountant"),
      ).rejects.toThrow("origin_denied");
  });
  it("does not accept a frontend-selected role as authorization", async () => {
    const s = setup();
    s.grant.workspaces = ["manager"];
    await expect(s.login()).rejects.toThrow("workspace_denied");
  });
  it("checks membership on each request so revocation takes effect", async () => {
    const s = setup();
    const login = await s.login();
    s.grant.active = false;
    await expect(
      s.auth.authenticate(s.req("GET", login.cookie), "accountant"),
    ).rejects.toThrow("workspace_denied");
  });
  it("rejects revoked provider sessions even while cookie has not expired", async () => {
    const s = setup();
    const login = await s.login();
    s.access.providerSessionActive.mockResolvedValue(false);
    await expect(
      s.auth.authenticate(s.req("GET", login.cookie), "accountant"),
    ).rejects.toThrow("authentication_required");
  });
  it("requires privileged MFA", async () => {
    const s = setup();
    s.identity.verifyAccessToken.mockResolvedValue({
      userId: "user",
      providerSessionId: "provider-session",
      assurance: "aal1" as "aal2",
      expiresAt: 1_800_003_600_000,
    });
    await expect(s.login()).rejects.toThrow("mfa_required");
  });
  it("prevents Accountant sessions entering Manager workspace without a grant", async () => {
    const s = setup();
    const login = await s.login();
    await expect(
      s.auth.authenticate(s.req("GET", login.cookie), "manager"),
    ).rejects.toThrow("workspace_denied");
  });
  it.each([undefined, "wrong"])(
    "requires CSRF on writes (%s)",
    async (csrf) => {
      const s = setup();
      const login = await s.login();
      await expect(
        s.auth.authenticate(s.req("POST", login.cookie, csrf), "accountant"),
      ).rejects.toThrow("csrf_denied");
    },
  );
  it("accepts a same-origin write with the per-session CSRF secret", async () => {
    const s = setup();
    const login = await s.login();
    await expect(
      s.auth.authenticate(
        s.req("POST", login.cookie, login.csrf),
        "accountant",
      ),
    ).resolves.toMatchObject({ userId: "user" });
  });
  it("rejects duplicate session cookies", async () => {
    const s = setup();
    const login = await s.login();
    await expect(
      s.auth.authenticate(
        s.req("GET", `${login.cookie}; ${backendCookieName}=${"a".repeat(43)}`),
        "accountant",
      ),
    ).rejects.toThrow("authentication_required");
  });
  it.each([15 * 60_000, 3_600_000, 8 * 3_600_000])(
    "expires idle/absolute/provider-bounded session at %s ms",
    async (elapsed) => {
      const s = setup();
      const login = await s.login();
      s.advance(elapsed);
      await expect(
        s.auth.authenticate(s.req("GET", login.cookie), "accountant"),
      ).rejects.toThrow("authentication_required");
    },
  );
  it("fails closed if atomic session touch loses a revocation race", async () => {
    const s = setup();
    const login = await s.login();
    s.store.touch.mockResolvedValue(false);
    await expect(
      s.auth.authenticate(s.req("GET", login.cookie), "accountant"),
    ).rejects.toThrow("authentication_required");
  });
  it("logout revokes locally before contacting provider", async () => {
    const s = setup();
    const login = await s.login();
    s.identity.revokeSession.mockRejectedValue(new Error("provider down"));
    await expect(
      s.auth.logout(s.req("POST", login.cookie, login.csrf)),
    ).rejects.toThrow("provider down");
    await expect(
      s.auth.authenticate(s.req("GET", login.cookie), "accountant"),
    ).rejects.toThrow("authentication_required");
  });
  it("revokes a newly created session if mandatory audit persistence fails", async () => {
    const s = setup();
    s.audit.append.mockRejectedValue(new Error("audit unavailable"));
    await expect(s.login()).rejects.toThrow("audit unavailable");
    expect([...s.sessions.values()][0].revokedAt).not.toBeNull();
  });
});
describe("resource and policy authorization", () => {
  const actor = (): AuthorizedActor => ({
    userId: "u",
    companyId: "c",
    sessionId: "s",
    assurance: "aal2",
    grant: {
      userId: "u",
      companyId: "c",
      active: true,
      roles: ["project_manager"],
      workspaces: ["manager"],
      projectIds: ["p"],
      capabilities: ["project.write", "expense.approve", "finance.read"],
    },
  });
  it("does not grant draft mutations to a read-only Accountant", () => {
    const a = actor();
    a.grant.roles = ["accountant"];
    a.grant.workspaces = ["accountant"];
    a.grant.capabilities = ["finance.read"];
    expect(() =>
      authorize(a, "finance.read", { companyId: "c" }),
    ).not.toThrow();
    expect(() => authorize(a, "finance.draft", { companyId: "c" })).toThrow(
      "capability_denied",
    );
    a.grant.capabilities.push("finance.draft");
    expect(() =>
      authorize(a, "finance.draft", { companyId: "c" }),
    ).not.toThrow();
    expect(() => authorize(a, "finance.post", { companyId: "c" })).toThrow(
      "capability_denied",
    );
  });
  it("allows a currently assigned project write", () =>
    expect(() =>
      authorize(actor(), "project.write", { companyId: "c", projectId: "p" }),
    ).not.toThrow());
  it.each(["other", ""])("rejects cross-project access %s", (projectId) =>
    expect(() =>
      authorize(actor(), "project.write", { companyId: "c", projectId }),
    ).toThrow("project_access_denied"),
  );
  it("rejects cross-company access", () =>
    expect(() =>
      authorize(actor(), "project.write", {
        companyId: "other",
        projectId: "p",
      }),
    ).toThrow("company_access_denied"));
  it("requires explicit posting capability even for an owner", () => {
    const a = actor();
    a.grant.roles = ["owner"];
    a.grant.workspaces.push("accountant");
    expect(() => authorize(a, "finance.post", { companyId: "c" })).toThrow(
      "capability_denied",
    );
  });
  it("rejects manager ledger access even with a spoofed finance capability", () =>
    expect(() =>
      authorize(actor(), "finance.read", { companyId: "c" }),
    ).toThrow("finance_access_denied"));
  it("excludes self-approval and missing requester", () => {
    for (const submittedBy of ["u", undefined])
      expect(() =>
        authorize(actor(), "expense.approve", {
          companyId: "c",
          projectId: "p",
          submittedBy,
        }),
      ).toThrow("self_approval_denied");
  });
  it("allows separately granted non-self approval", () =>
    expect(() =>
      authorize(actor(), "expense.approve", {
        companyId: "c",
        projectId: "p",
        submittedBy: "other",
      }),
    ).not.toThrow());
});
describe("Supabase online JWT verification", () => {
  const uid = "11111111-1111-4111-8111-111111111111";
  const sid = "22222222-2222-4222-8222-222222222222";
  const claims = () => ({
    iss: "https://approved.supabase.co/auth/v1",
    aud: "authenticated",
    role: "authenticated",
    sub: uid,
    session_id: sid,
    exp: 1800003600,
    iat: 1800000000,
    aal: "aal2",
    is_anonymous: false,
  });
  const token = (value: object) =>
    `e30.${Buffer.from(JSON.stringify(value)).toString("base64url")}.c2ln`;
  const setupVerifier = (response: Response) => {
    const transport = vi.fn(async () => response);
    return {
      transport,
      verify: createSupabaseTokenVerifier({
        url: "https://approved.supabase.co",
        publishableKey: "sb_publishable_test",
        now: () => 1800000000000,
        fetch: transport,
      }),
    };
  };
  it("never accepts decoded claims when the provider rejects the token", async () => {
    const s = setupVerifier(new Response("", { status: 401 }));
    await expect(s.verify(token(claims()))).rejects.toThrow(
      "authentication_required",
    );
  });
  it("accepts verified identity while ignoring user-editable admin metadata", async () => {
    const s = setupVerifier(
      Response.json({
        id: uid,
        is_anonymous: false,
        user_metadata: { role: "admin" },
      }),
    );
    expect(await s.verify(token(claims()))).toEqual({
      userId: uid,
      providerSessionId: sid,
      assurance: "aal2",
      expiresAt: 1800003600000,
    });
    expect(s.transport).toHaveBeenCalledOnce();
  });
  it("reports only a valid provider-verified TOTP timestamp, never a future value or another factor", async () => {
    const s = setupVerifier(Response.json({ id: uid, is_anonymous: false }));
    expect(
      await s.verify(
        token({
          ...claims(),
          amr: [
            { method: "totp", timestamp: 1799999950 },
            { method: "totp", timestamp: 1800000001 },
            { method: "password", timestamp: 1800000000 },
          ],
        }),
      ),
    ).toMatchObject({ mfaVerifiedAt: 1799999950000 });
    const failed = setupVerifier(new Response("", { status: 401 }));
    await expect(
      failed.verify(
        token({
          ...claims(),
          amr: [{ method: "totp", timestamp: 1800000000 }],
        }),
      ),
    ).rejects.toThrow("authentication_required");
  });
  it.each([
    { iss: "https://evil.test/auth/v1" },
    { aud: "service_role" },
    { role: "service_role" },
    { sub: sid },
    { session_id: "" },
    { exp: 1800000000 },
    { iat: 1800000001 },
    { aal: "fake" },
    { is_anonymous: true },
  ])("rejects incorrect verified-response claim shape %j", async (changed) => {
    const s = setupVerifier(Response.json({ id: uid, is_anonymous: false }));
    await expect(s.verify(token({ ...claims(), ...changed }))).rejects.toThrow(
      "authentication_required",
    );
  });
  it("maps provider outages to unavailable, never anonymous fallback", async () => {
    const s = setupVerifier(new Response("", { status: 503 }));
    await expect(s.verify(token(claims()))).rejects.toThrow(
      "identity_unavailable",
    );
  });
});
