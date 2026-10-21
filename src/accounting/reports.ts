import type { Account, AccountType, AccountingState, JournalEntry } from "./model";

// Read-only selectors for posted AED journals. They never infer entries from
// commercial summaries or modify the supplied accounting state.
export interface AccountBalanceRow {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  /** Debit minus credit; may be negative for a credit-normal account. */
  readonly signedBalanceFils: string;
}

export interface TrialBalanceRow extends AccountBalanceRow {
  readonly debitFils: string;
  readonly creditFils: string;
}

export interface TrialBalanceReport {
  readonly asOf: string;
  readonly rows: readonly TrialBalanceRow[];
  readonly totalDebitFils: string;
  readonly totalCreditFils: string;
  readonly balanced: boolean;
}

export interface GeneralLedgerLine {
  readonly journalId: string;
  readonly date: string;
  readonly memo: string;
  readonly source: JournalEntry["source"];
  readonly debitFils: string;
  readonly creditFils: string;
  /** Debit minus credit, including opening balance. */
  readonly runningBalanceFils: string;
}

export interface GeneralLedgerReport {
  readonly account: Account;
  readonly from: string;
  readonly to: string;
  readonly openingBalanceFils: string;
  readonly lines: readonly GeneralLedgerLine[];
  readonly closingBalanceFils: string;
}

export interface StatementSection {
  readonly rows: readonly StatementRow[];
  /** Positive for normal balances, negative for contra balances. */
  readonly totalFils: string;
}

export interface StatementRow {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  /** Positive for the account type's normal balance. */
  readonly normalBalanceFils: string;
}

export interface ProfitAndLossReport {
  readonly from: string;
  readonly to: string;
  readonly income: StatementSection;
  readonly costOfSales: StatementSection;
  readonly expenses: StatementSection;
  readonly grossProfitFils: string;
  readonly netProfitFils: string;
}

export interface BalanceSheetReport {
  readonly asOf: string;
  readonly assets: StatementSection;
  readonly liabilities: StatementSection;
  readonly equity: StatementSection;
  /** Unclosed cumulative P&L, shown separately from posted equity. */
  readonly currentEarningsFils: string;
  readonly liabilitiesAndEquityFils: string;
  readonly differenceFils: string;
  readonly balanced: boolean;
}

function parseFils(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value))
    throw Error("Posted journal amount must be nonnegative integer fils.");
  return BigInt(value);
}

function validDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Invalid report date.");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw Error("Invalid report date.");
}

function validRange(from: string, to: string): void {
  validDate(from);
  validDate(to);
  if (from > to) throw Error("Report start date exceeds end date.");
}

function orderedAccounts(state: AccountingState): Account[] {
  return [...state.accounts].sort((a, b) =>
    a.code.localeCompare(b.code) || a.id.localeCompare(b.id),
  );
}

/** Reject malformed or incomplete journal views instead of displaying false reports. */
export function validatePostedJournalView(state: AccountingState): void {
  if (state.version !== 1) throw Error("Unsupported accounting state version.");
  const accounts = new Map<string, Account>();
  const codes = new Set<string>();
  for (const account of state.accounts) {
    if (!account.id || !account.code || accounts.has(account.id) || codes.has(account.code))
      throw Error("Chart of accounts contains a missing or duplicate identity.");
    accounts.set(account.id, account);
    codes.add(account.code);
  }
  const journalIds = new Set<string>();
  for (const journal of state.journals) {
    if (!journal.id || journalIds.has(journal.id) || journal.currency !== "AED")
      throw Error("Posted journal identity or currency is invalid.");
    journalIds.add(journal.id);
    validDate(journal.date);
    if (journal.lines.length < 2) throw Error("Posted journal has too few lines.");
    let debit = 0n;
    let credit = 0n;
    for (const line of journal.lines) {
      const account = accounts.get(line.accountId);
      if (!account || !account.postable)
        throw Error("Posted journal references a missing or non-postable account.");
      const d = parseFils(line.debitFils);
      const c = parseFils(line.creditFils);
      if ((d > 0n) === (c > 0n))
        throw Error("Posted journal line needs exactly one debit or credit.");
      debit += d;
      credit += c;
    }
    if (debit === 0n || debit !== credit)
      throw Error("Posted journal does not balance in fils.");
  }
}

function balanceMap(
  state: AccountingState,
  include: (entry: JournalEntry) => boolean,
): Map<string, bigint> {
  const balances = new Map<string, bigint>();
  for (const journal of state.journals) {
    if (!include(journal)) continue;
    for (const line of journal.lines) {
      balances.set(
        line.accountId,
        (balances.get(line.accountId) ?? 0n) +
          parseFils(line.debitFils) -
          parseFils(line.creditFils),
      );
    }
  }
  return balances;
}

function row(account: Account, balance: bigint): AccountBalanceRow {
  return {
    accountId: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    signedBalanceFils: balance.toString(),
  };
}

