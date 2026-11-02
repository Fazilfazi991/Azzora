import { addAccount } from "../accounting/core.js";
import { buildGeneralLedger } from "../accounting/reports.js";
import type { JournalLine } from "../accounting/model";
import type { ReviewState } from "./domain";
import { ledgerNameKey } from "./expense-ledgers.js";

export const departments = [
  { id: "MEP", name: "MEP" },
  { id: "CIVIL", name: "CIVIL" },
  { id: "JOINERY", name: "JOINERY" },
] as const;
export type DepartmentId = (typeof departments)[number]["id"];
export type DepartmentJournalLine = JournalLine & {
  departmentId?: DepartmentId;
};
export interface ReviewCashAccount {
  id: string;
  name: string;
  type: "bank" | "cash" | "staff";
  holder?: string;
}
export interface ReviewTransfer {
  id: string;
  date: string;
  fromAccount: string;
  toAccount: string;
  amountFils: string;
  reference: string;
}
export interface ReviewSettlementDetail {
  id: string;
  account: string;
  reference: string;
}

export function departmentId(value: unknown): DepartmentId | undefined {
  if (value === undefined || value === "") return undefined;
  if (!departments.some((item) => item.id === value))
    throw Error(
      "Choose MEP, CIVIL or JOINERY, or leave department unassigned.",
    );
  return value as DepartmentId;
}

export function cashAccountsFor(state: ReviewState): ReviewCashAccount[] {
  const defaults: ReviewCashAccount[] = [
    { id: "bank", name: "Business bank", type: "bank" },
    { id: "cash", name: "Petty cash", type: "cash" },
  ];
  return [...defaults, ...(state.cashAccounts || [])].filter((item) =>
    state.accounting.accounts.some(
      (account) =>
        account.id === item.id &&
        account.type === "Asset" &&
        account.postable &&
        account.status === "Active",
    ),
  );
}

export function requireCashAccount(
  state: ReviewState,
  id: unknown,
): ReviewCashAccount {
  const found = cashAccountsFor(state).find((account) => account.id === id);
  if (!found) throw Error("Choose an active bank, cash or staff cash account.");
  return found;
}

function name(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw Error(`${label} is required.`);
  const result = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (
    result.length < 2 ||
    result.length > max ||
    /[<>]/.test(result) ||
    [...result].some((char) => char.charCodeAt(0) < 32)
  )
    throw Error(`${label} must contain 2–${max} readable characters.`);
  return result;
}

export function createCashAccount(
  previous: ReviewState,
  input: {
    id: string;
    name: string;
    type: ReviewCashAccount["type"];
    holder?: string;
  },
): ReviewState {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(input.id))
    throw Error("Use a valid unique account ID.");
  if (!["bank", "cash", "staff"].includes(input.type))
    throw Error("Choose bank, cash or staff cash account.");
  const title = name(input.name, "Account name", 100);
  const holder =
    input.type === "staff" ? name(input.holder, "Cash holder", 100) : undefined;
  if (
    previous.accounting.accounts.some(
      (account) => ledgerNameKey(account.name) === ledgerNameKey(title),
    )
  )
    throw Error("An account with this name already exists.");
  if ((previous.cashAccounts?.length || 0) >= 40)
    throw Error(
      "This demo supports up to 40 additional bank and cash accounts.",
    );
  let code = 1020;
  while (
    previous.accounting.accounts.some(
      (account) => account.code === String(code),
    )
  )
    code++;
  const accounting = addAccount(previous.accounting, {
    id: input.id,
    code: String(code),
    name: title,
    type: "Asset",
    status: "Active",
    postable: true,
  });
  return {
    ...structuredClone(previous),
    accounting,
    cashAccounts: [
      ...(previous.cashAccounts || []),
      {
        id: input.id,
        name: title,
        type: input.type,
        ...(holder ? { holder } : {}),
      },
    ],
  };
}

export function cashBalanceAt(
  state: ReviewState,
  id: string,
  asOf: string,
): bigint {
  return state.accounting.journals
    .filter((entry) => entry.date <= asOf)
    .flatMap((entry) => entry.lines)
    .filter((item) => item.accountId === id)
    .reduce(
      (sum, item) => sum + BigInt(item.debitFils) - BigInt(item.creditFils),
      0n,
    );
}

