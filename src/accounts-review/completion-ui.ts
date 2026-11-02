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
export type CompletionSnapshot = ReturnType<typeof reviewSnapshot> & {
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
    enabled: boolean;
    provider: "deepseek";
    status: "disabled" | "configuration-required" | "ready";
    message: string;
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
