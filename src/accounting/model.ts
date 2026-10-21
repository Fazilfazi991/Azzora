// Browser-local accounting contract. Monetary values are decimal integer fils so
// they survive JSON persistence without floating-point rounding or BigInt loss.
export type Fils = string;
export type AccountType =
  "Asset" | "Liability" | "Equity" | "Income" | "Cost of Sales" | "Expense";

export interface Account {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly parentId?: string;
  readonly postable: boolean;
  readonly status: "Active" | "Archived";
}

export interface AccountingPeriod {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly status: "Open" | "Locked";
}

export interface JournalLine {
  readonly accountId: string;
  readonly debitFils: Fils;
  readonly creditFils: Fils;
  readonly projectId?: string;
  readonly partyId?: string;
}

export interface JournalSource {
  readonly kind: string;
  readonly id: string;
  readonly action: string;
}

export interface JournalEntry {
  readonly id: string;
  readonly postingKey: string;
  readonly source: JournalSource;
  readonly date: string;
  readonly recordedAt: string;
  readonly periodId: string;
  readonly memo: string;
  readonly currency: "AED";
  readonly lines: readonly JournalLine[];
  readonly reversalOf?: string;
}

export interface AccountingState {
  readonly version: 1;
  readonly accounts: readonly Account[];
  readonly periods: readonly AccountingPeriod[];
  readonly journals: readonly JournalEntry[];
}

export interface PostJournalInput {
  readonly id: string;
  readonly postingKey: string;
  readonly source: JournalSource;
  readonly date: string;
  readonly recordedAt: string;
  readonly memo: string;
  readonly currency: "AED";
  readonly lines: readonly JournalLine[];
}

export interface ReverseJournalInput {
  readonly id: string;
  readonly postingKey: string;
  readonly originalId: string;
  readonly date: string;
  readonly recordedAt: string;
  readonly reason: string;
}
