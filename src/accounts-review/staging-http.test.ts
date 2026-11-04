import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../staging/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../staging/client")>()),
  stagingEnabled: true,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("staging Accounts transport", () => {
  it("uses independent auth and shares versioned snapshots with business actions", async () => {
    vi.stubEnv("VITE_AZZORA_STAGING", "1");
    vi.resetModules();
    const { accountsRequest, accountsUrl } = await import("./http");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"email":"fictional@example.test"}'))
      .mockResolvedValueOnce(new Response('{"version":7}'))
      .mockResolvedValueOnce(new Response('{"snapshot":{"version":8}}'))
      .mockResolvedValueOnce(new Response('{"version":8}'));
    vi.stubGlobal("fetch", fetch);
    await accountsRequest("/session");
    await accountsRequest("/snapshot");
    await accountsRequest("/action", {
      method: "POST",
      headers: { "X-Azzora-CSRF": "csrf-test" },
      body: '{"kind":"expense"}',
    });
    await accountsRequest("/action", { method: "POST" });
    expect(fetch.mock.calls[0][0]).toBe("/api/staging/auth/session");
    expect(fetch.mock.calls[1][0]).toBe("/api/staging/accounts/snapshot");
    expect(
      fetch.mock.calls[2][1].headers.get("X-Azzora-Expected-Version"),
    ).toBe("7");
    expect(fetch.mock.calls[2][1].headers.get("X-Azzora-CSRF")).toBe(
      "csrf-test",
    );
    expect(
      fetch.mock.calls[3][1].headers.get("X-Azzora-Expected-Version"),
    ).toBe("8");
    expect(accountsUrl("/pdf/invoice/fictional")).toBe(
      "/api/staging/accounts/pdf/invoice/fictional",
    );
  });
});
