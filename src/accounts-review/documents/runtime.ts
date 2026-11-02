// Server-only integration of the existing provider adapter and shared budget.
import { z } from "zod";
import { createDeepSeekRuntime } from "./deepseek-runtime.js";
import type { ReviewStore } from "../hosted-store.js";
import { disabledExtractor } from "./providers.js";

export type DocumentRuntime = ReturnType<typeof createDeepSeekRuntime>;
export const extractionInputSchema = z
  .object({
    file: z
      .object({ name: z.string(), mime: z.string(), data: z.string() })
      .strict(),
    mode: z.enum(["auto", "manual"]).optional(),
  })
  .strict();
export function configuredDocumentRuntime(store: ReviewStore): DocumentRuntime {
  let approval: unknown;
  try {
    approval = JSON.parse(process.env.AZZORA_AI_APPROVAL_JSON || "null");
  } catch {
    /* Missing/invalid evidence keeps paid extraction unavailable. */
  }
  return createDeepSeekRuntime({
    env: {
      AZZORA_AI_ENABLED: process.env.AZZORA_AI_ENABLED,
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
    provider: "deepseek" as const,
    status: value.ready
      ? ("ready" as const)
      : value.reason === "disabled"
        ? ("disabled" as const)
        : ("configuration-required" as const),
    message: value.ready
      ? "DeepSeek extraction is available only for approved fictional evaluation documents within the shared USD 5 allowance. Review every field before saving a draft."
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
