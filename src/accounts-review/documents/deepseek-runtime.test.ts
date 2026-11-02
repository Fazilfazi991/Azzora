import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ReviewConflict, type ReviewStore } from "../hosted-store";
import { exposure, newBudget } from "./benchmark-budget";
import { digestOf } from "./providers";
import { sampleDocuments } from "./samples";
import {
  createDeepSeekRuntime,
  DEEPSEEK_BUDGET_PATH,
  type DeepSeekApproval,
} from "./deepseek-runtime";

class Store implements ReviewStore {
  value: unknown;
  version = 0;
  async read<T>() {
    return this.value === undefined
      ? null
      : {
          value: structuredClone(this.value) as T,
          version: String(this.version),
        };
  }
  async write<T>(_path: string, value: T, version?: string) {
    if (
      version !== (this.value === undefined ? undefined : String(this.version))
    )
      throw new ReviewConflict("Conflict");
    this.value = structuredClone(value);
    this.version++;
  }
  async remove() {
    throw Error("Never delete AI history.");
  }
}
const now = () => new Date("2026-11-02T10:00:00.000Z");
const key = "fictional-unit-test-key-not-a-provider-credential";
const file = {
  name: "fictional.png",
  mime: "image/png",
  data: readFileSync("tests/fixtures/document-entry/01.png").toString("base64"),
};
function approval(): DeepSeekApproval {
  const budget = newBudget();
  return {
    version: 1,
    reference: "unit-test-synthetic-only",
    allowedDigests: [digestOf(file)],
    maxRequests: 40,
    combinedCapMicroUsd: 5_000_000,
    historyReconciled: true,
    priorBudget: budget,
    priorBudgetSha256: createHash("sha256")
      .update(JSON.stringify(budget))
      .digest("hex"),
    providers: {
      deepseek: {
        accountId: "fictional-account",
        keySha256: createHash("sha256").update(key).digest("hex"),
        capMicroUsd: 5_000_000,
        capScope: "account",
        hardStopVerified: true,
        autoTopupsDisabled: true,
        dedicatedToBenchmark: true,
        verifiedBy: "unit-test-only",
        evidenceRefs: ["mock-account-proof-not-live-approval"],
        verifiedAt: now().toISOString(),
        model: "deepseek-flash",
        tariff: {
          sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
          checkedAt: "2026-11-02",
          maxInputTokens: 1_048_576,
          maxOutputTokens: 8192,
          inputUsdPerMillion: 0.3,
          outputUsdPerMillion: 1.2,
        },
      },
    },
  };
}
const env = {
  AZZORA_AI_ENABLED: "true",
  AZZORA_AI_PROVIDER: "deepseek",
  DEEPSEEK_MODEL: "deepseek-flash",
  DEEPSEEK_API_KEY: key,
};
const response = (
  usage: unknown = { prompt_tokens: 1000, completion_tokens: 500 },
) =>
  Response.json({
    id: "fictional-request",
    model: "deepseek-flash",
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            fields: sampleDocuments[0].fields,
            uncertain: [],
          }),
        },
      },
    ],
    usage,
  });

