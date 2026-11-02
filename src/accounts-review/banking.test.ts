import { describe, expect, it } from "vitest";
import {
  applyReviewAction,
  createReviewState,
  reviewSnapshot,
  type ReviewAction,
  type ReviewState,
} from "./domain";
import { cashAccountsFor, planningExpenseReports } from "./banking";
import { encodeReview, decodeReview } from "./hosted-store";

const day = "2026-10-22";
const account = (
  id: string,
  type: "bank" | "cash" | "staff" = "staff",
  name = "Thomas Cash",
): ReviewAction => ({
  kind: "create-cash-account",
  id,
  name,
  type,
  ...(type === "staff" ? { holder: "Thomas" } : {}),
});
const transfer = (
  id: string,
  fromAccount = "bank",
  toAccount = "thomas",
  amount = "1000.00",
  date = day,
): ReviewAction => ({
  kind: "transfer",
  id,
  date,
  fromAccount,
  toAccount,
  amount,
  reference: "Cash advance " + id,
});
const sum = (rows: { totalFils: string }[]) =>
  rows.reduce((n, row) => n + BigInt(row.totalFils), 0n).toString();

describe("basic banking, departments and journal-derived dimension reports", () => {
  it("reads legacy states without adding records or changing their original metrics", () => {
    const state = createReviewState(),
      before = structuredClone(state);
    const data = reviewSnapshot(state);
    expect(data.cashAccounts.map((item) => item.id)).toEqual(["bank", "cash"]);
    expect(data.transfers).toEqual([]);
    expect(data.cashAccounts[0].balanceFils).toBe(data.metrics.bankFils);
    expect(data.metrics.cashFils).toBe("0");
    expect(state).toEqual(before);
  });

  it("creates multiple independent asset accounts at zero without posting or manufacturing balances", () => {
    const original = createReviewState();
    let state = applyReviewAction(original, account("thomas"));
    state = applyReviewAction(
      state,
      account("second-bank", "bank", "Second business bank"),
    );
    state = applyReviewAction(state, account("site-cash", "cash", "Site cash"));
    expect(state.accounting.journals).toEqual(original.accounting.journals);
    expect(cashAccountsFor(state)).toHaveLength(5);
    expect(
      reviewSnapshot(state).cashAccounts.find((item) => item.id === "thomas"),
    ).toMatchObject({ holder: "Thomas", type: "staff", balanceFils: "0" });
    expect(reviewSnapshot(state).metrics).toEqual(
      reviewSnapshot(original).metrics,
    );
    expect(original.cashAccounts).toBeUndefined();
  });

  it.each([
    { ...account("thomas"), name: "Business bank" },
    { ...account("thomas"), name: "<script>" },
    { ...account("thomas"), holder: "" },
    { ...account("thomas"), type: "Expense" },
    { ...account("bank"), name: "Duplicate identity" },
    { ...account("bad id") },
  ])(
    "rejects malformed or duplicate account creation atomically %#",
    (action) => {
      const state = createReviewState(),
        before = structuredClone(state);
      expect(() => applyReviewAction(state, action as ReviewAction)).toThrow();
      expect(state).toEqual(before);
    },
  );

  it("transfers bank funds to Thomas, pays an expense and returns cash without affecting income", () => {
    const original = createReviewState();
    let state = applyReviewAction(original, account("thomas"));
    state = applyReviewAction(state, transfer("T1"));
    const transferred = reviewSnapshot(state);
    expect(transferred.metrics.bankFils).toBe("5100000");
    expect(transferred.metrics.cashFils).toBe("100000");
    expect(transferred.metrics.netProfitFils).toBe(
      reviewSnapshot(original).metrics.netProfitFils,
    );
    expect(state.expenses).toEqual([]);
    expect(
      state.accounting.journals.at(-1)!.lines.map((line) => line.accountId),
    ).toEqual(["thomas", "bank"]);
    state = applyReviewAction(state, {
      kind: "expense",
      id: "THOMAS-EXP",
      date: day,
      payee: "Fictional office shop",
      description: "Office supplies",
      amount: "125.25",
      account: "thomas",
      departmentId: "CIVIL",
    });
    state = applyReviewAction(
      state,
      transfer("T2", "thomas", "bank", "100.00"),
    );
    const data = reviewSnapshot(state);
    expect(
      data.cashAccounts.find((item) => item.id === "thomas")!.balanceFils,
    ).toBe("77475");
    expect(data.metrics.bankFils).toBe("5110000");
    expect(data.metrics.operatingExpensesFils).toBe("112525");
    expect(data.balance.balanced && data.trial.balanced).toBe(true);
    expect(
      data.expenseSummary.byDepartment.find((item) => item.id === "CIVIL")!
        .totalFils,
    ).toBe("12525");
    expect(
      data.cashAccounts
        .find((item) => item.id === "thomas")!
        .transactions.map((item) => item.runningBalanceFils),
    ).toEqual(["100000", "87475", "77475"]);
    expect(state.invoices).toEqual(original.invoices);
    expect(state.bills).toEqual(original.bills);
  });

  it("moves bank to bank without changing the aggregate bank balance or P&L", () => {
    let state = applyReviewAction(
      createReviewState(),
      account("other-bank", "bank", "Other bank"),
    );
    const before = reviewSnapshot(state);
    state = applyReviewAction(
      state,
      transfer("BANK-T", "bank", "other-bank", "77.01"),
    );
    const after = reviewSnapshot(state);
    expect(after.metrics).toEqual(before.metrics);
    expect(
      after.cashAccounts.find((item) => item.id === "other-bank")!.balanceFils,
    ).toBe("7701");
    expect(after.pnl).toEqual(before.pnl);
  });

  it.each([
    transfer("BAD1", "bank", "bank"),
    transfer("BAD2", "bank", "receivables"),
    transfer("BAD3", "bank", "missing"),
    transfer("BAD4", "bank", "thomas", "-1"),
    transfer("BAD5", "bank", "thomas", "0"),
    transfer("BAD6", "bank", "thomas", "0.001"),
    transfer("BAD7", "bank", "thomas", "52000.01"),
    transfer("BAD8", "thomas", "bank", "0.01"),
    transfer("BAD9", "bank", "thomas", "1.00", "2026-02-30"),
    { ...transfer("BAD10"), reference: "" },
  ])(
    "rejects invalid transfers and insufficient funds atomically %#",
    (action) => {
      const state = applyReviewAction(createReviewState(), account("thomas")),
        before = structuredClone(state);
      expect(() => applyReviewAction(state, action)).toThrow();
      expect(state).toEqual(before);
    },
  );

  it("uses balances on the actual transfer date and excludes future transfers from an earlier snapshot", () => {
    let state = applyReviewAction(createReviewState(), account("thomas"));
    expect(() =>
      applyReviewAction(
        state,
        transfer("EARLY", "bank", "thomas", "1.00", "2025-12-31"),
      ),
    ).toThrow(/insufficient/);
    state = applyReviewAction(
      state,
      transfer("FUTURE", "bank", "thomas", "1.00", "2026-10-23"),
    );
    expect(reviewSnapshot(state, day).transfers).toHaveLength(0);
    expect(reviewSnapshot(state, day).metrics.cashFils).toBe("0");
    expect(reviewSnapshot(state, "2026-10-23").metrics.cashFils).toBe("100");
  });

  it("rejects a duplicate transfer ID without changing its original journal", () => {
    let state = applyReviewAction(createReviewState(), account("thomas"));
    state = applyReviewAction(state, transfer("DUP"));
    const before = structuredClone(state);
    expect(() => applyReviewAction(state, transfer("DUP"))).toThrow(/already/);
    expect(state).toEqual(before);
  });

  it("settles issued invoices and bills through selected accounts with preserved payment references", () => {
    let state = applyReviewAction(
      createReviewState(),
      account("second", "bank", "Second bank"),
    );
    state = applyReviewAction(
      state,
      transfer("FUND", "bank", "second", "1000.00"),
    );
    state = applyReviewAction(state, {
      kind: "receipt",
      id: "R-NEW",
      date: day,
      documentId: "INV-26041",
      amount: "100.00",
      account: "second",
      reference: "Fictional payment advice",
    });
    state = applyReviewAction(state, {
      kind: "supplier-payment",
      id: "P-NEW",
      date: day,
      documentId: "BILL-26031",
      amount: "200.00",
      account: "second",
      reference: "Fictional supplier transfer",
    });
    const data = reviewSnapshot(state);
    expect(data.receipts.at(-1)).toMatchObject({
      account: "second",
      reference: "Fictional payment advice",
      amountFils: "10000",
    });
    expect(data.supplierPayments.at(-1)).toMatchObject({
      account: "second",
      reference: "Fictional supplier transfer",
      amountFils: "20000",
    });
    expect(data.receipts[0].account).toBe("bank");
    expect(
      data.cashAccounts.find((item) => item.id === "second")!.balanceFils,
    ).toBe("90000");
    expect(data.metrics.receivablesFils).toBe("1490000");
    expect(data.metrics.payablesFils).toBe("580000");
    expect(data.balance.balanced).toBe(true);
    expect(
      reviewSnapshot(decodeReview<ReviewState>(encodeReview(state))),
    ).toEqual(data);
  });

  it("rejects non-cash assets and arbitrary departments without posting", () => {
    const state = createReviewState(),
      before = structuredClone(state);
    expect(() =>
      applyReviewAction(state, {
        kind: "expense",
        id: "BAD",
        date: day,
        payee: "Fictional",
        description: "Test",
        amount: "1.00",
        account: "receivables",
      }),
    ).toThrow(/active bank/);
    expect(() =>
      applyReviewAction(state, {
        kind: "expense",
        id: "BAD",
        date: day,
        payee: "Fictional",
        description: "Test",
        amount: "1.00",
        account: "bank",
        departmentId: "FICTIONAL",
      } as unknown as ReviewAction),
    ).toThrow(/MEP/);
    expect(state).toEqual(before);
  });

  it("reconciles tagged bills, direct and indirect project costs with P&L and project profit", () => {
    let state = createReviewState();
    state = applyReviewAction(state, {
      kind: "bill",
      id: "MEP-BILL",
      date: day,
      due: day,
      party: "Fictional supplier",
      description: "Electrical materials",
      amount: "100.00",
      projectId: "demo-apartment",
      departmentId: "MEP",
      category: "Cost of Sales",
      poReference: "Fictional PO",
    });
    state = applyReviewAction(state, {
      kind: "expense",
      id: "CIVIL-EXP",
      date: day,
      payee: "Fictional shop",
      description: "Site material",
      amount: "50.00",
      account: "bank",
      ledgerId: "project-materials",
      scope: "project",
      projectId: "demo-apartment",
      departmentId: "CIVIL",
    });
    state = applyReviewAction(state, {
      kind: "expense",
      id: "JOINERY-EXP",
      date: day,
      payee: "Fictional shop",
      description: "Consumables",
      amount: "25.00",
      account: "bank",
      scope: "project",
      projectId: "demo-apartment",
      departmentId: "JOINERY",
    });
    state = applyReviewAction(state, {
      kind: "invoice",
      id: "PROJECT-REV",
      date: day,
      due: day,
      party: "Fictional customer",
      description: "Project income",
      amount: "300.00",
      projectId: "demo-apartment",
      issue: true,
    });
    const data = reviewSnapshot(state),
      project = data.projectProfitability.find(
        (item) => item.id === "demo-apartment",
      )!;
    expect(project).toMatchObject({
      revenueFils: "30000",
      costOfSalesFils: "15000",
      operatingExpensesFils: "2500",
      grossProfitFils: "15000",
      netProfitFils: "12500",
    });
    expect(
      data.expenseSummary.byDepartment
        .filter((item) => item.id !== "unassigned")
        .map((item) => item.totalFils),
    ).toEqual(["10000", "5000", "2500"]);
    const total = (
      BigInt(data.pnl.costOfSales.totalFils) +
      BigInt(data.pnl.expenses.totalFils)
    ).toString();
    expect(data.expenseSummary.totalFils).toBe(total);
    expect(sum(data.expenseSummary.byProject)).toBe(total);
    expect(sum(data.expenseSummary.byDepartment)).toBe(total);
    expect(
      data.projectProfitability
        .reduce((n, item) => n + BigInt(item.netProfitFils), 0n)
        .toString(),
    ).toBe(data.pnl.netProfitFils);
  });

  it("leaves department-tagged bill drafts outside summaries until explicitly issued, then immutable", () => {
    const action: ReviewAction = {
      kind: "bill",
      id: "DRAFT-B",
      date: day,
      due: day,
      party: "Fictional supplier",
      description: "Joinery",
      amount: "40.01",
      projectId: "demo-apartment",
      departmentId: "JOINERY",
      category: "Cost of Sales",
      poReference: "Fictional PO",
      issue: false,
    };
    const initial = createReviewState();
    let state = applyReviewAction(initial, action);
    expect(reviewSnapshot(state).expenseSummary).toEqual(
      reviewSnapshot(initial).expenseSummary,
    );
    state = applyReviewAction(state, { kind: "issue-bill", id: "DRAFT-B" });
    expect(
      reviewSnapshot(state).expenseSummary.byDepartment.find(
        (item) => item.id === "JOINERY",
      )!.totalFils,
    ).toBe("4001");
    expect(() =>
      applyReviewAction(state, {
        ...action,
        kind: "update-bill-draft",
        departmentId: "MEP",
        revision: 1,
      }),
    ).toThrow(/unposted/);
    expect(state.bills.at(-1)!.departmentId).toBe("JOINERY");
  });

  it("honors report periods and does not classify internal transfers as project expenses", () => {
    let state = applyReviewAction(createReviewState(), account("thomas"));
    state = applyReviewAction(state, transfer("T"));
    const report = planningExpenseReports(
      state,
      [],
      "2026-10-22",
      "2026-10-22",
    );
    expect(report.expenseSummary.totalFils).toBe("0");
    expect(report.projectProfitability[0].netProfitFils).toBe("0");
  });

  it("separates selected-period profit and cash movements from as-of balances and aging", () => {
    let state = applyReviewAction(createReviewState(), account("thomas"));
    state = applyReviewAction(state, transfer("PERIOD-T"));
    state = applyReviewAction(state, {
      kind: "expense",
      id: "PERIOD-E",
      date: day,
      payee: "Fictional",
      description: "Same-day expense",
      amount: "2.01",
      account: "thomas",
      departmentId: "MEP",
    });
    const data = reviewSnapshot(state, day, { from: day, to: day });
    expect(data.period).toEqual({ from: day, to: day });
    expect(data.metrics.revenueFils).toBe("0");
    expect(data.metrics.netProfitFils).toBe("-201");
    expect(data.metrics.receivablesFils).toBe("1500000");
    expect(data.expenseSummary.totalFils).toBe("201");
    const bank = data.cashAccounts.find((item) => item.id === "bank")!;
    expect(bank.openingBalanceFils).toBe("5200000");
    expect(bank.transactions).toHaveLength(1);
    expect(bank.closingBalanceFils).toBe("5100000");
    expect(data.pnl.from).toBe(day);
    expect(data.pnl.to).toBe(day);
    expect(data.balance.asOf).toBe(day);
    const earlierPeriod = reviewSnapshot(state, day, {
      from: "2026-10-20",
      to: "2026-10-21",
    });
    expect(earlierPeriod.metrics.netProfitFils).toBe("0");
    expect(earlierPeriod.metrics.bankFils).toBe("5100000");
    expect(
      earlierPeriod.cashAccounts.find((item) => item.id === "bank")!
        .closingBalanceFils,
    ).toBe("5200000");
  });

  it("rejects invalid report dates and reversed periods instead of returning misleading totals", () => {
    const state = createReviewState();
    expect(() =>
      reviewSnapshot(state, day, { from: "2026-10-23", to: day }),
    ).toThrow(/start date/);
    expect(() =>
      reviewSnapshot(state, day, { from: "2026-02-30", to: day }),
    ).toThrow();
  });

  it("uses the chosen approved custom purchase ledger when a bill is explicitly issued", () => {
    let state = applyReviewAction(createReviewState(), {
      kind: "create-expense-ledger",
      id: "MATERIAL",
      name: "Electrical materials",
      group: "Direct Expense",
    });
    const action: ReviewAction = {
      kind: "bill",
      id: "CUSTOM-B",
      party: "Sample Supplier B",
      date: day,
      due: day,
      description: "Electrical supplies",
      amount: "10.01",
      category: "Cost of Sales",
      projectId: "demo-apartment",
      departmentId: "MEP",
      ledgerId: "MATERIAL",
      poReference: "Fictional PO",
      issue: false,
    };
    state = applyReviewAction(state, action);
    const journalCount = state.accounting.journals.length;
    state = applyReviewAction(state, { kind: "issue-bill", id: "CUSTOM-B" });
    expect(state.accounting.journals).toHaveLength(journalCount + 1);
    expect(state.accounting.journals.at(-1)!.lines[0].accountId).toBe(
      "expense-MATERIAL",
    );
    expect(
      reviewSnapshot(state).expenseSummary.byDepartment.find(
        (item) => item.id === "MEP",
      )!.totalFils,
    ).toBe("1001");
    expect(() =>
      applyReviewAction(state, {
        ...action,
        id: "MISMATCH",
        category: "Operating Expense",
      }),
    ).toThrow(/matches/);
  });
});
