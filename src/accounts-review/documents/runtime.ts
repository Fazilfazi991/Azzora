// Server-only integration of the existing provider adapter and shared budget.
import { z } from "zod";
import { createDeepSeekRuntime } from "./deepseek-runtime.js";
import type { ReviewStore } from "../hosted-store.js";
import {
  documentProcessingSchema,
  type DocumentAuthorization,
} from "./admission.js";
import { disabledExtractor } from "./providers.js";

export type DocumentRuntime = ReturnType<typeof createDeepSeekRuntime>;
export const extractionInputSchema = z
  .object({
    file: z
      .object({ name: z.string(), mime: z.string(), data: z.string() })
      .strict(),
    mode: z.enum(["auto", "manual"]).optional(),
    processing: documentProcessingSchema.optional(),
  })
  .strict();
export function configuredDocumentRuntime(
  store: ReviewStore,
  authorization?: DocumentAuthorization,
): DocumentRuntime {
  let approval: unknown;
  try {
    approval = JSON.parse(process.env.AZZORA_AI_APPROVAL_JSON || "null");
  } catch {
    /* Missing/invalid evidence keeps paid extraction unavailable. */
  }
  return createDeepSeekRuntime({
    authorization,
    env: {
      AZZORA_AI_GENERAL_DOCUMENTS: process.env.AZZORA_AI_GENERAL_DOCUMENTS,
      AZZORA_AI_AUTHORIZED_DOCUMENT_SHA256:
        process.env.AZZORA_AI_AUTHORIZED_DOCUMENT_SHA256,
      AZZORA_AI_NEW_REQUESTS_ENABLED:
        process.env.AZZORA_AI_NEW_REQUESTS_ENABLED,
      AZZORA_AI_ENABLED: process.env.AZZORA_AI_ENABLED,
      AZZORA_AI_CLIENT_DEMO_APP_CAP: process.env.AZZORA_AI_CLIENT_DEMO_APP_CAP,
      AZZORA_AI_PROVIDER: process.env.AZZORA_AI_PROVIDER,
      DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    },
    store,
    approval,
  });
}
export function documentAvailability(runtime: DocumentRuntime) {
  const value = runtime.status();
  return {
    enabled: value.ready,
    generalDocuments: value.generalDocuments === true,
    provider: "deepseek" as const,
    authorizationMode: value.authorizationMode,
    status: value.ready
      ? ("ready" as const)
      : value.reason === "disabled"
        ? ("disabled" as const)
        : ("configuration-required" as const),
    message: value.ready
      ? value.generalDocuments
        ? "DeepSeek reads new supported fictional documents after individual sign-in and per-upload consent. Review every suggestion before saving a draft. Shared USD 5 application cap; real company document processing is not approved."
        : value.newRequestsEnabled === false
          ? "New paid AI requests are on hold pending verification. Approved cached real results remain available. Unauthorized documents are never sent to the provider. Manual review remains available."
          : value.authorizedDocumentReview
            ? "AI accepts the approved fictional samples and the one specifically owner-authorized quotation photo. That photo is restricted to review drafts with no financial posting. The shared USD 5 application cap remains active; provider-account controls are unverified. Review all extracted values."
            : value.authorizationMode === "owner-application-cap"
              ? "Real DeepSeek extraction is available for approved fictional samples under the owner-approved shared USD 5 application cap. This is not a verified provider-account spending cap. Cached real results avoid another paid request. Review every field before saving a draft."
              : "DeepSeek extraction is available only for approved fictional evaluation documents within the shared USD 5 allowance. Review every field before saving a draft."
      : value.reason === "disabled"
        ? "Live AI extraction is disabled. Selectable PDF text and clearly labelled prepared demo suggestions are available; images can be entered manually."
        : "Live AI extraction is unavailable until credential and billing controls are verified. Manual entry and local PDF reading remain available.",
  };
}
export const extractorFor = (
  runtime: DocumentRuntime,
  mode?: "auto" | "manual",
) =>
  mode === "manual"
    ? disabledExtractor
    : runtime.status().ready
      ? runtime.extractor
      : undefined;
