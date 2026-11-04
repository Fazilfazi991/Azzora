import { createHash } from "node:crypto";
import type {
  Account,
  AccountingPeriod,
  JournalEntry,
  JournalLine,
} from "../accounting/model";
import type { Database } from "../domain/model";
import type { ReviewState } from "../accounts-review/domain";
import { cashAccountsFor, departments } from "../accounts-review/banking";
import { createSharedCompanyState, type SharedCompanyState } from "./domain";
import { refreshCommercialView } from "./commercial-commands";

export interface CanonicalRecord {
  entity_type: string;
  id: string;
  project_id: string | null;
  party_id: string | null;
  department_id: string | null;
  payload: Record<string, unknown>;
  status: string;
}
export interface CanonicalJournal {
  id: string;
  posting_key: string;
  source_type: string;
  source_id: string;
  source_action: string;
  domain_source: JournalEntry["source"];
  reversal_of?: string;
  posting_date: string;
  period_id: string;
  memo: string;
  currency: "AED";
  recorded_at: string;
  lines: {
    line_no: number;
    account_id: string;
    debit_fils: string;
    credit_fils: string;
    project_id: string | null;
    party_id: string | null;
    department_id: string | null;
    domain_dimensions?: {
      partyId?: string;
      projectId?: string;
      departmentId?: string;
    };
  }[];
}
export interface CanonicalData {
  parties: {
    id: string;
    kind: "customer" | "supplier" | "both";
    payload: Record<string, unknown>;
  }[];
  projects: {
    id: string;
    customer_id: string | null;
    payload: Record<string, unknown>;
  }[];
  departments: { id: string; name: string }[];
  records: CanonicalRecord[];
  accounts: {
    id: string;
    code: string;
    name: string;
    type: string;
    postable: boolean;
    active: boolean;
  }[];
  periods: {
    id: string;
    start_date: string;
    end_date: string;
    locked: boolean;
  }[];
  journals: CanonicalJournal[];
  snapshots: {
    entity_type: string;
    entity_id: string;
    revision: number;
    payload: unknown;
    sha256: string;
  }[];
}
const managedCollections = {
  people: "employee",
  phases: "phase",
  assignments: "assignment",
  tasks: "task",
  milestones: "milestone",
  updates: "site_update",
  snags: "snag",
  documents: "document",
  handover: "handover",
  quotations: "quotation",
  contracts: "contract",
  invoices: "sales_invoice",
  payments: "receipt",
  expenses: "expense",
  planning: "planning",
} as const;
const operationCollections = {
  variations: "variation",
  materials: "material",
  requests: "purchase_request",
  rfqs: "rfq",
  quotes: "supplier_quote",
  orders: "purchase_order",
  deliveries: "delivery",
  bills: "supplier_bill",
  supplierPayments: "supplier_payment",
  credits: "credit_note",
  refunds: "refund",
  budgets: "budget",
  approvals: "approval",
} as const;
const financialCollections = {
  invoices: "sales_invoice",
  bills: "supplier_bill",
  receipts: "receipt",
  supplierPayments: "supplier_payment",
  expenses: "expense",
  transfers: "transfer",
  expenseLedgers: "expense_ledger",
} as const;
const plain = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? { $fils: item.toString() } : item,
    ),
  ) as unknown;
const revive = <T>(value: unknown): T =>
  JSON.parse(JSON.stringify(value), (_key, item) =>
    item &&
    typeof item === "object" &&
    Object.keys(item).length === 1 &&
    typeof item.$fils === "string"
      ? BigInt(item.$fils)
      : item,
  ) as T;
