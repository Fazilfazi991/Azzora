/** Production-candidate wiring reuses the established command, session and storage paths. */
import { createStagingAuth } from "../staging/auth.js";
import {
  createProductionRpc,
  StagingServiceError,
} from "../staging/supabase.js";
import { createPrivateAttachmentStorage } from "../staging/storage.js";
import { createStagingHandler } from "../staging/server.js";
import { createProtectedProductionBackup } from "./launch-backup.js";
import {
  assertProductionIdentity,
  productionRuntime,
} from "./runtime-production.js";

/** No environment fallback, fixture bootstrap, client-review exception or automatic activation. */
export function createProductionCandidate(
  options: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
) {
  // Parse lazily: ordinary Manager/staging builds do not require production secrets.
  return async (request: Request): Promise<Response> => {
    try {
      const runtime = productionRuntime(options.env || process.env);
      const rpc = createProductionRpc(runtime, options.fetch || fetch);
      const identity = await rpc("azzora_runtime_identity", {
        p_company_id: runtime.companyId,
      });
      assertProductionIdentity(identity, runtime);
      const auth = createStagingAuth({
        rpc,
        fetch: options.fetch,
        production: runtime,
      });
      const storage = createPrivateAttachmentStorage(
        runtime,
        options.fetch || fetch,
      );
      return await createStagingHandler({
        rpc,
        auth,
        storage,
        production: runtime,
        productionBackup: async (source, read, actor) => {
          const env = options.env || process.env,
            raw = env.AZZORA_PRODUCTION_BACKUP_KEY || "",
            keyId = env.AZZORA_PRODUCTION_BACKUP_KEY_ID || "";
          if (
            !/^[A-Za-z0-9_-]{43}$/.test(raw) ||
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(keyId) ||
            [
              runtime.encryptionKey,
              runtime.serviceKey,
              runtime.publishableKey,
            ].includes(raw)
          )
            throw new StagingServiceError(
              503,
              "production_owner_backup_key_required",
            );
          return createProtectedProductionBackup(
            source,
            read,
            Buffer.from(raw, "base64url"),
            {
              companyId: runtime.companyId,
              keyId,
              capturedAt: new Date().toISOString(),
            },
            actor,
          );
        },
      })(request);
    } catch (error) {
      const status = error instanceof StagingServiceError ? error.status : 503;
      const code =
        error instanceof StagingServiceError
          ? error.code
          : "production_candidate_unavailable";
      return Response.json(
        {
          error:
            "Production setup is not verified. No operation has been confirmed.",
          code,
        },
        {
          status,
          headers: {
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
  };
}
export const productionCandidate = createProductionCandidate();
