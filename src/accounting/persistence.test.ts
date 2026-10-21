import { describe, expect, it } from "vitest";
import {
  createEmptyFinanceDemoState,
  dispatchSyntheticFinance,
  dispatchSyntheticFinanceInSavedJson,
  readOptionalFinanceFromSavedJson,
  serializeSyntheticFinanceFixture,
  validateFinanceDemoState,
  type FinanceDemoState,
  type SyntheticFinanceCommand,
  type SyntheticFinanceEnvelope,
} from "./persistence";

const mark = "fixture:alpha:";
const oct = "2026-10-21T12:00:00.000Z";
const nov = "2026-11-02T09:00:00.000Z";
const root = JSON.stringify({
  version: 1,
  financeFixture: { mode: "synthetic-demo", id: "alpha" },
  invoices: [{ id: "legacy-issued-invoice", snapshot: "unchanged" }],
  operations: { bills: [{ id: "legacy-bill", gross: "10000" }] },
  customFutureField: { untouched: true },
});

function envelope(
  index: number,
  command: SyntheticFinanceCommand,
  recordedAt = oct,
): SyntheticFinanceEnvelope {
  return {
    id: `${mark}event-${index}`,
    idempotencyKey: `${mark}key-${index}`,
    actorId: `${mark}actor-accountant`,
    recordedAt,
    command,
  };
}

const bank = {
  id: `${mark}bank`,
  code: "1010",
  name: "Demo Bank",
  type: "Asset" as const,
  postable: true,
  status: "Active" as const,
};
const receivable = {
  id: `${mark}ar`,
  code: "1100",
  name: "Demo Receivable",
  type: "Asset" as const,
  postable: true,
  status: "Active" as const,
};
const receipt = {
  id: `${mark}journal-receipt-1`,
  postingKey: `${mark}posting-receipt-1`,
  source: {
    kind: "Synthetic Fixture",
    id: `${mark}receipt-1`,
    action: "Posted",
  },
  date: "2026-10-21",
  recordedAt: oct,
  memo: "Fixture receipt allocated to a selected invoice",
  currency: "AED" as const,
  lines: [
    { accountId: bank.id, debitFils: "300000", creditFils: "0" },
    { accountId: receivable.id, debitFils: "0", creditFils: "300000" },
  ],
};

