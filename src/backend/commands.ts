import { createHash } from "node:crypto";
import { postJournal } from "../accounting/core";
import type { AccountingState, PostJournalInput } from "../accounting/model";
import {
  authorize,
  type AuthorizedActor,
  type BackendAction,
} from "./permissions";

/** Local integration contract, deliberately not connected to either live application. */
export interface CanonicalAggregate {
  version: number;
  documents: Record<string, unknown>;
  accounting: AccountingState;
}
export interface CommandEnvelope {
  companyId: string;
  kind: string;
  idempotencyKey: string;
  expectedVersion: number;
  payload: unknown;
}
export interface CommandReceipt {
  fingerprint: string;
  actorId: string;
  version: number;
}
export interface ApprovedPolicy {
  id: string;
  postingEnabled: boolean;
  accountingBasisApproved: boolean;
  vatApproved: boolean;
  authorityApproved: boolean;
  openingBalancesApproved: boolean;
}
export interface CanonicalTransaction {
  /** Must query/lock current session, membership and policy inside the DB transaction. */
  currentActor(): Promise<AuthorizedActor>;
  policy(): Promise<ApprovedPolicy | null>;
  receipt(key: string): Promise<CommandReceipt | null>;
  loadForUpdate(): Promise<CanonicalAggregate>;
  /** All writes below must roll back together, including audit and receipt. */
  save(next: CanonicalAggregate): Promise<void>;
  appendAudit(event: {
    actorId: string;
    companyId: string;
    kind: string;
    version: number;
    policyId: string | null;
  }): Promise<void>;
  recordReceipt(key: string, receipt: CommandReceipt): Promise<void>;
}
export interface CanonicalRepository {
  /** Company lock + SERIALIZABLE/row locking, unique company/key, bounded conflict reporting; no blind retries. */
  transaction<T>(
    companyId: string,
    execute: (tx: CanonicalTransaction) => Promise<T>,
  ): Promise<T>;
}
export interface DomainAdapter {
  action: BackendAction;
  /** Server registry declares whether this command can cause ANY financial transition. */
  financial: boolean;
  /** Derive resource scope from locked persisted records; never trust client project/submittedBy. */
  resource(
    state: CanonicalAggregate,
    payload: unknown,
  ): { projectId?: string; submittedBy?: string };
  /** Invoke the existing commercial/operational domain command; never duplicate its calculations. */
  prepare(
    state: CanonicalAggregate,
    payload: unknown,
    actor: AuthorizedActor,
  ): {
    documents: CanonicalAggregate["documents"];
    journals: PostJournalInput[];
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  throw Error("Command payload must contain JSON values only.");
}

/** The only proposed shared write coordinator. No seed/demo state is ever created here. */
export async function executeCanonicalCommand(
  repository: CanonicalRepository,
  adapters: ReadonlyMap<string, DomainAdapter>,
  input: CommandEnvelope,
): Promise<{ version: number; replayed: boolean }> {
  // Snapshot before the first await; caller edits must not diverge from the receipt hash.
  const command = structuredClone(input);
  if (
    !command.companyId ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(command.idempotencyKey) ||
    !Number.isSafeInteger(command.expectedVersion) ||
    command.expectedVersion < 0
  )
    throw Error("Invalid command envelope.");
  const adapter = adapters.get(command.kind);
  if (!adapter) throw Error("Unsupported canonical command.");
  if (adapter.action.endsWith(".read"))
    throw Error("A read capability cannot authorize a write command.");
  const fingerprint = createHash("sha256")
    .update(canonical(command))
    .digest("hex");
  return repository.transaction(command.companyId, async (tx) => {
    const actor = await tx.currentActor();
    const state = await tx.loadForUpdate();
    const scope = adapter.resource(structuredClone(state), command.payload);
    authorize(actor, adapter.action, {
      ...scope,
      companyId: command.companyId,
    });
    // A financial handler cannot obtain posting access merely by declaring a weaker action.
    if (adapter.financial)
      authorize(actor, "finance.post", { companyId: command.companyId });
    const previous = await tx.receipt(command.idempotencyKey);
    if (previous) {
      if (
        previous.fingerprint !== fingerprint ||
        previous.actorId !== actor.userId
      )
        throw Error(
          "Idempotency key conflicts with a different command or actor.",
        );
      return { version: previous.version, replayed: true };
    }
    if (state.version !== command.expectedVersion)
      throw Error("Version conflict. Refresh before retrying.");
    const policy = await tx.policy();
    if (
      adapter.financial &&
      (!policy?.postingEnabled ||
        !policy.id ||
        !policy.accountingBasisApproved ||
        !policy.vatApproved ||
        !policy.authorityApproved ||
        !policy.openingBalancesApproved)
    )
      throw Error(
        "Financial posting is blocked pending approved company policies.",
      );
    const prepared = adapter.prepare(
      structuredClone(state),
      structuredClone(command.payload),
      actor,
    );
    if (!adapter.financial && prepared.journals.length)
      throw Error("Nonfinancial command cannot post a journal.");
    // Reuse the tested single accounting engine: period locks, balanced entries and unique sources.
    const accounting = prepared.journals.reduce(
      (current, input) => postJournal(current, input).state,
      state.accounting,
    );
    const next = {
      documents: prepared.documents,
      accounting,
      version: state.version + 1,
    };
    await tx.save(next);
    await tx.appendAudit({
      actorId: actor.userId,
      companyId: command.companyId,
      kind: command.kind,
      version: next.version,
      policyId: policy?.id ?? null,
    });
    await tx.recordReceipt(command.idempotencyKey, {
      fingerprint,
      actorId: actor.userId,
      version: next.version,
    });
    return { version: next.version, replayed: false };
  });
}
