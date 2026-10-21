import type {
  Account,
  AccountingPeriod,
  AccountingState,
  JournalEntry,
  JournalLine,
  JournalSource,
  PostJournalInput,
  ReverseJournalInput,
} from "./model";

export const emptyAccounting = (): AccountingState => ({
  version: 1,
  accounts: [],
  periods: [],
  journals: [],
});

function required(value: string, label: string) {
  if (!value.trim()) throw Error(`${label} is required.`);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Invalid journal date.");
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw Error("Invalid journal date.");
}

function validTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value)))
    throw Error("A valid recording timestamp is required.");
  if (new Date(value).toISOString() !== value)
    throw Error("Recording timestamp must be canonical UTC ISO 8601.");
}

function fils(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value))
    throw Error("Journal amounts must be nonnegative integer fils.");
  return BigInt(value);
}

function sourceKey(source: JournalSource) {
  for (const value of [source.kind, source.id, source.action])
    required(value, "Journal source");
  return JSON.stringify([source.kind, source.id, source.action]);
}

function periodFor(state: AccountingState, date: string) {
  const matches = state.periods.filter((p) => p.start <= date && date <= p.end);
  if (matches.length !== 1 || matches[0].status !== "Open")
    throw Error("Posting date must be in exactly one open accounting period.");
  return matches[0];
}

export function addAccount(
  state: AccountingState,
  input: Account,
): AccountingState {
  required(input.id, "Account ID");
  required(input.code, "Account code");
  required(input.name, "Account name");
  if (state.accounts.some((a) => a.id === input.id || a.code === input.code))
    throw Error("Account ID and code must be unique.");
  if (input.parentId) {
    const parent = state.accounts.find((a) => a.id === input.parentId);
    if (!parent || parent.type !== input.type || parent.postable)
      throw Error(
        "Parent account must be a non-postable account of the same type.",
      );
  }
  return { ...state, accounts: [...state.accounts, { ...input }] };
}

export function addPeriod(
  state: AccountingState,
  input: AccountingPeriod,
): AccountingState {
  required(input.id, "Accounting period ID");
  validDate(input.start);
  validDate(input.end);
  if (input.start > input.end || input.status !== "Open")
    throw Error(
      "New accounting period must be open with valid start and end dates.",
    );
  if (
    state.periods.some(
      (p) =>
        p.id === input.id || (input.start <= p.end && p.start <= input.end),
    )
  )
    throw Error("Accounting periods must not overlap or reuse an ID.");
  return { ...state, periods: [...state.periods, { ...input }] };
}

export function lockPeriod(
  state: AccountingState,
  id: string,
): AccountingState {
  const period = state.periods.find((p) => p.id === id);
  if (!period || period.status !== "Open")
    throw Error("Only an open accounting period can be locked.");
  return {
    ...state,
    periods: state.periods.map((p) =>
      p.id === id ? { ...p, status: "Locked" as const } : p,
    ),
  };
}

function checkLines(
  state: AccountingState,
  lines: readonly JournalLine[],
  reversal: boolean,
) {
  if (lines.length < 2) throw Error("A journal needs at least two lines.");
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    const account = state.accounts.find((a) => a.id === line.accountId);
    if (
      !account ||
      !account.postable ||
      (!reversal && account.status !== "Active")
    )
      throw Error("Journal line requires a postable account.");
    const d = fils(line.debitFils);
    const c = fils(line.creditFils);
    if (d > 0n === c > 0n)
      throw Error(
        "Each journal line needs exactly one positive debit or credit.",
      );
    debit += d;
    credit += c;
  }
  if (debit === 0n || debit !== credit)
    throw Error("Journal debits and credits must balance in fils.");
}

function payload(entry: JournalEntry) {
  return JSON.stringify({
    source: entry.source,
    date: entry.date,
    memo: entry.memo,
    currency: entry.currency,
    lines: entry.lines,
    reversalOf: entry.reversalOf,
  });
}

function appendJournal(
  state: AccountingState,
  entry: JournalEntry,
  reversal: boolean,
) {
  required(entry.id, "Journal ID");
  required(entry.postingKey, "Posting key");
  required(entry.memo, "Journal memo");
  sourceKey(entry.source);
  validDate(entry.date);
  validTimestamp(entry.recordedAt);
  if (entry.currency !== "AED") throw Error("Only AED journals are supported.");
  if (Boolean(entry.reversalOf) !== reversal)
    throw Error("Reversals must use the dedicated reversal command.");
  const existing = state.journals.find(
    (j) => j.postingKey === entry.postingKey,
  );
  if (existing) {
    if (existing.id !== entry.id || payload(existing) !== payload(entry))
      throw Error("Posting key was already used for a different journal.");
    return { state, journal: existing };
  }
  if (state.journals.some((j) => j.id === entry.id))
    throw Error("Journal ID is already in use.");
  if (
    state.journals.some((j) => sourceKey(j.source) === sourceKey(entry.source))
  )
    throw Error("Source action was already posted.");
  const period = periodFor(state, entry.date);
  checkLines(state, entry.lines, reversal);
  const saved: JournalEntry = {
    ...entry,
    periodId: period.id,
    source: { ...entry.source },
    lines: entry.lines.map((line) => ({ ...line })),
  };
  return {
    state: { ...state, journals: [...state.journals, saved] },
    journal: saved,
  };
}

export function postJournal(state: AccountingState, input: PostJournalInput) {
  const entry: JournalEntry = {
    id: input.id,
    postingKey: input.postingKey,
    source: input.source,
    date: input.date,
    recordedAt: input.recordedAt,
    periodId: "",
    memo: input.memo,
    currency: input.currency,
    lines: input.lines,
  };
  return appendJournal(state, entry, false);
}

export function reverseJournal(
  state: AccountingState,
  input: ReverseJournalInput,
) {
  const original = state.journals.find((j) => j.id === input.originalId);
  if (!original || original.reversalOf)
    throw Error("Only an existing original journal can be reversed.");
  required(input.reason, "Reversal reason");
  const prior = state.journals.find((j) => j.reversalOf === original.id);
  if (prior && (prior.id !== input.id || prior.postingKey !== input.postingKey))
    throw Error("Journal has already been reversed.");
  const entry: JournalEntry = {
    id: input.id,
    postingKey: input.postingKey,
    source: { kind: "Journal Reversal", id: original.id, action: "Reverse" },
    date: input.date,
    recordedAt: input.recordedAt,
    periodId: "",
    memo: input.reason,
    currency: original.currency,
    lines: original.lines.map((line) => ({
      ...line,
      debitFils: line.creditFils,
      creditFils: line.debitFils,
    })),
    reversalOf: original.id,
  };
  return appendJournal(state, entry, true);
}
