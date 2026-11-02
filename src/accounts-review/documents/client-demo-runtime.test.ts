import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ReviewConflict, type ReviewStore } from "../hosted-store";
import { newBudget } from "./benchmark-budget";
import {
  createDeepSeekRuntime,
  DEEPSEEK_BUDGET_PATH,
} from "./deepseek-runtime";
import {
  CLIENT_DEMO_APPLICATION,
  clientDemoCachePath,
} from "./client-demo-runtime";
import { digestOf } from "./providers";
import { sampleDocuments } from "./samples";
import { documentAvailability } from "./runtime";
import digests from "./client-demo-digests.js";

class Store implements ReviewStore {
  values = new Map<string, { value: unknown; version: string }>();
  serial = 0;
  async read<T>(path: string) {
    const found = this.values.get(path);
    return found
      ? (structuredClone(found) as { value: T; version: string })
      : null;
  }
  async write<T>(path: string, value: T, version?: string) {
    if (this.values.get(path)?.version !== version)
      throw new ReviewConflict("Conflict");
    this.values.set(path, {
      value: structuredClone(value),
      version: String(++this.serial),
    });
  }
  async remove() {
    throw Error("AI history must not be deleted.");
  }
}
const env = {
  AZZORA_AI_CLIENT_DEMO_APP_CAP: "5",
  AZZORA_AI_ENABLED: "true",
  AZZORA_AI_PROVIDER: "deepseek",
  DEEPSEEK_MODEL: "deepseek-flash",
  DEEPSEEK_API_KEY: "fictional-mock-test-key-not-a-provider-key",
};
const file = {
  name: "01.png",
  mime: "image/png",
  data: readFileSync("tests/fixtures/document-entry/01.png").toString("base64"),
};
const second = {
  name: "03.png",
  mime: "image/png",
  data: readFileSync("public/document-samples/03.png").toString("base64"),
};
const response = (
  content = JSON.stringify({
    fields: sampleDocuments[0].fields,
    uncertain: [],
  }),
  usage: unknown = { prompt_tokens: 1000, completion_tokens: 500 },
) =>
  Response.json({
    model: "deepseek-flash",
    id: "mock-real-extraction-response",
    usage,
    choices: [{ finish_reason: "stop", message: { content } }],
  });
const setup = (
  store = new Store(),
  transport: typeof fetch = async () => response(),
  configured = { ...env },
) => ({
  store,
  runtime: createDeepSeekRuntime({ env: configured, store, transport }),
});

