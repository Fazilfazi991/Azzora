import { randomUUID, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHostedHandler } from "./hosted";
import {
  ReviewConflict,
  type ReviewStore,
  type StoredValue,
} from "./hosted-store";
import { createReviewState } from "./domain";
import { blankFields } from "./documents/model";
import { extractDocument } from "./documents/service";
import { disabledExtractor } from "./documents/providers";
import { reportSelection, selectedSnapshot } from "./reporting";

class MemoryStore implements ReviewStore {
  values = new Map<string, StoredValue<unknown>>();
  async read<T>(path: string) {
    return structuredClone((this.values.get(path) as StoredValue<T>) || null);
  }
  async write<T>(path: string, value: T, version?: string) {
    const old = this.values.get(path);
    if (old ? old.version !== version : Boolean(version))
      throw new ReviewConflict("Concurrent update.");
    this.values.set(path, {
      value: structuredClone(value),
      version: randomUUID(),
    });
  }
  async remove(path: string, version: string) {
    if (this.values.get(path)?.version !== version)
      throw new ReviewConflict("Concurrent update.");
    this.values.delete(path);
  }
}
const origin = "https://accounts.example.test";
const request = (
  path: string,
  input?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(origin + "/api/accounts-review/" + path, {
    method: input === undefined ? "GET" : "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
const file = {
  name: "fictional.png",
  mime: "image/png",
  data: readFileSync("public/document-samples/01.png").toString("base64"),
};
async function setup() {
  const salt = "0".repeat(32),
    password = "fictional-integration-test-password";
  const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const handler = createHostedHandler(new MemoryStore(), () => hash, {
    now: () => new Date("2026-11-02T08:00:00Z"),
  });
  const login = await handler(
    request("login", { email: "accountant@review.azzora.test", password }),
  );
  const session = await login.json();
  return {
    handler,
    headers: {
      Cookie: login.headers.get("set-cookie")!.split(";")[0],
      "X-Azzora-CSRF": session.csrf as string,
    },
  };
}
describe("integrated server document and reporting boundaries", () => {
  it("defaults current reporting dates in Dubai and validates explicit periods", () => {
    expect(
      reportSelection(new URL(origin), new Date("2026-11-01T21:00:00Z")).asOf,
    ).toBe("2026-11-02");
    expect(() => reportSelection(new URL(origin + "?asOf=2026-02-30"))).toThrow(
      /date/,
    );
    expect(() =>
      reportSelection(new URL(origin + "?from=2026-11-02&to=2026-11-01")),
    ).toThrow(/date/);
    expect(
      selectedSnapshot(createReviewState(), {
        from: "2026-11-01",
        to: "2026-11-02",
        asOf: "2026-11-02",
      }).metrics.netProfitFils,
    ).toBe("0");
  });
  it("preserves uploaded originals and unknown paid metering on extraction failure", async () => {
    const before = createReviewState();
    const result = await extractDocument(before, file, {
      async extract() {
        throw Error("Provider failed");
      },
    });
    const review = result.state.documentEntries!.reviews[0];
    expect(review.extraction.mode).toBe("manual");
    expect(review.extraction.costUsd).toBeNull();
    expect(review.extraction.inputTokens).toBeNull();
    expect(review.fields).toEqual(blankFields());
    expect(
      review.warnings.some((w) => w.code === "extraction-unavailable"),
    ).toBe(true);
    expect(result.state.attachments[0].data).toBe(file.data);
    expect(result.state.accounting).toEqual(before.accounting);
  });
  it("manual entry bypasses prepared replay on a known sample", async () => {
    const result = await extractDocument(
      createReviewState(),
      file,
      disabledExtractor,
    );
    expect(result.state.documentEntries!.reviews[0].extraction.mode).toBe(
      "manual",
    );
    expect(result.state.documentEntries!.reviews[0].fields.supplier).toBe("");
  });
  it("new authenticated account/transfer routes post once and preserve selected report dates", async () => {
    const { handler, headers } = await setup();
    const snapshot = await (
      await handler(request("snapshot", undefined, headers))
    ).json();
    expect(snapshot.documentAi.enabled).toBe(false);
    expect(snapshot.asOf).toBe("2026-11-02");
    const created = await handler(
      request(
        "action",
        {
          kind: "create-cash-account",
          name: "Thomas Cash",
          type: "staff",
          holder: "Thomas",
        },
        { ...headers, "X-Azzora-Idempotency-Key": randomUUID() },
      ),
    );
    expect(created.status).toBe(200);
    const account = (await created.json()).snapshot.cashAccounts.find(
      (a: { name: string }) => a.name === "Thomas Cash",
    );
    const idempotency = randomUUID();
    const action = {
      kind: "transfer",
      fromAccount: "bank",
      toAccount: account.id,
      date: "2026-11-02",
      amount: "100.00",
      reference: "Fictional test transfer",
    };
    const url = "action?from=2026-11-01&to=2026-11-02&asOf=2026-11-02";
    const first = await handler(
      request(url, action, {
        ...headers,
        "X-Azzora-Idempotency-Key": idempotency,
      }),
    );
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result.snapshot.period).toEqual({
      from: "2026-11-01",
      to: "2026-11-02",
    });
    expect(result.snapshot.metrics.netProfitFils).toBe("0");
    expect(
      result.snapshot.cashAccounts.find(
        (a: { id: string }) => a.id === account.id,
      ).balanceFils,
    ).toBe("10000");
    const retry = await (
      await handler(
        request(url, action, {
          ...headers,
          "X-Azzora-Idempotency-Key": idempotency,
        }),
      )
    ).json();
    expect(retry.snapshot.transfers).toHaveLength(1);
    expect(retry.id).toBe(result.id);
  });
  it("rejects an invented extraction mode before changing session data", async () => {
    const { handler, headers } = await setup();
    const response = await handler(
      request("documents/extract", { file, mode: "bypass-auth" }, headers),
    );
    expect(response.status).toBe(400);
    const state = await (
      await handler(request("snapshot", undefined, headers))
    ).json();
    expect(state.documentEntries.reviews).toEqual([]);
  });
});
