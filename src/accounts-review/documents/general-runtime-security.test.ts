import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewConflict, type ReviewStore } from "../hosted-store";
import { createReviewState, reviewSnapshot } from "../domain";
import {
  createDocumentAuthorization,
  FICTIONAL_AI_COMPANY_ID,
} from "./admission";
import {
  createDeepSeekRuntime,
  DEEPSEEK_BUDGET_PATH,
  type DeepSeekRuntimeOptions,
} from "./deepseek-runtime";
import {
  CLIENT_DEMO_APPLICATION,
  clientDemoCachePath,
} from "./client-demo-runtime";
import { newBudget, exposure, type BudgetState } from "./benchmark-budget";
import { blankFields, type Upload } from "./model";
import { digestOf } from "./providers";
import { extractDocument } from "./service";

class Store implements ReviewStore {
  values = new Map<string, { value: unknown; version: string }>();
  reads: string[] = [];
  writes: string[] = [];
  serial = 0;
  async read<T>(path: string) {
    this.reads.push(path);
    const row = this.values.get(path);
    return row ? (structuredClone(row) as { value: T; version: string }) : null;
  }
  async write<T>(path: string, value: T, version?: string) {
    if (this.values.get(path)?.version !== version)
      throw new ReviewConflict("CAS conflict");
    this.writes.push(path);
    this.values.set(path, {
      value: structuredClone(value),
      version: String(++this.serial),
    });
  }
  async remove() {
    throw Error("No budget or audit deletion");
  }
}
const env = {
  AZZORA_AI_CLIENT_DEMO_APP_CAP: "5",
  AZZORA_AI_GENERAL_DOCUMENTS: "fictional-v1",
  AZZORA_AI_ENABLED: "true",
  AZZORA_AI_PROVIDER: "deepseek",
  DEEPSEEK_MODEL: "deepseek-flash",
  DEEPSEEK_API_KEY: "fictional-mock-key",
};
const consent = {
  dataClass: "fictional",
  consent: true,
  policyVersion: "ai-fictional-v1",
};
const actor = {
  userId: "22222222-2222-4222-8222-222222222222",
  companyId: FICTIONAL_AI_COMPANY_ID,
  role: "accountant" as const,
  workspace: "accountant" as const,
  assurance: "aal2" as const,
  capabilities: ["finance.draft"],
};
const authorization = () => createDocumentAuthorization(actor, consent);
const file = (name = "new fictional supplier layout"): Upload => ({
  name: "unseen.png",
  mime: "image/png",
  data: Buffer.concat([
    readFileSync("tests/fixtures/document-entry/01.png"),
    Buffer.from(name),
  ]).toString("base64"),
});
const fields = () => ({
  ...blankFields(),
  documentType: "invoice" as const,
  supplier: "Fictional Supplier New",
  reference: "FICTIONAL-NEW-001",
  date: "2026-11-06",
  currency: "AED" as const,
  subtotal: "10.00",
  tax: "0.00",
  total: "10.00",
  kind: "supplier-bill" as const,
  items: [
    {
      description: "Fictional cable",
      quantity: "2",
      unit: "each",
      unitRate: "5.00",
      tax: "0.00",
      total: "10.00",
      productId: "",
    },
  ],
});
const response = () =>
  Response.json({
    model: "deepseek-flash",
    id: "mock-provider-result",
    usage: { prompt_tokens: 1000, completion_tokens: 500 },
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({ fields: fields(), uncertain: [] }),
        },
      },
    ],
  });
async function seed(
  store: Store,
  budget: BudgetState = {
    ...newBudget(),
    records: [
      {
        id: "historical-fictional-qwen",
        provider: "qwen",
        reservedMicroUsd: 10000,
        meteredUpperMicroUsd: 4857,
        status: "metered",
      },
    ],
  },
) {
  await store.write(DEEPSEEK_BUDGET_PATH, {
    version: 1,
    application: CLIENT_DEMO_APPLICATION,
    keyFingerprints: [
      createHash("sha256").update("previous-fictional-key").digest("hex"),
    ],
    budget,
  });
  store.writes = [];
}
const setup = (
  store: Store,
  transport: typeof fetch,
  extra: Partial<DeepSeekRuntimeOptions> = {},
) =>
  createDeepSeekRuntime({
    env,
    store,
    transport,
    authorization: authorization(),
    ...extra,
  });

