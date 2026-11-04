import { createHash, randomBytes } from "node:crypto";
import type { StagingActor } from "./auth.js";
interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
interface RecoveryState extends Tokens {
  factorId?: string;
  challengeId?: string;
  userId: string;
}
interface Flow {
  ciphertext: string;
  userId: string;
  role: string;
  kind: string;
  workspace: string;
  providerSessionId: string;
}
interface Context {
  rpc: <T = unknown>(
    name: string,
    params: Record<string, unknown>,
  ) => Promise<T>;
  load: (request: Request) => Promise<{
    actor: StagingActor;
    token: string;
    t: Tokens;
    version: number;
  }>;
  provider: <T>(
    path: string,
    method: string,
    body?: unknown,
    accessToken?: string,
  ) => Promise<T>;
  verifyToken: (token: string) => Promise<{
    userId: string;
    providerSessionId: string;
    assurance: string;
  }>;
  tokens: (value: Partial<Tokens> & { expires_in?: number }) => Tokens;
  encrypt: (value: unknown, aad: string) => string;
  decrypt: <T>(value: string, aad: string) => T;
  csrf: (token: string) => string;
  requireCsrf: (request: Request, token: string) => void;
  boundary: (request: Request, mutation: boolean) => void;
  input: (request: Request) => Promise<Record<string, unknown>>;
  transport: typeof fetch;
  url: string;
  serviceKey: () => string;
}
class RecoveryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const cookieName = "__Host-azzora_recovery";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const cookie = (token: string) =>
  `${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=300`;
