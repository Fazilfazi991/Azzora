import { afterEach, describe, expect, it, vi } from "vitest";
import { accountsRequest } from "./http";

const reference = "2e225d51-e5ef-42df-b962-dbfacb2ed5e0";
afterEach(() => vi.unstubAllGlobals());
describe("safe financial API failure transport", () => {
  it("shows a server UUID on JSON503 and never automatically repeats the POST", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Temporarily unavailable." }), {
          status: 503,
          headers: { "X-Azzora-Request-ID": reference },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      accountsRequest("/action", { method: "POST" }),
    ).rejects.toThrow(`Reference: ${reference}`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("contains a platform HTML503 without exposing its body or losing the safe reference", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("<html>private upstream diagnostic</html>", {
          status: 503,
          headers: { "X-Azzora-Request-ID": reference },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      accountsRequest("/action", { method: "POST" }),
    ).rejects.toThrow(
      `unreadable response. Please retry. Reference: ${reference}`,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not show arbitrary upstream identifiers as a trusted reference", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":"Unavailable"}', {
            status: 503,
            headers: { "X-Azzora-Request-ID": "untrusted-private-value" },
          }),
        ),
    );
    await expect(accountsRequest("/action")).rejects.toThrow(/^Unavailable$/);
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
    await expect(accountsRequest("/action")).rejects.toThrow(
      /^Choose an invoice$/,
    );
    await expect(accountsRequest("/snapshot")).resolves.toEqual({
      id: "posted-id",
    });
  });
});