export function cashAccountSnapshot(
  state: ReviewState,
  from: string,
  to: string,
  asOf = to,
) {
  return cashAccountsFor(state).map((account) => {
    const ledger = buildGeneralLedger(state.accounting, account.id, from, to);
    return {
      ...account,
      balanceFils: cashBalanceAt(state, account.id, asOf).toString(),
      openingBalanceFils: ledger.openingBalanceFils,
      closingBalanceFils: ledger.closingBalanceFils,
      transactions: ledger.lines,
    };
  });
}

const amounts = () => ({ revenue: 0n, cost: 0n, operating: 0n });
const expenseRow = (
  id: string,
  title: string,
  a: ReturnType<typeof amounts>,
) => ({
  id,
  name: title,
  costOfSalesFils: a.cost.toString(),
  operatingExpensesFils: a.operating.toString(),
  totalFils: (a.cost + a.operating).toString(),
});

/** Report dimensions come from posted lines, never inferred cash movements. */
export function planningExpenseReports(
  state: ReviewState,
  projects: { id: string; name: string }[],
  from: string,
  asOf: string,
) {
  const projectRows = new Map(
    projects.map((project) => [project.id, { ...project, ...amounts() }]),
  );
  projectRows.set("unassigned", {
    id: "unassigned",
    name: "Unassigned project",
    ...amounts(),
  });
  const departmentRows = new Map<string, ReturnType<typeof amounts>>(
    [...departments.map((item) => item.id), "unassigned"].map((id) => [
      id,
      amounts(),
    ]),
  );
  for (const journal of state.accounting.journals.filter(
    (entry) => entry.date >= from && entry.date <= asOf,
  )) {
    for (const item of journal.lines) {
      const type = state.accounting.accounts.find(
        (account) => account.id === item.accountId,
      )?.type;
      if (!["Income", "Cost of Sales", "Expense"].includes(type || ""))
        continue;
      const field =
        type === "Income"
          ? "revenue"
          : type === "Cost of Sales"
            ? "cost"
            : "operating";
      const value =
        field === "revenue"
          ? BigInt(item.creditFils) - BigInt(item.debitFils)
          : BigInt(item.debitFils) - BigInt(item.creditFils);
      const projectId = item.projectId || "unassigned";
      if (!projectRows.has(projectId))
        projectRows.set(projectId, {
          id: projectId,
          name: `Historical project ${projectId}`,
          ...amounts(),
        });
      projectRows.get(projectId)![field] += value;
      if (field !== "revenue") {
        const department =
          (item as DepartmentJournalLine).departmentId || "unassigned";
        if (!departmentRows.has(department))
          throw Error("Posted expense references an unknown department.");
        departmentRows.get(department)![field] += value;
      }
    }
  }
  const byProject = [...projectRows.values()].map((row) =>
    expenseRow(row.id, row.name, row),
  );
  const byDepartment = [...departmentRows].map(([id, a]) =>
    expenseRow(id, id === "unassigned" ? "Unassigned department" : id, a),
  );
  const totals = [...projectRows.values()].reduce(
    (sum, row) => ({
      revenue: sum.revenue + row.revenue,
      cost: sum.cost + row.cost,
      operating: sum.operating + row.operating,
    }),
    amounts(),
  );
  return {
    projectProfitability: [...projectRows.values()].map((row) => ({
      id: row.id,
      name: row.name,
      revenueFils: row.revenue.toString(),
      costOfSalesFils: row.cost.toString(),
      operatingExpensesFils: row.operating.toString(),
      grossProfitFils: (row.revenue - row.cost).toString(),
      netProfitFils: (row.revenue - row.cost - row.operating).toString(),
    })),
    expenseSummary: {
      byProject,
      byDepartment,
      totalFils: (totals.cost + totals.operating).toString(),
      costOfSalesFils: totals.cost.toString(),
      operatingExpensesFils: totals.operating.toString(),
      unassigned: byDepartment.find((row) => row.id === "unassigned")!,
    },
  };
}
