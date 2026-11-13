// Production adapter over the existing private store and GLOBAL USD 5 ledger.
// Never initialize/import a second ledger or read fictional financial records.
import {
  createDeepSeekRuntime,
  type DeepSeekRuntimeOptions,
  type DeepSeekRuntimeStatus,
} from "./deepseek-runtime.js";
import { businessAiApprovalSchema } from "./production-policy.js";
import { DocumentExtractionError } from "./extraction-status.js";

export async function createProductionDocumentRuntime(
  options: DeepSeekRuntimeOptions & { expectedCompanyId: string },
) {
  const configured = {
    ...options,
    env: { ...options.env, AZZORA_AI_GENERAL_DOCUMENTS: "business-v1" },
  };
  const runtime = createDeepSeekRuntime(configured);
  const approval = businessAiApprovalSchema.safeParse(options.businessApproval);
  let historyAvailable = false;
  const approvedMode =
    approval.success &&
    approval.data.companyId === options.expectedCompanyId &&
    options.env.AZZORA_AI_CLIENT_DEMO_APP_CAP === "5";
  if (approvedMode && runtime.status().ready) {
    try {
      // A missing, malformed or inaccessible existing ledger is a hard stop.
      // This is read-only; the existing adapter performs CAS and revalidates the
      // authoritative current ledger immediately before every provider request.
      historyAvailable = (await runtime.budgetExposureMicroUsd()) !== null;
    } catch {
      /* Protected storage cannot be replaced with an empty allowance. */
    }
  }
  const status = (): DeepSeekRuntimeStatus => {
    const value = runtime.status();
    return {
      ...value,
      businessDocuments: true,
      syntheticOnly: false,
      ...(!approvedMode || (value.ready && !historyAvailable)
        ? {
            ready: false,
            reason:
              value.reason === "disabled"
                ? ("disabled" as const)
                : ("approval-required" as const),
          }
        : {}),
    };
  };
  return {
    status,
    budgetExposureMicroUsd: runtime.budgetExposureMicroUsd,
    extractor: {
      async extract(file: Parameters<typeof runtime.extractor.extract>[0]) {
        if (!status().ready)
          throw new DocumentExtractionError("configuration-required");
        return runtime.extractor.extract(file);
      },
    },
  };
}
