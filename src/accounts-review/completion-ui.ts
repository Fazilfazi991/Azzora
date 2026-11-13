import type { reviewSnapshot } from "./domain";
import type { GeneralLedgerLine } from "../accounting/reports";

export type CashAccountView = {
  id: string;
  name: string;
  type: "bank" | "cash" | "staff";
  holder?: string;
  balanceFils: string;
  openingBalanceFils?: string;
  closingBalanceFils?: string;
  transactions: readonly GeneralLedgerLine[];
};
type CostSummary = {
  id?: string;
  name?: string;
  costOfSalesFils: string;
  operatingExpensesFils: string;
  totalFils: string;
};
/** Server-derived approval and actor affordances; never a posting authorization. */
export type ProductionFinanceView = {
  approved: boolean;
  effectiveFrom: string;
  businessDate: string;
  postingActive: boolean;
  canPost: boolean;
  expensePostingEnabled?: boolean;
  expensePostingReason?: string;
  transfersEnabled?: boolean;
  noVat: boolean;
  taxRegistration: string;
  taxInvoiceEnabled: boolean;
  openingStatus: "draft" | "reconciled" | "owner-approved" | "posted";
  openingRevision: number;
  openingDigest?: string;
  mayReconcile: boolean;
  mayApproveOpenings: boolean;
  mayPostOpenings: boolean;
};
export function productionFinanceNotice(view?: ProductionFinanceView) {
  if (!view?.approved)
    return "Company drafts remain available. Financial posting is awaiting approved company settings.";
  const when = new Date(view.effectiveFrom + "T00:00:00Z").toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  );
  const posting = !view.postingActive
    ? `Accountant posting begins ${when}; drafts remain available before that date.`
    : view.canPost
      ? `Accountant posting is active within the approved transaction scope from ${when}.`
      : "Posting is restricted to the authorized Accountant; this account can prepare and review drafts.";
  const opening =
    view.openingStatus === "posted"
      ? "Approved opening balances have been posted."
      : "Opening balances remain separate, unposted and provisional until reconciled and approved.";
  return `${view.noVat ? "No VAT charged. Legal Tax Invoices are unavailable. " : ""}${posting} ${opening}`;
}
export type CompletionSnapshot = ReturnType<typeof reviewSnapshot> & {
  productionFinance?: ProductionFinanceView;
  departments?: readonly { id: string; name: string }[];
  cashAccounts?: CashAccountView[];
  transfers?: {
    id: string;
    date: string;
    fromAccount: string;
    toAccount: string;
    amountFils: string;
    reference: string;
  }[];
  projectProfitability?: {
    id: string;
    name: string;
    revenueFils: string;
    costOfSalesFils: string;
    operatingExpensesFils: string;
    grossProfitFils: string;
    netProfitFils: string;
  }[];
  expenseSummary?: {
    byProject: CostSummary[];
    byDepartment: CostSummary[];
    unassigned: CostSummary;
  };
  documentAi?: {
    generalDocuments?: boolean;
    enabled: boolean;
    provider: "deepseek";
    status: "disabled" | "configuration-required" | "ready";
    message: string;
    processing?: {
      dataClass: "business";
      policyVersion: "ai-business-v1";
      consentRequired: true;
    };
    reviewOnly?: boolean;
    availabilityReason?: string;
  };
};

// Older demo sessions retain their original two accounts until migrated by the
// server. This view never creates accounts or infers new financial entries.
export function cashAccountsFor(data: CompletionSnapshot): CashAccountView[] {
  return (
    data.cashAccounts ??
    ["bank", "cash"].flatMap((id) => {
      const report = data.ledger.find((item) => item.account.id === id);
      return report
        ? [
            {
              id,
              name: report.account.name,
              type: id as "bank" | "cash",
              balanceFils:
                id === "bank" ? data.metrics.bankFils : data.metrics.cashFils,
              openingBalanceFils: report.openingBalanceFils,
              closingBalanceFils: report.closingBalanceFils,
              transactions: report.lines,
            },
          ]
        : [];
    })
  );
}

export const displayMoney = (value: string | bigint) => {
  const fils = BigInt(value);
  const amount = fils < 0n ? -fils : fils;
  return `${fils < 0n ? "−" : ""}AED ${(amount / 100n).toLocaleString("en-AE")}.${(amount % 100n).toString().padStart(2, "0")}`;
};
