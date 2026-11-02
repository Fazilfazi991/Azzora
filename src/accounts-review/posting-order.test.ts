import { expect, it } from "vitest";
import { applyReviewAction, createReviewState, reviewSnapshot } from "./domain";

it("keeps same-day funding before spending regardless of random identifier order", () => {
  const created = applyReviewAction(createReviewState(), {
    kind: "create-cash-account",
    id: "thomas",
    name: "Thomas Cash",
    type: "staff",
    holder: "Thomas",
  });
  const funded = applyReviewAction(created, {
    kind: "transfer",
    id: "ZZZ-FUNDING",
    date: "2026-11-02",
    fromAccount: "bank",
    toAccount: "thomas",
    amount: "100.00",
    reference: "Fictional cash custody funding",
  });
  const original = structuredClone(funded.accounting.journals);
  const spent = applyReviewAction(funded, {
    kind: "expense",
    id: "AAA-SPEND",
    date: "2026-11-02",
    payee: "Fictional shop",
    description: "Fictional company consumables",
    amount: "25.00",
    account: "thomas",
    ledgerId: "legacy-operating",
    scope: "company",
  });
  const data = reviewSnapshot(spent, "2026-11-02");
  const cash = data.cashAccounts.find((a) => a.id === "thomas")!;
  expect(cash.transactions.map((line) => line.journalId)).toEqual([
    "J-ZZZ-FUNDING",
    "J-AAA-SPEND",
  ]);
  expect(cash.transactions.map((line) => line.runningBalanceFils)).toEqual([
    "10000",
    "7500",
  ]);
  expect(cash.balanceFils).toBe("7500");
  expect(funded.accounting.journals).toEqual(original);
  expect(spent.accounting.journals.slice(0, -1)).toEqual(original);
  expect(data.trial.balanced && data.balance.balanced).toBe(true);
});