describe("DeepSeek live integration gate — mocked transport only", () => {
  it.each([
    [{ ...env, AZZORA_AI_ENABLED: "false" }, "disabled"],
    [{ ...env, DEEPSEEK_API_KEY: "" }, "key-missing"],
    [{ ...env, DEEPSEEK_MODEL: "another-model" }, "model-invalid"],
    [{ ...env, AZZORA_AI_PROVIDER: "other" }, "provider-unconfigured"],
  ])(
    "does not call or reserve while configuration is unavailable",
    async (configured, reason) => {
      const store = new Store();
      let calls = 0;
      const runtime = createDeepSeekRuntime({
        env: configured,
        store,
        approval: approval(),
        now,
        transport: async () => {
          calls++;
          return response();
        },
      });
      expect(runtime.status().reason).toBe(reason);
      expect((await runtime.extractor.extract(file)).mode).toBe("manual");
      expect(calls).toBe(0);
      expect(store.value).toBeUndefined();
      expect(JSON.stringify(runtime.status())).not.toContain(key);
    },
  );
  it("requires verified cap, fresh tariff, reconciled history and matching credential", async () => {
    for (const mutate of [
      (a: DeepSeekApproval) => {
        a.providers.deepseek.verifiedAt = "2026-10-22T00:00:00Z";
      },
      (a: DeepSeekApproval) => {
        a.providers.deepseek.keySha256 = "0".repeat(64);
      },
      (a: DeepSeekApproval) => {
        a.providers.deepseek.tariff.checkedAt = "2026-11-01";
      },
      (a: DeepSeekApproval) => {
        a.priorBudgetSha256 = "0".repeat(64);
      },
    ]) {
      const a = approval();
      mutate(a);
      expect(
        createDeepSeekRuntime({
          env,
          store: new Store(),
          approval: a,
          now,
        }).status().reason,
      ).toBe("approval-required");
    }
    expect(
      createDeepSeekRuntime({ env, store: new Store(), now }).status().reason,
    ).toBe("approval-required");
  });
  it("honors a disabled switch and expired evidence before submission", async () => {
    let currentTime = now();
    const configured = { ...env };
    let calls = 0;
    const runtime = createDeepSeekRuntime({
      env: configured,
      store: new Store(),
      approval: approval(),
      now: () => currentTime,
      transport: async () => {
        calls++;
        return response();
      },
    });
    configured.AZZORA_AI_ENABLED = "false";
    expect(runtime.status().reason).toBe("disabled");
    await expect(runtime.extractor.extract(file)).rejects.toThrow(/disabled/);
    configured.AZZORA_AI_ENABLED = "true";
    currentTime = new Date("2026-11-04T10:00:00Z");
    expect(runtime.status().reason).toBe("approval-required");
    await expect(runtime.extractor.extract(file)).rejects.toThrow(/approval/);
    expect(calls).toBe(0);
  });
  it("shares one persistent reservation, meters valid usage and rejects a repeated digest", async () => {
    const store = new Store();
    let calls = 0;
    const runtime = createDeepSeekRuntime({
      env,
      store,
      approval: approval(),
      now,
      transport: async (url, init) => {
        calls++;
        expect(url).toBe("https://api.deepseek.com/chat/completions");
        expect((init?.headers as Record<string, string>).Authorization).toBe(
          `Bearer ${key}`,
        );
        expect(String(init?.body)).not.toContain(key);
        expect(await runtime.budgetExposureMicroUsd()).toBe(324404);
        return response();
      },
    });
    expect(runtime.status().ready).toBe(true);
    expect((await runtime.extractor.extract(file)).mode).toBe("live");
    expect(await runtime.budgetExposureMicroUsd()).toBe(900);
    const restarted = createDeepSeekRuntime({
      env,
      store,
      approval: approval(),
      now,
      transport: async () => {
        calls++;
        return response();
      },
    });
    await expect(restarted.extractor.extract(file)).rejects.toThrow(
      /already reserved/,
    );
    expect(calls).toBe(1);
    expect(DEEPSEEK_BUDGET_PATH).toBe("ai-evaluation/shared-budget-v1.json");
  });
  it("retains maximum exposure for failed or missing metering without a retry", async () => {
    for (const mode of ["network", "usage", "http"] as const) {
      const store = new Store();
      let calls = 0;
      const runtime = createDeepSeekRuntime({
        env,
        store,
        approval: approval(),
        now,
        transport: async () => {
          calls++;
          if (mode === "network") throw Error("secret provider error");
          if (mode === "http")
            return new Response("Provider detail", { status: 429 });
          return response(null);
        },
      });
      if (mode === "usage") await runtime.extractor.extract(file);
      else await expect(runtime.extractor.extract(file)).rejects.toThrow();
      expect(await runtime.budgetExposureMicroUsd()).toBe(324404);
      expect(calls).toBe(1);
    }
  });
  it("rejects unauthorised documents and enforces account/global caps before network", async () => {
    const a = approval();
    a.providers.deepseek.capMicroUsd = 1;
    let calls = 0;
    const runtime = createDeepSeekRuntime({
      env,
      store: new Store(),
      approval: a,
      now,
      transport: async () => {
        calls++;
        return response();
      },
    });
    await expect(runtime.extractor.extract(file)).rejects.toThrow(
      /spending cap/,
    );
    await expect(
      runtime.extractor.extract({
        ...file,
        data: Buffer.from("unknown synthetic").toString("base64"),
      }),
    ).rejects.toThrow(/not approved/);
    expect(calls).toBe(0);
  });
  it("requires and reserves the complete 1,048,576-token input envelope", async () => {
    const a = approval();
    const oldEnvelope = structuredClone(a);
    const invalid = {
      ...oldEnvelope,
      providers: {
        deepseek: {
          ...oldEnvelope.providers.deepseek,
          tariff: {
            ...oldEnvelope.providers.deepseek.tariff,
            maxInputTokens: 1_000_000,
          },
        },
      },
    };
    expect(
      createDeepSeekRuntime({
        env,
        store: new Store(),
        approval: invalid,
        now,
      }).status().reason,
    ).toBe("approval-required");
    const store = new Store();
    const runtime = createDeepSeekRuntime({
      env,
      store,
      approval: a,
      now,
      transport: async () => {
        expect(await runtime.budgetExposureMicroUsd()).toBe(324404);
        return response({ prompt_tokens: 1_048_576, completion_tokens: 8192 });
      },
    });
    await runtime.extractor.extract(file);
    expect(await runtime.budgetExposureMicroUsd()).toBe(324404);
    const recorded = store.value as {
      budget: { records: { status: string; meteredUpperMicroUsd: number }[] };
    };
    expect(recorded.budget.records[0].status).toBe("metered");
    expect(recorded.budget.records[0].meteredUpperMicroUsd).toBe(324404);
  });
  it("retains valid metered cost when document JSON is malformed or its schema is invalid", async () => {
    for (const content of [
      "not json",
      JSON.stringify({ fields: { supplier: "incomplete" }, uncertain: [] }),
    ]) {
      const store = new Store();
      let calls = 0;
      const runtime = createDeepSeekRuntime({
        env,
        store,
        approval: approval(),
        now,
        transport: async () => {
          calls++;
          return Response.json({
            choices: [{ message: { content }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1000, completion_tokens: 500 },
          });
        },
      });
      await expect(runtime.extractor.extract(file)).rejects.toThrow();
      expect(await runtime.budgetExposureMicroUsd()).toBe(900);
      const recorded = store.value as {
        budget: { records: { status: string; meteredUpperMicroUsd: number }[] };
      };
      expect(recorded.budget.records[0].status).toBe("metered");
      expect(recorded.budget.records[0].meteredUpperMicroUsd).toBe(900);
      await expect(runtime.extractor.extract(file)).rejects.toThrow(
        /already reserved/,
      );
      expect(calls).toBe(1);
    }
  });
  it("uses optimistic concurrency to prevent a double paid call", async () => {
    const store = new Store();
    let calls = 0;
    const runtime = createDeepSeekRuntime({
      env,
      store,
      approval: approval(),
      now,
      transport: async () => {
        calls++;
        return response();
      },
    });
    const results = await Promise.allSettled([
      runtime.extractor.extract(file),
      runtime.extractor.extract(file),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(calls).toBe(1);
  });
  it("imports historical Qwen spending instead of starting another USD5 allowance", async () => {
    const a = approval();
    a.priorBudget.records.push({
      id: "qwen:prior",
      provider: "qwen",
      status: "uncertain",
      reservedMicroUsd: 4_900_000,
    });
    a.priorBudgetSha256 = createHash("sha256")
      .update(JSON.stringify(a.priorBudget))
      .digest("hex");
    let calls = 0;
    const runtime = createDeepSeekRuntime({
      env,
      store: new Store(),
      approval: a,
      now,
      transport: async () => {
        calls++;
        return response();
      },
    });
    expect(await runtime.budgetExposureMicroUsd()).toBe(
      exposure(a.priorBudget),
    );
    await expect(runtime.extractor.extract(file)).rejects.toThrow(/combined/);
    expect(calls).toBe(0);
  });
});