function sorted(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(sorted).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${sorted((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}
const digest = (value: unknown) =>
  createHash("sha256")
    .update(sorted(plain(value)))
    .digest("hex");

/** One canonical row per entity; Manager and Accountant representations are compatible views of that row. */
export function serializeCanonical(state: SharedCompanyState): CanonicalData {
  if (state.mode !== "fictional-staging")
    throw Error(
      "Canonical serialization requires explicit fictional staging scope.",
    );
  const records = new Map<string, CanonicalRecord>();
  const add = (type: string, id: string, field: string, value: unknown) => {
    if (!id) throw Error(`Canonical ${type} ID is missing.`);
    const key = JSON.stringify([type, id]);
    const entity = value as Record<string, unknown>;
    const record = records.get(key) || {
      entity_type: type,
      id,
      project_id: null,
      party_id: null,
      department_id: null,
      payload: {},
      status: "draft",
    };
    if (record.payload[field])
      throw Error(`Duplicate canonical ${type} record ${id}.`);
    record.payload[field] = plain(value);
    if (typeof entity.projectId === "string" && entity.projectId)
      record.project_id = entity.projectId;
    if (typeof entity.customerId === "string" && entity.customerId)
      record.party_id = entity.customerId;
    if (typeof entity.supplierId === "string" && entity.supplierId)
      record.party_id = entity.supplierId;
    if (typeof entity.departmentId === "string" && entity.departmentId)
      record.department_id = entity.departmentId;
    if (typeof entity.status === "string")
      record.status = entity.status.toLowerCase();
    records.set(key, record);
  };
  const managerMeta = structuredClone(state.manager) as unknown as Record<
    string,
    unknown
  >;
  for (const [key, type] of Object.entries(managedCollections)) {
    const values =
      (state.manager as unknown as Record<string, unknown[]>)[key] || [];
    values.forEach((value, index) => {
      const item = value as { id?: string; projectId?: string };
      add(
        type,
        item.id || `${key}:${item.projectId || index}`,
        "manager",
        value,
      );
    });
    delete managerMeta[key];
  }
  delete managerMeta.clients;
  delete managerMeta.projects;
  delete managerMeta.operations;
  const operations = state.manager.operations!;
  const operationMeta = structuredClone(operations) as unknown as Record<
    string,
    unknown
  >;
  for (const [key, type] of Object.entries(operationCollections)) {
    for (const item of (
      operations as unknown as Record<string, { id: string }[]>
    )[key])
      add(type, item.id, "operations", item);
    delete operationMeta[key];
  }
  delete operationMeta.suppliers;
  const financeMeta = structuredClone(state.finance) as unknown as Record<
    string,
    unknown
  >;
  for (const [key, type] of Object.entries(financialCollections)) {
    for (const item of (
      state.finance as unknown as Record<string, { id: string }[]>
    )[key] || [])
      add(type, item.id, "finance", item);
    delete financeMeta[key];
  }
  for (const account of cashAccountsFor(state.finance))
    add("cash_account", account.id, "finance", account);
  delete financeMeta.cashAccounts;
  delete financeMeta.accounting;
  delete financeMeta.documentCatalog;
  delete financeMeta.commercialAdjustments;
  for (const attachment of state.finance.attachments)
    add("document", `attachment:${attachment.id}`, "attachment", attachment);
  delete financeMeta.attachments;
  for (const review of state.finance.documentEntries?.reviews || [])
    add("document", `review:${review.id}`, "review", review);
  delete financeMeta.documentEntries;
  for (const submission of state.expenseSubmissions)
    add("expense", submission.id, "submission", submission);
  add("workspace_metadata", "__staging_metadata", "metadata", {
    version: 1,
    mode: state.mode,
    manager: managerMeta,
    operations: operationMeta,
    finance: financeMeta,
    documentEntryVersion: state.finance.documentEntries?.version || 1,
    documentDefaults: state.finance.documentEntries?.defaults || [],
  });

  const parties = new Map<string, CanonicalData["parties"][number]>();
  for (const client of state.manager.clients)
    parties.set(client.id, {
      id: client.id,
      kind: "customer",
      payload: { manager: plain(client) },
    });
  for (const supplier of operations.suppliers) {
    const old = parties.get(supplier.id);
    parties.set(supplier.id, {
      id: supplier.id,
      kind: old ? "both" : "supplier",
      payload: { ...old?.payload, supplier: plain(supplier) },
    });
  }
  // Finance-only counterparties still resolve to one normalized company party.
  const normalized = (name: string) =>
    name
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  const partyForName = (name: string, side: "customer" | "supplier") => {
    const found = [...parties.values()].filter((party) => {
      const candidate = (party.payload[
        side === "customer" ? "manager" : "supplier"
      ] || party.payload.finance) as { name?: string } | undefined;
      return candidate?.name && normalized(candidate.name) === normalized(name);
    });
    if (found.length > 1)
      throw Error(
        "Counterparty name is ambiguous; use a unique canonical party ID.",
      );
    return found[0]?.id;
  };
  for (const invoice of state.finance.invoices) {
    const row = records.get(JSON.stringify(["sales_invoice", invoice.id]))!;
    row.party_id ||= partyForName(invoice.party, "customer") || null;
  }
  for (const bill of state.finance.bills) {
    let partyId = partyForName(bill.party, "supplier");
    if (!partyId) {
      partyId = `finance-supplier:${createHash("sha256").update(normalized(bill.party)).digest("hex").slice(0, 24)}`;
      parties.set(partyId, {
        id: partyId,
        kind: "supplier",
        payload: { finance: { name: bill.party, id: partyId } },
      });
    }
    records.get(JSON.stringify(["supplier_bill", bill.id]))!.party_id ||=
      partyId;
  }
  const allRecords = [...records.values()];
  const canonicalParty = (id: string | undefined) => {
    if (!id) return null;
    if (parties.has(id)) return id;
    const matches = [...parties.values()].filter((party) =>
      Object.values(party.payload).some(
        (value) =>
          value &&
          typeof value === "object" &&
          typeof (value as { name?: unknown }).name === "string" &&
          normalized(String((value as { name: string }).name)) ===
            normalized(id),
      ),
    );
    if (matches.length !== 1)
      throw Error(
        "Journal party dimension has no unique canonical counterparty.",
      );
    return matches[0].id;
  };
  const sourceRecord = (
    entry: JournalEntry,
    visited = new Set<string>(),
  ): { type: string; id: string } => {
    if (visited.has(entry.id))
      throw Error("Journal reversal source contains a cycle.");
    visited.add(entry.id);
    if (entry.reversalOf || entry.source.kind === "Journal Reversal") {
      const original = state.finance.accounting.journals.find(
        (value) => value.id === (entry.reversalOf || entry.source.id),
      );
      if (!original) throw Error("Journal reversal original is missing.");
      return sourceRecord(original, visited);
    }
    if (entry.source.kind === "cash_account")
      return { type: "cash_account", id: entry.source.id };
    const candidates = allRecords.filter(
      (record) =>
        record.id === entry.source.id &&
        [
          "sales_invoice",
          "supplier_bill",
          "receipt",
          "supplier_payment",
          "expense",
          "transfer",
          "credit_note",
          "refund",
        ].includes(record.entity_type),
    );
    if (candidates.length !== 1)
      throw Error(`Journal ${entry.id} has no unique canonical source.`);
    return { type: candidates[0].entity_type, id: candidates[0].id };
  };
  const snapshots: CanonicalData["snapshots"] = [];
  for (const record of allRecords) {
    const item = record.payload.manager as
      { status?: string; revision?: number } | undefined;
    if (
      (record.entity_type === "quotation" && item?.status === "Accepted") ||
      (record.entity_type === "sales_invoice" && item?.status === "Issued") ||
      record.entity_type === "contract"
    ) {
      const payload = record.payload.manager;
      snapshots.push({
        entity_type: record.entity_type,
        entity_id: record.id,
        revision: (item?.revision || 0) + 1,
        payload,
        sha256: digest(payload),
      });
    }
    const submission = record.payload.submission as
      { approvalSnapshot?: string } | undefined;
    if (submission?.approvalSnapshot)
      snapshots.push({
        entity_type: "expense",
        entity_id: record.id,
        revision: 1,
        payload: submission.approvalSnapshot,
        sha256: digest(submission.approvalSnapshot),
      });
  }
  const retained = new Map<string, CanonicalData["snapshots"][number]>();
  for (const snapshot of [...(state.canonicalSnapshots || []), ...snapshots]) {
    const key = JSON.stringify([
      snapshot.entity_type,
      snapshot.entity_id,
      snapshot.revision,
    ]);
    const existing = retained.get(key);
    if (
      existing &&
      (existing.sha256 !== snapshot.sha256 ||
        sorted(existing.payload) !== sorted(snapshot.payload))
    )
      throw Error("Immutable canonical snapshot changed.");
    retained.set(key, structuredClone(snapshot));
  }
  return {
    parties: [...parties.values()],
    projects: state.manager.projects.map((project) => ({
      id: project.id,
      customer_id: project.clientId || null,
      payload: { manager: plain(project) },
    })),
    departments: departments.map((item) => ({ ...item })),
    records: allRecords,
    accounts: state.finance.accounting.accounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      postable: account.postable,
      active: account.status === "Active",
    })),
    periods: state.finance.accounting.periods.map((period) => ({
      id: period.id,
      start_date: period.start,
      end_date: period.end,
      locked: period.status === "Locked",
    })),
    journals: state.finance.accounting.journals.map((entry) => ({
      id: entry.id,
      posting_key: entry.postingKey,
      source_type: sourceRecord(entry).type,
      source_id: sourceRecord(entry).id,
      source_action: entry.source.action,
      domain_source: entry.source,
      ...(entry.reversalOf ? { reversal_of: entry.reversalOf } : {}),
      posting_date: entry.date,
      period_id: entry.periodId,
      memo: entry.memo,
      currency: entry.currency,
      recorded_at: entry.recordedAt,
      lines: entry.lines.map((line, index) => ({
        line_no: index + 1,
        account_id: line.accountId,
        debit_fils: line.debitFils,
        credit_fils: line.creditFils,
        project_id: line.projectId || null,
        party_id: canonicalParty(line.partyId),
        department_id:
          (line as JournalLine & { departmentId?: string }).departmentId ||
          null,
        domain_dimensions: {
          ...(line.partyId ? { partyId: line.partyId } : {}),
          ...(line.projectId ? { projectId: line.projectId } : {}),
          ...((line as JournalLine & { departmentId?: string }).departmentId
            ? {
                departmentId: (line as JournalLine & { departmentId?: string })
                  .departmentId,
              }
            : {}),
        },
      })),
    })),
    snapshots: [...retained.values()],
  };
}

