// Server-only paid extraction gate. All sessions/deployments share one budget.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ReviewStore } from "../hosted-store.js";
import {
  exposure,
  meterBudget,
  reserveBudget,
  tokenCostUpperMicroUsd,
  validateBudget,
  type BudgetState,
} from "./benchmark-budget.js";
import {
  createChatExtractor,
  disabledExtractor,
  digestOf,
  type DocumentExtractor,
} from "./providers.js";
import { prepareDeepSeekPdf } from "./deepseek-pdf.js";

export const DEEPSEEK_BUDGET_PATH = "ai-evaluation/shared-budget-v1.json";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const money = z.number().int().positive().max(5_000_000);
const accountSchema = z
  .object({
    accountId: z.string().trim().min(1),
    keySha256: z.string().regex(/^[a-f0-9]{64}$/),
    capMicroUsd: money,
    capScope: z.literal("account"),
    hardStopVerified: z.literal(true),
    autoTopupsDisabled: z.literal(true),
    dedicatedToBenchmark: z.literal(true),
    verifiedBy: z.string().trim().min(1),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1),
    verifiedAt: z.string().datetime(),
    model: z.literal("deepseek-flash"),
    tariff: z
      .object({
        sourceUrl: z.string().url(),
        checkedAt: z.string(),
        // The full model envelope is reserved; image-token estimates are not a cap.
        maxInputTokens: z.literal(1_000_000),
        maxOutputTokens: z.literal(8192),
        inputUsdPerMillion: z.number().finite().min(0.3),
        outputUsdPerMillion: z.number().finite().min(1.2),
      })
      .strict(),
  })
  .strict();
