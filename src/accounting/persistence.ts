import { z } from "zod";
import {
  addAccount,
  addPeriod,
  emptyAccounting,
  lockPeriod,
  postJournal,
  reverseJournal,
} from "./core";
import type {
  Account,
  AccountingPeriod,
  AccountingState,
  JournalEntry,
  PostJournalInput,
  ReverseJournalInput,
} from "./model";

// This checkpoint accepts fixture-only records. The CRM store must validate an
// optional namespace on load, but must never initialize or post it on load.
const fixtureIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const filsPattern = /^(0|[1-9]\d*)$/;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const accountType = z.enum([
  "Asset",
  "Liability",
  "Equity",
  "Income",
  "Cost of Sales",
  "Expense",
]);
const accountSchema = z
  .object({
    id: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
    type: accountType,
    parentId: z.string().min(1).optional(),
    postable: z.boolean(),
    status: z.enum(["Active", "Archived"]),
  })
  .strict();
const periodSchema = z
  .object({
    id: z.string().min(1),
    start: z.string().regex(dayPattern),
    end: z.string().regex(dayPattern),
    status: z.enum(["Open", "Locked"]),
  })
  .strict();
const sourceSchema = z
  .object({
    kind: z.string().min(1),
    id: z.string().min(1),
    action: z.string().min(1),
  })
  .strict();
const lineSchema = z
  .object({
    accountId: z.string().min(1),
    debitFils: z.string().regex(filsPattern),
    creditFils: z.string().regex(filsPattern),
    projectId: z.string().min(1).optional(),
    partyId: z.string().min(1).optional(),
  })
  .strict();
const journalSchema = z
  .object({
    id: z.string().min(1),
    postingKey: z.string().min(1),
    source: sourceSchema,
    date: z.string().regex(dayPattern),
    recordedAt: z.string().min(1),
    periodId: z.string().min(1),
    memo: z.string().min(1),
    currency: z.literal("AED"),
    lines: z.array(lineSchema).min(2),
    reversalOf: z.string().min(1).optional(),
  })
  .strict();
const accountingSchema = z
  .object({
    version: z.literal(1),
    accounts: z.array(accountSchema),
    periods: z.array(periodSchema),
    journals: z.array(journalSchema),
  })
  .strict();

export type SyntheticFinanceCommand =
  | { readonly kind: "AddAccount"; readonly account: Account }
  | { readonly kind: "AddPeriod"; readonly period: AccountingPeriod }
  | { readonly kind: "LockPeriod"; readonly periodId: string }
  | { readonly kind: "PostJournal"; readonly journal: PostJournalInput }
  | { readonly kind: "ReverseJournal"; readonly reversal: ReverseJournalInput };

export interface SyntheticFinanceEnvelope {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly recordedAt: string;
  readonly command: SyntheticFinanceCommand;
}

export interface FinanceAuditEvent {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly recordedAt: string;
  readonly command: SyntheticFinanceCommand;
  readonly journalId?: string;
}

export interface FinanceDemoState {
  readonly version: 1;
  readonly mode: "synthetic-demo";
  readonly fixtureId: string;
  readonly accounting: AccountingState;
  readonly audit: readonly FinanceAuditEvent[];
}

const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("AddAccount"), account: accountSchema }).strict(),
  z.object({ kind: z.literal("AddPeriod"), period: periodSchema }).strict(),
  z
    .object({ kind: z.literal("LockPeriod"), periodId: z.string().min(1) })
    .strict(),
  z
    .object({
      kind: z.literal("PostJournal"),
      journal: journalSchema.omit({ periodId: true, reversalOf: true }),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ReverseJournal"),
      reversal: z
        .object({
          id: z.string().min(1),
          postingKey: z.string().min(1),
          originalId: z.string().min(1),
          date: z.string().regex(dayPattern),
          recordedAt: z.string().min(1),
          reason: z.string().min(1),
        })
        .strict(),
    })
    .strict(),
]);
const auditSchema = z
  .object({
    id: z.string().min(1),
    idempotencyKey: z.string().min(1),
    actorId: z.string().min(1),
    recordedAt: z.string().min(1),
    command: commandSchema,
    journalId: z.string().min(1).optional(),
  })
  .strict();
const financeSchema = z
  .object({
    version: z.literal(1),
    mode: z.literal("synthetic-demo"),
    fixtureId: z.string().regex(fixtureIdPattern),
    accounting: accountingSchema,
    audit: z.array(auditSchema),
  })
  .strict();

function canonicalUtc(value: string) {
  if (
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw Error("Finance timestamp must be canonical UTC ISO 8601.");
}

function validDay(value: string) {
  if (!dayPattern.test(value)) throw Error("Finance date is invalid.");
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw Error("Finance date is invalid.");
}

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length)
    throw Error(`Duplicate ${label} in finance namespace.`);
}

