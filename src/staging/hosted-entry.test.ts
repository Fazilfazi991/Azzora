import { expect, it, vi } from "vitest";
const handler = vi.hoisted(() =>
  vi.fn(async (request: Request) => new Response(request.url)),
);
vi.mock("./server", () => ({ stagingHandler: handler }));
import endpoint from "../../api/staging";
it("does not trust a caller-supplied recovery rate-limit identity at the hosted entry", async () => {
  const original = new Request(
    "https://staging.test/api/staging/auth/recovery",
    {
      method: "POST",
      headers: {
        "X-Azzora-Client-Address": "forged-client",
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  await endpoint.fetch(original);
  const forwarded = handler.mock.calls[0][0] as unknown as Request;
  expect(forwarded.headers.has("X-Azzora-Client-Address")).toBe(false);
  expect(await forwarded.text()).toBe("{}");
  expect(forwarded.headers.get("Content-Type")).toBe("application/json");
});
