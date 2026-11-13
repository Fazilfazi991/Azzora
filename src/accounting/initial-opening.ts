import { createHash } from "node:crypto";
import { postJournal } from "./core.js";
import type { JournalLine } from "./model.js";
import type { AuthorizedActor } from "../backend/permissions.js";
import type { SharedCompanyState } from "../staging/domain.js";
import {
  inspectOpeningSetup,
  type OpeningWorkflowAction,
} from "../accounts-review/opening-setup.js";
import { cashAccountsFor } from "../accounts-review/banking.js";
import { parseFils } from "../finance/settlement.js";
import { isProductionPasswordOnly } from "../backend/production-password-policy.js";
import {
  assertInitialFinanceActor,
  dubaiBusinessDate,
  InitialFinanceError,
  initialAccountantId,
  initialOwnerId,
  prepareInitialPostingDay,
  type InitialFinanceAuthority,
} from "./initial-live.js";

const ordered = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(ordered)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, ordered(item)]),
        )
      : value;
const sha = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(ordered(value)))
    .digest("hex");
const nameKey = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
export function initialOpeningDigest(state: SharedCompanyState): string {
  return sha({
    draft: state.finance.openingSetup || null,
    accounts: state.finance.accounting.accounts,
    customers: state.manager.clients,
    suppliers: state.manager.operations?.suppliers || [],
  });
}
function openingPlan(state: SharedCompanyState) {
  const draft = state.finance.openingSetup;
  if (!draft)
    throw new InitialFinanceError(
      "opening_draft_required",
      "Prepare the actual starting figures before reconciliation.",
    );
  const inspected = inspectOpeningSetup(draft);
  if (inspected.warnings.length)
    throw new InitialFinanceError(
      "opening_reconciliation_incomplete",
      inspected.warnings[0],
    );
  const lines: JournalLine[] = [];
  const documents: {
    kind: "customer-invoice" | "supplier-bill";
    id: string;
    party: string;
    amountFils: string;
    reference: string;
    date: string;
    due: string;
  }[] = [];
  const references = new Set<string>();
  for (const row of draft.rows) {
    const debit = row.debit ? parseFils(row.debit) : 0n,
      credit = row.credit ? parseFils(row.credit) : 0n;
    let accountId: string, partyId: string | undefined;
    if (row.kind === "customer-invoice" || row.kind === "supplier-bill") {
      const customer = row.kind === "customer-invoice",
        parties = customer
          ? state.manager.clients
          : state.manager.operations?.suppliers || [];
      const matches = parties.filter(
        (p) =>
          p.id === row.accountOrParty ||
          p.code === row.accountOrParty ||
          nameKey(p.name) === nameKey(row.accountOrParty),
      );
      if (matches.length !== 1)
        throw new InitialFinanceError(
          "opening_party_required",
          `Opening line ${draft.rows.indexOf(row) + 1}: select one existing customer or supplier.`,
        );
      if (
        (customer && (debit <= 0n || credit !== 0n)) ||
        (!customer && (credit <= 0n || debit !== 0n))
      )
        throw new InitialFinanceError(
          "opening_document_side_invalid",
          "Customer outstanding invoices require a debit; supplier outstanding bills require a credit. Advances and credit balances need separate approval.",
        );
      if (row.documentDate > draft.date || row.dueDate < row.documentDate)
        throw new InitialFinanceError(
          "opening_document_date_invalid",
          "Check each outstanding document's actual issue and due dates against the opening date.",
        );
      const referenceKey = `${row.kind}:${matches[0].id}:${nameKey(row.reference)}`;
      if (references.has(referenceKey))
        throw new InitialFinanceError(
          "opening_duplicate_document",
          "The same outstanding document appears more than once.",
        );
      references.add(referenceKey);
      const existing = customer ? state.finance.invoices : state.finance.bills;
      if (
        existing.some(
          (item) =>
            nameKey(item.party) === nameKey(matches[0].name) &&
            nameKey(item.invoiceReference || item.id) ===
              nameKey(row.reference),
        )
      )
        throw new InitialFinanceError(
          "opening_duplicate_document",
          "This outstanding document is already in the authoritative ledger.",
        );
      accountId = customer ? "receivables" : "payables";
      partyId = matches[0].name;
      documents.push({
        kind: row.kind,
        id: `OPEN-${customer ? "AR" : "AP"}-${sha({ row: row.id, referenceKey }).slice(0, 20)}`,
        party: matches[0].name,
        amountFils: (customer ? debit : credit).toString(),
        reference: row.reference,
        date: row.documentDate,
        due: row.dueDate,
      });
    } else {
      const matches = state.finance.accounting.accounts.filter(
        (account) =>
          account.id === row.accountOrParty ||
          account.code === row.accountOrParty ||
          nameKey(account.name) === nameKey(row.accountOrParty),
      );
      if (matches.length !== 1)
        throw new InitialFinanceError(
          "opening_account_required",
          `Opening line ${draft.rows.indexOf(row) + 1}: select one existing account code or account.`,
        );
      const account = matches[0];
      accountId = account.id;
      if (!["Asset", "Liability", "Equity"].includes(account.type))
        throw new InitialFinanceError(
          "opening_balance_sheet_accounts_required",
          "Starting figures are limited to balance-sheet accounts. Historical income/expense treatment requires the accountant's separate fiscal-period decision.",
        );
      if (["receivables", "payables"].includes(accountId))
        throw new InitialFinanceError(
          "opening_document_detail_required",
          "Use individual customer invoices or supplier bills for receivables/payables; keep their references and dates.",
        );
      if (
        row.kind !== "ledger" &&
        !cashAccountsFor(state.finance).some((cash) => cash.id === accountId)
      )
        throw new InitialFinanceError(
          "opening_cash_account_required",
          "Choose an existing bank, cash or petty-cash account for this opening row.",
        );
    }
    const account = state.finance.accounting.accounts.find(
      (item) => item.id === accountId,
    );
    if (!account || account.status !== "Active" || !account.postable)
      throw new InitialFinanceError(
        "opening_account_not_postable",
        "Every opening row needs an active, postable account.",
      );
    if (debit || credit)
      lines.push({
        accountId,
        debitFils: debit.toString(),
        creditFils: credit.toString(),
        ...(partyId ? { partyId } : {}),
      });
  }
  return { draft, lines, documents, totalDebit: inspected.debitFils };
}
export function applyInitialOpening(
  state: SharedCompanyState,
  action: OpeningWorkflowAction,
  actor: AuthorizedActor,
  authority: InitialFinanceAuthority,
  now: string,
) {
  const review = state.finance.openingReview || { revision: 0 },
    digest = initialOpeningDigest(state);
  if (
    action.id !== "opening-setup" ||
    action.confirmed !== true ||
    action.revision !== review.revision ||
    action.digest !== digest
  )
    throw new InitialFinanceError(
      "opening_review_changed",
      "The opening draft, chart or counterparties changed. Refresh and review the exact current figures.",
    );
  if (review.posted)
    throw new InitialFinanceError(
      "opening_already_posted",
      "These starting figures are already posted. No duplicate opening entry was created.",
    );
  const actorValid =
    actor.companyId === authority.companyId &&
    actor.grant.companyId === authority.companyId &&
    actor.grant.userId === actor.userId &&
    actor.grant.active &&
    actor.grant.workspaces.includes("accountant") &&
    (actor.assurance === "aal2" || isProductionPasswordOnly(actor));
  if (!actorValid)
    throw new InitialFinanceError(
      "opening_review_denied",
      "A current authorized company sign-in is required.",
    );
  const stamp = {
    by: actor.userId,
    at: now,
    digest,
    revision: review.revision,
  };
  const plan = openingPlan(state);
  if (plan.draft.date > authority.effectiveFrom)
    throw new InitialFinanceError(
      "opening_date_after_start",
      "Starting figures must describe the approved accounting start or an earlier closing date; ordinary transactions stay separate.",
    );
  if (action.kind === "opening-reconcile") {
    if (
      actor.userId !== initialAccountantId ||
      !actor.grant.roles.includes("accountant") ||
      !actor.grant.capabilities.includes("finance.draft") ||
      action.complete !== true
    )
      throw new InitialFinanceError(
        "accountant_opening_confirmation_required",
        "The Accountant must explicitly confirm the complete starting trial balance after checking statements and outstanding documents.",
      );
    state.finance.openingReview = {
      revision: review.revision,
      reconciliation: { ...stamp, complete: true },
    };
  } else if (action.kind === "opening-approve") {
    if (
      actor.userId !== initialOwnerId ||
      !actor.grant.roles.includes("owner") ||
      !actor.grant.capabilities.includes("access.manage") ||
      review.reconciliation?.digest !== digest ||
      review.reconciliation.by === actor.userId
    )
      throw new InitialFinanceError(
        "owner_opening_approval_required",
        "The Owner must accept the exact Accountant-reconciled starting figures independently.",
      );
    state.finance.openingReview = { ...review, ownerApproval: stamp };
  } else {
    assertInitialFinanceActor(authority, actor, now);
    if (
      review.reconciliation?.digest !== digest ||
      review.ownerApproval?.digest !== digest ||
      review.ownerApproval.by !== initialOwnerId ||
      review.reconciliation.by !== initialAccountantId
    )
      throw new InitialFinanceError(
        "approved_openings_required",
        "Reconcile the current complete opening trial balance and obtain the Owner's approval before explicitly posting it.",
      );
    if (plan.draft.date > dubaiBusinessDate(now))
      throw new InitialFinanceError(
        "opening_date_in_future",
        "Opening figures cannot be posted in the future.",
      );
    const journalId =
      BigInt(plan.totalDebit) > 0n ? `OPENING-${digest.slice(0, 20)}` : null;
    for (const doc of plan.documents) {
      const record = {
        id: doc.id,
        party: doc.party,
        date: doc.date,
        due: doc.due,
        description: `Opening outstanding document ${doc.reference}`,
        amountFils: doc.amountFils,
        status: "Issued" as const,
        invoiceReference: doc.reference,
        openingBalance: true as const,
        revision: 0,
      };
      if (doc.kind === "customer-invoice")
        state.finance.invoices.push({
          ...record,
          invoiceType: "Normal Invoice",
        });
      else state.finance.bills.push(record);
    }
    if (journalId) {
      prepareInitialPostingDay(state, plan.draft.date);
      state.finance.accounting = postJournal(state.finance.accounting, {
        id: journalId,
        postingKey: `approved-opening:${digest}`,
        source: {
          kind: "OpeningBalance",
          id: `opening:${digest}`,
          action: "Approved starting figures",
        },
        date: plan.draft.date,
        recordedAt: now,
        memo: "Accountant-reconciled and Owner-approved starting figures",
        currency: "AED",
        lines: plan.lines,
      }).state;
    }
    state.finance.openingReview = {
      ...review,
      posted: { ...stamp, journalId },
    };
  }
}
export function initialFinanceView(
  state: SharedCompanyState,
  actor: AuthorizedActor,
  authority: InitialFinanceAuthority,
  now: string,
) {
  const digest = initialOpeningDigest(state),
    review = state.finance.openingReview,
    postingActive = dubaiBusinessDate(now) >= authority.effectiveFrom;
  const currentReconciliation = review?.reconciliation?.digest === digest,
    currentApproval = review?.ownerApproval?.digest === digest;
  return {
    approved: true,
    effectiveFrom: authority.effectiveFrom,
    businessDate: dubaiBusinessDate(now),
    postingActive,
    canPost:
      postingActive &&
      actor.userId === initialAccountantId &&
      actor.grant.capabilities.includes("finance.post"),
    noVat: true,
    taxRegistration: "unconfirmed" as const,
    taxInvoiceEnabled: false,
    expensePostingEnabled: false,
    transfersEnabled: false,
    openingStatus: review?.posted
      ? "posted"
      : currentApproval
        ? "owner-approved"
        : currentReconciliation
          ? "reconciled"
          : "draft",
    openingRevision: review?.revision || 0,
    openingDigest: digest,
    mayReconcile: actor.userId === initialAccountantId && !review?.posted,
    mayApproveOpenings:
      actor.userId === initialOwnerId &&
      currentReconciliation &&
      !review?.posted,
    mayPostOpenings:
      actor.userId === initialAccountantId &&
      postingActive &&
      currentApproval &&
      !review?.posted,
    openingBalancesIncluded: !!review?.posted,
    reason: postingActive
      ? "Opening balances remain excluded until their separate reconciliation, Owner approval and explicit posting."
      : "Posting starts on 15 November 2026 in Dubai; drafts remain available.",
  };
}
