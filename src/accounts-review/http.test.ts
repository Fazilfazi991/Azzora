import { afterEach, describe, expect, it, vi } from "vitest";
import { accountsRequest } from "./http";

const reference = "2e225d51-e5ef-42df-b962-dbfacb2ed5e0";
afterEach(() => vi.unstubAllGlobals());
describe("safe financial API failure transport", () => {
  it("shows a server UUID on JSON503 and never automatically repeats the POST", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Temporarily unavailable." }), {
        status: 503,
        headers: { "X-Azzora-Request-ID": reference },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const error = await accountsRequest("/action?asOf=2026-10-22", {
      method: "POST",
    }).catch((problem) => problem);
    expect(error.message).toContain(
      "Unable to confirm whether the submission was saved",
    );
    expect(error.message).toContain("It may already be saved");
    expect(error.message).toContain("Retry with the same details");
    expect(error.message).toContain("refresh and check the ledger");
    expect(error.message).toContain(`Reference: ${reference}`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([200, 503])(
    "contains a non-JSON action response with HTTP%s without assuming the submission failed",
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response("<html>private upstream diagnostic</html>", {
          status,
          headers: { "X-Azzora-Request-ID": reference },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      const error = await accountsRequest("/action", { method: "POST" }).catch(
        (problem) => problem,
      );
      expect(error.message).toContain("unreadable response");
      expect(error.message).toContain("It may already be saved");
      expect(error.message).toContain(`Reference: ${reference}`);
      expect(error.message).not.toContain("private upstream diagnostic");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("does not show arbitrary upstream identifiers as a trusted reference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"error":"Unavailable"}', {
          status: 503,
          headers: { "X-Azzora-Request-ID": "untrusted-private-value" },
        }),
      ),
    );
    const error = await accountsRequest("/action", { method: "POST" }).catch(
      (problem) => problem,
    );
    expect(error.message).toContain("It may already be saved");
    expect(error.message).not.toContain("Reference:");
    expect(error.message).not.toContain("untrusted-private-value");
  });
  it("preserves ordinary validation messages and successful data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('{"error":"Choose an invoice"}', {
            status: 400,
            headers: { "X-Azzora-Request-ID": reference },
          }),
        )
        .mockResolvedValueOnce(
          new Response('{"id":"posted-id"}', { status: 200 }),
        ),
    );
    await expect(
      accountsRequest("/action", { method: "POST" }),
    ).rejects.toThrow(/^Choose an invoice$/);
    await expect(accountsRequest("/snapshot")).resolves.toEqual({
      id: "posted-id",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("treats a network interruption after an action POST as an uncertain outcome without retrying or exposing its details", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("https://private.example?token=private-secret"),
      );
    vi.stubGlobal("fetch", fetch);
    const error = await accountsRequest("/action", {
      method: "POST",
      body: '{"kind":"expense"}',
    }).catch((problem) => problem);
    expect(error.message).toContain("It may already be saved");
    expect(error.message).toContain("Retry with the same details");
    expect(error.message).not.toMatch(/private|secret|https:|Reference:/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
