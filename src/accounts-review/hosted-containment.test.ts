import { randomUUID, scryptSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlobServiceRateLimited } from "@vercel/blob";
import { createHostedHandler } from "./hosted";
import {
  ReviewConflict,
  type ReviewStore,
  type StoredValue,
} from "./hosted-store";
import type { ReviewState } from "./domain";

const origin = "https://review.example.test";
const password = "fictional-containment-test-password";
const salt = "0".repeat(32);
const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const request = (
  path: string,
  method = "GET",
  input?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`${origin}/api/accounts-review/${path}`, {
    method,
    headers: {
      ...(method === "POST"
        ? { Origin: origin, "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
interface SessionValue {
  finance: ReviewState;
  actions: Record<string, { fingerprint: string; id: string }>;
}
class FaultStore implements ReviewStore {
  values = new Map<string, StoredValue<unknown>>();
  fault: "read" | "before-write" | "after-write" | null = null;
  writes = 0;
  async read<T>(path: string) {
    if (this.fault === "read") {
      this.fault = null;
      throw new BlobServiceRateLimited(2);
    }
    return structuredClone((this.values.get(path) as StoredValue<T>) ?? null);
  }
  async write<T>(path: string, value: T, version?: string) {
    this.writes++;
    const old = this.values.get(path);
    if (old ? old.version !== version : Boolean(version))
      throw new ReviewConflict("Concurrent change.");
    if (this.fault === "before-write") {
      this.fault = null;
      throw new Error("SYNTHETIC_PRIVATE_CANARY");
    }
    this.values.set(path, {
      value: structuredClone(value),
      version: String(Number(old?.version || 0) + 1),
    });
    if (this.fault === "after-write") {
      this.fault = null;
      throw new Error("SYNTHETIC_PRIVATE_CANARY");
    }
  }
  async remove(path: string, version: string) {
    if (this.values.get(path)?.version !== version)
      throw new ReviewConflict("Concurrent change.");
    this.values.delete(path);
  }
  session() {
    return [...this.values.entries()].find(([key]) =>
      key.startsWith("sessions/"),
    )![1].value as SessionValue;
  }
}
async function setup() {
  const store = new FaultStore();
  const handler = createHostedHandler(store, () => passwordHash);
  const login = await handler(
    request("login", "POST", {
      email: "accountant@review.azzora.test",
      password,
    }),
  );
  expect(login.status).toBe(200);
  const data = await login.json();
  return {
    store,
    handler,
    login,
    headers: {
      Cookie: login.headers.get("set-cookie")!.split(";")[0],
      "X-Azzora-CSRF": data.csrf,
      "X-Azzora-Idempotency-Key": randomUUID(),
    },
  };
}
const receipt = {
  kind: "receipt",
  documentId: "INV-26042",
  date: "2026-10-22",
  amount: "100.00",
  account: "bank",
};
afterEach(() => vi.restoreAllMocks());

describe("hosted failure containment and financial retry invariants", () => {
  it("generates unique server correlation IDs for success, authorization and validation responses", async () => {
    const { handler, headers, login } = await setup();
    const responses = [
      login,
      await handler(request("snapshot")),
      await handler(
        request(
          "action",
          "POST",
          {},
          { ...headers, "X-Azzora-Request-ID": "attacker-input" },
        ),
      ),
      await handler(request("snapshot", "GET", undefined, headers)),
    ];
    expect(responses.map((response) => response.status)).toEqual([
      200, 401, 400, 200,
    ]);
    const ids = responses.map((response) =>
      response.headers.get("x-azzora-request-id"),
    );
    for (const id of ids)
      expect(id).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
      );
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("keeps an unknown pre-commit write failure at 503 without posting, then explicit same-key retry posts once", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, handler, headers } = await setup();
    const before = structuredClone(store.session().finance);
    const attempts = store.writes;
    store.fault = "before-write";
    const failed = await handler(request("action", "POST", receipt, headers));
    expect(failed.status).toBe(503);
    expect(store.writes).toBe(attempts + 1); // No automatic replay.
    expect(store.session().finance).toEqual(before);
    expect(await failed.json()).toEqual({
      error: "The review service is temporarily unavailable. Please retry.",
    });
    const id = failed.headers.get("x-azzora-request-id");
    expect(
      log.mock.calls.some(
        (call) =>
          call[0] === "accounts-review-request-failed" &&
          call[1].requestId === id &&
          call[1].route === "/action",
      ),
    ).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /SYNTHETIC_PRIVATE_CANARY|Sample Client|INV-26042|session|csrf|password/i,
    );
    const retried = await handler(request("action", "POST", receipt, headers));
    expect(retried.status).toBe(200);
    const result = await retried.json();
    const replay = await handler(request("action", "POST", receipt, headers));
    expect(replay.status).toBe(200);
    expect((await replay.json()).id).toBe(result.id);
    expect(store.session().finance.receipts).toHaveLength(
      before.receipts.length + 1,
    );
    expect(store.session().finance.accounting.journals).toHaveLength(
      before.accounting.journals.length + 1,
    );
  });
  it("recovers an ambiguous committed write using its persisted idempotency record without duplicate posting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, handler, headers } = await setup();
    const before = structuredClone(store.session().finance);
    store.fault = "after-write";
    const failed = await handler(request("action", "POST", receipt, headers));
    expect(failed.status).toBe(503);
    const committed = structuredClone(store.session());
    expect(committed.finance.receipts).toHaveLength(before.receipts.length + 1);
    expect(committed.finance.accounting.journals).toHaveLength(
      before.accounting.journals.length + 1,
    );
    const writes = store.writes;
    const retry = await handler(request("action", "POST", receipt, headers));
    expect(retry.status).toBe(200);
    expect((await retry.json()).id).toBe(
      committed.actions[headers["X-Azzora-Idempotency-Key"]].id,
    );
    expect(store.writes).toBe(writes);
    expect(store.session()).toEqual(committed);
    expect(
      (
        await handler(
          request("action", "POST", { ...receipt, amount: "200.00" }, headers),
        )
      ).status,
    ).toBe(409);
  });
  it("contains a typed storage rate limit as unavailable without misreporting it as a conflict", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, handler, headers } = await setup();
    const before = structuredClone(store.session());
    store.fault = "read";
    const response = await handler(
      request("snapshot", "GET", undefined, headers),
    );
    expect(response.status).toBe(503);
    expect(store.session()).toEqual(before);
    expect(
      log.mock.calls.some(
        (call) =>
          call[1]?.constructorName === "BlobServiceRateLimited" &&
          call[1]?.requestId === response.headers.get("x-azzora-request-id"),
      ),
    ).toBe(true);
  });
  it("isolates correlation contexts and preserves CAS during concurrent financial writes", async () => {
    const { store, handler, headers } = await setup();
    const before = structuredClone(store.session().finance);
    const secondHeaders = {
      ...headers,
      "X-Azzora-Idempotency-Key": randomUUID(),
    };
    const responses = await Promise.all([
      handler(request("action", "POST", receipt, headers)),
      handler(
        request(
          "action",
          "POST",
          { ...receipt, amount: "200.00" },
          secondHeaders,
        ),
      ),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      new Set(
        responses.map((response) =>
          response.headers.get("x-azzora-request-id"),
        ),
      ).size,
    ).toBe(2);
    const loser =
      responses[0].status === 409
        ? { action: receipt, headers }
        : { action: { ...receipt, amount: "200.00" }, headers: secondHeaders };
    expect(
      (await handler(request("action", "POST", loser.action, loser.headers)))
        .status,
    ).toBe(200);
    expect(store.session().finance.receipts).toHaveLength(
      before.receipts.length + 2,
    );
    const journals = store.session().finance.accounting.journals;
    expect(journals).toHaveLength(before.accounting.journals.length + 2);
    expect(new Set(journals.map((journal) => journal.postingKey)).size).toBe(
      journals.length,
    );
    for (const journal of journals)
      expect(
        journal.lines.reduce(
          (sum, line) => sum + BigInt(line.debitFils) - BigInt(line.creditFils),
          0n,
        ),
      ).toBe(0n);
  });
});