const sourceKey = (journal: JournalEntry) =>
  JSON.stringify([
    journal.source.kind,
    journal.source.id,
    journal.source.action,
  ]);
const prefix = (fixtureId: string) => `fixture:${fixtureId}:`;

function validateAccounting(finance: FinanceDemoState) {
  const { accounts, periods, journals } = finance.accounting;
  const mark = prefix(finance.fixtureId);
  unique(
    accounts.map((a) => a.id),
    "account ID",
  );
  unique(
    accounts.map((a) => a.code),
    "account code",
  );
  unique(
    periods.map((p) => p.id),
    "period ID",
  );
  unique(
    journals.map((j) => j.id),
    "journal ID",
  );
  unique(
    journals.map((j) => j.postingKey),
    "posting key",
  );
  unique(journals.map(sourceKey), "source action");
  for (const account of accounts) {
    if (!account.id.startsWith(mark))
      throw Error("Finance account is not synthetic.");
    if (account.parentId) {
      const parent = accounts.find((a) => a.id === account.parentId);
      if (!parent || parent.postable || parent.type !== account.type)
        throw Error("Finance account hierarchy is invalid.");
    }
  }
  for (const period of periods) {
    if (!period.id.startsWith(mark))
      throw Error("Finance period is not synthetic.");
    validDay(period.start);
    validDay(period.end);
    if (period.start > period.end)
      throw Error("Finance period dates are invalid.");
    if (
      periods.some(
        (other) =>
          other.id !== period.id &&
          period.start <= other.end &&
          other.start <= period.end,
      )
    )
      throw Error("Finance periods overlap.");
  }
  for (const journal of journals) {
    if (!journal.id.startsWith(mark) || !journal.postingKey.startsWith(mark))
      throw Error("Finance posting is not synthetic.");
    canonicalUtc(journal.recordedAt);
    validDay(journal.date);
    const period = periods.find((p) => p.id === journal.periodId);
    if (!period || journal.date < period.start || journal.date > period.end)
      throw Error("Journal period/date relationship is invalid.");
    let debit = 0n,
      credit = 0n;
    for (const line of journal.lines) {
      const account = accounts.find((a) => a.id === line.accountId);
      if (!account?.postable)
        throw Error("Journal account relationship is invalid.");
      if (
        (line.projectId && !line.projectId.startsWith(mark)) ||
        (line.partyId && !line.partyId.startsWith(mark))
      )
        throw Error(
          "Real CRM dimension IDs are prohibited in demo finance state.",
        );
      const d = BigInt(line.debitFils),
        c = BigInt(line.creditFils);
      if (d > 0n === c > 0n)
        throw Error("Journal line needs one positive side.");
      debit += d;
      credit += c;
    }
    if (debit === 0n || debit !== credit)
      throw Error("Stored journal is unbalanced.");
    if (journal.reversalOf) {
      const original = journals.find((j) => j.id === journal.reversalOf);
      if (
        !original ||
        original.reversalOf ||
        journal.source.kind !== "Journal Reversal" ||
        journal.source.id !== original.id ||
        journal.source.action !== "Reverse"
      )
        throw Error("Journal reversal link is invalid.");
      const mirrored = original.lines.map((line) => ({
        ...line,
        debitFils: line.creditFils,
        creditFils: line.debitFils,
      }));
      if (JSON.stringify(journal.lines) !== JSON.stringify(mirrored))
        throw Error("Journal reversal does not mirror the original.");
    } else if (
      journal.source.kind !== "Synthetic Fixture" ||
      !journal.source.id.startsWith(mark)
    ) {
      throw Error("Real CRM source IDs are prohibited in demo finance state.");
    }
  }
  unique(
    journals.filter((j) => j.reversalOf).map((j) => j.reversalOf!),
    "journal reversal",
  );
}