describe("general document runtime security with mocked transport only", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());
  it("sends an unseen authorized file only after reserving existing shared history", async () => {
    const store = new Store();
    await seed(store);
    const transport = vi.fn(async () => {
      const b = (await store.read<{ budget: BudgetState }>(
        DEEPSEEK_BUDGET_PATH,
      ))!.value.budget;
      expect(b.records.at(-1)?.status).toBe("reserved");
      expect(b.records[0].meteredUpperMicroUsd).toBe(4857);
      return response();
    });
    const result = await setup(store, transport).extractor.extract(file());
    expect(transport).toHaveBeenCalledOnce();
    expect(result.fields.supplier).toBe("Fictional Supplier New");
    expect(result.mode).toBe("live");
    expect(result.reviewPolicy).toBe("draft-only");
    expect(await setup(store, transport).budgetExposureMicroUsd()).toBe(5757);
  });
  it("fails closed when historical shared allowance is missing", async () => {
    const store = new Store(),
      transport = vi.fn(async () => response());
    const runtime = setup(store, transport);
    await expect(runtime.extractor.extract(file())).rejects.toMatchObject({
      code: "budget-blocked",
    });
    expect(await runtime.budgetExposureMicroUsd()).toBeNull();
    expect(transport).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });
  it.each([
    undefined,
    JSON.parse(JSON.stringify(authorization())),
    { ...authorization() },
  ])(
    "rejects absent/forged context before private cache lookup or paid transport",
    async (fake) => {
      const store = new Store();
      await seed(store);
      store.reads = [];
      const transport = vi.fn(async () => response());
      await expect(
        setup(store, transport, { authorization: fake }).extractor.extract(
          file(),
        ),
      ).rejects.toMatchObject({ code: "not-authorized" });
      expect(store.reads).toEqual([]);
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it("cannot mint authorization from missing consent or another company", () => {
    expect(() => createDocumentAuthorization(actor, undefined)).toThrow();
    expect(() =>
      createDocumentAuthorization(
        { ...actor, companyId: "33333333-3333-4333-8333-333333333333" },
        consent,
      ),
    ).toThrow();
  });
  it("namespaces raw and validated caches by company and never consults legacy global document caches", async () => {
    const store = new Store();
    await seed(store);
    const f = file("namespaced"),
      transport = vi.fn(async () => response());
    await store.write(clientDemoCachePath(digestOf(f)), {
      privateOtherScope: "must never be read",
    });
    await setup(store, transport).extractor.extract(f);
    expect(store.reads).not.toContain(clientDemoCachePath(digestOf(f)));
    expect(store.writes).toContain(
      `ai-evaluation/general-v1/${FICTIONAL_AI_COMPANY_ID}/raw/${digestOf(f)}.json`,
    );
    expect(store.writes).toContain(
      `ai-evaluation/general-v1/${FICTIONAL_AI_COMPANY_ID}/extractions/${digestOf(f)}.json`,
    );
  });
  it("reuses its company cache without charging while still requiring a fresh minted authorization", async () => {
    const store = new Store();
    await seed(store);
    const transport = vi.fn(async () => response()),
      f = file("cache");
    await setup(store, transport).extractor.extract(f);
    const after = await setup(store, transport).budgetExposureMicroUsd();
    const cached = await setup(store, transport).extractor.extract(f);
    expect(cached.provider).toMatch(/Cached real/);
    expect(cached.reviewOnly).toBe(true);
    expect(await setup(store, transport).budgetExposureMicroUsd()).toBe(after);
    expect(transport).toHaveBeenCalledOnce();
  });
  it("key rotation retains all prior Qwen/DeepSeek budget records", async () => {
    const store = new Store();
    await seed(store);
    const transport = vi.fn(async () => response());
    await setup(store, transport).extractor.extract(file("firstkey"));
    const old = (await store.read<{ budget: BudgetState }>(
      DEEPSEEK_BUDGET_PATH,
    ))!.value.budget.records;
    await setup(store, transport, {
      env: { ...env, DEEPSEEK_API_KEY: "second-fictional-key" },
    }).extractor.extract(file("rotatedkey"));
    const current = (await store.read<{
      budget: BudgetState;
      keyFingerprints: string[];
    }>(DEEPSEEK_BUDGET_PATH))!.value;
    expect(current.budget.records.slice(0, old.length)).toEqual(old);
    expect(current.budget.limitMicroUsd).toBe(5_000_000);
    expect(current.keyFingerprints).toHaveLength(3);
    expect(exposure(current.budget)).toBe(6657);
  });
  it("blocks insufficient remaining allowance without calling the provider", async () => {
    const store = new Store();
    await seed(store, {
      ...newBudget(),
      records: [
        {
          id: "prior-uncertain",
          provider: "deepseek",
          reservedMicroUsd: 4_900_000,
          status: "uncertain",
        },
      ],
    });
    const transport = vi.fn(async () => response());
    await expect(
      setup(store, transport).extractor.extract(file()),
    ).rejects.toMatchObject({ code: "budget-blocked" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("preserves actual invoice type for a draft-only review and never changes financial totals", async () => {
    const store = new Store();
    await seed(store);
    const initial = createReviewState(),
      before = reviewSnapshot(initial);
    const result = await extractDocument(
      initial,
      file("invoice-not-quotation"),
      setup(
        store,
        vi.fn(async () => response()),
      ).extractor,
    );
    const review = result.state.documentEntries!.reviews[0];
    expect(review.fields.documentType).toBe("invoice");
    expect(review.extraction.reviewOnly).toBe(true);
    expect(review.extraction.reviewPolicy).toBe("draft-only");
    expect(result.state.accounting).toEqual(initial.accounting);
    expect(reviewSnapshot(result.state).metrics).toEqual(before.metrics);
  });
});
