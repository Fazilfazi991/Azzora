import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  BlobServiceRateLimited,
} from "@vercel/blob";
import { BlobReviewStore, ReviewConflict, encodeReview } from "./hosted-store";
import { createHostedHandler } from "./hosted";
import {
  HOSTED_REQUEST_TIMEOUT_MS,
  HOSTED_STORE_TIMEOUT_MS,
  withHostedRequestDiagnostics,
} from "./hosted-diagnostics";
import { createReviewState } from "./domain";

const sdk = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  ...sdk,
}));
const origin = "https://review.example.test";
const configured = `${"0".repeat(32)}:${"0".repeat(128)}`;
const cookie = `__Host-azzora_accounts_review=${"a".repeat(64)}`;
const request = (signal?: AbortSignal) =>
  new Request(`${origin}/api/accounts-review/snapshot`, {
    signal,
    headers: { Cookie: cookie },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("Blob conditional writes and cooperative deadline containment", () => {
  it("passes bounded abort signals to all storage operations and preserves captured conditional versions", async () => {
    const timeouts: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });
    sdk.get.mockResolvedValue({
      statusCode: 200,
      stream: new Blob([encodeReview({ safe: true })]).stream(),
      blob: { etag: '"known-version"' },
    });
    sdk.put.mockResolvedValue({});
    sdk.del.mockResolvedValue(undefined);
    const store = new BlobReviewStore();
    await withHostedRequestDiagnostics(request(), async () => {
      const read = await store.read<{ safe: boolean }>("fictional-session");
      expect(read?.version).toBe('"known-version"');
      await store.write("fictional-session", { safe: true }, read!.version);
      await store.remove("fictional-session", read!.version);
      return new Response("ok");
    });
    expect(timeouts).toEqual([45_000, 15_000, 15_000, 15_000]);
    expect(HOSTED_STORE_TIMEOUT_MS).toBe(15_000);
    expect(HOSTED_REQUEST_TIMEOUT_MS).toBe(45_000);
    expect(sdk.get.mock.calls[0][1].headers).toEqual({
      "Accept-Encoding": "identity",
    });
    for (const options of [
      sdk.get.mock.calls[0][1],
      sdk.put.mock.calls[0][2],
      sdk.del.mock.calls[0][1],
    ])
      expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(sdk.put.mock.calls[0][2]).toMatchObject({
      allowOverwrite: true,
      ifMatch: '"known-version"',
    });
    expect(sdk.del.mock.calls[0][1].ifMatch).toBe('"known-version"');
  });
  it("keeps typed precondition conflicts at409 and never retries a rejected conditional write", async () => {
    sdk.put.mockRejectedValue(new BlobPreconditionFailedError());
    const store = new BlobReviewStore();
    await expect(
      store.write("fictional", { safe: true }, '"captured"'),
    ).rejects.toBeInstanceOf(ReviewConflict);
    expect(sdk.put).toHaveBeenCalledTimes(1);
    expect(sdk.put.mock.calls[0][2].ifMatch).toBe('"captured"');
    sdk.put.mockRejectedValue(new BlobServiceRateLimited(2));
    await expect(
      store.write("fictional", { safe: true }, '"captured"'),
    ).rejects.toBeInstanceOf(BlobServiceRateLimited);
    expect(sdk.put).toHaveBeenCalledTimes(2);
  });
  it.each(["operation", "request", "client"] as const)(
    "returns a correlated503 for an aborted %s read without issuing writes",
    async (reason) => {
      const timers = new Map<number, AbortController>();
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        const controller = new AbortController();
        timers.set(ms, controller);
        return controller.signal;
      });
      sdk.get.mockImplementation(
        async (_path, options: { abortSignal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.abortSignal.addEventListener(
              "abort",
              () => reject(new BlobRequestAbortedError()),
              { once: true },
            );
          }),
      );
      const controller = new AbortController();
      const handler = createHostedHandler(
        new BlobReviewStore(),
        () => configured,
      );
      const result = handler(request(controller.signal));
      await vi.waitFor(() => expect(sdk.get).toHaveBeenCalledTimes(1));
      if (reason === "client")
        controller.abort(new Error("SYNTHETIC_PRIVATE_ABORT_REASON"));
      else
        timers
          .get(
            reason === "operation"
              ? HOSTED_STORE_TIMEOUT_MS
              : HOSTED_REQUEST_TIMEOUT_MS,
          )!
          .abort(new DOMException("Synthetic deadline", "TimeoutError"));
      const canceled = sdk.get.mock.calls[0][1].abortSignal;
      expect(canceled.aborted).toBe(true);
      expect(canceled.reason.name).toBe("AbortError");
      expect(String(canceled.reason)).not.toContain("SYNTHETIC_PRIVATE_ABORT_REASON");
      const response = await result;
      expect(response.status).toBe(503);
      expect(response.headers.get("x-azzora-request-id")).toMatch(
        /^[a-f0-9-]{36}$/,
      );
      expect(sdk.put).not.toHaveBeenCalled();
      expect(sdk.del).not.toHaveBeenCalled();
      const logs = vi.mocked(console.error).mock.calls;
      expect(
        logs.some(
          (call) =>
            call[0] === "accounts-review-store-failed" &&
            call[1].requestId === response.headers.get("x-azzora-request-id") &&
            call[1].operation === "read" &&
            call[1].constructorName === "BlobRequestAbortedError",
        ),
      ).toBe(true);
      expect(JSON.stringify(logs)).not.toMatch(
        /SYNTHETIC_PRIVATE|sessions\/|__Host-|https:|token|password|csrf/i,
      );
    },
  );
  it("contains an aborted pre-commit write with one conditional attempt and no persisted mutation", async () => {
    const timers = new Map<number, AbortController>();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      timers.set(ms, controller);
      return controller.signal;
    });
    const finance = createReviewState();
    const before = structuredClone(finance);
    sdk.get.mockImplementation(async () => ({
      statusCode: 200,
      stream: new Blob([
        encodeReview({
          role: "accountant",
          csrf: "fictional-csrf",
          expires: Date.now() + 10_000,
          finance,
          actions: {},
        }),
      ]).stream(),
      blob: { etag: '"unchanged"' },
    }));
    sdk.put.mockImplementation(
      async (_path, _data, options: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.abortSignal.addEventListener(
            "abort",
            () => reject(new BlobRequestAbortedError()),
            { once: true },
          );
        }),
    );
    const handler = createHostedHandler(
      new BlobReviewStore(),
      () => configured,
    );
    const response = handler(
      new Request(`${origin}/api/accounts-review/action`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-Azzora-CSRF": "fictional-csrf",
          "X-Azzora-Idempotency-Key": "10000000-0000-4000-8000-000000000001",
        },
        body: JSON.stringify({
          kind: "receipt",
          documentId: "INV-26042",
          date: "2026-10-22",
          amount: "100.00",
          account: "bank",
        }),
      }),
    );
    await vi.waitFor(() => expect(sdk.put).toHaveBeenCalledTimes(1));
    timers.get(HOSTED_STORE_TIMEOUT_MS)!.abort();
    expect((await response).status).toBe(503);
    expect(sdk.put).toHaveBeenCalledTimes(1);
    expect(sdk.put.mock.calls[0][2].ifMatch).toBe('"unchanged"');
    expect(finance).toEqual(before);
  });
});