describe("owner-authorized USD5 fictional AI demo — mocked provider only", () => {
  it("requires exact opt-in and keeps the strict benchmark approval gate unchanged", () => {
    expect(setup().runtime.status()).toMatchObject({
      ready: true,
      authorizationMode: "owner-application-cap",
    });
    for (const value of [undefined, "4", "5.00", "6"]) {
      const runtime = createDeepSeekRuntime({
        env: { ...env, AZZORA_AI_CLIENT_DEMO_APP_CAP: value },
        store: new Store(),
      });
      expect(runtime.status().reason).toBe("approval-required");
      expect(runtime.status().authorizationMode).toBeUndefined();
    }
    const visible = JSON.stringify(documentAvailability(setup().runtime));
    expect(visible).toContain("not a verified provider-account spending cap");
    expect(visible).not.toContain(env.DEEPSEEK_API_KEY);
    expect(visible).not.toContain("hardStopVerified");
  });
  it.each([
    [{ ...env, AZZORA_AI_ENABLED: "false" }, "disabled"],
    [{ ...env, DEEPSEEK_API_KEY: "" }, "key-missing"],
    [{ ...env, DEEPSEEK_MODEL: "other" }, "model-invalid"],
    [{ ...env, AZZORA_AI_PROVIDER: "other" }, "provider-unconfigured"],
  ])(
    "fails closed before any paid call for missing configuration",
    async (configured, reason) => {
      let calls = 0;
      const { store, runtime } = setup(
        new Store(),
        async () => {
          calls++;
          return response();
        },
        configured,
      );
      expect(runtime.status().reason).toBe(reason);
      await expect(runtime.extractor.extract(file)).rejects.toThrow(
        /disabled|unconfigured/,
      );
      expect(calls).toBe(0);
      expect(store.values.size).toBe(0);
    },
  );
  it("keeps application authorization valid tomorrow without fabricating daily provider evidence", () => {
    let now = new Date("2026-11-02T10:00:00Z");
    const runtime = createDeepSeekRuntime({
      env,
      store: new Store(),
      now: () => now,
    });
    now = new Date("2026-11-04T10:00:00Z");
    expect(runtime.status().ready).toBe(true);
  });
  it("allowlists exactly the verified 40 synthetic documents including all public samples", async () => {
    const manifest = JSON.parse(
      readFileSync("tests/fixtures/document-entry/manifest.json", "utf8"),
    ) as { path: string; sha256: string }[];
    expect(digests).toHaveLength(40);
    for (const item of manifest)
      expect(digests).toContain(
        createHash("sha256").update(readFileSync(item.path)).digest("hex"),
      );
    for (const name of ["01.png", "02.pdf", "03.png"])
      expect(digests).toContain(
        createHash("sha256")
          .update(readFileSync(`public/document-samples/${name}`))
          .digest("hex"),
      );
    let calls = 0;
    const { runtime, store } = setup(new Store(), async () => {
      calls++;
      return response();
    });
    await expect(
      runtime.extractor.extract({
        ...file,
        data: Buffer.from("unapproved fictional document").toString("base64"),
      }),
    ).rejects.toThrow(/approved fictional/);
    expect(calls).toBe(0);
    expect(store.values.size).toBe(0);
  });
  it("reserves the full envelope then privately caches validated real output across sessions and key rotations", async () => {
    const store = new Store();
    let calls = 0;
    const first = setup(store, async (url) => {
      calls++;
      expect(url).toBe("https://api.deepseek.com/chat/completions");
      expect(await first.runtime.budgetExposureMicroUsd()).toBe(324404);
      return response();
    });
    expect((await first.runtime.extractor.extract(file)).mode).toBe("live");
    expect(await first.runtime.budgetExposureMicroUsd()).toBe(900);
    const raw = (await store.read<Record<string, unknown>>(
      DEEPSEEK_BUDGET_PATH,
    ))!.value;
    expect(raw).toMatchObject({
      application: CLIENT_DEMO_APPLICATION,
      authorizationMode: "owner-application-cap",
      keyFingerprints: [
        createHash("sha256").update(env.DEEPSEEK_API_KEY).digest("hex"),
      ],
    });
    expect(raw).not.toHaveProperty("accountId");
    expect(raw).not.toHaveProperty("hardStopVerified");
    const restarted = setup(
      store,
      async () => {
        calls++;
        return response();
      },
      { ...env, DEEPSEEK_API_KEY: "fictional-rotated-key" },
    );
    const cached = await restarted.runtime.extractor.extract(file);
    expect(cached.mode).toBe("live");
    expect(cached.provider).toContain("Cached real DeepSeek extraction");
    expect(cached.provider).toContain("no new paid request");
    expect(cached.fields).toEqual(sampleDocuments[0].fields);
    expect(calls).toBe(1);
    expect(await restarted.runtime.budgetExposureMicroUsd()).toBe(900);
    await restarted.runtime.extractor.extract(second);
    const updated = (await store.read<typeof raw>(DEEPSEEK_BUDGET_PATH))!.value;
    expect(updated.keyFingerprints).toHaveLength(2);
    expect(await restarted.runtime.budgetExposureMicroUsd()).toBe(1800);
  });
  it("preserves legacy account metadata and all historical uncertain Qwen spending without creating an allowance", async () => {
    const store = new Store();
    const budget = newBudget();
    budget.records.push({
      id: "qwen:old",
      provider: "qwen",
      reservedMicroUsd: 4_900_000,
      status: "uncertain",
    });
    const old = {
      version: 1,
      accountId: "legacy-account-retained-not-new-proof",
      keySha256: "a".repeat(64),
      budget,
    };
    await store.write(DEEPSEEK_BUDGET_PATH, old);
    let calls = 0;
    const { runtime } = setup(store, async () => {
      calls++;
      return response();
    });
    await expect(runtime.extractor.extract(file)).rejects.toThrow(/combined/);
    expect(calls).toBe(0);
    expect(await runtime.budgetExposureMicroUsd()).toBe(4_900_000);
    expect((await store.read(DEEPSEEK_BUDGET_PATH))!.value).toEqual(old);
  });
  it("binds the same shared history on a successful migration and never resets after key rotation", async () => {
    const store = new Store();
    const budget = newBudget();
    budget.records.push({
      id: "qwen:old",
      provider: "qwen",
      reservedMicroUsd: 1000,
      status: "uncertain",
    });
    await store.write(DEEPSEEK_BUDGET_PATH, {
      version: 1,
      accountId: "legacy",
      keySha256: "a".repeat(64),
      budget,
    });
    const { runtime } = setup(store);
    await runtime.extractor.extract(file);
    expect(await runtime.budgetExposureMicroUsd()).toBe(1900);
    const current = (await store.read<{
      accountId: string;
      budget: typeof budget;
    }>(DEEPSEEK_BUDGET_PATH))!.value;
    expect(current.accountId).toBe("legacy");
    expect(current.budget.records[0]).toEqual(budget.records[0]);
  });
  it.each(["network", "malformed", "usage", "http"])(
    "retains actual or uncertain spend and forbids recharge after %s",
    async (mode) => {
      let calls = 0;
      const { runtime, store } = setup(new Store(), async () => {
        calls++;
        if (mode === "network") throw Error("secret provider details");
        if (mode === "http")
          return new Response("private provider details", { status: 503 });
        return response(
          mode === "malformed" ? "invalid json" : undefined,
          mode === "usage" ? null : undefined,
        );
      });
      if (mode === "usage") await runtime.extractor.extract(file);
      else await expect(runtime.extractor.extract(file)).rejects.toThrow();
      expect(await runtime.budgetExposureMicroUsd()).toBe(
        mode === "malformed" ? 900 : 324404,
      );
      if (mode !== "usage") {
        expect(
          await store.read(clientDemoCachePath(digestOf(file))),
        ).toBeNull();
        await expect(runtime.extractor.extract(file)).rejects.toThrow(
          /already submitted/,
        );
      } else
        expect((await runtime.extractor.extract(file)).provider).toContain(
          "Cached real",
        );
      expect(calls).toBe(1);
    },
  );
  it("fails closed for missing cached results after a previously reserved attempt", async () => {
    const store = new Store();
    const budget = newBudget();
    budget.records.push({
      id: `deepseek:${digestOf(file)}`,
      provider: "deepseek",
      reservedMicroUsd: 324404,
      status: "reserved",
    });
    await store.write(DEEPSEEK_BUDGET_PATH, { version: 1, budget });
    let calls = 0;
    const { runtime } = setup(store, async () => {
      calls++;
      return response();
    });
    await expect(runtime.extractor.extract(file)).rejects.toThrow(
      /already submitted/,
    );
    expect(calls).toBe(0);
  });
  it("does not treat synthetic replay or an orphan cache as real extraction", async () => {
    for (const synthetic of [true, false]) {
      const store = new Store();
      let calls = 0;
      const { runtime } = setup(store, async () => {
        calls++;
        return response();
      });
      await runtime.extractor.extract(file);
      const path = clientDemoCachePath(digestOf(file));
      const cached = (await store.read<{ extraction: { mode: string } }>(
        path,
      ))!;
      if (synthetic) {
        cached.value.extraction.mode = "synthetic-replay";
        await store.write(path, cached.value, cached.version);
      } else store.values.delete(DEEPSEEK_BUDGET_PATH);
      await expect(runtime.extractor.extract(file)).rejects.toThrow();
      expect(calls).toBe(1);
    }
  });
  it("allows only one provider submission when the same sample arrives concurrently", async () => {
    let calls = 0;
    const { runtime } = setup(new Store(), async () => {
      calls++;
      return response();
    });
    const result = await Promise.allSettled([
      runtime.extractor.extract(file),
      runtime.extractor.extract(file),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(calls).toBe(1);
    expect((await runtime.extractor.extract(file)).provider).toContain(
      "Cached real",
    );
  });
  it("retains paid history if writing the result cache fails, without a second call", async () => {
    class CacheFailure extends Store {
      override async write<T>(path: string, value: T, version?: string) {
        if (path !== DEEPSEEK_BUDGET_PATH) throw Error("Cache unavailable");
        return super.write(path, value, version);
      }
    }
    let calls = 0;
    const { runtime } = setup(new CacheFailure(), async () => {
      calls++;
      return response();
    });
    await expect(runtime.extractor.extract(file)).rejects.toThrow(
      /Cache unavailable/,
    );
    expect(await runtime.budgetExposureMicroUsd()).toBe(900);
    await expect(runtime.extractor.extract(file)).rejects.toThrow(
      /already submitted/,
    );
    expect(calls).toBe(1);
  });
  it("rejects an incompatible shared namespace rather than resetting its budget", async () => {
    const store = new Store();
    await store.write(DEEPSEEK_BUDGET_PATH, {
      version: 1,
      application: "different-app",
      budget: newBudget(),
    });
    let calls = 0;
    const { runtime } = setup(store, async () => {
      calls++;
      return response();
    });
    await expect(runtime.extractor.extract(file)).rejects.toThrow(
      /incompatible/,
    );
    expect(calls).toBe(0);
  });
});
