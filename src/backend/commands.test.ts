import { describe, expect, it } from "vitest";
import { emptyAccounting } from "../accounting/core";
import type { AuthorizedActor } from "./permissions";
import {
  executeCanonicalCommand,
  type CanonicalAggregate,
  type CanonicalRepository,
  type CommandEnvelope,
  type CommandReceipt,
  type DomainAdapter,
} from "./commands";

function fixture() {
  let state: CanonicalAggregate = {
    version: 0,
    documents: {},
    accounting: emptyAccounting(),
  };
  let receipts = new Map<string, CommandReceipt>();
  let audit: unknown[] = [];
  let queue = Promise.resolve();
  let failAudit = false;
  let enabled = false;
  const actor: AuthorizedActor = {
    userId: "accountant",
    companyId: "company",
    sessionId: "session",
    assurance: "aal2",
    grant: {
      userId: "accountant",
      companyId: "company",
      active: true,
      roles: ["accountant"],
      workspaces: ["accountant"],
      projectIds: [],
      capabilities: ["finance.read", "finance.draft", "finance.post"],
    },
  };
  const repository: CanonicalRepository = {
    transaction(companyId, execute) {
      const result = queue.then(async () => {
        if (companyId !== "company") throw Error("Tenant denied");
        let draft = structuredClone(state);
        const nextReceipts = structuredClone(receipts);
        const nextAudit = structuredClone(audit);
        const value = await execute({
          currentActor: async () => structuredClone(actor),
          policy: async () => ({
            id: "signed-policy",
            postingEnabled: enabled,
            accountingBasisApproved: enabled,
            vatApproved: enabled,
            authorityApproved: enabled,
            openingBalancesApproved: enabled,
          }),
          loadForUpdate: async () => structuredClone(draft),
          receipt: async (key) => nextReceipts.get(key) ?? null,
          save: async (next) => {
            draft = structuredClone(next);
          },
          appendAudit: async (event) => {
            if (failAudit) throw Error("Audit unavailable");
            nextAudit.push(event);
          },
          recordReceipt: async (key, receipt) => {
            nextReceipts.set(key, receipt);
          },
        });
        state = draft;
        receipts = nextReceipts;
        audit = nextAudit;
        return value;
      });
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const adapter: DomainAdapter = {
    action: "finance.draft",
    financial: false,
    resource: () => ({}),
    prepare: (current, payload) => ({
      documents: { ...current.documents, draft: payload },
      journals: [],
    }),
  };
  const adapters = new Map([["save-draft", adapter]]);
  const command: CommandEnvelope = {
    companyId: "company",
    kind: "save-draft",
    idempotencyKey: "request-key-000001",
    expectedVersion: 0,
    payload: { title: "Fictional draft" },
  };
  return {
    repository,
    adapters,
    adapter,
    command,
    actor,
    state: () => state,
    audit: () => audit,
    failAudit: () => {
      failAudit = true;
    },
    enable: () => {
      enabled = true;
    },
  };
}

describe("canonical shared transaction boundary (local adapter contract)", () => {
  it("persists a draft and actor audit without financial posting", async () => {
    const f = fixture();
    expect(
      await executeCanonicalCommand(f.repository, f.adapters, f.command),
    ).toEqual({ version: 1, replayed: false });
    expect(f.state().accounting.journals).toHaveLength(0);
    expect(f.audit()).toHaveLength(1);
  });
  it("serializes simultaneous identical requests into one write", async () => {
    const f = fixture();
    const values = await Promise.all(
      [1, 2].map(() =>
        executeCanonicalCommand(f.repository, f.adapters, f.command),
      ),
    );
    expect(values.map((value) => value.replayed)).toEqual([false, true]);
    expect(f.audit()).toHaveLength(1);
  });
  it("reports stale concurrent edits instead of silently overwriting", async () => {
    const f = fixture();
    const values = await Promise.allSettled(
      [f.command, { ...f.command, idempotencyKey: "request-key-000002" }].map(
        (command) => executeCanonicalCommand(f.repository, f.adapters, command),
      ),
    );
    expect(values.map((value) => value.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(f.state().version).toBe(1);
  });
  it("rolls back documents, receipt and journal when audit fails", async () => {
    const f = fixture();
    f.failAudit();
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, f.command),
    ).rejects.toThrow("Audit unavailable");
    expect(f.state().version).toBe(0);
    expect(f.audit()).toHaveLength(0);
  });
  it("does not replay another payload using the same idempotency key", async () => {
    const f = fixture();
    await executeCanonicalCommand(f.repository, f.adapters, f.command);
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, {
        ...f.command,
        payload: { title: "Different" },
      }),
    ).rejects.toThrow("Idempotency");
  });
  it("rechecks revoked membership even for a committed replay", async () => {
    const f = fixture();
    await executeCanonicalCommand(f.repository, f.adapters, f.command);
    f.actor.grant.active = false;
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, f.command),
    ).rejects.toThrow("company_access_denied");
  });
  it("does not turn financial permissions into policy approval", async () => {
    const f = fixture();
    f.adapter.financial = true;
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, f.command),
    ).rejects.toThrow("approved company policies");
    expect(f.state().version).toBe(0);
  });
  it("does not let a weak action bypass financial capability", async () => {
    const f = fixture();
    f.adapter.financial = true;
    f.enable();
    f.actor.grant.capabilities = ["finance.draft"];
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, f.command),
    ).rejects.toThrow("capability_denied");
  });
  it("blocks accidental journals from a document-only handler", async () => {
    const f = fixture();
    f.adapter.prepare = () => ({ documents: {}, journals: [{} as never] });
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, f.command),
    ).rejects.toThrow("Nonfinancial");
  });
  it("uses existing financial validation and rolls back invalid entries", async () => {
    const f = fixture();
    f.adapter.financial = true;
    f.enable();
    f.adapter.prepare = () => ({
      documents: {},
      journals: [
        {
          id: "invalid",
          postingKey: "invalid",
          source: { kind: "invoice", id: "1", action: "issue" },
          date: "2026-11-04",
          recordedAt: "2026-11-04T00:00:00.000Z",
          memo: "Fictional",
          currency: "AED",
          lines: [],
        },
      ],
    });
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, f.command),
    ).rejects.toThrow();
    expect(f.state().version).toBe(0);
    expect(f.audit()).toHaveLength(0);
  });
  it("rejects undefined/non-JSON financial payloads before opening a transaction", async () => {
    const f = fixture();
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, {
        ...f.command,
        payload: { amount: NaN },
      }),
    ).rejects.toThrow("JSON");
  });
  it("does not allow read-only adapter capabilities to authorize a write", async () => {
    const f = fixture();
    f.adapter.action = "finance.read";
    await expect(
      executeCanonicalCommand(f.repository, f.adapters, f.command),
    ).rejects.toThrow("read capability");
    expect(f.state().version).toBe(0);
  });
  it("snapshots payload before asynchronous authorization and transaction work", async () => {
    const f = fixture();
    const result = executeCanonicalCommand(f.repository, f.adapters, f.command);
    (f.command.payload as { title: string }).title =
      "Changed while awaiting DB";
    await result;
    expect(f.state().documents.draft).toEqual({ title: "Fictional draft" });
  });
});
