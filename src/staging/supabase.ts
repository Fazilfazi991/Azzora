/** SERVER ONLY. Never import this module from a browser component. */
export const stagingProjectRef = "hkhomrrvxtcxnxvdlkoh";
export interface StagingConfig {
  url: string;
  publishableKey: string;
  serviceKey: string;
}
export class StagingServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
export function stagingConfig(
  env: Record<string, string | undefined> = process.env,
): StagingConfig {
  const url = env.AZZORA_STAGING_SUPABASE_URL || "";
  const publishableKey = env.AZZORA_STAGING_PUBLISHABLE_KEY || "";
  const serviceKey = env.AZZORA_STAGING_SERVICE_KEY || "";
  if (
    url.replace(/\/$/, "") !== `https://${stagingProjectRef}.supabase.co` ||
    !publishableKey.startsWith("sb_publishable_")
  )
    throw new StagingServiceError(503, "staging_configuration_required");
  let legacyService = false;
  try {
    legacyService =
      JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url").toString())
        .role === "service_role";
  } catch {
    /* no decoded claim is used for user authorization */
  }
  if (
    (!serviceKey.startsWith("sb_secret_") && !legacyService) ||
    serviceKey === publishableKey
  )
    throw new StagingServiceError(503, "staging_server_credentials_required");
  return { url: url.replace(/\/$/, ""), publishableKey, serviceKey };
}
export type StagingRpc = <T = unknown>(
  name: string,
  params?: Record<string, unknown>,
) => Promise<T>;

// Staging diagnostics intentionally contain no payload, identity, credentials,
// URLs or SQL text. Vercel's invocation ID correlates these with request logs.
const timedStagingRpcNames = new Set([
  "staging_company_read",
  "staging_company_commit",
  "staging_auth_actor",
]);
const timingStatuses = new Set([
  200, 204, 400, 401, 403, 409, 429, 500, 502, 503, 504,
]);
const timingCodes = new Set([
  "57014",
  "55P03",
  "40P01",
  "53300",
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
  "PT409",
  "40001",
  "23505",
]);

function createScopedRpc(
  config: StagingConfig,
  transport: typeof fetch,
  production = false,
): StagingRpc {
  return async <T>(
    name: string,
    params: Record<string, unknown> = {},
  ): Promise<T> => {
    if (
      production
        ? !productionRpcNames.has(name)
        : !/^(?:azzora_)?staging_[a-z0-9_]+$/.test(name)
    )
      throw new StagingServiceError(400, "unsupported_staging_rpc");
    const functionName =
      production && name !== "azzora_runtime_identity"
        ? name.replace(/^staging_/, "azzora_production_")
        : name;
    const started = Date.now();
    const timed = !production && timedStagingRpcNames.has(name);
    const recordTiming = (status: number | "transport", code?: string) => {
      if (!timed) return;
      console.info(
        JSON.stringify({
          event: "staging_rpc_timing",
          rpc: name,
          elapsedMs: Math.min(120_000, Math.max(0, Date.now() - started)),
          status:
            typeof status === "number" && !timingStatuses.has(status)
              ? "other"
              : status,
          code: code && timingCodes.has(code) ? code : "other",
        }),
      );
    };
    let response: Response;
    try {
      response = await transport(`${config.url}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: {
          apikey: config.serviceKey,
          "Content-Type": "application/json",
          ...(config.serviceKey.startsWith("eyJ")
            ? { Authorization: `Bearer ${config.serviceKey}` }
            : {}),
        },
        body: JSON.stringify(params),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(25_000),
      });
    } catch (error) {
      recordTiming("transport");
      if (!production)
        console.warn(
          JSON.stringify({
            event: "staging_rpc_transport_failure",
            failure:
              error instanceof Error &&
              (error.name === "TimeoutError" || error.name === "AbortError")
                ? "timeout_or_abort"
                : "network_failure",
          }),
        );
      throw new StagingServiceError(503, "staging_service_unavailable");
    }
    if (!response.ok) {
      // Read only structured codes. SQL errors can contain record contents; never log or forward them.
      const body = (await response.json().catch(() => null)) as {
        code?: string;
      } | null;
      recordTiming(response.status, body?.code);
      if (response.status === 429 || body?.code === "PT429")
        throw new StagingServiceError(429, "staging_rate_limited");
      if (
        response.status === 409 ||
        ["40001", "23505", "PT409"].includes(body?.code || "")
      )
        throw new StagingServiceError(409, "staging_version_conflict");
      if (["PT401", "PT403"].includes(body?.code || ""))
        throw new StagingServiceError(
          body?.code === "PT401" ? 401 : 403,
          "staging_access_denied",
        );
      if (["PT400", "23514", "23503", "22023"].includes(body?.code || ""))
        throw new StagingServiceError(400, "staging_validation_failed");
      if (!production) {
        const allowedStatuses = [500, 502, 503, 504];
        const allowedCodes = [
          "57014",
          "55P03",
          "40P01",
          "53300",
          "PGRST000",
          "PGRST001",
          "PGRST002",
          "PGRST003",
        ];
        console.warn(
          JSON.stringify({
            event: "staging_rpc_upstream_failure",
            status: allowedStatuses.includes(response.status)
              ? response.status
              : "other",
            code: allowedCodes.includes(body?.code || "")
              ? body!.code
              : "other",
          }),
        );
      }
      throw new StagingServiceError(503, "staging_service_unavailable");
    }
    recordTiming(response.status);
    if (response.status === 204) return undefined as T;
    const value = await response.text();
    if (!value.trim()) return undefined as T;
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new StagingServiceError(503, "staging_response_invalid");
    }
  };
}
const productionRpcNames = new Set([
  "azzora_runtime_identity",
  "staging_company_read",
  "staging_company_commit",
  "staging_company_people",
  "staging_auth_grant",
  "staging_auth_actor",
  "staging_auth_rate",
  "staging_auth_pending_put",
  "staging_auth_pending_get",
  "staging_auth_pending_delete",
  "staging_auth_session_put",
  "staging_auth_session_get",
  "staging_auth_session_revoke",
  "staging_auth_session_touch",
  "staging_auth_tokens_update",
]);
export function createStagingRpc(
  config: StagingConfig,
  transport: typeof fetch = fetch,
): StagingRpc {
  return createScopedRpc(config, transport);
}
/** Compatibility names are internal only; no production HTTP request targets a staging RPC. */
export function createProductionRpc(
  config: StagingConfig,
  transport: typeof fetch = fetch,
): StagingRpc {
  return createScopedRpc(config, transport, true);
}
/** Lazy so ordinary Manager/Accounts builds never require staging credentials. */
export const rpc: StagingRpc = <T>(
  name: string,
  params?: Record<string, unknown>,
) => createStagingRpc(stagingConfig())<T>(name, params);