export function validateFinanceDemoState(
  value: unknown,
): asserts value is FinanceDemoState {
  financeSchema.parse(value);
  const finance = value as FinanceDemoState;
  const mark = prefix(finance.fixtureId);
  validateAccounting(finance);
  unique(
    finance.audit.map((a) => a.id),
    "audit ID",
  );
  unique(
    finance.audit.map((a) => a.idempotencyKey),
    "audit idempotency key",
  );
  for (const event of finance.audit) {
    if (
      !event.id.startsWith(mark) ||
      !event.idempotencyKey.startsWith(mark) ||
      !event.actorId.startsWith(mark)
    )
      throw Error("Finance audit event is not synthetic.");
    canonicalUtc(event.recordedAt);
    if (
      event.command.kind === "PostJournal" ||
      event.command.kind === "ReverseJournal"
    ) {
      const expectedId =
        event.command.kind === "PostJournal"
          ? event.command.journal.id
          : event.command.reversal.id;
      const journal = finance.accounting.journals.find(
        (j) => j.id === expectedId,
      );
      if (event.journalId !== expectedId || !journal)
        throw Error(
          "Finance audit journal reference is missing or mismatched.",
        );
      if (event.command.kind === "PostJournal") {
        const input = event.command.journal;
        if (
          journal.reversalOf ||
          journal.postingKey !== input.postingKey ||
          journal.date !== input.date ||
          journal.recordedAt !== input.recordedAt ||
          journal.memo !== input.memo ||
          journal.currency !== input.currency ||
          JSON.stringify(journal.source) !== JSON.stringify(input.source) ||
          JSON.stringify(journal.lines) !== JSON.stringify(input.lines)
        )
          throw Error("Finance audit posting does not match its journal.");
      } else {
        const input = event.command.reversal;
        if (
          journal.reversalOf !== input.originalId ||
          journal.postingKey !== input.postingKey ||
          journal.date !== input.date ||
          journal.recordedAt !== input.recordedAt ||
          journal.memo !== input.reason
        )
          throw Error("Finance audit reversal does not match its journal.");
      }
    } else if (event.journalId) {
      throw Error("Non-journal finance audit event has a journal reference.");
    } else if (event.command.kind === "AddAccount") {
      const expected = event.command.account;
      const account = finance.accounting.accounts.find(
        (a) => a.id === expected.id,
      );
      if (!account || JSON.stringify(account) !== JSON.stringify(expected))
        throw Error("Finance account does not match its audit event.");
    } else if (event.command.kind === "AddPeriod") {
      const expected = event.command.period;
      const period = finance.accounting.periods.find(
        (p) => p.id === expected.id,
      );
      if (
        !period ||
        period.start !== expected.start ||
        period.end !== expected.end ||
        expected.status !== "Open"
      )
        throw Error("Finance period does not match its audit event.");
    } else if (event.command.kind === "LockPeriod") {
      const expectedId = event.command.periodId;
      const period = finance.accounting.periods.find(
        (p) => p.id === expectedId,
      );
      if (period?.status !== "Locked")
        throw Error("Finance period lock does not match its audit event.");
    }
  }
  unique(
    finance.audit.flatMap((a) => (a.journalId ? [a.journalId] : [])),
    "journal audit",
  );
  if (
    finance.accounting.journals.some(
      (j) => !finance.audit.some((a) => a.journalId === j.id),
    )
  )
    throw Error("Finance journal is missing its audit event.");
  if (
    finance.accounting.accounts.some(
      (account) =>
        !finance.audit.some(
          (event) =>
            event.command.kind === "AddAccount" &&
            event.command.account.id === account.id,
        ),
    )
  )
    throw Error("Finance account is missing its audit event.");
  if (
    finance.accounting.periods.some(
      (period) =>
        !finance.audit.some(
          (event) =>
            event.command.kind === "AddPeriod" &&
            event.command.period.id === period.id,
        ) ||
        (period.status === "Locked" &&
          !finance.audit.some(
            (event) =>
              event.command.kind === "LockPeriod" &&
              event.command.periodId === period.id,
          )),
    )
  )
    throw Error("Finance period is missing its audit event.");
}

export function createEmptyFinanceDemoState(
  fixtureId: string,
): FinanceDemoState {
  if (!fixtureIdPattern.test(fixtureId))
    throw Error("Invalid synthetic fixture ID.");
  return {
    version: 1,
    mode: "synthetic-demo",
    fixtureId,
    accounting: emptyAccounting(),
    audit: [],
  };
}

