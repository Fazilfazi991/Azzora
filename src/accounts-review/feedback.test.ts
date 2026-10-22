import { describe, expect, it } from "vitest";
import {
  applyReviewAction,
  createReviewState,
  reviewSnapshot,
  type ReviewState,
  type ReviewAction,
} from "./domain";
import { expenseLedgersFor, type ExpenseGroup } from "./expense-ledgers";
import { decodeReview, encodeReview } from "./hosted-store";
const items = [
  { description: "Plumbing Item A", quantity: "10", unit: "Nos", rate: "6.00" },
  { description: "Plumbing Item B", quantity: "5", unit: "Nos", rate: "20.00" },
  { description: "Pipe Fitting", quantity: "3", unit: "Nos", rate: "15.00" },
];
const invoice = (
  id: string,
): Extract<ReviewAction, { kind: "invoice" | "update-invoice-draft" }> => ({
  kind: "invoice",
  id,
  party: "Fictional customer",
  date: "2026-10-22",
  due: "2026-10-22",
  description: "Itemized invoice",
  items,
  amount: "0.01",
  issue: false,
  invoiceType: "Normal Invoice",
});
const bill = (
  id: string,
): Extract<ReviewAction, { kind: "bill" | "update-bill-draft" }> => ({
  kind: "bill",
  id,
  party: "Sample Supplier B",
  date: "2026-10-22",
  due: "2026-10-22",
  description: "Itemized bill",
  items,
  amount: "0.01",
  issue: false,
  category: "Cost of Sales",
  poReference: "PO-" + id,
  invoiceReference: "REF-" + id,
  projectId: "demo-apartment",
});
const metrics = (state: ReviewState) => reviewSnapshot(state).metrics;
describe("itemized document integration and legacy boundaries", () => {
  it("computes item totals server-side and saves invoice drafts without posting", () => {
    const initial = createReviewState(),
      next = applyReviewAction(initial, invoice("ITEM-INV"));
    expect(next.invoices.at(-1)).toMatchObject({
      amountFils: "20500",
      subtotalFils: "20500",
      taxFils: "0",
      taxStatus: "Policy pending",
      status: "Draft",
    });
    expect(metrics(next)).toEqual(metrics(initial));
    expect(next.invoices.at(-1)!.items!.map((item) => item.amountFils)).toEqual(
      ["6000", "10000", "4500"],
    );
    expect(initial.invoices).toHaveLength(4);
  });
  it("reopens, edits and issues once without rewriting an issued snapshot or payment history", () => {
    const initial = createReviewState();
    let state = applyReviewAction(initial, invoice("ITEM-INV"));
    state = applyReviewAction(state, {
      ...invoice("ITEM-INV"),
      kind: "update-invoice-draft",
      revision: 0,
      items: items.slice(0, 2),
    });
    expect(state.invoices.at(-1)!.amountFils).toBe("16000");
    state = applyReviewAction(state, { kind: "issue-invoice", id: "ITEM-INV" });
    const issued = structuredClone(state);
    expect(() =>
      applyReviewAction(state, {
        ...invoice("ITEM-INV"),
        kind: "update-invoice-draft",
        revision: 1,
      }),
    ).toThrow(/unissued/);
    expect(() =>
      applyReviewAction(state, { kind: "issue-invoice", id: "ITEM-INV" }),
    ).toThrow(/draft invoice/);
    expect(state).toEqual(issued);
    expect(state.invoices.slice(0, 4)).toEqual(initial.invoices);
    expect(state.receipts).toEqual(initial.receipts);
  });
  it("rejects stale draft updates and invalid item calculations atomically", () => {
    const state = applyReviewAction(createReviewState(), invoice("ITEM-INV"));
    expect(() =>
      applyReviewAction(state, {
        ...invoice("ITEM-INV"),
        kind: "update-invoice-draft",
        revision: 8,
      }),
    ).toThrow(/current/);
    expect(() =>
      applyReviewAction(state, {
        ...invoice("BAD"),
        items: [{ ...items[0], rate: "-1" }],
      }),
    ).toThrow();
    expect(state.invoices.at(-1)!.amountFils).toBe("20500");
  });
  it("keeps purchase drafts outside AP, aging and settlements, then posts stored lines once", () => {
    const initial = createReviewState();
    let state = applyReviewAction(initial, bill("ITEM-BILL"));
    expect(metrics(state)).toEqual(metrics(initial));
    expect(reviewSnapshot(state).bills.at(-1)).toMatchObject({
      outstandingFils: "0",
      ageing: null,
    });
    expect(() =>
      applyReviewAction(state, {
        kind: "supplier-payment",
        id: "PAY-DRAFT",
        documentId: "ITEM-BILL",
        amount: "1.00",
        date: "2026-10-22",
        account: "bank",
      }),
    ).toThrow(/issued/);
    state = applyReviewAction(state, { kind: "issue-bill", id: "ITEM-BILL" });
    expect(
      BigInt(metrics(state).payablesFils) -
        BigInt(metrics(initial).payablesFils),
    ).toBe(20500n);
    expect(state.accounting.journals.at(-1)!.lines[0].projectId).toBe(
      "demo-apartment",
    );
    expect(() =>
      applyReviewAction(state, {
        ...bill("ITEM-BILL"),
        kind: "update-bill-draft",
        revision: 0,
      }),
    ).toThrow(/unposted/);
    state = applyReviewAction(state, {
      kind: "supplier-payment",
      id: "PAY-ITEM",
      documentId: "ITEM-BILL",
      amount: "50.25",
      date: "2026-10-22",
      account: "bank",
    });
    expect(reviewSnapshot(state).bills.at(-1)!.outstandingFils).toBe("15475");
    expect(reviewSnapshot(state).balance.balanced).toBe(true);
  });
  it("does not post an itemized proforma or permit its direct receipt allocation", () => {
    const initial = createReviewState();
    const state = applyReviewAction(initial, {
      ...invoice("PRO-ITEM"),
      invoiceType: "Proforma",
      issue: true,
    });
    expect(metrics(state)).toEqual(metrics(initial));
    expect(() =>
      applyReviewAction(state, {
        kind: "receipt",
        id: "PRO-RECEIPT",
        documentId: "PRO-ITEM",
        date: "2026-10-22",
        amount: "1.00",
        account: "bank",
      }),
    ).toThrow(/issued document/);
  });
  it("preserves legacy totals and journals when adding fields or serializing a session", () => {
    const legacy = createReviewState(),
      before = structuredClone(legacy);
    expect(reviewSnapshot(legacy).invoices[0].items).toBeUndefined();
    expect(legacy).toEqual(before);
    const state = applyReviewAction(legacy, invoice("NEW"));
    expect(state.invoices.slice(0, 4)).toEqual(legacy.invoices);
    expect(state.accounting.journals).toEqual(legacy.accounting.journals);
    expect(
      reviewSnapshot(decodeReview<ReviewState>(encodeReview(state))),
    ).toEqual(reviewSnapshot(state));
  });
});

