import { expect, it } from "vitest";
import {
  applySharedCommand,
  createSharedCompanyState,
  type SharedActor,
} from "./domain";
import { serializeCanonical } from "./canonical";

it("projects an Accountant-origin bill into one Manager cost and reuses its payment state without a second posting", () => {
  const owner: SharedActor = {
    userId: "fictional-owner",
    personId: "fictional-owner",
    companyId: "fictional",
    sessionId: "unit-only",
    assurance: "aal2",
    grant: {
      userId: "fictional-owner",
      companyId: "fictional",
      active: true,
      roles: ["owner"],
      workspaces: ["manager", "accountant"],
      projectIds: [],
      capabilities: [
        "project.write",
        "finance.draft",
        "finance.simulate",
        "access.manage",
      ],
    },
  };
  let state = createSharedCompanyState([
    {
      id: owner.userId,
      name: "Fictional Owner",
      role: "Project Manager",
      demoRole: "Owner",
      email: "owner@fictional.test",
      phone: "",
      status: "Active",
      capacity: 100,
    },
  ]);
  const act = (action: unknown) => {
    state = applySharedCommand(
      state,
      { kind: "accounts.action", payload: { action } },
      owner,
    );
  };
  act({
    kind: "bill",
    id: "fictional-accountant-bill",
    party: "Fictional bill supplier",
    date: "2026-11-04",
    due: "2026-11-30",
    description: "Fictional standalone bill",
    amount: "30",
    category: "Operating Expense",
    poReference: "FICTIONAL-STANDALONE",
  });
  const cost = state.manager.expenses.find(
    (value) => value.supplierBillId === "fictional-accountant-bill",
  )!;
  expect(cost.amount).toBe("30.00");
  expect(cost.paidAmount).toBe("0.00");
  expect(
    state.finance.accounting.journals.filter(
      (value) => value.source.id === "fictional-accountant-bill",
    ),
  ).toHaveLength(1);
  act({
    kind: "supplier-payment",
    id: "fictional-payment",
    documentId: "fictional-accountant-bill",
    date: "2026-11-04",
    amount: "10",
    account: "bank",
    reference: "FICTIONAL-PAY",
  });
  act({
    kind: "create-expense-ledger",
    id: "fictional-ledger",
    name: "Fictional recurring cost",
    group: "Indirect Expense",
  });
  expect(
    state.manager.expenses.filter(
      (value) => value.supplierBillId === "fictional-accountant-bill",
    ),
  ).toHaveLength(1);
  expect(
    state.manager.expenses.find((value) => value.id === cost.id)!.paidAmount,
  ).toBe("10.00");
  expect(
    serializeCanonical(state).records.filter(
      (value) =>
        value.entity_type === "supplier_bill" &&
        value.id === "fictional-accountant-bill",
    ),
  ).toHaveLength(1);
  expect(
    state.finance.accounting.journals.filter(
      (value) => value.source.id === "fictional-accountant-bill",
    ),
  ).toHaveLength(1);
});

it("preserves an Accountant-origin itemized invoice in Manager without rewriting issued history", () => {
  const owner: SharedActor = {
    userId: "owner",
    personId: "owner",
    companyId: "fictional",
    sessionId: "unit",
    assurance: "aal2",
    grant: {
      userId: "owner",
      companyId: "fictional",
      active: true,
      roles: ["owner"],
      workspaces: ["manager", "accountant"],
      projectIds: [],
      capabilities: [
        "finance.draft",
        "finance.simulate",
        "project.write",
        "access.manage",
      ],
    },
  };
  let state = createSharedCompanyState();
  const action = {
    kind: "invoice",
    id: "itemized-source",
    party: "Fictional item customer",
    date: "2026-11-04",
    due: "2026-11-30",
    description: "Fictional itemized source",
    invoiceType: "Normal Invoice",
    issue: false,
    items: [
      {
        description: "Fictional cable",
        quantity: "0.0625",
        unit: "m",
        rate: "335",
        details: "Original source detail",
      },
      {
        description: "Fictional fitting",
        quantity: "2",
        unit: "Nos",
        rate: "14",
      },
    ],
  };
  const act = (value: unknown) => {
    state = applySharedCommand(
      state,
      { kind: "accounts.action", payload: { action: value } },
      owner,
    );
  };
  act(action);
  expect(
    state.manager.invoices[0].lines.map((v) => [
      v.description,
      v.quantity,
      v.rate,
    ]),
  ).toEqual(action.items.map((v) => [v.description, v.quantity, v.rate]));
  const originalItems = structuredClone(state.finance.invoices[0].items);
  act({ kind: "issue-invoice", id: action.id });
  expect(state.manager.invoices[0].lines).toHaveLength(2);
  expect(state.manager.invoices[0].snapshot?.grand).toBe(
    state.finance.invoices[0].amountFils,
  );
  expect(state.finance.invoices[0].items).toEqual(originalItems);
  const snapshot = JSON.stringify(state.manager.invoices[0]);
  act({
    kind: "create-expense-ledger",
    id: "unrelated-ledger",
    name: "Fictional ancillary cost",
    group: "Indirect Expense",
  });
  expect(JSON.stringify(state.manager.invoices[0])).toBe(snapshot);
  expect(
    state.finance.accounting.journals.filter((v) => v.source.id === action.id),
  ).toHaveLength(1);
});