export function dispatchSyntheticFinance(
  finance: FinanceDemoState,
  envelope: SyntheticFinanceEnvelope,
): FinanceDemoState {
  validateFinanceDemoState(finance);
  auditSchema.omit({ journalId: true }).parse(envelope);
  const mark = prefix(finance.fixtureId);
  if (
    ![envelope.id, envelope.idempotencyKey, envelope.actorId].every((id) =>
      id.startsWith(mark),
    )
  )
    throw Error("Synthetic command identity must match the fixture.");
  canonicalUtc(envelope.recordedAt);
  const prior = finance.audit.find(
    (a) => a.idempotencyKey === envelope.idempotencyKey,
  );
  if (prior) {
    if (
      prior.id !== envelope.id ||
      prior.actorId !== envelope.actorId ||
      prior.recordedAt !== envelope.recordedAt ||
      JSON.stringify(prior.command) !== JSON.stringify(envelope.command)
    )
      throw Error(
        "Finance idempotency key was reused for a different command.",
      );
    return finance;
  }
  if (finance.audit.some((a) => a.id === envelope.id))
    throw Error("Finance audit ID is already in use.");
  const command = envelope.command;
  let accounting: AccountingState = finance.accounting;
  let journalId: string | undefined;
  switch (command.kind) {
    case "AddAccount":
      if (!command.account.id.startsWith(mark))
        throw Error("Account must be synthetic.");
      accounting = addAccount(accounting, command.account);
      break;
    case "AddPeriod":
      if (!command.period.id.startsWith(mark))
        throw Error("Period must be synthetic.");
      accounting = addPeriod(accounting, command.period);
      break;
    case "LockPeriod":
      accounting = lockPeriod(accounting, command.periodId);
      break;
    case "PostJournal": {
      const input = command.journal;
      if (
        !input.id.startsWith(mark) ||
        !input.postingKey.startsWith(mark) ||
        input.source.kind !== "Synthetic Fixture" ||
        !input.source.id.startsWith(mark)
      )
        throw Error("Real CRM source IDs are prohibited in demo postings.");
      const result = postJournal(accounting, input);
      if (result.state === accounting)
        throw Error("Journal already belongs to another finance command.");
      accounting = result.state;
      journalId = result.journal.id;
      break;
    }
    case "ReverseJournal": {
      const input = command.reversal;
      if (!input.id.startsWith(mark) || !input.postingKey.startsWith(mark))
        throw Error("Reversal must be synthetic.");
      const result = reverseJournal(accounting, input);
      if (result.state === accounting)
        throw Error("Reversal already belongs to another finance command.");
      accounting = result.state;
      journalId = result.journal.id;
      break;
    }
  }
  const next: FinanceDemoState = {
    ...finance,
    accounting,
    audit: [
      ...finance.audit,
      {
        id: envelope.id,
        idempotencyKey: envelope.idempotencyKey,
        actorId: envelope.actorId,
        recordedAt: envelope.recordedAt,
        command: structuredClone(command),
        ...(journalId ? { journalId } : {}),
      },
    ],
  };
  validateFinanceDemoState(next);
  return next;
}

function savedRoot(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).version !== 1
  )
    throw Error("Saved CRM data is incompatible with finance demo adapter.");
  return value as Record<string, unknown>;
}

export function readOptionalFinanceFromSavedJson(
  raw: string,
): FinanceDemoState | undefined {
  const root = savedRoot(raw);
  if (root.finance === undefined) return undefined;
  validateFinanceDemoState(root.finance);
  return root.finance;
}

export function serializeSyntheticFinanceFixture(
  raw: string,
  finance: FinanceDemoState,
): string {
  const root = savedRoot(raw);
  validateFinanceDemoState(finance);
  const marker = root.financeFixture;
  if (
    !marker ||
    typeof marker !== "object" ||
    Array.isArray(marker) ||
    (marker as Record<string, unknown>).mode !== "synthetic-demo" ||
    (marker as Record<string, unknown>).id !== finance.fixtureId
  )
    throw Error(
      "Only an explicitly marked synthetic fixture can store finance journals.",
    );
  if (root.finance !== undefined) {
    validateFinanceDemoState(root.finance);
    if (root.finance.fixtureId !== finance.fixtureId)
      throw Error("Finance fixture identity cannot change.");
    const previous = root.finance;
    for (const collection of ["accounts", "journals"] as const) {
      const before = previous.accounting[collection];
      const after = finance.accounting[collection];
      if (
        before.length > after.length ||
        before.some(
          (entry, index) =>
            JSON.stringify(entry) !== JSON.stringify(after[index]),
        )
      )
        throw Error("Synthetic finance history is append-only.");
    }
    if (
      previous.audit.length > finance.audit.length ||
      previous.audit.some(
        (event, index) =>
          JSON.stringify(event) !== JSON.stringify(finance.audit[index]),
      )
    )
      throw Error("Synthetic finance audit history is append-only.");
    if (previous.accounting.periods.length > finance.accounting.periods.length)
      throw Error("Accounting periods cannot be removed.");
    for (const oldPeriod of previous.accounting.periods) {
      const nextPeriod = finance.accounting.periods.find(
        (p) => p.id === oldPeriod.id,
      );
      if (
        !nextPeriod ||
        nextPeriod.start !== oldPeriod.start ||
        nextPeriod.end !== oldPeriod.end ||
        (oldPeriod.status === "Locked" && nextPeriod.status !== "Locked")
      )
        throw Error("Accounting period history cannot be rewritten.");
    }
  }
  return JSON.stringify({ ...root, finance });
}

export function dispatchSyntheticFinanceInSavedJson(
  raw: string,
  envelope: SyntheticFinanceEnvelope,
): string {
  const finance = readOptionalFinanceFromSavedJson(raw);
  if (!finance)
    throw Error("Explicit synthetic finance initialization is required.");
  const next = dispatchSyntheticFinance(finance, envelope);
  if (next === finance) return raw;
  return serializeSyntheticFinanceFixture(raw, next);
}
