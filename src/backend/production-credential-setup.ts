import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createSupabaseTokenVerifier } from "./auth-supabase.js";
import {
  productionRuntime,
  assertProductionIdentity,
  assertProductionActor,
} from "./runtime-production.js";
import { createProductionRpc } from "../staging/supabase.js";

const cookieName = "__Host-azzora_setup";
const reply = (status: number, body: unknown, cookie?: string) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
/** A provider-issued single-use recovery link sets credentials only. It never creates an app session or grants MFA access. */
export function createProductionCredentialSetup(
  options: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
    now?: () => number;
  } = {},
) {
  return async (request: Request) => {
    try {
      const runtime = productionRuntime(options.env || process.env),
        target = new URL(request.url),
        now = options.now || Date.now;
      if (
        target.protocol !== "https:" ||
        !runtime.allowedOrigins.has(target.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.method !== "GET" &&
          request.headers.get("origin") !== target.origin)
      )
        return reply(403, { error: "Use the authorized AZZORA setup page." });
      const sign = (value: string) =>
        createHmac("sha256", Buffer.from(runtime.encryptionKey, "base64url"))
          .update("credential-setup:" + value)
          .digest("base64url");
      if (request.method === "GET") {
        const value = `${now()}.${randomBytes(24).toString("base64url")}`,
          token = `${value}.${sign(value)}`;
        return reply(
          200,
          { csrf: token },
          `${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=600`,
        );
      }
      if (request.method !== "POST")
        return reply(405, { error: "Use the setup form." });
      const csrf = request.headers.get("x-azzora-setup-csrf") || "",
        parts = csrf.split("."),
        value = parts.slice(0, 2).join("."),
        signature = sign(value);
      const cookies = (request.headers.get("cookie") || "")
        .split(";")
        .map((v) => v.trim())
        .filter((v) => v.startsWith(cookieName + "="));
      if (
        parts.length !== 3 ||
        !/^\d{13}$/.test(parts[0]) ||
        now() - Number(parts[0]) > 600_000 ||
        Number(parts[0]) > now() ||
        !/^[A-Za-z0-9_-]{32}$/.test(parts[1]) ||
        parts[2].length !== signature.length ||
        !timingSafeEqual(Buffer.from(parts[2]), Buffer.from(signature)) ||
        cookies.length !== 1 ||
        cookies[0] !== `${cookieName}=${csrf}`
      )
        return reply(403, {
          error: "Refresh the setup page before trying again.",
        });
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return reply(400, { error: "Use the setup form." });
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 8192)
        return reply(413, { error: "Setup input is too large." });
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw Error();
      } catch {
        return reply(400, { error: "Check the setup form." });
      }
      if (
        typeof data.tokenHash !== "string" ||
        !/^[A-Za-z0-9_-]{32,256}$/.test(data.tokenHash) ||
        typeof data.password !== "string" ||
        data.password.length < 12 ||
        data.password.length > 256
      )
        return reply(422, {
          error:
            "Use the private setup link and a password of at least 12 characters.",
        });
      const transport = options.fetch || fetch,
        rpc = createProductionRpc(runtime, transport);
      assertProductionIdentity(
        await rpc("azzora_runtime_identity", {
          p_company_id: runtime.companyId,
        }),
        runtime,
      );
      if (
        !(await rpc("staging_auth_rate", {
          p_key_hash: createHash("sha256")
            .update("production-credential-setup:" + data.tokenHash)
            .digest("hex"),
        }))
      )
        return reply(429, {
          error: "Please wait five minutes before trying again.",
        });
      const call = async (
        path: string,
        method: string,
        body?: unknown,
        accessToken?: string,
      ) => {
        const result = await transport(runtime.url + "/auth/v1" + path, {
          method,
          headers: {
            apikey: runtime.publishableKey,
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
        if (!result.ok) throw Error("provider");
        return result.status === 204 ? {} : await result.json();
      };
      const tokens = await call("/verify", "POST", {
        token_hash: data.tokenHash,
        type: "recovery",
      });
      const identity = await createSupabaseTokenVerifier({
        url: runtime.url,
        publishableKey: runtime.publishableKey,
        fetch: transport,
        now,
      })(tokens.access_token);
      const grant = await rpc<{
        userId: string;
        companyId: string;
        email: string;
        role: string;
      }>("staging_auth_grant", { p_user_id: identity.userId });
      const requiredRole = (
        {
          "info@azzora.ae": "owner_admin",
          "accounts@azzora.ae": "accountant",
        } as Record<string, string>
      )[grant.email?.toLowerCase()];
      let authorized = true;
      try {
        assertProductionActor(grant, runtime);
      } catch {
        authorized = false;
      }
      if (
        !authorized ||
        grant.userId !== identity.userId ||
        !requiredRole ||
        grant.role !== requiredRole
      ) {
        await call("/logout?scope=global", "POST", {}, tokens.access_token);
        return reply(403, {
          error: "This account is not approved for initial company setup.",
        });
      }
      await call(
        "/user",
        "PUT",
        { password: data.password },
        tokens.access_token,
      );
      // Supported provider logout revokes the setup session. No provider tokens reach the application session store.
      await call("/logout?scope=global", "POST", {}, tokens.access_token);
      return reply(
        200,
        {
          status: "password-set",
          message: "Password set. Sign in with your email and password.",
        },
        `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
      );
    } catch {
      // Never echo provider messages, tokens, passwords, or request bodies.
      return reply(400, {
        error:
          "The setup link is invalid, expired or unavailable. Request a new private setup link; if you already submitted, try signing in.",
      });
    }
  };
}
export const productionCredentialSetup = createProductionCredentialSetup();
