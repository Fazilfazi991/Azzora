// Server-only owner-authorized fictional demo. No provider-account cap is claimed.
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DEEPSEEK_BUDGET_PATH,
  DEEPSEEK_MAX_INPUT_TOKENS,
  type DeepSeekRuntimeOptions,
  type DeepSeekRuntimeStatus,
} from "./deepseek-runtime.js";
import {
  exposure,
  meterBudget,
  newBudget,
  reserveBudget,
  tokenCostUpperMicroUsd,
  validateBudget,
  type BudgetState,
} from "./benchmark-budget.js";
import {
  createChatExtractor,
  digestOf,
  extractionSchema,
  parseChatExtractionResponse,
  type DocumentExtractor,
} from "./providers.js";
import { prepareDeepSeekPdf } from "./deepseek-pdf.js";
import type { Extraction } from "./model.js";
import digests from "./client-demo-digests.js";
import { DocumentExtractionError } from "./extraction-status.js";
function failureFor(stage: string) {
  return stage === "prepare"
    ? ("preparation-failed" as const)
    : stage === "reserve"
      ? ("budget-blocked" as const)
      : stage === "validate"
        ? ("response-invalid" as const)
        : stage === "cache" || stage === "meter"
          ? ("storage-unavailable" as const)
          : ("provider-unavailable" as const);
}

export const CLIENT_DEMO_APPLICATION = "azzora-accounts-client-demo";
export const clientDemoCachePath = (digest: string) =>
  `ai-evaluation/client-demo-extractions-v1/${digest}.json`;
export const clientDemoRawCachePath = (digest: string) =>
  `ai-evaluation/client-demo-raw-responses-v1/${digest}.json`;
const rawByteLimit = 1_048_576;
const rawCacheSchema = z
  .object({
    version: z.literal(1),
    application: z.literal(CLIENT_DEMO_APPLICATION),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    httpStatus: z.literal(200),
    body: z.string().max(rawByteLimit),
    requestId: z.string().max(200).optional(),
    createdAt: z.string().datetime(),
    latencyMs: z.number().finite().nonnegative(),
  })
  .strict();
