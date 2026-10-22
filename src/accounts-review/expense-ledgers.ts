import { addAccount } from "../accounting/core.js";
import type { ReviewState } from "./domain";

export const expenseGroups = [
  "Administrative Expense",
  "Direct Expense",
  "Indirect Expense",
] as const;
export type ExpenseGroup = (typeof expenseGroups)[number];
export interface ReviewExpenseLedger {
  id: string;
  name: string;
  group: ExpenseGroup;
  description?: string;
  accountId: string;
  code: string;
}
export const ledgerNameKey = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");

export function expenseLedgersFor(state: ReviewState): ReviewExpenseLedger[] {
  return [
    {
      id: "legacy-operating",
      name: "Operating Expenses",
      group: "Indirect Expense" as const,
      accountId: "operating",
      code: "6000",
    },
    {
      id: "project-materials",
      name: "Material Expenses",
      group: "Direct Expense" as const,
      accountId: "cost",
      code: "5000",
    },
    ...(state.expenseLedgers || []),
  ].filter((ledger) =>
    state.accounting.accounts.some(
      (account) =>
        account.id === ledger.accountId &&
        account.status === "Active" &&
        account.postable,
    ),
  );
}

export function createExpenseLedger(
  previous: ReviewState,
  id: string,
  name: string,
  group: ExpenseGroup,
  description = "",
): ReviewState {
  if (typeof name !== "string" || typeof description !== "string")
    throw Error("Enter a ledger name and optional description.");
  name = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (
    name.length < 2 ||
    name.length > 100 ||
    !/[\p{L}\p{N}]/u.test(name) ||
    /[<>]/u.test(name) ||
    [...name].some((char) => char.charCodeAt(0) < 32)
  )
    throw Error("Ledger name must contain 2–100 readable characters.");
  if (!expenseGroups.includes(group))
    throw Error("Choose a supported expense group.");
  if (description.trim().length > 300)
    throw Error("Ledger description must be at most 300 characters.");
  if (
    expenseLedgersFor(previous).some(
      (ledger) => ledgerNameKey(ledger.name) === ledgerNameKey(name),
    ) ||
    previous.accounting.accounts.some(
      (account) => ledgerNameKey(account.name) === ledgerNameKey(name),
    )
  )
    throw Error("An expense ledger with this name already exists.");
  if ((previous.expenseLedgers?.length || 0) >= 100)
    throw Error("This demo supports up to 100 custom expense ledgers.");
  const next = structuredClone(previous);
  const start =
    group === "Direct Expense"
      ? 5100
      : group === "Administrative Expense"
        ? 6100
        : 6200;
  let code = start;
  while (
    next.accounting.accounts.some((account) => account.code === String(code))
  )
    code++;
  const ledger: ReviewExpenseLedger = {
    id,
    name,
    group,
    description: description.trim(),
    accountId: "expense-" + id,
    code: String(code),
  };
  next.accounting = addAccount(next.accounting, {
    id: ledger.accountId,
    code: ledger.code,
    name,
    type: group === "Direct Expense" ? "Cost of Sales" : "Expense",
    status: "Active",
    postable: true,
  });
  next.expenseLedgers = [...(next.expenseLedgers || []), ledger];
  return next;
}