describe("persisted custom expense ledger integration", () => {
  it.each([
    "Administrative Expense",
    "Direct Expense",
    "Indirect Expense",
  ] as const)(
    "maps %s to the correct chart account with no creation posting",
    (group) => {
      const initial = createReviewState();
      const state = applyReviewAction(initial, {
        kind: "create-expense-ledger",
        id: "LEDGER-1",
        name: "Fictional labour",
        group,
        description: "QA only",
      });
      const ledger = expenseLedgersFor(state).at(-1)!;
      expect(
        state.accounting.accounts.find(
          (account) => account.id === ledger.accountId,
        )!.type,
      ).toBe(group === "Direct Expense" ? "Cost of Sales" : "Expense");
      expect(state.accounting.journals).toEqual(initial.accounting.journals);
      expect(metrics(state)).toEqual(metrics(initial));
      expect(
        expenseLedgersFor(decodeReview<ReviewState>(encodeReview(state))).at(
          -1,
        ),
      ).toEqual(ledger);
    },
  );
  it("rejects invalid and duplicate normalized names and generates stable unique codes", () => {
    let state = createReviewState();
    state = applyReviewAction(state, {
      kind: "create-expense-ledger",
      id: "L1",
      name: "  Site   Labour ",
      group: "Direct Expense",
    });
    expect(() =>
      applyReviewAction(state, {
        kind: "create-expense-ledger",
        id: "L2",
        name: "site labour",
        group: "Indirect Expense",
      }),
    ).toThrow(/already exists/);
    for (const name of ["", "<script>", "x"])
      expect(() =>
        applyReviewAction(state, {
          kind: "create-expense-ledger",
          id: "BAD",
          name,
          group: "Indirect Expense",
        }),
      ).toThrow();
    state = applyReviewAction(state, {
      kind: "create-expense-ledger",
      id: "L2",
      name: "Other Labour",
      group: "Direct Expense",
    });
    expect(
      new Set(expenseLedgersFor(state).map((ledger) => ledger.code)).size,
    ).toBe(4);
  });
  it("charges direct expenses to project Cost of Sales and preserves bank and group snapshots", () => {
    const initial = createReviewState();
    let state = applyReviewAction(initial, {
      kind: "create-expense-ledger",
      id: "DIRECT",
      name: "Project Labour",
      group: "Direct Expense",
    });
    const entry: ReviewAction = {
      kind: "expense",
      id: "EXP",
      payee: "Synthetic crew",
      date: "2026-10-22",
      amount: "123.45",
      description: "Labour",
      ledgerId: "DIRECT",
      account: "bank",
      scope: "project",
      projectId: "demo-apartment",
    };
    expect(() =>
      applyReviewAction(state, { ...entry, scope: "company", projectId: "" }),
    ).toThrow(/require a project/);
    state = applyReviewAction(state, entry);
    expect(state.expenses.at(-1)).toMatchObject({
      ledgerId: "DIRECT",
      ledgerName: "Project Labour",
      expenseGroup: "Direct Expense",
      projectId: "demo-apartment",
    });
    expect(
      BigInt(metrics(state).costOfSalesFils) -
        BigInt(metrics(initial).costOfSalesFils),
    ).toBe(12345n);
    expect(metrics(state).operatingExpensesFils).toBe(
      metrics(initial).operatingExpensesFils,
    );
    expect(
      BigInt(metrics(initial).bankFils) - BigInt(metrics(state).bankFils),
    ).toBe(12345n);
    expect(reviewSnapshot(state).projectCosts[0].costFils).toBe("12345");
    expect(reviewSnapshot(state).balance.balanced).toBe(true);
  });
  it("posts administrative and indirect expenses to their own operating accounts", () => {
    let state = createReviewState();
    const initial = metrics(state);
    for (const [index, group] of (
      ["Administrative Expense", "Indirect Expense"] as ExpenseGroup[]
    ).entries()) {
      state = applyReviewAction(state, {
        kind: "create-expense-ledger",
        id: "L" + index,
        name: "Fictional ledger " + index,
        group,
      });
      state = applyReviewAction(state, {
        kind: "expense",
        id: "E" + index,
        payee: "Sample",
        date: "2026-10-22",
        amount: "10.00",
        description: "Office",
        account: "cash",
        ledgerId: "L" + index,
        scope: "company",
      });
    }
    expect(
      BigInt(metrics(state).operatingExpensesFils) -
        BigInt(initial.operatingExpensesFils),
    ).toBe(2000n);
    expect(metrics(state).costOfSalesFils).toBe(initial.costOfSalesFils);
    expect(reviewSnapshot(state).trial.balanced).toBe(true);
  });
});
