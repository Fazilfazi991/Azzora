/** Narrow initial operating authority recorded from the Owner's explicit release
 * instruction. It does not claim reconciled openings, VAT registration or a FY. */
import { z } from "zod";
import { addPeriod } from "./core.js";
import type { Account } from "./model.js";
import type { AuthorizedActor } from "../backend/permissions.js";
import type { SharedCommand, SharedCompanyState } from "../staging/domain.js";
import { isProductionPasswordOnly } from "../backend/production-password-policy.js";
import { parseFils } from "../finance/settlement.js";

export const initialOwnerId = "86d914dd-1f39-4860-87d0-b671dd39eb00";
export const initialAccountantId = "c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3";
export const initialCompanyId = "fc525d78-bc83-4845-96f1-fb402bb07465";
export const initialFinanceApprovalId = "owner-live-20261115-v1";
export const initialLiveSchema = z
  .object({
    version: z.literal(1),
    approvalId: z.literal(initialFinanceApprovalId),
    companyId: z.literal(initialCompanyId),
    companyName: z.literal("Azzora"),
    noVat: z.literal(true),
    taxRegistration: z.literal("unconfirmed"),
    taxInvoiceEnabled: z.literal(false),
    effectiveFrom: z.literal("2026-11-15"),
    timezone: z.literal("Asia/Dubai"),
    postingUserId: z.literal(initialAccountantId),
    // Owner explicitly approved automatic expense approval for the initial
    // operating scope. This is deliberately narrow: only the same approved
    // Accountant, company and effective-date gate may use it.
    expenseApproverId: z.literal(initialAccountantId),
    expenseApprovalMode: z.literal("accountant-auto-approved"),
    approvedBy: z.literal(initialOwnerId),
    approvedAt: z.iso.datetime({ offset: true }),
    instructionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type InitialFinanceAuthority = z.infer<typeof initialLiveSchema>;
export class InitialFinanceError extends Error {
  readonly status = 423;
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function dubaiBusinessDate(now: string): string {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime()))
    throw new InitialFinanceError(
      "trusted_clock_required",
      "A verified server clock is required.",
    );
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((kind) => parts.find((part) => part.type === kind)!.value)
    .join("-");
}
/** Existing engine control IDs only. No bank, cash, equity or balance is guessed. */
export const initialControlAccounts: readonly Account[] = [
  {
    id: "receivables",
    code: "1100",
    name: "Accounts receivable",
    type: "Asset",
    postable: true,
    status: "Active",
  },
  {
    id: "payables",
    code: "2100",
    name: "Accounts payable",
    type: "Liability",
    postable: true,
    status: "Active",
  },
  {
    id: "revenue",
    code: "4000",
    name: "Design & build revenue",
    type: "Income",
    postable: true,
    status: "Active",
  },
  {
    id: "cost",
    code: "5000",
    name: "Project cost of sales",
    type: "Cost of Sales",
    postable: true,
    status: "Active",
  },
  {
    id: "operating",
    code: "6000",
    name: "Operating expenses",
    type: "Expense",
    postable: true,
    status: "Active",
  },
];
export function parseInitialFinanceAuthority(
  value: unknown,
): InitialFinanceAuthority {
  const result = initialLiveSchema.safeParse(value);
  if (!result.success)
    throw new InitialFinanceError(
      "initial_finance_approval_required",
      "The recorded Owner approval for this company and Accountant is required.",
    );
  return result.data;
}
export function assertInitialFinanceActor(
  authority: InitialFinanceAuthority,
  actor: AuthorizedActor,
  now: string,
  operation: "post" | "approve-expense" = "post",
) {
  parseInitialFinanceAuthority(authority);
  const expenseApproval = operation === "approve-expense";
  if (
    !actor.grant.active ||
    actor.grant.userId !== actor.userId ||
    actor.companyId !== authority.companyId ||
    actor.grant.companyId !== authority.companyId ||
    actor.userId !==
      (expenseApproval ? authority.expenseApproverId : authority.postingUserId) ||
    !actor.grant.roles.includes("accountant") ||
    !actor.grant.capabilities.includes(
      expenseApproval ? "expense.approve" : "finance.post",
    ) ||
    !actor.grant.workspaces.includes(
      "accountant",
    ) ||
    (actor.assurance !== "aal2" && !isProductionPasswordOnly(actor))
  )
    throw new InitialFinanceError(
      "initial_posting_authority_denied",
      expenseApproval
        ? "Only the approved Accountant may automatically approve an expense."
        : "Only the approved Accountant can post financial transactions.",
    );
  if (new Date(authority.approvedAt).getTime() > new Date(now).getTime())
    throw new InitialFinanceError(
      "initial_finance_approval_invalid",
      "The approval timestamp is not valid for the trusted server clock.",
    );
  if (dubaiBusinessDate(now) < authority.effectiveFrom)
    throw new InitialFinanceError(
      "accounting_start_not_reached",
      "Financial posting starts on 15 November 2026 in Dubai. Drafts remain available.",
    );
}
export function initialCommandDate(
  state: SharedCompanyState,
  command: SharedCommand,
): string | undefined {
  const payload = command.payload as {
    action?: Record<string, unknown>;
    id?: string;
    date?: string;
  };
  const action = payload.action;
  if (action?.kind === "issue-invoice")
    return state.finance.invoices.find((row) => row.id === action.id)?.date;
  if (action?.kind === "issue-bill")
    return state.finance.bills.find((row) => row.id === action.id)?.date;
  if (action?.kind === "opening-post") return state.finance.openingSetup?.date;
  return typeof action?.date === "string"
    ? action.date
    : typeof payload.date === "string"
      ? payload.date
      : undefined;
}
export function assertInitialCommand(
  authority: InitialFinanceAuthority,
  state: SharedCompanyState,
  actor: AuthorizedActor,
  command: SharedCommand,
  now: string,
) {
  assertInitialFinanceActor(authority, actor, now);
  const action = (command.payload as { action?: Record<string, unknown> })
    .action;
  if (
    command.kind !== "accounts.action" ||
    !action ||
    ![
      "invoice",
      "update-invoice-draft",
      "issue-invoice",
      "bill",
      "update-bill-draft",
      "issue-bill",
      "receipt",
      "supplier-payment",
      "expense",
      "opening-post",
    ].includes(String(action.kind))
  )
    throw new InitialFinanceError(
      "financial_action_not_approved",
      "This initial release does not authorize transfers, advances, credits, refunds or financial reversals.",
    );
  if (action.kind === "expense")
    throw new InitialFinanceError(
      "expense_approval_authority_pending",
      "Expense posting requires its confirmed independent approver and approval. Keep the expense as a draft until that authority is supplied.",
    );
  const date = initialCommandDate(state, command);
  if (
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    date > dubaiBusinessDate(now) ||
    (action.kind !== "opening-post" && date < authority.effectiveFrom)
  )
    throw new InitialFinanceError(
      "financial_date_outside_approval",
      "Use a valid document date from 15 November through the current Dubai business date. Historical openings require their separate approved workflow.",
    );
  const invoice =
    action.kind === "issue-invoice"
      ? state.finance.invoices.find((row) => row.id === action.id)
      : action;
  if (
    ["invoice", "update-invoice-draft", "issue-invoice"].includes(
      String(action.kind),
    ) &&
    (!invoice || invoice.invoiceType === "Tax Invoice" || !invoice.invoiceType)
  )
    throw new InitialFinanceError(
      "legal_tax_invoice_disabled",
      "No VAT is charged. Legal Tax Invoice issuance is not approved; use a Normal Invoice or nonposting Proforma.",
    );
  if (
    ["invoice", "update-invoice-draft", "issue-invoice"].includes(
      String(action.kind),
    )
  ) {
    const reference = String(invoice?.invoiceReference || "").trim();
    if (
      !reference ||
      reference.length > 100 ||
      Array.from(reference).some((character) => character.charCodeAt(0) < 32)
    )
      throw new InitialFinanceError(
        "invoice_reference_required",
        "Enter the approved invoice number before issuing. No numbering sequence is assumed.",
      );
    if (
      state.finance.invoices.some(
        (row) =>
          row.id !== action.id &&
          row.status === "Issued" &&
          row.invoiceReference?.trim().toLocaleLowerCase() ===
            reference.toLocaleLowerCase(),
      )
    )
      throw new InitialFinanceError(
        "invoice_reference_duplicate",
        "This invoice number has already been issued. Enter a unique approved number.",
      );
  }
  if (action.kind !== "opening-post")
    for (const required of initialControlAccounts) {
      const account = state.finance.accounting.accounts.find(
        (row) => row.id === required.id,
      );
      if (
        !account ||
        account.type !== required.type ||
        account.status !== "Active" ||
        !account.postable
      )
        throw new InitialFinanceError(
          "control_account_setup_required",
          "The existing engine's structural control accounts must be verified before posting. No balance was assumed.",
        );
    }
  if (["supplier-payment", "expense"].includes(String(action.kind))) {
    const account = String(action.account || ""),
      amount = parseFils(String(action.amount || ""));
    const confirmed = state.finance.accounting.journals
      .filter((row) => row.date <= date)
      .reduce(
        (total, row) =>
          total +
          row.lines
            .filter((line) => line.accountId === account)
            .reduce(
              (sum, line) =>
                sum + BigInt(line.debitFils) - BigInt(line.creditFils),
              0n,
            ),
        0n,
      );
    if (confirmed < amount)
      throw new InitialFinanceError(
        "cash_funding_not_confirmed",
        "Recorded funds do not support this payment. Reconcile the relevant opening balance or record verified funding; an unknown bank balance is not treated as zero.",
      );
  }
}
/** Technical one-day posting windows; this does not select a company fiscal year. */
export function prepareInitialPostingDay(
  state: SharedCompanyState,
  date: string,
) {
  const periods = state.finance.accounting.periods.filter(
    (period) => period.start <= date && period.end >= date,
  );
  if (periods.length) {
    if (periods.length !== 1 || periods[0].status !== "Open")
      throw new InitialFinanceError(
        "accounting_period_locked",
        "This date is locked or has conflicting periods. No replacement period was created.",
      );
    return;
  }
  state.finance.accounting = addPeriod(state.finance.accounting, {
    id: `operating-day:${date}`,
    start: date,
    end: date,
    status: "Open",
  });
}
