/** Pure receivable/payable settlement rules. All money is integer fils. */
export type SettlementSide = "receivable" | "payable";

export interface SettlementDocument {
  id: string;
  side: SettlementSide;
  partyId: string;
  issuedOn: string;
  dueOn: string;
  /** Eligible open amount after any separately approved credit adjustments. */
  amountFils: bigint;
}

export interface DocumentAllocation {
  documentId: string;
  amountFils: bigint;
}

export interface PostedSettlement {
  type: "posted";
  id: string;
  postingKey: string;
  side: SettlementSide;
  partyId: string;
  date: string;
  amountFils: bigint;
  allocations: DocumentAllocation[];
}

export interface SettlementReversal {
  type: "reversed";
  id: string;
  settlementId: string;
  date: string;
  reason: string;
}

export type SettlementEvent = PostedSettlement | SettlementReversal;

export interface SettlementPosition {
  allocatedFils: bigint;
  unallocatedFils: bigint;
}

export type AgeingBucket = "Current" | "1–30" | "31–60" | "61–90" | "90+";

export interface DocumentAgeing {
  documentId: string;
  asOf: string;
  outstandingFils: bigint;
  daysOverdue: number;
  bucket: AgeingBucket;
}

/** Strict AED decimal adapter; never rounds a fractional fils. */
export function parseFils(value: string): bigint {
  const input = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match)
    throw Error("Enter a non-negative amount with at most two decimals.");
  return BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
}

function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw Error("Use a valid YYYY-MM-DD date.");
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw Error("Use a valid YYYY-MM-DD date.");
  return Math.floor(date.getTime() / 86_400_000);
}

function activePosts(events: readonly SettlementEvent[], asOf: string) {
  const cutoff = dayNumber(asOf);
  const reversed = new Set(
    events
      .filter((event): event is SettlementReversal => event.type === "reversed")
      .filter((event) => dayNumber(event.date) <= cutoff)
      .map((event) => event.settlementId),
  );
  return events
    .filter((event): event is PostedSettlement => event.type === "posted")
    .filter(
      (event) => dayNumber(event.date) <= cutoff && !reversed.has(event.id),
    );
}

export function documentOutstanding(
  document: SettlementDocument,
  events: readonly SettlementEvent[],
  asOf: string,
): bigint {
  if (document.amountFils < 0n)
    throw Error("Document amount cannot be negative.");
  if (dayNumber(document.issuedOn) > dayNumber(asOf)) return 0n;
  const allocated = activePosts(events, asOf)
    .filter(
      (post) =>
        post.side === document.side && post.partyId === document.partyId,
    )
    .flatMap((post) => post.allocations)
    .filter((allocation) => allocation.documentId === document.id)
    .reduce((sum, allocation) => sum + allocation.amountFils, 0n);
  if (allocated > document.amountFils)
    throw Error(`Document ${document.id} has over-allocated history.`);
  return document.amountFils - allocated;
}

export function settlementPosition(
  settlement: PostedSettlement,
  events: readonly SettlementEvent[],
  asOf: string,
): SettlementPosition {
  const active = activePosts(events, asOf).some(
    (post) => post.id === settlement.id,
  );
  if (!active) return { allocatedFils: 0n, unallocatedFils: 0n };
  const allocatedFils = settlement.allocations.reduce(
    (sum, allocation) => sum + allocation.amountFils,
    0n,
  );
  if (allocatedFils > settlement.amountFils || allocatedFils < 0n)
    throw Error("Settlement has invalid allocation history.");
  return {
    allocatedFils,
    unallocatedFils: settlement.amountFils - allocatedFils,
  };
}

/** Validates exactly the selected documents; no implicit oldest-first allocation. */
export function postSettlement(
  documents: readonly SettlementDocument[],
  events: readonly SettlementEvent[],
  input: PostedSettlement,
): SettlementEvent[] {
  if (
    input.type !== "posted" ||
    !input.id.trim() ||
    !input.postingKey.trim() ||
    !input.partyId.trim()
  )
    throw Error("Settlement identity, posting key and party are required.");
  const postingDay = dayNumber(input.date);
  if (input.amountFils <= 0n)
    throw Error("Settlement amount must be positive.");
  if (events.some((event) => event.id === input.id))
    throw Error("Settlement event ID already exists.");
  if (
    events.some(
      (event) =>
        event.type === "posted" && event.postingKey === input.postingKey,
    )
  )
    throw Error("Settlement posting key already exists.");
  const ids = input.allocations.map((allocation) => allocation.documentId);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length)
    throw Error("Choose each document at most once.");
  const documentById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const allocated = input.allocations.reduce((sum, allocation) => {
    if (allocation.amountFils <= 0n)
      throw Error("Each document allocation must be positive.");
    const document = documentById.get(allocation.documentId);
    if (!document) throw Error("Selected document was not found.");
    if (document.side !== input.side || document.partyId !== input.partyId)
      throw Error(
        "Selected documents must belong to the same party and ledger side.",
      );
    if (dayNumber(document.issuedOn) > postingDay)
      throw Error("Settlement cannot precede document issue date.");
    if (
      allocation.amountFils > documentOutstanding(document, events, input.date)
    )
      throw Error("Allocation exceeds the selected document balance.");
    return sum + allocation.amountFils;
  }, 0n);
  if (allocated > input.amountFils)
    throw Error("Allocations exceed the settlement amount.");
  // Empty or partial allocations are explicit advances, never inferred allocations.
  return [...events, structuredClone(input)];
}

/** Appends a correction event while retaining the original posted event. */
export function reverseSettlement(
  events: readonly SettlementEvent[],
  reversal: SettlementReversal,
): SettlementEvent[] {
  if (
    reversal.type !== "reversed" ||
    !reversal.id.trim() ||
    !reversal.reason.trim()
  )
    throw Error("Reversal ID and reason are required.");
  if (events.some((event) => event.id === reversal.id))
    throw Error("Settlement event ID already exists.");
  const posted = events.find(
    (event): event is PostedSettlement =>
      event.type === "posted" && event.id === reversal.settlementId,
  );
  if (!posted) throw Error("Posted settlement was not found.");
  if (
    events.some(
      (event) => event.type === "reversed" && event.settlementId === posted.id,
    )
  )
    throw Error("Settlement is already reversed.");
  if (dayNumber(reversal.date) < dayNumber(posted.date))
    throw Error("Reversal date cannot precede settlement date.");
  return [...events, structuredClone(reversal)];
}

/** Age is always measured from the selected document's own due date. */
export function documentAgeing(
  document: SettlementDocument,
  events: readonly SettlementEvent[],
  asOf: string,
): DocumentAgeing {
  const due = dayNumber(document.dueOn);
  const date = dayNumber(asOf);
  const outstandingFils = documentOutstanding(document, events, asOf);
  const daysOverdue = outstandingFils > 0n ? Math.max(0, date - due) : 0;
  const bucket: AgeingBucket =
    daysOverdue === 0
      ? "Current"
      : daysOverdue <= 30
        ? "1–30"
        : daysOverdue <= 60
          ? "31–60"
          : daysOverdue <= 90
            ? "61–90"
            : "90+";
  return {
    documentId: document.id,
    asOf,
    outstandingFils,
    daysOverdue,
    bucket,
  };
}
