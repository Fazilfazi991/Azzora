import { isPasswordOnlyClientReview } from "../backend/client-review-policy.js";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { stagingRuntimeOrigins } from "./deployment.js";
import { rpc as configuredRpc } from "./supabase.js";
import { createSupabaseTokenVerifier } from "../backend/auth-supabase.js";
import { createStagingRecovery } from "./auth-recovery.js";
import {
  assertProductionActor,
  type ProductionRuntime,
} from "../backend/runtime-production.js";

export interface StagingActor {
  authenticationPolicy?: string;
  userId: string;
  personId?: string;
  email: string;
  companyId: string;
  role: "owner_admin" | "project_manager" | "accountant" | "site_staff";
  workspace: "manager" | "accountant";
  sessionHash: string;
  assurance: "aal1" | "aal2";
  providerSessionId: string;
  projectIds: string[];
  capabilities: string[];
}
type Rpc = <T>(name: string, parameters: Record<string, unknown>) => Promise<T>;
interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
interface Pending extends Tokens {
  factorId: string;
  challengeId: string;
  userId: string;
  companyId: string;
  workspace: "manager" | "accountant";
}
interface Grant {
  authenticationPolicy?: string;
  userId: string;
  companyId: string;
  email: string;
  role: StagingActor["role"];
  workspaces: string[];
  capabilities: string[];
}
class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const cookieName = "__Host-azzora_staging";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const json = (status: number, value: unknown, cookie?: string) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
const cookie = (token: string, maxAge: number, name = cookieName) =>
  `${name}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
const clearCookie = `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
function tokenFrom(request: Request, name = cookieName): string {
  const parts = (request.headers.get("cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + "="));
  if (parts.length !== 1) throw new AuthError(401, "Sign in is required.");
  const token = parts[0].slice(name.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new AuthError(401, "Sign in is required.");
  return token;
}
async function input(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AuthError(400, "JSON input is required.");
  const text = await request.text();
  if (Buffer.byteLength(text) > 16_384)
    throw new AuthError(413, "Sign-in request is too large.");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new AuthError(400, "Invalid sign-in input.");
  }
}
export function createStagingAuth(
  options: {
    rpc?: Rpc;
    fetch?: typeof fetch;
    now?: () => number;
    allowedOrigins?: ReadonlySet<string>;
    url?: string;
    publishableKey?: string;
    encryptionKey?: string;
    serviceKey?: string;
    production?: ProductionRuntime;
  } = {},
) {
  const rpc = options.rpc || configuredRpc;
  const transport = options.fetch || fetch;
  const now = options.now || Date.now;
  const production = options.production;
  if (production && !options.rpc)
    throw Error(
      "Production authentication requires an explicitly isolated RPC adapter.",
    );
  const sessionCookieName = production ? "__Host-azzora_session" : cookieName;
  const sessionCookie = (token: string, maxAge: number) =>
    cookie(token, maxAge, sessionCookieName);
  const clearSessionCookie = production
    ? `${sessionCookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`
    : clearCookie;
  const url =
    production?.url ||
    options.url ||
    process.env.AZZORA_STAGING_SUPABASE_URL ||
    "";
  if (!production && url !== "https://hkhomrrvxtcxnxvdlkoh.supabase.co")
    throw new Error("Approved staging identity URL is required.");
  const publishableKey =
    production?.publishableKey ||
    options.publishableKey ||
    process.env.AZZORA_STAGING_PUBLISHABLE_KEY ||
    "";
  const key = Buffer.from(
    production?.encryptionKey ||
      options.encryptionKey ||
      process.env.AZZORA_STAGING_AUTH_KEY ||
      "",
    "base64url",
  );
  if (key.length !== 32)
    throw new Error("Staging session encryption must be configured.");
  const origins =
    production?.allowedOrigins ||
    options.allowedOrigins ||
    stagingRuntimeOrigins();
  if (!origins.size) throw new Error("Explicit staging origins are required.");
  const verifyToken = createSupabaseTokenVerifier({
    url,
    publishableKey,
    fetch: transport,
    now,
  });
  const csrf = (token: string) =>
    createHmac("sha256", key)
      .update("csrf:" + token)
      .digest("base64url");
  function encrypt(value: unknown, aad: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(aad));
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), bytes]).toString(
      "base64url",
    );
  }
  function decrypt<T>(value: string, aad: string): T {
    try {
      const bytes = Buffer.from(value, "base64url");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      ) as T;
    } catch {
      throw new AuthError(401, "Session cannot be read. Sign in again.");
    }
  }
  function boundary(request: Request, mutation: boolean) {
    const target = new URL(request.url);
    if (
      target.protocol !== "https:" ||
      !origins.has(target.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (mutation && request.headers.get("origin") !== target.origin)
    )
      throw new AuthError(403, "This request origin is not permitted.");
  }
  function requireCsrf(request: Request, token: string) {
    const value = request.headers.get("x-azzora-csrf") || "";
    const expected = csrf(token);
    if (
      value.length !== expected.length ||
      !timingSafeEqual(Buffer.from(value), Buffer.from(expected))
    )
      throw new AuthError(403, "Please refresh and retry this action.");
  }
  async function provider<T>(
    path: string,
    method: string,
    body?: unknown,
    accessToken?: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await transport(url + "/auth/v1" + path, {
        method,
        headers: {
          apikey: publishableKey,
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new AuthError(
        503,
        "The identity service is unavailable. Please retry later.",
      );
    }
    if (!response.ok)
      throw new AuthError(
        response.status === 429 ? 429 : response.status >= 500 ? 503 : 401,
        response.status === 429
          ? "Too many sign-in attempts. Please wait before retrying."
          : response.status >= 500
            ? "The identity service is unavailable."
            : "Sign-in or authenticator verification failed.",
      );
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  function tokens(value: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
  }): Tokens {
    if (!value.access_token || !value.refresh_token)
      throw new AuthError(
        503,
        "The identity service returned an incomplete session.",
      );
    return {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      expires_at:
        value.expires_at ||
        Math.floor(now() / 1000) + (value.expires_in || 3600),
    };
  }
  async function finish(
    t: Tokens,
    grant: Grant,
    workspace: "manager" | "accountant",
    pendingHash?: string,
  ) {
    const identity = await verifyToken(t.access_token);
    if (
      identity.userId !== grant.userId ||
      !grant.workspaces.includes(workspace)
    )
      throw new AuthError(401, "Identity verification failed.");
    if (production) {
      assertProductionActor(grant, production);
      if (
        ["owner_admin", "accountant"].includes(grant.role) &&
        identity.assurance !== "aal2"
      )
        throw new AuthError(403, "Multi-factor verification is required.");
    }
    const token = opaque();
    const sessionHash = hash(token);
    await rpc("staging_auth_session_put", {
      p_hash: sessionHash,
      p_csrf_hash: hash(csrf(token)),
      p_user_id: identity.userId,
      p_provider_session_id: identity.providerSessionId,
      p_company_id: grant.companyId,
      p_workspace: workspace,
      p_assurance: identity.assurance,
      p_ciphertext: encrypt(t, sessionHash),
    });
    if (pendingHash)
      await rpc("staging_auth_pending_delete", { p_hash: pendingHash });
    return json(
      200,
      { status: "authenticated" },
      sessionCookie(token, 8 * 3600),
    );
  }
  async function load(request: Request) {
    boundary(request, !["GET", "HEAD"].includes(request.method));
    const token = tokenFrom(request, sessionCookieName);
    const sessionHash = hash(token);
    if (!["GET", "HEAD"].includes(request.method)) requireCsrf(request, token);
    let stored = await rpc<{
      actor: StagingActor;
      ciphertext: string;
      version: number;
    }>("staging_auth_session_get", { p_hash: sessionHash });
    let t = decrypt<Tokens>(stored.ciphertext, sessionHash);
    if (t.expires_at * 1000 - now() < 60_000) {
      const refreshed = tokens(
        await provider("/token?grant_type=refresh_token", "POST", {
          refresh_token: t.refresh_token,
        }),
      );
      const verified = await verifyToken(refreshed.access_token);
      if (
        verified.userId !== stored.actor.userId ||
        verified.providerSessionId !== stored.actor.providerSessionId
      )
        throw new AuthError(401, "Session identity changed. Sign in again.");
      try {
        await rpc("staging_auth_tokens_update", {
          p_hash: sessionHash,
          p_expected_version: stored.version,
          p_ciphertext: encrypt(refreshed, sessionHash),
        });
        t = refreshed;
        stored = { ...stored, version: stored.version + 1 };
      } catch {
        stored = await rpc("staging_auth_session_get", { p_hash: sessionHash });
        t = decrypt<Tokens>(stored.ciphertext, sessionHash);
        if (t.expires_at * 1000 <= now())
          throw new AuthError(401, "Session refresh failed. Sign in again.");
      }
    }
    const verified = await verifyToken(t.access_token);
    if (
      verified.userId !== stored.actor.userId ||
      verified.providerSessionId !== stored.actor.providerSessionId ||
      verified.assurance !== stored.actor.assurance
    )
      throw new AuthError(401, "Session verification failed.");
    const actor = await rpc<StagingActor>("staging_auth_actor", {
      p_session_hash: sessionHash,
    });
    if (production) {
      assertProductionActor(actor, production);
      if (
        ["owner_admin", "accountant"].includes(actor.role) &&
        actor.assurance !== "aal2"
      )
        throw new AuthError(403, "Multi-factor verification is required.");
    }
    await rpc("staging_auth_session_touch", { p_hash: sessionHash });
    return { actor, token, t, version: stored.version };
  }
  const recovery = createStagingRecovery({
    rpc,
    load,
    provider,
    verifyToken,
    tokens,
    encrypt,
    decrypt,
    csrf,
    requireCsrf,
    boundary,
    input,
    transport,
    url,
    serviceKey: () =>
      production?.serviceKey ||
      options.serviceKey ||
      process.env.AZZORA_STAGING_SERVICE_KEY ||
      "",
  });
  return {
    async requireActor(request: Request, workspace?: "manager" | "accountant") {
      const state = await load(request);
      if (workspace && state.actor.workspace !== workspace)
        throw new AuthError(403, "This workspace is not permitted.");
      return state.actor;
    },
    async handle(request: Request, path: string): Promise<Response> {
      try {
        boundary(request, request.method !== "GET");
        if (production && path.startsWith("/auth/recovery/"))
          return json(503, {
            error:
              "Production account recovery requires the approved, verified recovery service. Contact the administrator.",
          });
        if (path.startsWith("/auth/recovery/"))
          return recovery.handle(request, path);
        if (path === "/auth/login" && request.method === "POST") {
          const data = await input(request);
          const email =
            typeof data.email === "string"
              ? data.email.trim().toLowerCase()
              : "";
          const password =
            typeof data.password === "string" ? data.password : "";
          const workspace = data.workspace;
          if (
            (production
              ? !/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(email) ||
                email.endsWith("@staging.azzora.test")
              : !email.endsWith("@staging.azzora.test")) ||
            !password ||
            password.length > 256 ||
            !["manager", "accountant"].includes(String(workspace))
          )
            throw new AuthError(401, "Sign-in failed.");
          const rateKey = hash(
            email +
              ":" +
              (production
                ? "production"
                : request.headers.get("x-forwarded-for") || "staging"),
          );
          if (
            !(await rpc<boolean>("staging_auth_rate", { p_key_hash: rateKey }))
          )
            throw new AuthError(
              429,
              "Too many sign-in attempts. Please wait five minutes.",
            );
          const t = tokens(
            await provider("/token?grant_type=password", "POST", {
              email,
              password,
            }),
          );
          const identity = await verifyToken(t.access_token);
          const grant = await rpc<Grant>("staging_auth_grant", {
            p_user_id: identity.userId,
          });
          if (production) assertProductionActor(grant, production);
          if (!grant.workspaces.includes(workspace as string))
            throw new AuthError(
              403,
              "This account does not have access to this workspace.",
            );
          if (
            !["owner_admin", "accountant"].includes(grant.role) ||
            (!production &&
              isPasswordOnlyClientReview({
                ...grant,
                workspace: String(workspace),
              }))
          )
            return finish(t, grant, workspace as "manager" | "accountant");
          const user = await provider<{
            factors?: { id: string; factor_type: string; status: string }[];
          }>("/user", "GET", undefined, t.access_token);
          const verified = user.factors?.find(
            (f) => f.factor_type === "totp" && f.status === "verified",
          );
          let factorId = verified?.id;
          let qrCode: string | undefined;
          let uri: string | undefined;
          if (!factorId) {
            // Remove only this identity's abandoned, unverified enrollments. Verified
            // factors are never reset or removed by the application sign-in flow.
            for (const abandoned of user.factors || []) {
              if (
                abandoned.factor_type === "totp" &&
                abandoned.status === "unverified"
              )
                await provider(
                  "/factors/" + abandoned.id,
                  "DELETE",
                  undefined,
                  t.access_token,
                );
            }
            const enrolled = await provider<{
              id: string;
              totp: { qr_code: string; uri: string };
            }>(
              "/factors",
              "POST",
              {
                factor_type: "totp",
                friendly_name:
                  (production ? "AZZORA " : "AZZORA staging ") + now(),
              },
              t.access_token,
            );
            factorId = enrolled.id;
            qrCode = enrolled.totp.qr_code;
            uri = enrolled.totp.uri;
          }
          const challenge = await provider<{ id: string }>(
            "/factors/" + factorId + "/challenge",
            "POST",
            {},
            t.access_token,
          );
          const token = opaque();
          const pendingHash = hash(token);
          const pending: Pending = {
            ...t,
            factorId,
            challengeId: challenge.id,
            userId: grant.userId,
            companyId: grant.companyId,
            workspace: workspace as "manager" | "accountant",
          };
          await rpc("staging_auth_pending_put", {
            p_hash: pendingHash,
            p_user_id: grant.userId,
            p_company_id: grant.companyId,
            p_workspace: workspace,
            p_ciphertext: encrypt(pending, pendingHash),
          });
          return json(
            200,
            {
              status: verified ? "mfa-challenge" : "mfa-enroll",
              csrf: csrf(token),
              ...(qrCode ? { qrCode, uri } : {}),
            },
            sessionCookie(token, 300),
          );
        }
        if (path === "/auth/mfa/verify" && request.method === "POST") {
          const token = tokenFrom(request, sessionCookieName);
          requireCsrf(request, token);
          const pendingHash = hash(token);
          const data = await input(request);
          if (typeof data.code !== "string" || !/^\d{6}$/.test(data.code))
            throw new AuthError(400, "Enter the six-digit authenticator code.");
          const stored = await rpc<{ ciphertext: string }>(
            "staging_auth_pending_get",
            { p_hash: pendingHash },
          );
          const pending = decrypt<Pending>(stored.ciphertext, pendingHash);
          const t = tokens(
            await provider(
              "/factors/" + pending.factorId + "/verify",
              "POST",
              { challenge_id: pending.challengeId, code: data.code },
              pending.access_token,
            ),
          );
          const grant = await rpc<Grant>("staging_auth_grant", {
            p_user_id: pending.userId,
          });
          return finish(t, grant, pending.workspace, pendingHash);
        }
        if (path === "/auth/session" && request.method === "GET") {
          const state = await load(request);
          return json(200, {
            userId: state.actor.userId,
            personId: state.actor.personId,
            email: state.actor.email,
            companyId: state.actor.companyId,
            role: state.actor.role,
            workspace: state.actor.workspace,
            assurance: state.actor.assurance,
            projectIds: state.actor.projectIds,
            capabilities: state.actor.capabilities,
            csrf: csrf(state.token),
            mode: production ? "production-candidate" : "fictional-staging",
          });
        }
        if (path === "/auth/logout" && request.method === "POST") {
          const token = tokenFrom(request, sessionCookieName);
          requireCsrf(request, token);
          const sessionHash = hash(token);
          let accessToken: string | undefined;
          try {
            const stored = await rpc<{ ciphertext: string }>(
              "staging_auth_session_get",
              { p_hash: sessionHash },
            );
            accessToken = decrypt<Tokens>(
              stored.ciphertext,
              sessionHash,
            ).access_token;
          } catch {
            /* Revocation must still work when the identity is expired. */
          }
          await rpc("staging_auth_session_revoke", { p_hash: sessionHash });
          if (accessToken) {
            try {
              await provider("/logout?scope=local", "POST", {}, accessToken);
            } catch {
              /* Local server session is already durably revoked. */
            }
          }
          return json(200, { status: "signed-out" }, clearSessionCookie);
        }
        return json(404, { error: "Unknown authentication route." });
      } catch (error) {
        if (error instanceof AuthError)
          return json(error.status, { error: error.message });
        const status =
          typeof error === "object" &&
          error &&
          "status" in error &&
          typeof error.status === "number"
            ? error.status
            : 503;
        return json(status === 401 || status === 403 ? status : 503, {
          error:
            status === 401 || status === 403
              ? "Sign in again or request access to this workspace."
              : "The staging identity service could not complete this request.",
        });
      }
    },
  };
}