async function boundedResponseText(response: Response) {
  const reader = response.clone().body?.getReader();
  if (!reader) throw Error("AI response has no readable body.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > rawByteLimit) {
        void reader.cancel();
        throw Error("AI response exceeds the private recovery limit.");
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
const allowed = new Set(digests);
const cap = 5_000_000;
const outputLimit = 8192;
// Verified published peak tariff, USD per million tokens. Usage is an upper
// estimate, not a claim that provider billing was independently reconciled.
const inputRate = 0.3;
const outputRate = 1.2;
const safeIssueCodes = new Set([
  "invalid_type",
  "invalid_value",
  "too_big",
  "too_small",
  "invalid_format",
  "unrecognized_keys",
  "custom",
  "invalid_union",
  "not_multiple_of",
  "invalid_key",
  "invalid_element",
  "invalid_string",
  "invalid_enum_value",
]);
const safeIssuePaths = new Set([
  "version",
  "application",
  "digest",
  "createdAt",
  "extraction",
  "fields",
  "uncertain",
  "provider",
  "mode",
  "inputTokens",
  "outputTokens",
  "requestId",
  "ocrPages",
  "costUsd",
  "latencyMs",
  "retries",
  "supplier",
  "date",
  "dueDate",
  "reference",
  "purchaseOrderReference",
  "currency",
  "items",
  "description",
  "quantity",
  "unit",
  "unitRate",
  "discount",
  "tax",
  "total",
  "productId",
  "subtotal",
  "kind",
  "categoryId",
  "department",
  "ledgerId",
  "projectName",
  "customerName",
  "projectId",
  "customerId",
]);
interface AppBudget {
  version: 1;
  application?: string;
  authorizationMode?: "owner-application-cap";
  keyFingerprints?: string[];
  budget: BudgetState;
  // Legacy account metadata is retained verbatim, never invented or trusted as
  // evidence in application-cap mode. Key rotation cannot create a new budget.
  accountId?: string;
  keySha256?: string;
}
const cachedExtractionSchema = extractionSchema.extend({
  // The official endpoint may return a resolved model revision rather than
  // echoing the requested alias. Retain its actual name without inventing one.
  provider: z.string().trim().min(1).max(200),
  mode: z.literal("live"),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  requestId: z.string().optional(),
  ocrPages: z.number().int().positive().optional(),
  costUsd: z.null(),
  latencyMs: z.number().finite().nonnegative(),
  retries: z.literal(0),
});
const cacheSchema = z
  .object({
    version: z.literal(1),
    application: z.literal(CLIENT_DEMO_APPLICATION),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.string().datetime(),
    extraction: cachedExtractionSchema,
  })
  .strict();

function validateShared(value: AppBudget) {
  if (
    !value ||
    value.version !== 1 ||
    !value.budget ||
    (value.application !== undefined &&
      value.application !== CLIENT_DEMO_APPLICATION) ||
    (value.keyFingerprints !== undefined &&
      (!Array.isArray(value.keyFingerprints) ||
        value.keyFingerprints.some(
          (fingerprint) =>
            typeof fingerprint !== "string" ||
            !/^[a-f0-9]{64}$/.test(fingerprint),
        )))
  )
    throw Error(
      "Shared AI history is incompatible; reconcile before continuing.",
    );
  validateBudget(value.budget);
}

export function createClientDemoRuntime(options: DeepSeekRuntimeOptions) {
  const { env, store } = options;
  const now = options.now ?? (() => new Date());
  const status = (): DeepSeekRuntimeStatus => {
    let reason: DeepSeekRuntimeStatus["reason"] = "ready";
    if (env.AZZORA_AI_ENABLED !== "true") reason = "disabled";
    else if (env.AZZORA_AI_CLIENT_DEMO_APP_CAP !== "5")
      reason = "approval-required";
    else if (env.AZZORA_AI_PROVIDER !== "deepseek")
      reason = "provider-unconfigured";
    else if (!env.DEEPSEEK_API_KEY?.trim()) reason = "key-missing";
    else if (env.DEEPSEEK_MODEL !== "deepseek-flash") reason = "model-invalid";
    return {
      provider: "deepseek",
      model: "deepseek-flash",
      enabled: env.AZZORA_AI_ENABLED === "true",
      ready: reason === "ready",
      reason,
      maximumEvaluationUsd: 5,
      syntheticOnly: true,
      authorizationMode: "owner-application-cap",
      newRequestsEnabled: env.AZZORA_AI_NEW_REQUESTS_ENABLED !== "false",
    };
  };
  const budgetExposureMicroUsd = async () => {
    const stored = await store.read<AppBudget>(DEEPSEEK_BUDGET_PATH);
    if (!stored) return 0;
    validateShared(stored.value);
    return exposure(stored.value.budget);
  };
  const extractor: DocumentExtractor = {
    async extract(file) {
      let stage:
        | "prepare"
        | "reserve"
        | "provider-response"
        | "meter"
        | "validate"
        | "cache" = "prepare";
      let httpStatus: number | null = null;
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      let preparedImageCount: number | null = null;
      let timedOut = false;
      const started = performance.now();
      try {
        if (!status().ready)
          throw new DocumentExtractionError("configuration-required");
        const digest = digestOf(file);
        if (!allowed.has(digest))
          throw new DocumentExtractionError("not-authorized");
        const id = `deepseek:${digest}`;
        // The cache uses the same injected PRIVATE Blob store as the allowance.
        // Never replace it with a public URL or a session-local spending ledger.
        stage = "cache";
        const cached = await store.read<unknown>(clientDemoCachePath(digest));
        const initial = await store.read<AppBudget>(DEEPSEEK_BUDGET_PATH);
        if (initial) validateShared(initial.value);
        const priorRecord = initial?.value.budget.records.find(
          (record) => record.id === id,
        );
        if (cached) {
          const parsed = cacheSchema.parse(cached.value);
          if (parsed.digest !== digest || !priorRecord)
            throw Error(
              "Cached AI history is incomplete; enter manually without another paid request.",
            );
          const fields = parsed.extraction.fields;
          if (
            fields.categoryId ||
            fields.projectId ||
            fields.customerId ||
            fields.ledgerId ||
            fields.items.some((item) => item.productId)
          )
            throw Error(
              "Cached AI extraction contains unapproved identifiers; enter manually.",
            );
          return {
            ...parsed.extraction,
            provider: `Cached real DeepSeek extraction (${parsed.extraction.provider}; no new paid request)`,
          } satisfies Extraction;
        }
        const rawCached = await store.read<unknown>(
          clientDemoRawCachePath(digest),
        );
        if (rawCached) {
          const raw = rawCacheSchema.parse(rawCached.value);
          if (raw.digest !== digest || !priorRecord)
            throw Error(
              "Cached raw AI history is incomplete; enter manually without another paid request.",
            );
          stage = "validate";
          httpStatus = raw.httpStatus;
          const extraction = parseChatExtractionResponse(JSON.parse(raw.body), {
            model: "deepseek-flash",
            requestId: raw.requestId,
            latencyMs: raw.latencyMs,
          });
          const value = cacheSchema.parse({
            version: 1,
            application: CLIENT_DEMO_APPLICATION,
            digest,
            createdAt: raw.createdAt,
            extraction,
          });
          stage = "cache";
          await store.write(clientDemoCachePath(digest), value);
          return {
            ...extraction,
            provider: `Cached real DeepSeek extraction (${extraction.provider}; no new paid request)`,
          };
        }
        if (priorRecord) throw new DocumentExtractionError("budget-blocked");
        const key = env.DEEPSEEK_API_KEY!;
        const fingerprint = createHash("sha256").update(key).digest("hex");
        stage = "prepare";
        const transport: typeof fetch = async (url, init) => {
          stage = "reserve";
          if (!status().ready)
            throw Error("AI extraction was disabled before submission.");
          if (url !== "https://api.deepseek.com/chat/completions")
            throw Error("Unexpected AI endpoint.");
          const body = JSON.parse(String(init?.body));
          preparedImageCount = Array.isArray(body.messages?.[1]?.content)
            ? body.messages[1].content.filter(
                (part: { type?: string }) => part?.type === "image_url",
              ).length
            : 0;
          if (
            body.model !== "deepseek-flash" ||
            body.max_tokens !== outputLimit ||
            body.stream !== false
          )
            throw Error("AI request exceeds the approved model envelope.");
          if (env.AZZORA_AI_NEW_REQUESTS_ENABLED === "false")
            throw new DocumentExtractionError("configuration-required");
          const prior = await store.read<AppBudget>(DEEPSEEK_BUDGET_PATH);
          if (prior) validateShared(prior.value);
          const current: AppBudget = prior?.value ?? {
            version: 1,
            budget: newBudget(),
          };
          const fingerprints = new Set(current.keyFingerprints ?? []);
          if (current.keySha256 && /^[a-f0-9]{64}$/.test(current.keySha256))
            fingerprints.add(current.keySha256);
          fingerprints.add(fingerprint);
          const maximum = tokenCostUpperMicroUsd(
            DEEPSEEK_MAX_INPUT_TOKENS,
            outputLimit,
            inputRate,
            outputRate,
          );
          const reserved: AppBudget = {
            ...current,
            application: CLIENT_DEMO_APPLICATION,
            authorizationMode: "owner-application-cap",
            keyFingerprints: [...fingerprints],
            budget: reserveBudget(current.budget, id, "deepseek", maximum, cap),
          };
          // CAS before any provider request. Conflicts and uncertain outcomes do
          // not retry, erase history, reset on key rotation, or permit recharging.
          await store.write(DEEPSEEK_BUDGET_PATH, reserved, prior?.version);
          const finish = async (upper: number | null) => {
            stage = "meter";
            const latest = await store.read<AppBudget>(DEEPSEEK_BUDGET_PATH);
            if (!latest)
              throw Error(
                "AI reservation history is missing; stop and reconcile billing.",
              );
            validateShared(latest.value);
            await store.write(
              DEEPSEEK_BUDGET_PATH,
              {
                ...latest.value,
                budget: meterBudget(latest.value.budget, id, upper),
              },
              latest.version,
            );
          };
          let response: Response;
          try {
            stage = "provider-response";
            response = await (options.transport ?? fetch)(url, init);
            httpStatus = response.status;
          } catch (error) {
            timedOut =
              Boolean(init?.signal?.aborted) ||
              (error instanceof Error &&
                ["TimeoutError", "AbortError"].includes(error.name));
            await finish(null);
            stage = "provider-response";
            throw Error(
              "AI service unavailable; no automatic retry. Enter manually.",
            );
          }
          let upper: number | null = null;
          let rawText: string | undefined;
          let readFailure: unknown;
          try {
            rawText = await boundedResponseText(response);
          } catch (error) {
            readFailure = error;
          }
          try {
            const result = JSON.parse(rawText ?? "");
            const usage = result.usage;
            if (
              response.ok &&
              Number.isSafeInteger(usage?.prompt_tokens) &&
              usage.prompt_tokens >= 0 &&
              usage.prompt_tokens <= DEEPSEEK_MAX_INPUT_TOKENS &&
              Number.isSafeInteger(usage?.completion_tokens) &&
              usage.completion_tokens >= 0 &&
              usage.completion_tokens <= outputLimit
            ) {
              inputTokens = usage.prompt_tokens;
              outputTokens = usage.completion_tokens;
              upper = tokenCostUpperMicroUsd(
                usage.prompt_tokens,
                usage.completion_tokens,
                inputRate,
                outputRate,
              );
            }
          } catch {
            /* Keep the complete reservation when usage is uncertain. */
          }
          let cacheFailure: unknown;
          if (response.status === 200 && rawText !== undefined) {
            stage = "cache";
            try {
              if (rawText.includes(key))
                throw Error(
                  "AI response cannot be retained safely; enter manually.",
                );
              // Create-only immutable evidence, saved BEFORE strict field
              // validation. No key/request payload/ground truth is stored.
              await store.write(
                clientDemoRawCachePath(digest),
                rawCacheSchema.parse({
                  version: 1,
                  application: CLIENT_DEMO_APPLICATION,
                  digest,
                  httpStatus: 200,
                  body: rawText,
                  requestId: response.headers.get("x-request-id") || undefined,
                  createdAt: now().toISOString(),
                  latencyMs: performance.now() - started,
                }),
              );
            } catch (error) {
              cacheFailure = error;
            }
          }
          await finish(upper);
          if (cacheFailure) {
            stage = "cache";
            throw cacheFailure;
          }
          if (readFailure) {
            stage = "provider-response";
            throw readFailure;
          }
          stage = response.ok ? "validate" : "provider-response";
          return response;
        };
        const extraction = await createChatExtractor(
          "deepseek",
          key,
          {
            reference: "owner-authorized-fictional-demo-USD5-application-cap",
            allowedDigests: allowed,
            maxRequests: 1,
          },
          undefined,
          transport,
          { preparePdf: prepareDeepSeekPdf, timeoutMs: 20_000 },
        ).extract(file);
        // Only successfully validated REAL provider output can enter this cache.
        // Cache-write failure retains the budget reservation and prevents recharge.
        stage = "validate";
        const value = cacheSchema.parse({
          version: 1,
          application: CLIENT_DEMO_APPLICATION,
          digest,
          createdAt: now().toISOString(),
          extraction,
        });
        stage = "cache";
        await store.write(clientDemoCachePath(digest), value);
        return extraction;
      } catch (error) {
        // Allowlisted operational metadata only. Never log provider bodies,
        // error messages, fields, filenames, hashes, credentials, or store paths.
        console.warn(
          "accounts-ai-extraction-failed",
          JSON.stringify({
            stage,
            reasonCode:
              error instanceof DocumentExtractionError
                ? error.code
                : failureFor(stage),
            httpStatus,
            inputTokens,
            outputTokens,
            preparedImageCount,
            elapsedMs: Math.round(Math.max(0, performance.now() - started)),
            timedOut:
              timedOut ||
              (error instanceof Error &&
                ["TimeoutError", "AbortError"].includes(error.name)),
            validationFailed:
              error instanceof z.ZodError || error instanceof SyntaxError,
            validationIssues:
              error instanceof z.ZodError
                ? error.issues.slice(0, 6).map((issue) => ({
                    code: safeIssueCodes.has(issue.code) ? issue.code : "other",
                    path: issue.path
                      .slice(0, 6)
                      .map((part) =>
                        typeof part === "number" &&
                        Number.isSafeInteger(part) &&
                        part >= 0 &&
                        part <= 120
                          ? part
                          : typeof part === "string" && safeIssuePaths.has(part)
                            ? part
                            : "field",
                      ),
                  }))
                : [],
          }),
        );
        if (error instanceof DocumentExtractionError) throw error;
        throw new DocumentExtractionError(failureFor(stage));
      }
    },
  };
  return { status, extractor, budgetExposureMicroUsd };
}
