import type { VerifiedIdentity } from "./auth.js";
import { AccessDenied } from "./permissions.js";

/** Online verification adapter. getUser validates the exact JWT before any claim is trusted.
 * Session revocation and current authorization are separately required by AccessDirectory.
 * No secret/service key or client-side session storage is used here.
 */
export function createSupabaseTokenVerifier(options: {
  url: string;
  publishableKey: string;
  fetch?: typeof fetch;
  now?: () => number;
}) {
  const base = new URL(options.url);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    !options.publishableKey.startsWith("sb_publishable_")
  )
    throw new Error("Approved HTTPS Supabase URL and publishable key required");
  const transport = options.fetch || fetch;
  return async (token: string): Promise<VerifiedIdentity> => {
    if (!token || token.length > 16_384)
      throw new AccessDenied("authentication_required", 401);
    let response: Response;
    try {
      response = await transport(`${base.origin}/auth/v1/user`, {
        method: "GET",
        headers: {
          apikey: options.publishableKey,
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new AccessDenied("identity_unavailable", 503);
    }
    if (!response.ok)
      throw new AccessDenied(
        response.status >= 500 || response.status === 429
          ? "identity_unavailable"
          : "authentication_required",
        response.status >= 500 || response.status === 429 ? 503 : 401,
      );
    try {
      const user = (await response.json()) as {
        id?: unknown;
        is_anonymous?: unknown;
      };
      const parts = token.split(".");
      if (
        parts.length !== 3 ||
        parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
      )
        throw Error();
      const claims = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const at = (options.now || Date.now)();
      if (
        typeof user.id !== "string" ||
        !uuid.test(user.id) ||
        user.is_anonymous !== false ||
        claims.is_anonymous !== false ||
        claims.sub !== user.id ||
        claims.iss !== `${base.origin}/auth/v1` ||
        claims.aud !== "authenticated" ||
        claims.role !== "authenticated" ||
        typeof claims.session_id !== "string" ||
        !uuid.test(claims.session_id) ||
        typeof claims.exp !== "number" ||
        !Number.isSafeInteger(claims.exp) ||
        claims.exp * 1000 <= at ||
        typeof claims.iat !== "number" ||
        !Number.isSafeInteger(claims.iat) ||
        claims.iat * 1000 > at ||
        (claims.nbf !== undefined &&
          (typeof claims.nbf !== "number" || claims.nbf * 1000 > at)) ||
        !["aal1", "aal2"].includes(String(claims.aal))
      )
        throw Error();
      return {
        userId: user.id,
        providerSessionId: claims.session_id,
        assurance: claims.aal as "aal1" | "aal2",
        expiresAt: claims.exp * 1000,
      };
    } catch {
      throw new AccessDenied("authentication_required", 401);
    }
  };
}