const clearCookie = `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
const response = (status: number, value: unknown, setCookie?: string) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
      ...(setCookie ? { "Set-Cookie": setCookie } : {}),
    },
  });
function readCookie(request: Request) {
  const entries = (request.headers.get("cookie") || "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(cookieName + "="));
  if (entries.length !== 1)
    throw new RecoveryError(
      401,
      "Recovery could not be verified. Ask the Owner for a new code.",
    );
  const token = entries[0].slice(cookieName.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new RecoveryError(
      401,
      "Recovery could not be verified. Ask the Owner for a new code.",
    );
  return token;
}
export function createStagingRecovery(ctx: Context) {
  async function freshOwner(request: Request, code: unknown) {
    const current = await ctx.load(request);
    if (
      current.actor.role !== "owner_admin" ||
      current.actor.assurance !== "aal2" ||
      !current.actor.capabilities.includes("access.manage")
    )
      throw new RecoveryError(
        403,
        "Only the staging Owner can assist recovery.",
      );
    if (typeof code !== "string" || !/^\d{6}$/.test(code))
      throw new RecoveryError(400, "Enter a fresh authenticator code.");
    const user = await ctx.provider<{
      factors?: { id: string; factor_type: string; status: string }[];
    }>("/user", "GET", undefined, current.t.access_token);
    const factor = user.factors?.find(
      (f) => f.factor_type === "totp" && f.status === "verified",
    );
    if (!factor) throw new RecoveryError(403, "Current Owner MFA is required.");
    const challenge = await ctx.provider<{ id: string }>(
      "/factors/" + factor.id + "/challenge",
      "POST",
      {},
      current.t.access_token,
    );
    const tokens = ctx.tokens(
      await ctx.provider(
        "/factors/" + factor.id + "/verify",
        "POST",
        { challenge_id: challenge.id, code },
        current.t.access_token,
      ),
    );
    const identity = await ctx.verifyToken(tokens.access_token);
    if (
      identity.userId !== current.actor.userId ||
      identity.providerSessionId !== current.actor.providerSessionId ||
      identity.assurance !== "aal2"
    )
      throw new RecoveryError(403, "Current Owner MFA is required.");
    await ctx.rpc("staging_auth_tokens_update", {
      p_hash: current.actor.sessionHash,
      p_expected_version: current.version,
      p_ciphertext: ctx.encrypt(tokens, current.actor.sessionHash),
    });
    return current.actor;
  }
  async function generate(email: string, target: string) {
    const service = ctx.serviceKey();
    if (!service)
      throw new RecoveryError(503, "Recovery service is not configured.");
    const result = await ctx.transport(
      ctx.url + "/auth/v1/admin/generate_link",
      {
        method: "POST",
        headers: {
          apikey: service,
          ...(service.startsWith("eyJ")
            ? { Authorization: "Bearer " + service }
            : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "recovery", email }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!result.ok)
      throw new RecoveryError(
        503,
        "The identity recovery service could not complete this request.",
      );
    const data = (await result.json()) as {
      id?: string;
      hashed_token?: string;
      properties?: { hashed_token?: string };
      user?: { id?: string };
    };
    const secret = data.hashed_token || data.properties?.hashed_token;
    // The official REST response places user fields at the top level; the SDK
    // transforms them into `user` and `properties` (_generateLinkResponse).
    if (!secret || (data.user?.id || data.id) !== target)
      throw new RecoveryError(
        503,
        "The identity recovery response could not be verified.",
      );
    return secret;
  }
  return {
    async handle(request: Request, path: string): Promise<Response> {
      try {
        ctx.boundary(request, true);
        if (request.method !== "POST")
          return response(405, { error: "Recovery requires a POST request." });
        const data = await ctx.input(request);
        if (path === "/auth/recovery/start") {
          const owner = await freshOwner(request, data.code);
          const email =
            typeof data.email === "string"
              ? data.email.trim().toLowerCase()
              : "";
          const target = await ctx.rpc<{ userId: string }>(
            "staging_auth_recovery_target",
            { p_owner_hash: owner.sessionHash, p_email: email },
          );
          if (
            !(await ctx.rpc<boolean>("staging_auth_rate", {
              p_key_hash: hash("owner-recovery:" + owner.userId),
            }))
          )
            throw new RecoveryError(
              429,
              "Please wait before issuing another recovery code.",
            );
          const providerHash = await generate(email, target.userId);
          const code = opaque();
          const codeHash = hash(code);
          await ctx.rpc("staging_auth_recovery_issue", {
            p_owner_hash: owner.sessionHash,
            p_email: email,
            p_code_hash: codeHash,
            p_ciphertext: ctx.encrypt({ providerHash }, codeHash),
          });
          return response(200, {
            status: "handoff-created",
            handoffCode: code,
            expiresInSeconds: 600,
            emailSent: false,
            message:
              "Manual fictional staging recovery only. No email was sent. Privately hand this one-time code to the test user.",
          });
        }
        if (path === "/auth/recovery/verify") {
          if (
            typeof data.handoffCode !== "string" ||
            !/^[A-Za-z0-9_-]{43}$/.test(data.handoffCode) ||
            !["manager", "accountant"].includes(String(data.workspace))
          )
            throw new RecoveryError(
              401,
              "Recovery could not be verified. Ask the Owner for a new code.",
            );
          if (
            !(await ctx.rpc<boolean>("staging_auth_rate", {
              p_key_hash: hash("staging-recovery-exchange"),
            }))
          )
            throw new RecoveryError(
              429,
              "Please wait before retrying recovery.",
            );
          // The local BFF overwrites this internal header from the TCP peer.
          // A global quota above remains enforced even if no peer is available.
          const peer =
            request.headers.get("x-azzora-client-address") ||
            "loopback-staging";
          if (
            !(await ctx.rpc<boolean>("staging_auth_rate", {
              p_key_hash: hash(ctx.csrf("recovery-ip:" + peer)),
            }))
          )
            throw new RecoveryError(
              429,
              "Please wait before retrying recovery.",
            );
          const codeHash = hash(data.handoffCode);
          const taken = await ctx.rpc<{
            ciphertext: string;
            userId: string;
            role: string;
          }>("staging_auth_recovery_take", {
            p_code_hash: codeHash,
            p_workspace: data.workspace,
          });
          const encrypted = ctx.decrypt<{ providerHash: string }>(
            taken.ciphertext,
            codeHash,
          );
          const tokens = ctx.tokens(
            await ctx.provider("/verify", "POST", {
              type: "recovery",
              token_hash: encrypted.providerHash,
            }),
          );
          const identity = await ctx.verifyToken(tokens.access_token);
          if (identity.userId !== taken.userId)
            throw new RecoveryError(
              401,
              "Recovery identity could not be verified.",
            );
          const state: RecoveryState = { ...tokens, userId: identity.userId };
          let status = "reset-password";
          if (["owner_admin", "accountant"].includes(taken.role)) {
            const user = await ctx.provider<{
              factors?: { id: string; factor_type: string; status: string }[];
            }>("/user", "GET", undefined, tokens.access_token);
            const factor = user.factors?.find(
              (f) => f.factor_type === "totp" && f.status === "verified",
            );
            if (!factor)
              throw new RecoveryError(
                403,
                "Lost MFA needs separately authorized identity review. This flow cannot remove or replace a verified factor.",
              );
            const challenge = await ctx.provider<{ id: string }>(
              "/factors/" + factor.id + "/challenge",
              "POST",
              {},
              tokens.access_token,
            );
            state.factorId = factor.id;
            state.challengeId = challenge.id;
            status = "mfa-challenge";
          }
          const token = opaque();
          const sessionHash = hash(token);
          await ctx.rpc("staging_auth_recovery_pending_put", {
            p_parent_hash: codeHash,
            p_hash: sessionHash,
            p_provider_session_id: identity.providerSessionId,
            p_ciphertext: ctx.encrypt(state, sessionHash),
          });
          return response(
            200,
            { status, csrf: ctx.csrf(token) },
            cookie(token),
          );
        }
        const token = readCookie(request);
        ctx.requireCsrf(request, token);
        const sessionHash = hash(token);
        if (path === "/auth/recovery/mfa") {
          if (typeof data.code !== "string" || !/^\d{6}$/.test(data.code))
            throw new RecoveryError(
              400,
              "Enter the six-digit authenticator code.",
            );
          const flow = await ctx.rpc<Flow>(
            "staging_auth_recovery_pending_get",
            { p_hash: sessionHash },
          );
          const state = ctx.decrypt<RecoveryState>(
            flow.ciphertext,
            sessionHash,
          );
          if (flow.kind !== "pending" || !state.factorId || !state.challengeId)
            throw new RecoveryError(403, "An MFA challenge is required.");
          const tokens = ctx.tokens(
            await ctx.provider(
              "/factors/" + state.factorId + "/verify",
              "POST",
              { challenge_id: state.challengeId, code: data.code },
              state.access_token,
            ),
          );
          const identity = await ctx.verifyToken(tokens.access_token);
          if (
            identity.userId !== flow.userId ||
            identity.providerSessionId !== flow.providerSessionId ||
            identity.assurance !== "aal2"
          )
            throw new RecoveryError(403, "Current MFA could not be verified.");
          await ctx.rpc("staging_auth_recovery_mfa", {
            p_hash: sessionHash,
            p_ciphertext: ctx.encrypt(
              { ...tokens, userId: flow.userId },
              sessionHash,
            ),
          });
          return response(200, {
            status: "reset-password",
            csrf: ctx.csrf(token),
          });
        }
        if (path === "/auth/recovery/password") {
          if (
            typeof data.newPassword !== "string" ||
            data.newPassword.length < 12 ||
            data.newPassword.length > 128 ||
            !/[a-z]/.test(data.newPassword) ||
            !/[A-Z]/.test(data.newPassword) ||
            !/[0-9]/.test(data.newPassword)
          )
            throw new RecoveryError(
              400,
              "Use 12–128 characters including uppercase, lowercase and a number.",
            );
          const claimed = await ctx.rpc<Flow>("staging_auth_recovery_claim", {
            p_hash: sessionHash,
          });
          const state = ctx.decrypt<RecoveryState>(
            claimed.ciphertext,
            sessionHash,
          );
          const identity = await ctx.verifyToken(state.access_token);
          if (
            identity.userId !== claimed.userId ||
            (["owner_admin", "accountant"].includes(claimed.role) &&
              identity.assurance !== "aal2")
          )
            throw new RecoveryError(
              403,
              "Recovery identity could not be verified.",
            );
          await ctx.provider(
            "/user",
            "PUT",
            { password: data.newPassword },
            state.access_token,
          );
          // Durable app revocation must happen even if provider sign-out is unavailable.
          let revocationFailed = false;
          try {
            await ctx.rpc("staging_auth_recovery_complete", {
              p_hash: sessionHash,
            });
          } catch {
            revocationFailed = true;
          }
          try {
            await ctx.provider(
              "/logout?scope=global",
              "POST",
              {},
              state.access_token,
            );
          } catch {
            revocationFailed = true;
          }
          if (revocationFailed)
            throw new RecoveryError(
              503,
              "Password change was requested, but session revocation could not be fully confirmed. Ask the Owner to review the account before retrying.",
            );
          return response(
            200,
            {
              status: "recovered",
              message:
                "Password changed and sessions revoked. Sign in again; privileged accounts must complete MFA again.",
              emailDeliveryVerified: false,
            },
            clearCookie,
          );
        }
        return response(404, { error: "Unknown recovery route." });
      } catch (error) {
        const status =
          error instanceof RecoveryError
            ? error.status
            : typeof error === "object" &&
                error &&
                "status" in error &&
                typeof error.status === "number"
              ? error.status
              : 503;
        return response(status, {
          error:
            error instanceof RecoveryError
              ? error.message
              : status === 401 || status === 403
                ? "Recovery could not be verified. Ask the Owner for a new code."
                : "Recovery could not be confirmed. Ask the Owner to review the account before retrying.",
        });
      }
    },
  };
}
