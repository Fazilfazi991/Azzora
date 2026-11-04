import { expect, it, vi } from "vitest";
import { createStagingHandler } from "./server";
import { createSharedCompanyState } from "./domain";
import { serializeCanonical } from "./canonical";
import type { createStagingAuth, StagingActor } from "./auth";
import type { StagingRpc } from "./supabase";
const actor: StagingActor = {
  userId: "owner",
  companyId: "11111111-1111-4111-8111-111111111111",
  email: "owner@staging.azzora.test",
  role: "owner_admin",
  workspace: "manager",
  sessionHash: "private-session",
  assurance: "aal2",
  providerSessionId: "private-provider-session",
  projectIds: [],
  capabilities: ["project.read", "project.write"],
};
function setup(denied = false) {
  const data = serializeCanonical(createSharedCompanyState());
  const calls = vi.fn(async (name: string) => {
    if (name === "staging_company_read") return { version: 2, data };
    if (name === "staging_company_commit")
      return { version: 2, replayed: true };
    throw Error("Unexpected RPC");
  });
  const auth = {
    handle: vi.fn(),
    requireActor: vi.fn(async () => {
      if (denied) throw Object.assign(Error("Denied"), { status: 401 });
      return actor;
    }),
  } as unknown as ReturnType<typeof createStagingAuth>;
  return {
    handle: createStagingHandler({ auth, rpc: calls as StagingRpc }),
    calls,
  };
}
const request = (path: string, body?: unknown) =>
  new Request(
    `https://staging.test/api/staging${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
it("requires authenticated identity before reading canonical company data", async () => {
  const { handle, calls } = setup(true);
  expect((await handle(request("/manager/snapshot"))).status).toBe(401);
  expect(calls).not.toHaveBeenCalled();
});
it("returns only the Manager projection and no session or journal payload", async () => {
  const { handle } = setup();
  const r = await handle(request("/manager/snapshot"));
  expect(r.status).toBe(200);
  const value = await r.json();
  expect(value.db).toBeDefined();
  expect(value.finance).toBeUndefined();
  expect(JSON.stringify(value)).not.toContain("private-session");
});
it("replays an actor-bound committed receipt before applying stale commands", async () => {
  const { handle, calls } = setup();
  const r = await handle(
    request("/manager/command", {
      expectedVersion: 1,
      idempotencyKey: "a-retried-command-key",
      kind: "customer.save",
      payload: {},
    }),
  );
  expect(r.status).toBe(200);
  expect(
    calls.mock.calls.some(([name]) => name === "staging_company_commit"),
  ).toBe(true);
});
it("rejects new financial or unsupported command routes", async () => {
  const { handle, calls } = setup();
  expect(
    (
      await handle(
        request("/manager/reset", {
          expectedVersion: 2,
          idempotencyKey: "a-new-command-key",
        }),
      )
    ).status,
  ).toBe(404);
  expect(
    calls.mock.calls.filter(([name]) => name === "staging_company_commit"),
  ).toHaveLength(0);
});
it("rejects plaintext transport before loading authentication", async () => {
  const { handle, calls } = setup();
  expect(
    (
      await handle(
        new Request("http://staging.test/api/staging/manager/snapshot"),
      )
    ).status,
  ).toBe(403);
  expect(calls).not.toHaveBeenCalled();
});
