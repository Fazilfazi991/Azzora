import { describe, expect, it } from "vitest";
import { addAccount, addPeriod, emptyAccounting, postJournal, reverseJournal } from "./core";
import type { AccountingState, JournalLine } from "./model";
import {
  buildBalanceSheet,
  buildGeneralLedger,
  buildProfitAndLoss,
  buildTrialBalance,
  validatePostedJournalView,
} from "./reports";

const D = (accountId: string, amount: string): JournalLine => ({
  accountId,
  debitFils: amount,
  creditFils: "0",
});
const C = (accountId: string, amount: string): JournalLine => ({
  accountId,
  debitFils: "0",
  creditFils: amount,
});

function syntheticLedger(): AccountingState {
  let state = addPeriod(emptyAccounting(), {
    id: "2026",
    start: "2026-01-01",
    end: "2026-12-31",
    status: "Open",
  });
  for (const [id, code, name, type] of [
    ["bank", "1010", "Operating bank", "Asset"],
    ["cash", "1020", "Thomas cash custody", "Asset"],
    ["ar", "1100", "Customer receivables", "Asset"],
    ["ap", "2100", "Supplier payables", "Liability"],
    ["capital", "3100", "Owner capital", "Equity"],
    ["revenue", "4100", "Fit-out revenue", "Income"],
    ["cost", "5100", "Materials cost", "Cost of Sales"],
    ["expense", "6100", "Site expense", "Expense"],
  ] as const) {
    state = addAccount(state, { id, code, name, type, postable: true, status: "Active" });
  }
  const entries: { id: string; date: string; lines: JournalLine[] }[] = [
    { id: "opening", date: "2026-01-01", lines: [D("bank", "1000000"), C("capital", "1000000")] },
    { id: "invoice", date: "2026-01-05", lines: [D("ar", "200000"), C("revenue", "200000")] },
    { id: "receipt", date: "2026-01-10", lines: [D("bank", "50000"), C("ar", "50000")] },
    { id: "bill", date: "2026-01-12", lines: [D("cost", "60000"), C("ap", "60000")] },
    { id: "supplier-payment", date: "2026-01-14", lines: [D("ap", "20000"), C("bank", "20000")] },
    { id: "expense", date: "2026-01-15", lines: [D("expense", "10000"), C("bank", "10000")] },
    { id: "custody-transfer", date: "2026-01-16", lines: [D("cash", "30000"), C("bank", "30000")] },
  ];
  for (const entry of entries) {
    state = postJournal(state, {
      id: entry.id,
      postingKey: entry.id,
      source: { kind: "Synthetic Fixture", id: entry.id, action: "Post" },
      date: entry.date,
      recordedAt: `${entry.date}T12:00:00.000Z`,
      memo: entry.id,
      currency: "AED",
      lines: entry.lines,
    }).state;
  }
  return state;
}

