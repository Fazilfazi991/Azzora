// Mock transport and CAS store only: no provider, cloud credentials or real data.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewConflict, type ReviewStore } from "../hosted-store";
import {
  createProductionDocumentAuthorization,
  createDocumentAuthorization,
  FICTIONAL_AI_COMPANY_ID,
  type DocumentAdmissionActor,
} from "./admission";
import { createProductionDocumentRuntime } from "./production-runtime";
import { CLIENT_DEMO_APPLICATION } from "./client-demo-runtime";
import {
  DEEPSEEK_BUDGET_PATH,
  type DeepSeekRuntimeOptions,
} from "./deepseek-runtime";
import { exposure, newBudget, type BudgetState } from "./benchmark-budget";
import { blankFields } from "./model";
import { documentAvailability, extractionInputSchema } from "./runtime";
import { createReviewState, reviewSnapshot } from "../domain";
import { extractDocument } from "./service";

const company = "33333333-3333-4333-8333-333333333333";
const actor: DocumentAdmissionActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  companyId: company,
  role: "accountant",
  workspace: "accountant",
  assurance: "aal2",
  capabilities: ["finance.draft"],
};
const consent = {
  dataClass: "business",
  policyVersion: "ai-business-v1",
  consent: true,
};
const approval = {
  version: 1,
  companyId: company,
  ownerApprovalReference: "mock-owner-approval",
  processingPolicyReference: "mock-processing-review",
  noTrainingVerificationReference: "mock-binding-no-training-evidence",
  sharedBudgetVerificationReference: "mock-existing-store-history-review",
};
const env = {
  AZZORA_AI_NEW_REQUESTS_ENABLED: "true",
  AZZORA_AI_ENABLED: "true",
  AZZORA_AI_CLIENT_DEMO_APP_CAP: "5",
  AZZORA_AI_PROVIDER: "deepseek",
  DEEPSEEK_MODEL: "deepseek-flash",
  DEEPSEEK_API_KEY: "fictional-mock-not-a-key",
};
const file = {
  name: "fictional.png",
  mime: "image/png",
  data: readFileSync("tests/fixtures/document-entry/01.png").toString("base64"),
};
class Store implements ReviewStore {
  values = new Map<string, { value: unknown; version: string }>();
  writes: string[] = [];
  reads: string[] = [];
  serial = 0;
  async read<T>(path: string) {
    this.reads.push(path);
    const row = this.values.get(path);
    return row ? (structuredClone(row) as { value: T; version: string }) : null;
  }
  async write<T>(path: string, value: T, version?: string) {
    if (this.values.get(path)?.version !== version)
      throw new ReviewConflict("CAS");
    this.writes.push(path);
    this.values.set(path, {
      value: structuredClone(value),
      version: String(++this.serial),
    });
  }
  async remove() {
    throw Error("Never delete AI history");
  }
}
const historical = {
  id: "prior-qwen",
  provider: "qwen" as const,
  reservedMicroUsd: 10000,
  meteredUpperMicroUsd: 4857,
  status: "metered" as const,
};
async function seed(
  store: Store,
  budget: BudgetState = { ...newBudget(), records: [historical] },
) {
  await store.write(DEEPSEEK_BUDGET_PATH, {
    version: 1,
    application: CLIENT_DEMO_APPLICATION,
    keyFingerprints: [],
    budget,
  });
  store.writes = [];
}
const response = () =>
  Response.json({
    model: "deepseek-flash",
    id: "mock-provider-response",
    usage: { prompt_tokens: 1000, completion_tokens: 500 },
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            fields: {
              ...blankFields(),
              supplier: "Fictional Test Supplier",
              reference: "TEST-ONLY",
              total: "10.00",
            },
            uncertain: [],
          }),
        },
      },
    ],
  });
const setup = (
  store: Store,
  transport: typeof fetch,
  extra: Partial<DeepSeekRuntimeOptions> = {},
) =>
  createProductionDocumentRuntime({
    expectedCompanyId: company,
    env,
    store,
    transport,
    businessApproval: approval,
    authorization: createProductionDocumentAuthorization(
      actor,
      consent,
      company,
    ),
    ...extra,
  });
afterEach(() => vi.restoreAllMocks());

