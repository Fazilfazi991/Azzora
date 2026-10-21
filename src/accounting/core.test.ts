import { describe, expect, it } from "vitest";
import {
  addAccount,
  addPeriod,
  emptyAccounting,
  lockPeriod,
  postJournal,
  reverseJournal,
} from "./core";
import type { AccountingState, PostJournalInput } from "./model";

const timestamp = "2026-10-21T12:00:00.000Z";
function fixture(): AccountingState {
  let state = emptyAccounting();
  state = addAccount(state, {
    id: "assets",
    code: "1000",
    name: "Assets",
    type: "Asset",
    postable: false,
    status: "Active",
  });
  state = addAccount(state, {
    id: "bank",
    code: "1010",
    name: "Bank",
    type: "Asset",
    parentId: "assets",
    postable: true,
    status: "Active",
  });
  state = addAccount(state, {
    id: "receivable",
    code: "1100",
    name: "Receivables",
    type: "Asset",
    parentId: "assets",
    postable: true,
    status: "Active",
  });
  state = addPeriod(state, {
    id: "october",
    start: "2026-10-01",
    end: "2026-10-31",
    status: "Open",
  });
  return state;
}

function receipt(): PostJournalInput {
  return {
    id: "journal-receipt-1",
    postingKey: "receipt-1:posted",
    source: { kind: "Customer Receipt", id: "receipt-1", action: "Posted" },
    date: "2026-10-21",
    recordedAt: timestamp,
    memo: "Receipt against selected invoice",
    currency: "AED",
    lines: [
      { accountId: "bank", debitFils: "300000", creditFils: "0" },
      { accountId: "receivable", debitFils: "0", creditFils: "300000" },
    ],
  };
}

describe("pure accounting journal core", () => {
  it("posts one balanced AED event, exactly in integer fils, and survives JSON persistence", () => {
    const start = fixture();
    const result = postJournal(start, receipt());
    expect(start.journals).toHaveLength(0);
    expect(result.state.journals).toHaveLength(1);
    expect(result.journal.periodId).toBe("october");
    expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
    expect(result.journal.lines).toEqual(receipt().lines);
  });

  it("rejects one-fils imbalance and fractional or negative fils", () => {
    const state = fixture();
    const input = receipt();
    expect(() =>
      postJournal(state, {
        ...input,
        lines: [input.lines[0], { ...input.lines[1], creditFils: "299999" }],
      }),
    ).toThrow(/balance/);
    for (const invalid of ["0.01", "-1", "1e3", "01"])
      expect(() =>
        postJournal(state, {
          ...input,
          lines: [{ ...input.lines[0], debitFils: invalid }, input.lines[1]],
        }),
      ).toThrow(/integer fils/);
  });

  it("requires active posting accounts and valid non-overlapping periods", () => {
    const state = fixture();
    expect(() =>
      addAccount(state, {
        id: "other",
        code: "1010",
        name: "Duplicate code",
        type: "Asset",
        postable: true,
        status: "Active",
      }),
    ).toThrow(/unique/);
    expect(() =>
      addAccount(state, {
        id: "income",
        code: "4000",
        name: "Income under assets",
        type: "Income",
        parentId: "assets",
        postable: true,
        status: "Active",
      }),
    ).toThrow(/same type/);
    expect(() =>
      addPeriod(state, {
        id: "overlap",
        start: "2026-10-31",
        end: "2026-11-30",
        status: "Open",
      }),
    ).toThrow(/overlap/);
    expect(() => postJournal(lockPeriod(state, "october"), receipt())).toThrow(
      /open accounting period/,
    );
    expect(() =>
      postJournal(state, {
        ...receipt(),
        lines: [
          { accountId: "assets", debitFils: "1", creditFils: "0" },
          { accountId: "receivable", debitFils: "0", creditFils: "1" },
        ],
      }),
    ).toThrow(/postable/);
    expect(() =>
      postJournal(state, {
        ...receipt(),
        recordedAt: "2026-10-21T12:00:00+04:00",
      }),
    ).toThrow(/canonical UTC/);
  });

  it("returns the existing journal for an identical retry and rejects changed or duplicate sources", () => {
    const first = postJournal(fixture(), receipt());
    const retry = postJournal(first.state, receipt());
    expect(retry.state).toBe(first.state);
    expect(retry.journal).toBe(first.journal);
    expect(() =>
      postJournal(first.state, { ...receipt(), memo: "Altered value" }),
    ).toThrow(/Posting key/);
    expect(() =>
      postJournal(first.state, {
        ...receipt(),
        id: "journal-receipt-2",
        postingKey: "another-key",
      }),
    ).toThrow(/Source action/);
    const forged = { ...receipt(), reversalOf: first.journal.id };
    expect(postJournal(fixture(), forged).journal.reversalOf).toBeUndefined();
  });

  it("reverses into an open period, retains the original, and prevents a second reversal", () => {
    const first = postJournal(fixture(), receipt());
    const closed = lockPeriod(first.state, "october");
    const november = addPeriod(closed, {
      id: "november",
      start: "2026-11-01",
      end: "2026-11-30",
      status: "Open",
    });
    const originalBytes = JSON.stringify(first.journal);
    const reverse = {
      id: "journal-reversal-1",
      postingKey: "receipt-1:reversal",
      originalId: first.journal.id,
      date: "2026-11-02",
      recordedAt: "2026-11-02T09:00:00.000Z",
      reason: "Incorrect receiving account",
    };
    expect(() =>
      reverseJournal(november, { ...reverse, date: "2026-10-22" }),
    ).toThrow(/open accounting period/);
    const result = reverseJournal(november, reverse);
    expect(JSON.stringify(result.state.journals[0])).toBe(originalBytes);
    expect(result.journal.periodId).toBe("november");
    expect(result.journal.reversalOf).toBe(first.journal.id);
    expect(result.journal.lines).toEqual([
      { accountId: "bank", debitFils: "0", creditFils: "300000" },
      { accountId: "receivable", debitFils: "300000", creditFils: "0" },
    ]);
    expect(reverseJournal(result.state, reverse).state).toBe(result.state);
    expect(() =>
      reverseJournal(result.state, {
        ...reverse,
        id: "journal-reversal-2",
        postingKey: "second-reversal",
      }),
    ).toThrow(/already been reversed/);
    expect(() =>
      reverseJournal(result.state, {
        ...reverse,
        originalId: result.journal.id,
      }),
    ).toThrow(/original journal/);
  });
});