function section(
  accounts: readonly Account[],
  balances: Map<string, bigint>,
  type: AccountType,
): StatementSection {
  const normalSign = type === "Asset" || type === "Cost of Sales" || type === "Expense" ? 1n : -1n;
  const rows = accounts
    .filter((account) => account.type === type && (balances.get(account.id) ?? 0n) !== 0n)
    .map((account): StatementRow => ({
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalanceFils: ((balances.get(account.id) ?? 0n) * normalSign).toString(),
    }));
  return {
    rows,
    totalFils: rows.reduce((sum, value) => sum + BigInt(value.normalBalanceFils), 0n).toString(),
  };
}

export function buildTrialBalance(state: AccountingState, asOf: string): TrialBalanceReport {
  validDate(asOf);
  validatePostedJournalView(state);
  const balances = balanceMap(state, (entry) => entry.date <= asOf);
  const rows = orderedAccounts(state)
    .filter((account) => (balances.get(account.id) ?? 0n) !== 0n)
    .map((account): TrialBalanceRow => {
      const balance = balances.get(account.id) ?? 0n;
      return {
        ...row(account, balance),
        debitFils: (balance > 0n ? balance : 0n).toString(),
        creditFils: (balance < 0n ? -balance : 0n).toString(),
      };
    });
  const totalDebit = rows.reduce((sum, value) => sum + BigInt(value.debitFils), 0n);
  const totalCredit = rows.reduce((sum, value) => sum + BigInt(value.creditFils), 0n);
  return {
    asOf,
    rows,
    totalDebitFils: totalDebit.toString(),
    totalCreditFils: totalCredit.toString(),
    balanced: totalDebit === totalCredit,
  };
}

export function buildGeneralLedger(
  state: AccountingState,
  accountId: string,
  from: string,
  to: string,
): GeneralLedgerReport {
  validRange(from, to);
  validatePostedJournalView(state);
  const account = state.accounts.find((candidate) => candidate.id === accountId);
  if (!account) throw Error("General Ledger account was not found.");
  const openingBalance = balanceMap(state, (entry) => entry.date < from).get(accountId) ?? 0n;
  let runningBalance = openingBalance;
  const lines = [...state.journals]
    .filter((entry) => from <= entry.date && entry.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))
    .flatMap((journal) => journal.lines
      .filter((line) => line.accountId === accountId)
      .map((line): GeneralLedgerLine => {
        runningBalance += parseFils(line.debitFils) - parseFils(line.creditFils);
        return {
          journalId: journal.id,
          date: journal.date,
          memo: journal.memo,
          source: journal.source,
          debitFils: line.debitFils,
          creditFils: line.creditFils,
          runningBalanceFils: runningBalance.toString(),
        };
      }));
  return {
    account,
    from,
    to,
    openingBalanceFils: openingBalance.toString(),
    lines,
    closingBalanceFils: runningBalance.toString(),
  };
}

export function buildProfitAndLoss(
  state: AccountingState,
  from: string,
  to: string,
): ProfitAndLossReport {
  validRange(from, to);
  validatePostedJournalView(state);
  const balances = balanceMap(state, (entry) => from <= entry.date && entry.date <= to);
  const accounts = orderedAccounts(state);
  const income = section(accounts, balances, "Income");
  const costOfSales = section(accounts, balances, "Cost of Sales");
  const expenses = section(accounts, balances, "Expense");
  const grossProfit = BigInt(income.totalFils) - BigInt(costOfSales.totalFils);
  return {
    from,
    to,
    income,
    costOfSales,
    expenses,
    grossProfitFils: grossProfit.toString(),
    netProfitFils: (grossProfit - BigInt(expenses.totalFils)).toString(),
  };
}

export function buildBalanceSheet(state: AccountingState, asOf: string): BalanceSheetReport {
  validDate(asOf);
  validatePostedJournalView(state);
  const balances = balanceMap(state, (entry) => entry.date <= asOf);
  const accounts = orderedAccounts(state);
  const assets = section(accounts, balances, "Asset");
  const liabilities = section(accounts, balances, "Liability");
  const equity = section(accounts, balances, "Equity");
  const income = section(accounts, balances, "Income");
  const costOfSales = section(accounts, balances, "Cost of Sales");
  const expenses = section(accounts, balances, "Expense");
  const currentEarnings = BigInt(income.totalFils) - BigInt(costOfSales.totalFils) - BigInt(expenses.totalFils);
  const liabilitiesAndEquity = BigInt(liabilities.totalFils) + BigInt(equity.totalFils) + currentEarnings;
  const difference = BigInt(assets.totalFils) - liabilitiesAndEquity;
  return {
    asOf,
    assets,
    liabilities,
    equity,
    currentEarningsFils: currentEarnings.toString(),
    liabilitiesAndEquityFils: liabilitiesAndEquity.toString(),
    differenceFils: difference.toString(),
    balanced: difference === 0n,
  };
}