/** Reconstructs views from normalized authoritative records. No seeded company records are merged in. */
export function hydrateCanonical(data: CanonicalData): SharedCompanyState {
  const meta = data.records.find(
    (record) =>
      record.entity_type === "workspace_metadata" &&
      record.id === "__staging_metadata",
  )?.payload.metadata as Record<string, unknown> | undefined;
  if (!meta || meta.mode !== "fictional-staging" || meta.version !== 1)
    throw Error("Fictional company metadata is missing or incompatible.");
  if (
    meta.documentEntryVersion !== undefined &&
    meta.documentEntryVersion !== 1
  )
    throw Error(
      "Document entry metadata is incompatible; preserve the original records for recovery.",
    );
  const state = createSharedCompanyState();
  state.canonicalSnapshots = structuredClone(data.snapshots || []);
  state.manager = revive<Database>({
    ...(meta.manager as object),
    operations: { ...(meta.operations as object) },
  });
  for (const key of Object.keys(managedCollections))
    (state.manager as unknown as Record<string, unknown[]>)[key] = [];
  for (const key of Object.keys(operationCollections))
    (state.manager.operations as unknown as Record<string, unknown[]>)[key] =
      [];
  state.manager.clients = [];
  state.manager.projects = [];
  state.manager.operations!.suppliers = [];
  state.finance = revive<ReviewState>({
    ...(meta.finance as object),
    accounting: { version: 1, accounts: [], periods: [], journals: [] },
    attachments: [],
    cashAccounts: [],
    documentEntries: {
      version: 1,
      reviews: [],
      defaults: meta.documentDefaults || [],
    },
  });
  for (const key of Object.keys(financialCollections))
    (state.finance as unknown as Record<string, unknown[]>)[key] = [];
  state.expenseSubmissions = [];
  for (const party of data.parties) {
    if (party.payload.manager)
      state.manager.clients.push(revive(party.payload.manager));
    if (party.payload.supplier)
      state.manager.operations!.suppliers.push(revive(party.payload.supplier));
  }
  for (const project of data.projects)
    state.manager.projects.push(revive(project.payload.manager));
  for (const record of data.records) {
    for (const [key, type] of Object.entries(managedCollections))
      if (type === record.entity_type && record.payload.manager)
        (state.manager as unknown as Record<string, unknown[]>)[key].push(
          revive(record.payload.manager),
        );
    for (const [key, type] of Object.entries(operationCollections))
      if (type === record.entity_type && record.payload.operations)
        (state.manager.operations as unknown as Record<string, unknown[]>)[
          key
        ].push(revive(record.payload.operations));
    for (const [key, type] of Object.entries(financialCollections))
      if (type === record.entity_type && record.payload.finance)
        (state.finance as unknown as Record<string, unknown[]>)[key].push(
          revive(record.payload.finance),
        );
    if (
      record.entity_type === "cash_account" &&
      record.payload.finance &&
      !["bank", "cash"].includes(record.id)
    )
      state.finance.cashAccounts!.push(revive(record.payload.finance));
    if (record.payload.attachment)
      state.finance.attachments.push(revive(record.payload.attachment));
    if (record.payload.review)
      state.finance.documentEntries!.reviews.push(
        revive(record.payload.review),
      );
    if (record.payload.submission)
      state.expenseSubmissions.push(revive(record.payload.submission));
  }
  const accounts: Account[] = data.accounts.map((account) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type as Account["type"],
    postable: account.postable,
    status: account.active ? "Active" : "Archived",
  }));
  const periods: AccountingPeriod[] = data.periods.map((period) => ({
    id: period.id,
    start: period.start_date,
    end: period.end_date,
    status: period.locked ? "Locked" : "Open",
  }));
  const journals: JournalEntry[] = data.journals.map((entry) => ({
    id: entry.id,
    postingKey: entry.posting_key,
    source: entry.domain_source || {
      kind: entry.source_type,
      id: entry.source_id,
      action: entry.source_action,
    },
    date: entry.posting_date,
    periodId: entry.period_id,
    memo: entry.memo,
    currency: entry.currency,
    recordedAt: entry.recorded_at,
    ...(entry.reversal_of ? { reversalOf: entry.reversal_of } : {}),
    lines: [...entry.lines]
      .sort((a, b) => a.line_no - b.line_no)
      .map((line) => ({
        accountId: line.account_id,
        debitFils: String(line.debit_fils),
        creditFils: String(line.credit_fils),
        ...(line.project_id ? { projectId: line.project_id } : {}),
        ...(line.domain_dimensions?.partyId || line.party_id
          ? { partyId: line.domain_dimensions?.partyId || line.party_id! }
          : {}),
        ...(line.department_id ? { departmentId: line.department_id } : {}),
      })),
  }));
  state.finance.accounting = { version: 1, accounts, periods, journals };
  state.finance.documentCatalog = {
    suppliers: state.manager.operations!.suppliers.map(
      (supplier) => supplier.name,
    ),
    customers: state.manager.clients.map((client) => ({
      id: client.id,
      name: client.name,
    })),
    projects: state.manager.projects.map((project) => ({
      id: project.id,
      name: project.name,
    })),
    products: [],
  };
  refreshCommercialView(state);
  return state;
}