describe("journal-derived accountant reports", () => {
  it("reconciles Trial Balance, P&L and Balance Sheet from the same posted synthetic ledger", () => {
    const state = syntheticLedger();
    const trial = buildTrialBalance(state, "2026-01-31");
    const pnl = buildProfitAndLoss(state, "2026-01-01", "2026-01-31");
    const balance = buildBalanceSheet(state, "2026-01-31");
    expect(trial.balanced).toBe(true);
    expect(trial.totalDebitFils).toBe(trial.totalCreditFils);
    expect(trial.rows.find((r) => r.accountId === "ar")?.debitFils).toBe("150000");
    expect(trial.rows.find((r) => r.accountId === "ap")?.creditFils).toBe("40000");
    expect(pnl.income.totalFils).toBe("200000");
    expect(pnl.costOfSales.totalFils).toBe("60000");
    expect(pnl.expenses.totalFils).toBe("10000");
    expect(pnl.grossProfitFils).toBe("140000");
    expect(pnl.netProfitFils).toBe("130000");
    expect(balance.assets.totalFils).toBe("1170000");
    expect(balance.liabilities.totalFils).toBe("40000");
    expect(balance.equity.totalFils).toBe("1000000");
    expect(balance.currentEarningsFils).toBe(pnl.netProfitFils);
    expect(balance.balanced).toBe(true);
    expect(balance.differenceFils).toBe("0");
  });

  it("treats a cash-holder transfer as two assets, not revenue or expense", () => {
    const state = syntheticLedger();
    const before = buildProfitAndLoss(state, "2026-01-01", "2026-01-15");
    const after = buildProfitAndLoss(state, "2026-01-01", "2026-01-16");
    expect(after.netProfitFils).toBe(before.netProfitFils);
    expect(buildBalanceSheet(state, "2026-01-16").assets.rows.find((r) => r.accountId === "cash")?.normalBalanceFils).toBe("30000");
  });

  it("gives GL an opening balance and deterministic running balance", () => {
    const ledger = buildGeneralLedger(syntheticLedger(), "bank", "2026-01-10", "2026-01-31");
    expect(ledger.openingBalanceFils).toBe("1000000");
    expect(ledger.lines.map((line) => line.runningBalanceFils)).toEqual([
      "1050000", "1030000", "1020000", "990000",
    ]);
    expect(ledger.closingBalanceFils).toBe("990000");
  });

  it("includes reversal lines and preserves original journal history", () => {
    const original = syntheticLedger();
    const reversed = reverseJournal(original, {
      id: "expense-reversal",
      postingKey: "expense-reversal",
      originalId: "expense",
      date: "2026-01-17",
      recordedAt: "2026-01-17T12:00:00.000Z",
      reason: "Synthetic correction",
    }).state;
    expect(reversed.journals).toHaveLength(original.journals.length + 1);
    expect(reversed.journals.find((j) => j.id === "expense")).toEqual(original.journals.find((j) => j.id === "expense"));
    expect(buildProfitAndLoss(reversed, "2026-01-01", "2026-01-31").expenses.totalFils).toBe("0");
    expect(buildTrialBalance(reversed, "2026-01-31").balanced).toBe(true);
    expect(buildBalanceSheet(reversed, "2026-01-31").balanced).toBe(true);
  });

  it("fails closed for malformed journals and dates without mutating input", () => {
    const state = syntheticLedger();
    const copy = JSON.stringify(state);
    const invalid = {
      ...state,
      journals: state.journals.map((entry) => entry.id === "bill"
        ? { ...entry, lines: [entry.lines[0], { ...entry.lines[1], creditFils: "59999" }] }
        : entry),
    };
    expect(() => validatePostedJournalView(invalid)).toThrow(/balance/);
    expect(() => buildProfitAndLoss(invalid, "2026-01-01", "2026-01-31")).toThrow(/balance/);
    expect(() => buildTrialBalance(state, "2026-02-30")).toThrow(/date/);
    expect(() => buildProfitAndLoss(state, "2026-02-01", "2026-01-01")).toThrow(/start date/);
    expect(JSON.stringify(state)).toBe(copy);
  });

  it("handles integer fils beyond JavaScript Number's safe range", () => {
    let state = addPeriod(emptyAccounting(), { id: "p", start: "2026-01-01", end: "2026-12-31", status: "Open" });
    state = addAccount(state, { id: "a", code: "1000", name: "Asset", type: "Asset", postable: true, status: "Active" });
    state = addAccount(state, { id: "e", code: "3000", name: "Equity", type: "Equity", postable: true, status: "Active" });
    state = postJournal(state, {
      id: "large", postingKey: "large", source: { kind: "Synthetic Fixture", id: "large", action: "Post" },
      date: "2026-01-01", recordedAt: "2026-01-01T12:00:00.000Z", memo: "Large amount", currency: "AED",
      lines: [D("a", "9007199254740993"), C("e", "9007199254740993")],
    }).state;
    expect(buildBalanceSheet(state, "2026-01-31").assets.totalFils).toBe("9007199254740993");
  });
});