function funded(): FinanceDemoState {
  let finance = createEmptyFinanceDemoState("alpha");
  finance = dispatchSyntheticFinance(
    finance,
    envelope(1, { kind: "AddAccount", account: bank }),
  );
  finance = dispatchSyntheticFinance(
    finance,
    envelope(2, { kind: "AddAccount", account: receivable }),
  );
  finance = dispatchSyntheticFinance(
    finance,
    envelope(3, {
      kind: "AddPeriod",
      period: {
        id: `${mark}october`,
        start: "2026-10-01",
        end: "2026-10-31",
        status: "Open",
      },
    }),
  );
  return finance;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("synthetic-only finance persistence boundary", () => {
  it("reads old saved CRM data without adding a finance namespace or changing bytes", () => {
    const legacy = JSON.stringify({
      version: 1,
      projects: [{ id: "project-1" }],
      invoices: [],
    });
    expect(readOptionalFinanceFromSavedJson(legacy)).toBeUndefined();
    expect(legacy).toBe(
      '{"version":1,"projects":[{"id":"project-1"}],"invoices":[]}',
    );
    expect(() =>
      dispatchSyntheticFinanceInSavedJson(
        legacy,
        envelope(1, {
          kind: "AddAccount",
          account: bank,
        }),
      ),
    ).toThrow(/initialization/);
  });

  it("round-trips only an explicitly marked fixture and preserves unrelated CRM fields", () => {
    const finance = funded();
    const serialized = serializeSyntheticFinanceFixture(root, finance);
    const loaded = readOptionalFinanceFromSavedJson(serialized);
    expect(loaded).toEqual(finance);
    expect(JSON.parse(serialized).invoices).toEqual(JSON.parse(root).invoices);
    expect(JSON.parse(serialized).operations).toEqual(
      JSON.parse(root).operations,
    );
    expect(JSON.parse(serialized).customFutureField).toEqual(
      JSON.parse(root).customFutureField,
    );
    expect(() =>
      serializeSyntheticFinanceFixture(
        JSON.stringify({ version: 1, invoices: [] }),
        finance,
      ),
    ).toThrow(/explicitly marked synthetic/);
  });

  it("dispatches one audited journal atomically, repeats exact retries unchanged, and rejects second write paths", () => {
    const initial = serializeSyntheticFinanceFixture(root, funded());
    const event = envelope(4, { kind: "PostJournal", journal: receipt });
    const posted = dispatchSyntheticFinanceInSavedJson(initial, event);
    const finance = readOptionalFinanceFromSavedJson(posted)!;
    expect(finance.accounting.journals).toHaveLength(1);
    expect(finance.audit.at(-1)?.journalId).toBe(receipt.id);
    expect(finance.accounting.journals[0].periodId).toBe(`${mark}october`);
    expect(dispatchSyntheticFinanceInSavedJson(posted, event)).toBe(posted);
    expect(() =>
      dispatchSyntheticFinanceInSavedJson(posted, {
        ...event,
        command: {
          ...event.command,
          kind: "PostJournal",
          journal: { ...receipt, memo: "changed" },
        },
      }),
    ).toThrow(/idempotency key/);
    expect(() =>
      dispatchSyntheticFinanceInSavedJson(
        posted,
        envelope(5, {
          kind: "PostJournal",
          journal: receipt,
        }),
      ),
    ).toThrow(/already belongs to another/);
    expect(JSON.parse(posted).invoices).toEqual(JSON.parse(root).invoices);
  });

  it("reconciles a receipt and append-only reversal across a locked period", () => {
    let finance = dispatchSyntheticFinance(
      funded(),
      envelope(4, {
        kind: "PostJournal",
        journal: receipt,
      }),
    );
    const original = JSON.stringify(finance.accounting.journals[0]);
    finance = dispatchSyntheticFinance(
      finance,
      envelope(5, {
        kind: "LockPeriod",
        periodId: `${mark}october`,
      }),
    );
    finance = dispatchSyntheticFinance(
      finance,
      envelope(
        6,
        {
          kind: "AddPeriod",
          period: {
            id: `${mark}november`,
            start: "2026-11-01",
            end: "2026-11-30",
            status: "Open",
          },
        },
        nov,
      ),
    );
    finance = dispatchSyntheticFinance(
      finance,
      envelope(
        7,
        {
          kind: "ReverseJournal",
          reversal: {
            id: `${mark}journal-reversal-1`,
            postingKey: `${mark}reversal-receipt-1`,
            originalId: receipt.id,
            date: "2026-11-02",
            recordedAt: nov,
            reason: "Synthetic correction",
          },
        },
        nov,
      ),
    );
    expect(JSON.stringify(finance.accounting.journals[0])).toBe(original);
    expect(finance.accounting.journals[1].reversalOf).toBe(receipt.id);
    const totals = new Map<string, bigint>();
    for (const journal of finance.accounting.journals)
      for (const line of journal.lines)
        totals.set(
          line.accountId,
          (totals.get(line.accountId) || 0n) +
            BigInt(line.debitFils) -
            BigInt(line.creditFils),
        );
    expect([...totals.values()]).toEqual([0n, 0n]);
    const saved = serializeSyntheticFinanceFixture(root, finance);
    expect(readOptionalFinanceFromSavedJson(saved)).toEqual(finance);
    expect(() => serializeSyntheticFinanceFixture(saved, funded())).toThrow(
      /append-only|periods cannot/,
    );
  });

  it("rejects malformed, unbalanced, duplicate and real-source records before a write", () => {
    const posted = dispatchSyntheticFinance(
      funded(),
      envelope(4, {
        kind: "PostJournal",
        journal: receipt,
      }),
    );
    const unbalanced = clone(posted);
    (
      unbalanced.accounting.journals[0].lines[1] as { creditFils: string }
    ).creditFils = "299999";
    expect(() => validateFinanceDemoState(unbalanced)).toThrow(/unbalanced/);
    const realSource = clone(posted);
    (realSource.accounting.journals[0].source as { id: string }).id =
      "legacy-issued-invoice";
    expect(() => validateFinanceDemoState(realSource)).toThrow(
      /Real CRM source IDs/,
    );
    const realDimension = clone(posted);
    (
      realDimension.accounting.journals[0].lines[0] as { projectId?: string }
    ).projectId = "project-1";
    expect(() => validateFinanceDemoState(realDimension)).toThrow(
      /Real CRM dimension IDs/,
    );
    const mismatchedAudit = clone(posted);
    const lastEvent = mismatchedAudit.audit.at(-1)!;
    if (lastEvent.command.kind !== "PostJournal")
      throw Error("Expected fixture posting.");
    (lastEvent.command.journal as { memo: string }).memo = "Forged memo";
    expect(() => validateFinanceDemoState(mismatchedAudit)).toThrow(
      /does not match its journal/,
    );
    const missingAudit = clone(posted);
    (missingAudit.audit as unknown as object[]).pop();
    expect(() => validateFinanceDemoState(missingAudit)).toThrow(
      /missing its audit event/,
    );
    const duplicated = clone(posted);
    (duplicated.accounting.journals as unknown as object[]).push(
      clone(duplicated.accounting.journals[0]),
    );
    expect(() => validateFinanceDemoState(duplicated)).toThrow(
      /Duplicate journal ID/,
    );
    const future = clone(posted) as unknown as Record<string, unknown>;
    future.version = 2;
    expect(() => validateFinanceDemoState(future)).toThrow();
    const malformed = JSON.stringify({ ...JSON.parse(root), finance: future });
    expect(() => readOptionalFinanceFromSavedJson(malformed)).toThrow();
    expect(() =>
      dispatchSyntheticFinanceInSavedJson(
        malformed,
        envelope(5, {
          kind: "PostJournal",
          journal: receipt,
        }),
      ),
    ).toThrow();
  });
});
