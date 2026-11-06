import { expect, it, vi } from "vitest";
import {
  applySharedCommand,
  createSharedCompanyState,
  type SharedActor,
} from "./domain";
import { createStagingHandler } from "./server";
import { serializeCanonical } from "./canonical";
import type { StagingRpc } from "./supabase";
import type { createStagingAuth, StagingActor } from "./auth";
const actor: SharedActor = {
  userId: "client",
  personId: "client",
  companyId: "fictional",
  sessionId: "offline",
  assurance: "aal2",
  grant: {
    userId: "client",
    companyId: "fictional",
    active: true,
    roles: ["accountant"],
    workspaces: ["accountant"],
    projectIds: [],
    capabilities: ["finance.read", "finance.draft"],
  },
};
const denied = [
  "create-expense-ledger",
  "create-cash-account",
  "invoice",
  "update-invoice-draft",
  "issue-invoice",
  "bill",
  "update-bill-draft",
  "issue-bill",
  "receipt",
  "supplier-payment",
  "expense",
  "transfer",
  "create-bill-from-review",
  "create-expense-from-review",
];
it.each(denied)(
  "document-only actor cannot execute %s and leaves state untouched",
  (kind) => {
    const state = createSharedCompanyState(),
      before = structuredClone(state);
    expect(() =>
      applySharedCommand(
        state,
        {
          kind: "accounts.action",
          payload: {
            action: {
              kind,
              id: "FORBIDDEN",
              name: "Fictional forbidden",
              group: "Indirect Expense",
              type: "cash",
            },
          },
        },
        actor,
      ),
    ).toThrow("capability");
    expect(state).toEqual(before);
  },
);
it.each([
  "expense.approve",
  "employee.save",
  "settings.save",
  "payment.record",
  "refund.post",
  "credit.issue",
])("document-only actor cannot execute Manager/admin command %s", (kind) =>
  expect(() =>
    applySharedCommand(
      createSharedCompanyState(),
      { kind, payload: {} },
      actor,
    ),
  ).toThrow(),
);
it.each(["accountant", "owner"] as const)(
  "preserves legitimate %s catalog writes",
  (role) => {
    const full = structuredClone(actor);
    full.grant.roles = [role];
    full.grant.capabilities.push("finance.simulate");
    let state = createSharedCompanyState();
    state = applySharedCommand(
      state,
      {
        kind: "accounts.action",
        payload: {
          action: {
            kind: "create-expense-ledger",
            id: "ALLOWED-LEDGER",
            name: "Fictional allowed ledger",
            group: "Indirect Expense",
          },
        },
      },
      full,
    );
    state = applySharedCommand(
      state,
      {
        kind: "accounts.action",
        payload: {
          action: {
            kind: "create-cash-account",
            id: "ALLOWED-CASH",
            name: "Fictional allowed cash",
            type: "cash",
          },
        },
      },
      full,
    );
    expect(
      state.finance.expenseLedgers?.some((x) => x.id === "ALLOWED-LEDGER"),
    ).toBe(true);
    expect(
      state.finance.cashAccounts?.some((x) => x.id === "ALLOWED-CASH"),
    ).toBe(true);
  },
);
it.each(denied)("direct HTTP %s is403 before database commit", async (kind) => {
  const calls = vi.fn(async (name: string) =>
    name === "staging_company_read"
      ? { version: 1, data: serializeCanonical(createSharedCompanyState()) }
      : name === "staging_company_receipt"
        ? null
        : undefined,
  );
  const a: StagingActor = {
    userId: "client",
    companyId: "fictional",
    email: "client-review@staging.azzora.test",
    role: "accountant",
    workspace: "accountant",
    sessionHash: "private",
    providerSessionId: "provider",
    assurance: "aal2",
    projectIds: [],
    capabilities: ["finance.read", "finance.draft"],
  };
  const auth = {
    handle: vi.fn(),
    requireActor: vi.fn(async () => a),
  } as unknown as ReturnType<typeof createStagingAuth>;
  const handle = createStagingHandler({ auth, rpc: calls as StagingRpc });
  const response = await handle(
    new Request("https://staging.test/api/staging/accounts/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Azzora-Expected-Version": "1",
        "X-Azzora-Idempotency-Key": "denial-unit-test-000001",
      },
      body: JSON.stringify({
        kind,
        id: "FORBIDDEN",
        name: "Forbidden",
        group: "Indirect Expense",
        type: "cash",
      }),
    }),
  );
  expect(response.status).toBe(403);
  expect(calls.mock.calls.some((c) => c[0] === "staging_company_commit")).toBe(
    false,
  );
});