describe("production document processing — mocked only", () => {
  it("denies a foreign approval company even for a snapshot without an upload grant", async () => {
    const store = new Store();
    await seed(store);
    const transport = vi.fn(async () => response());
    const runtime = await setup(store, transport, {
      authorization: undefined,
      businessApproval: {
        ...approval,
        companyId: "44444444-4444-4444-8444-444444444444",
      },
    });
    expect(runtime.status().ready).toBe(false);
    expect(documentAvailability(runtime).status).toBe("configuration-required");
    await expect(runtime.extractor.extract(file)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });
  it("reuses a saved original review without duplicate review, attachment, paid call or financial posting", async () => {
    const store = new Store();
    await seed(store);
    const transport = vi.fn(async () => response());
    const runtime = await setup(store, transport);
    const initial = createReviewState(),
      before = reviewSnapshot(initial);
    const first = await extractDocument(initial, file, runtime.extractor);
    const again = await extractDocument(first.state, file, runtime.extractor);
    expect(again).toMatchObject({ id: first.id, reused: true });
    expect(again.state).toBe(first.state);
    expect(again.state.documentEntries!.reviews).toHaveLength(1);
    expect(again.state.attachments).toHaveLength(
      initial.attachments.length + 1,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(again.state.accounting).toEqual(initial.accounting);
    expect(reviewSnapshot(again.state).metrics).toEqual(before.metrics);
  });
  it.each([undefined, "false"])(
    "requires explicit paid-request switch %s",
    async (value) => {
      const store = new Store();
      await seed(store);
      const transport = vi.fn(async () => response());
      const runtime = await setup(store, transport, {
        env: { ...env, AZZORA_AI_NEW_REQUESTS_ENABLED: value },
      });
      expect(documentAvailability(runtime)).toMatchObject({
        enabled: false,
        status: "configuration-required",
        processing: { dataClass: "business" },
      });
      expect(documentAvailability(runtime).message).toContain(
        "no-training evidence",
      );
      await expect(runtime.extractor.extract(file)).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
      expect(store.writes).toEqual([]);
    },
  );
  it("accepts the exact two processing versions without mixing policies or widening the payload", () => {
    expect(
      extractionInputSchema.safeParse({ file, processing: consent }).success,
    ).toBe(true);
    expect(
      extractionInputSchema.safeParse({
        file,
        processing: {
          dataClass: "fictional",
          consent: true,
          policyVersion: "ai-fictional-v1",
        },
      }).success,
    ).toBe(true);
    expect(
      extractionInputSchema.safeParse({
        file,
        processing: { ...consent, policyVersion: "ai-fictional-v1" },
      }).success,
    ).toBe(false);
    expect(
      extractionInputSchema.safeParse({
        file,
        processing: { ...consent, companyId: company },
      }).success,
    ).toBe(false);
  });
  it("accepts only the explicit existing production password-policy exception", () => {
    const productionActor = {
      ...actor,
      userId: "c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3",
      companyId: "fc525d78-bc83-4845-96f1-fb402bb07465",
      assurance: "aal1" as const,
      authenticationPolicy: "production-password-only" as const,
    };
    expect(
      createProductionDocumentAuthorization(
        productionActor,
        consent,
        productionActor.companyId,
      ).reviewOnly,
    ).toBe(true);
    expect(() =>
      createProductionDocumentAuthorization(
        { ...productionActor, userId: actor.userId },
        consent,
        productionActor.companyId,
      ),
    ).toThrow(/not authorized/);
  });
  it.each([
    undefined,
    {},
    { ...consent, consent: false },
    { ...consent, dataClass: "fictional" },
    { ...consent, policyVersion: "ai-fictional-v1" },
  ])("requires explicit current business consent %j", (value) => {
    expect(() =>
      createProductionDocumentAuthorization(actor, value, company),
    ).toThrow(/not authorized/);
  });
  it.each([
    { companyId: FICTIONAL_AI_COMPANY_ID },
    { companyId: "44444444-4444-4444-8444-444444444444" },
    { workspace: "manager" },
    { role: "site_staff" },
    { assurance: "aal1" },
    { capabilities: [] },
  ])("requires verified eligible actor %j", (change) => {
    expect(() =>
      createProductionDocumentAuthorization(
        { ...actor, ...change } as DocumentAdmissionActor,
        consent,
        company,
      ),
    ).toThrow(/not authorized/);
  });
  it.each([
    undefined,
    { ...approval, noTrainingVerificationReference: "" },
    { ...approval, processingPolicyReference: "" },
    { ...approval, sharedBudgetVerificationReference: "" },
  ])(
    "fails closed without reviewed policy and history references %j",
    async (businessApproval) => {
      const store = new Store();
      await seed(store);
      const transport = vi.fn(async () => response());
      const runtime = await setup(store, transport, { businessApproval });
      expect(runtime.status().ready).toBe(false);
      await expect(runtime.extractor.extract(file)).rejects.toThrow(
        /not configured/,
      );
      expect(transport).not.toHaveBeenCalled();
      expect(store.writes).toEqual([]);
    },
  );
  it.each(["absent", "malformed", "inaccessible"])(
    "never starts a new ledger when existing history is %s",
    async (failure) => {
      const store = new Store();
      if (failure === "malformed")
        await store.write(DEEPSEEK_BUDGET_PATH, { version: 1, budget: {} });
      if (failure === "inaccessible")
        vi.spyOn(store, "read").mockRejectedValue(
          Error("private storage failure"),
        );
      store.writes = [];
      const transport = vi.fn(async () => response());
      const runtime = await setup(store, transport);
      expect(runtime.status().ready).toBe(false);
      expect(transport).not.toHaveBeenCalled();
      expect(store.writes).toEqual([]);
    },
  );
  it("preserves historical allowance without storing business document contents in the shared store", async () => {
    const store = new Store();
    await seed(store);
    const transport = vi.fn(async () => response());
    const runtime = await setup(store, transport);
    expect(documentAvailability(runtime)).toMatchObject({
      enabled: true,
      reviewOnly: true,
      processing: {
        dataClass: "business",
        policyVersion: "ai-business-v1",
        consentRequired: true,
      },
    });
    const result = await runtime.extractor.extract(file);
    expect(result).toMatchObject({
      mode: "live",
      costUsd: null,
      reviewOnly: true,
      reviewPolicy: "draft-only",
    });
    const budget = (await store.read<{ budget: BudgetState }>(
      DEEPSEEK_BUDGET_PATH,
    ))!.value.budget;
    expect(budget.records[0]).toEqual(historical);
    expect(exposure(budget)).toBe(5757);
    expect(budget.records).toHaveLength(2);
    expect(store.writes.every((path) => path === DEEPSEEK_BUDGET_PATH)).toBe(
      true,
    );
    expect(
      store.reads.some(
        (path) => path.includes("general-v1") || path.includes("sessions/"),
      ),
    ).toBe(false);
    expect(store.reads.every((path) => path === DEEPSEEK_BUDGET_PATH)).toBe(
      true,
    );
    expect(JSON.stringify([...store.values.values()])).not.toMatch(
      /Fictional Test Supplier|TEST-ONLY|"fields"|"body"/,
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(runtime.extractor.extract(file)).rejects.toThrow(
      /shared spending/,
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rejects fictional grants and cross-company or forged business grants before transport", async () => {
    for (const authorization of [
      createDocumentAuthorization(
        { ...actor, companyId: FICTIONAL_AI_COMPANY_ID },
        {
          dataClass: "fictional",
          policyVersion: "ai-fictional-v1",
          consent: true,
        },
      ),
      createProductionDocumentAuthorization(
        { ...actor, companyId: "44444444-4444-4444-8444-444444444444" },
        consent,
        "44444444-4444-4444-8444-444444444444",
      ),
      { ...createProductionDocumentAuthorization(actor, consent, company) },
    ]) {
      const store = new Store();
      await seed(store);
      const transport = vi.fn(async () => response());
      const runtime = await setup(store, transport, { authorization });
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await expect(runtime.extractor.extract(file)).rejects.toThrow(
        /not authorized/,
      );
      expect(transport).not.toHaveBeenCalled();
      expect(store.writes).toEqual([]);
    }
  });
  it("cannot exceed remaining cap or reset old reservations after key rotation", async () => {
    const store = new Store();
    await seed(store, {
      ...newBudget(),
      records: [
        {
          ...historical,
          reservedMicroUsd: 4900000,
          meteredUpperMicroUsd: 4900000,
        },
      ],
    });
    const transport = vi.fn(async () => response());
    const runtime = await setup(store, transport, {
      env: { ...env, DEEPSEEK_API_KEY: "different-fictional-mock" },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(runtime.extractor.extract(file)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
    expect(await runtime.budgetExposureMicroUsd()).toBe(4900000);
  });
  it("retains full reservation on ambiguous provider failure and never automatically retries", async () => {
    const store = new Store();
    await seed(store);
    const transport = vi.fn(async () => {
      throw Error("network failure");
    });
    const runtime = await setup(store, transport);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(runtime.extractor.extract(file)).rejects.toThrow();
    await expect(runtime.extractor.extract(file)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await runtime.budgetExposureMicroUsd()).toBe(329261);
  });
});