export const deepSeekApprovalSchema = z
  .object({
    version: z.literal(1),
    reference: z.string().trim().min(1),
    allowedDigests: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .min(1)
      .max(100),
    maxRequests: z.number().int().positive().max(100),
    combinedCapMicroUsd: money,
    providers: z.object({ deepseek: accountSchema }).strict(),
    // Import the previously reconciled shared allowance, including Qwen usage.
    // An absent or different historical ledger can never silently start at zero.
    historyReconciled: z.literal(true),
    priorBudget: z.custom<BudgetState>(),
    priorBudgetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type DeepSeekApproval = z.infer<typeof deepSeekApprovalSchema>;
export interface DeepSeekEnvironment {
  AZZORA_AI_ENABLED?: string;
  AZZORA_AI_PROVIDER?: string;
  DEEPSEEK_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
}
export interface DeepSeekRuntimeStatus {
  provider: "deepseek";
  model: "deepseek-flash";
  enabled: boolean;
  ready: boolean;
  reason:
    | "disabled"
    | "provider-unconfigured"
    | "key-missing"
    | "model-invalid"
    | "approval-required"
    | "ready";
  maximumEvaluationUsd: 5;
  syntheticOnly: true;
}
interface SharedBudget {
  version: 1;
  accountId: string;
  keySha256: string;
  budget: BudgetState;
}
export interface DeepSeekRuntimeOptions {
  env: DeepSeekEnvironment;
  store: ReviewStore;
  approval?: unknown;
  transport?: typeof fetch;
  now?: () => Date;
}

function checkApproval(
  value: unknown,
  key: string,
  now: Date,
): DeepSeekApproval {
  const a = deepSeekApprovalSchema.parse(value);
  const account = a.providers.deepseek;
  const age = now.getTime() - Date.parse(account.verifiedAt);
  if (
    age < 0 ||
    age > 86_400_000 ||
    account.tariff.checkedAt !== now.toISOString().slice(0, 10)
  )
    throw Error("Current account/billing verification is required.");
  if (
    account.keySha256 !== hash(key) ||
    account.capMicroUsd > a.combinedCapMicroUsd
  )
    throw Error(
      "Account verification does not match this credential or allowance.",
    );
  validateBudget(a.priorBudget);
  if (
    a.priorBudget.limitMicroUsd !== a.combinedCapMicroUsd ||
    hash(JSON.stringify(a.priorBudget)) !== a.priorBudgetSha256
  )
    throw Error("Historical benchmark allowance has not been reconciled.");
  return a;
}

export function createDeepSeekRuntime(options: DeepSeekRuntimeOptions): {
  status: () => DeepSeekRuntimeStatus;
  extractor: DocumentExtractor;
  budgetExposureMicroUsd: () => Promise<number | null>;
} {
  const { env, store } = options;
  const now = options.now ?? (() => new Date());
  const base = {
    provider: "deepseek" as const,
    model: "deepseek-flash" as const,
    maximumEvaluationUsd: 5 as const,
    syntheticOnly: true as const,
  };
  let reason: DeepSeekRuntimeStatus["reason"] = "ready";
  if (env.AZZORA_AI_ENABLED !== "true") reason = "disabled";
  else if (env.AZZORA_AI_PROVIDER !== "deepseek")
    reason = "provider-unconfigured";
  else if (!env.DEEPSEEK_API_KEY?.trim()) reason = "key-missing";
  else if (env.DEEPSEEK_MODEL !== "deepseek-flash") reason = "model-invalid";
  let approval: DeepSeekApproval | undefined;
  if (reason === "ready") {
    try {
      approval = checkApproval(options.approval, env.DEEPSEEK_API_KEY!, now());
    } catch {
      reason = "approval-required";
    }
  }
  const status = (): DeepSeekRuntimeStatus => {
    let current = reason;
    if (env.AZZORA_AI_ENABLED !== "true") current = "disabled";
    else if (env.AZZORA_AI_PROVIDER !== "deepseek")
      current = "provider-unconfigured";
    else if (!env.DEEPSEEK_API_KEY?.trim()) current = "key-missing";
    else if (env.DEEPSEEK_MODEL !== "deepseek-flash") current = "model-invalid";
    else if (approval) {
      try {
        checkApproval(approval, env.DEEPSEEK_API_KEY, now());
        current = "ready";
      } catch {
        current = "approval-required";
      }
    }
    return {
      ...base,
      enabled: env.AZZORA_AI_ENABLED === "true",
      ready: current === "ready",
      reason: current,
    };
  };
  const budgetExposureMicroUsd = async () => {
    if (!approval) return null;
    const stored = await store.read<SharedBudget>(DEEPSEEK_BUDGET_PATH);
    if (!stored) return exposure(approval.priorBudget);
    validateShared(stored.value, approval);
    return exposure(stored.value.budget);
  };
  if (!approval)
    return { status, extractor: disabledExtractor, budgetExposureMicroUsd };
  const approved = approval;
  const key = env.DEEPSEEK_API_KEY!;
  const extractor: DocumentExtractor = {
    async extract(file) {
      if (!status().ready)
        throw Error(
          "AI extraction is disabled or needs current account approval; enter manually.",
        );
      checkApproval(approved, key, now());
      const digest = digestOf(file);
      if (!approved.allowedDigests.includes(digest))
        throw Error(
          "This document is not approved for the synthetic AI evaluation; enter it manually.",
        );
      const account = approved.providers.deepseek;
      const id = `deepseek:${digest}`;
      // Preparation/strict input validation happen before any charge reservation.
      const transport: typeof fetch = async (url, init) => {
        if (!status().ready)
          throw Error("AI extraction was disabled before submission.");
        if (url !== "https://api.deepseek.com/chat/completions")
          throw Error("Unexpected AI endpoint.");
        const body = JSON.parse(String(init?.body));
        if (
          body.model !== "deepseek-flash" ||
          body.max_tokens !== 8192 ||
          body.stream !== false
        )
          throw Error("AI request exceeds the verified model envelope.");
        checkApproval(approved, key, now());
        const prior = await store.read<SharedBudget>(DEEPSEEK_BUDGET_PATH);
        if (prior) validateShared(prior.value, approved);
        const current: SharedBudget = prior?.value ?? {
          version: 1,
          accountId: account.accountId,
          keySha256: account.keySha256,
          budget: approved.priorBudget,
        };
        if (
          current.budget.records.filter((r) => r.provider === "deepseek")
            .length >= approved.maxRequests
        )
          throw Error("The authorized AI request limit has been reached.");
        const maximum = tokenCostUpperMicroUsd(
          account.tariff.maxInputTokens,
          account.tariff.maxOutputTokens,
          account.tariff.inputUsdPerMillion,
          account.tariff.outputUsdPerMillion,
        );
        const reserved = {
          ...current,
          budget: reserveBudget(
            current.budget,
            id,
            "deepseek",
            maximum,
            account.capMicroUsd,
          ),
        };
        // ReviewStore writes use conditional versions, shared by every session.
        // A conflict fails before fetch; no auto retry or duplicated allowance.
        await store.write(DEEPSEEK_BUDGET_PATH, reserved, prior?.version);
        const finish = async (upper: number | null) => {
          const latest = await store.read<SharedBudget>(DEEPSEEK_BUDGET_PATH);
          if (!latest)
            throw Error(
              "AI reservation history is missing; stop and reconcile billing.",
            );
          validateShared(latest.value, approved);
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
            "AI service unavailable; no automatic retry. Enter the document manually.",
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
            usage.prompt_tokens <= account.tariff.maxInputTokens &&
            Number.isSafeInteger(usage?.completion_tokens) &&
            usage.completion_tokens >= 0 &&
            usage.completion_tokens <= account.tariff.maxOutputTokens
          )
            upper = tokenCostUpperMicroUsd(
              usage.prompt_tokens,
              usage.completion_tokens,
              account.tariff.inputUsdPerMillion,
              account.tariff.outputUsdPerMillion,
            );
        } catch {
          /* Missing/invalid usage retains the full reservation. */
        }
        await finish(upper);
        return response;
      };
      return createChatExtractor(
        "deepseek",
        key,
        {
          reference: approved.reference,
          allowedDigests: new Set(approved.allowedDigests),
          maxRequests: 1,
        },
        undefined,
        transport,
        { preparePdf: prepareDeepSeekPdf, timeoutMs: 20_000 },
      ).extract(file);
    },
  };
  return { status, extractor, budgetExposureMicroUsd };
}

function validateShared(value: SharedBudget, approval: DeepSeekApproval) {
  const account = approval.providers.deepseek;
  if (
    value.version !== 1 ||
    value.accountId !== account.accountId ||
    value.keySha256 !== account.keySha256 ||
    value.budget.limitMicroUsd !== approval.combinedCapMicroUsd
  )
    throw Error(
      "Shared AI budget/account mismatch; reconcile before continuing.",
    );
  validateBudget(value.budget);
  // History imported for the approval must remain present and unchanged.
  for (const historical of approval.priorBudget.records) {
    const found = value.budget.records.find(
      (record) => record.id === historical.id,
    );
    if (!found || JSON.stringify(found) !== JSON.stringify(historical))
      throw Error("Shared AI budget history differs from its verified import.");
  }
}
