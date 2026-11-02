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
  type DocumentExtractor,
} from "./providers.js";
import { prepareDeepSeekPdf } from "./deepseek-pdf.js";
import type { Extraction } from "./model.js";
import digests from "./client-demo-digests.json";

export const CLIENT_DEMO_APPLICATION = "azzora-accounts-client-demo";
export const clientDemoCachePath = (digest: string) =>
  `ai-evaluation/client-demo-extractions-v1/${digest}.json`;
const allowed = new Set(digests);
const cap = 5_000_000;
const outputLimit = 8192;
// Verified published peak tariff, USD per million tokens. Usage is an upper
// estimate, not a claim that provider billing was independently reconciled.
const inputRate = 0.3;
const outputRate = 1.2;
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
      if (!status().ready)
        throw Error(
          "AI extraction is disabled or unconfigured; enter manually.",
        );
      const digest = digestOf(file);
      if (!allowed.has(digest))
        throw Error(
          "Only approved fictional demo samples may use AI; enter this document manually.",
        );
      const id = `deepseek:${digest}`;
      // The cache uses the same injected PRIVATE Blob store as the allowance.
      // Never replace it with a public URL or a session-local spending ledger.
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
      if (priorRecord)
        throw Error(
          "This sample was already submitted but has no reusable result; enter manually. No second paid request is allowed.",
        );
      const key = env.DEEPSEEK_API_KEY!;
      const fingerprint = createHash("sha256").update(key).digest("hex");
      const transport: typeof fetch = async (url, init) => {
        if (!status().ready)
          throw Error("AI extraction was disabled before submission.");
        if (url !== "https://api.deepseek.com/chat/completions")
          throw Error("Unexpected AI endpoint.");
        const body = JSON.parse(String(init?.body));
        if (
          body.model !== "deepseek-flash" ||
          body.max_tokens !== outputLimit ||
          body.stream !== false
        )
          throw Error("AI request exceeds the approved model envelope.");
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
          response = await (options.transport ?? fetch)(url, init);
        } catch {
          await finish(null);
          throw Error(
            "AI service unavailable; no automatic retry. Enter manually.",
          );
        }
        let upper: number | null = null;
        try {
          const result = await response.clone().json();
          const usage = result.usage;
          if (
            response.ok &&
            Number.isSafeInteger(usage?.prompt_tokens) &&
            usage.prompt_tokens >= 0 &&
            usage.prompt_tokens <= DEEPSEEK_MAX_INPUT_TOKENS &&
            Number.isSafeInteger(usage?.completion_tokens) &&
            usage.completion_tokens >= 0 &&
            usage.completion_tokens <= outputLimit
          )
            upper = tokenCostUpperMicroUsd(
              usage.prompt_tokens,
              usage.completion_tokens,
              inputRate,
              outputRate,
            );
        } catch {
          /* Keep the complete reservation when usage is uncertain. */
        }
        await finish(upper);
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
      const value = cacheSchema.parse({
        version: 1,
        application: CLIENT_DEMO_APPLICATION,
        digest,
        createdAt: now().toISOString(),
        extraction,
      });
      await store.write(clientDemoCachePath(digest), value);
      return extraction;
    },
  };
  return { status, extractor, budgetExposureMicroUsd };
}
