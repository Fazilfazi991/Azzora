import { expect, it, vi } from "vitest";
import { createProductionCredentialSetup } from "./production-credential-setup.js";

function fixture() {
  const now = 1_800_000_000_000,
    userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const env = {
    AZZORA_DEPLOYMENT_MODE: "production-candidate",
    AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL: "OWNER-SETUP-APPROVAL",
    AZZORA_PRODUCTION_SUPABASE_PROJECT_REF: "zwjiztnsxenluqybxhhz",
    AZZORA_PRODUCTION_SUPABASE_URL: "https://zwjiztnsxenluqybxhhz.supabase.co",
    AZZORA_PRODUCTION_COMPANY_ID: "22222222-2222-4222-8222-222222222222",
    AZZORA_PRODUCTION_DATABASE_REGION: "ap-southeast-1",
    AZZORA_PRODUCTION_VERCEL_PROJECT_ID: "prj_SetupFixture",
    AZZORA_PRODUCTION_PUBLISHABLE_KEY: "sb_publishable_fixture",
    AZZORA_PRODUCTION_SERVICE_KEY: "sb_secret_fixture",
    AZZORA_PRODUCTION_AUTH_KEY: Buffer.alloc(32, 9).toString("base64url"),
    AZZORA_PRODUCTION_ALLOWED_ORIGINS: "https://setup.example.test",
    AZZORA_PRODUCTION_FINANCIAL_POSTING: "false",
    AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING: "false",
  };
  const grant = {
    userId,
    companyId: env.AZZORA_PRODUCTION_COMPANY_ID,
    email: "accounts@azzora.ae",
    role: "accountant",
  };
  let valid = true,
    used = false,
    rate = true;
  const token = `e30.${Buffer.from(JSON.stringify({ sub: userId, iss: env.AZZORA_PRODUCTION_SUPABASE_URL + "/auth/v1", aud: "authenticated", role: "authenticated", is_anonymous: false, session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", iat: now / 1000, exp: now / 1000 + 3600, aal: "aal1" })).toString("base64url")}.c2ln`;
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/azzora_runtime_identity"))
        return Response.json({
          schemaVersion: 1,
          contractVersion: "azzora-canonical-production-v1",
          environment: "production",
          projectRef: env.AZZORA_PRODUCTION_SUPABASE_PROJECT_REF,
          companyId: env.AZZORA_PRODUCTION_COMPANY_ID,
          region: "ap-southeast-1",
          vercelProjectId: "prj_SetupFixture",
          configurationApprovalId: env.AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL,
          financialPostingEnabled: false,
          realDocumentProcessingEnabled: false,
          fictionalData: false,
          privateStorageBucket: "azzora-private",
          backendCommandsInstalled: true,
          allowedOrigins: ["https://setup.example.test"],
        });
      if (url.pathname.endsWith("/azzora_production_auth_rate"))
        return Response.json(rate);
      if (url.pathname.endsWith("/azzora_production_auth_grant"))
        return Response.json(grant);
      if (url.pathname.endsWith("/verify")) {
        if (!valid || used) return Response.json({}, { status: 401 });
        used = true;
        expect(JSON.parse(String(init?.body))).toEqual({
          token_hash: "f".repeat(64),
          type: "recovery",
        });
        return Response.json({ access_token: token });
      }
      if (url.pathname.endsWith("/user"))
        return Response.json({ id: userId, is_anonymous: false });
      if (url.pathname.endsWith("/logout"))
        return new Response(null, { status: 204 });
      throw Error("Unexpected provider or financial command");
    },
  );
  const handler = createProductionCredentialSetup({
    env,
    fetch: transport,
    now: () => now,
  });
  const start = () =>
    handler(
      new Request(
        "https://setup.example.test/api/staging/auth/credential-setup",
      ),
    );
  async function submit(
    patch: {
      csrf?: string;
      origin?: string;
      body?: unknown;
      cookie?: string;
    } = {},
  ) {
    const setup = await start(),
      csrf = (await setup.json()).csrf;
    return handler(
      new Request(
        "https://setup.example.test/api/staging/auth/credential-setup",
        {
          method: "POST",
          headers: {
            Origin: patch.origin || "https://setup.example.test",
            "Content-Type": "application/json",
            "X-Azzora-Setup-CSRF": patch.csrf ?? csrf,
            Cookie:
              patch.cookie ?? setup.headers.get("set-cookie")!.split(";")[0],
          },
          body: JSON.stringify(
            patch.body || {
              tokenHash: "f".repeat(64),
              password: "fictional-private-password",
            },
          ),
        },
      ),
    );
  }
  return {
    start,
    submit,
    grant,
    transport,
    invalid: () => {
      valid = false;
    },
    rateLimited: () => {
      rate = false;
    },
  };
}

it("sets only the verified approved account's own password, revokes the setup session, and creates no application or financial session", async () => {
  for (const owner of [false, true]) {
    const f = fixture();
    if (owner) {
      f.grant.email = "info@azzora.ae";
      f.grant.role = "owner_admin";
    }
    const result = await f.submit();
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toContain("__Host-azzora_setup=;");
    const paths = f.transport.mock.calls.map(
      ([url]) => new URL(String(url)).pathname,
    );
    expect(paths).toEqual([
      "/rest/v1/rpc/azzora_runtime_identity",
      "/rest/v1/rpc/azzora_production_auth_rate",
      "/auth/v1/verify",
      "/auth/v1/user",
      "/rest/v1/rpc/azzora_production_auth_grant",
      "/auth/v1/user",
      "/auth/v1/logout",
    ]);
    expect(
      f.transport.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);
    expect(await result.text()).not.toContain("fictional-private-password");
    expect((await f.submit()).status).toBe(400); // one-time proof cannot be replayed
  }
});
it("denies invalid or used provider proofs without changing credentials", async () => {
  const f = fixture();
  f.invalid();
  expect((await f.submit()).status).toBe(400);
  expect(
    f.transport.mock.calls.some(([, init]) => init?.method === "PUT"),
  ).toBe(false);
});
it("denies foreign companies, unapproved email addresses and mismatched roles before a credential change", async () => {
  for (const patch of [
    { companyId: "33333333-3333-4333-8333-333333333333" },
    { email: "other@example.test" },
    { role: "owner_admin" },
    { userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
  ]) {
    const f = fixture();
    Object.assign(f.grant, patch);
    expect((await f.submit()).status).toBe(403);
    expect(
      f.transport.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  }
});
it("enforces same-origin CSRF, input limits and the provider rate gate before consuming the proof", async () => {
  for (const patch of [
    { csrf: "forged" },
    { cookie: "" },
    { origin: "https://foreign.example" },
  ]) {
    const f = fixture();
    expect((await f.submit(patch)).status).toBe(403);
    expect(f.transport).not.toHaveBeenCalled();
  }
  const short = fixture();
  expect(
    (
      await short.submit({
        body: { tokenHash: "f".repeat(64), password: "short" },
      })
    ).status,
  ).toBe(422);
  expect(short.transport).not.toHaveBeenCalled();
  const huge = fixture();
  expect(
    (
      await huge.submit({
        body: {
          tokenHash: "f".repeat(9000),
          password: "fictional-long-password",
        },
      })
    ).status,
  ).toBe(413);
  expect(huge.transport).not.toHaveBeenCalled();
  const limited = fixture();
  limited.rateLimited();
  expect((await limited.submit()).status).toBe(429);
  expect(
    limited.transport.mock.calls.some(([url]) =>
      String(url).endsWith("/verify"),
    ),
  ).toBe(false);
});
