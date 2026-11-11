/** Production-candidate wiring reuses the established command, session and storage paths. */
import { createStagingAuth } from "../staging/auth.js";
import {
  createProductionRpc,
  StagingServiceError,
} from "../staging/supabase.js";
import { createPrivateAttachmentStorage } from "../staging/storage.js";
import { createStagingHandler } from "../staging/server.js";
import { createAuthoritativeProductionBackup } from "./launch-backup.js";
import { isDistinctBackupKey } from "./backup-key-policy.js";
import {
  assertProductionIdentity,
  productionRuntime,
  type ProductionRuntime,
} from "./runtime-production.js";

/** Resolve a canonical, independent owner key without logging its value. */
export function resolveProductionBackupKey(
  env: Record<string, string | undefined>,
  runtime: ProductionRuntime,
) {
  const raw = env.AZZORA_PRODUCTION_BACKUP_KEY || "";
  const keyId = env.AZZORA_PRODUCTION_BACKUP_KEY_ID || "";
  if (
    !isDistinctBackupKey(raw, [
      runtime.encryptionKey,
      runtime.serviceKey,
      runtime.publishableKey,
    ]) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/.test(keyId)
  )
    throw new StagingServiceError(503, "production_owner_backup_key_required");
  return { key: Buffer.from(raw, "base64url"), keyId };
}

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
        productionBackup: async (_source, read, actor) => {
          const { key, keyId } = resolveProductionBackupKey(
            options.env || process.env,
            runtime,
          );
          const capture = await rpc("staging_owner_backup", {
            p_session_hash: actor.sessionId,
          });
          return createAuthoritativeProductionBackup(
            capture,
            read,
            key,
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
