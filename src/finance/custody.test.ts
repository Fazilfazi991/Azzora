import { describe, expect, it } from "vitest";
import {
  createCustodyState,
  custodyBalanceFils,
  custodyPurchaseOutflowFils,
  custodyReconciliation,
  custodyStatement,
  recordCustodyPurchase,
  transactionClassification,
  transferCustody,
  type CustodyPurchase,
  type CustodyTransfer,
} from "./custody";

const accounts = [
  {
    id: "bank",
    name: "Company Bank",
    kind: "bank" as const,
    currency: "AED" as const,
  },
  {
    id: "petty",
    name: "Petty Cash",
    kind: "cash" as const,
    currency: "AED" as const,
  },
  {
    id: "thomas",
    name: "Thomas Cash",
    kind: "staff-holder" as const,
    holderId: "person-thomas",
    currency: "AED" as const,
  },
];
const opening = [{ accountId: "bank", amountFils: "1000000" }];
const transfer: CustodyTransfer = {
  id: "transfer-1",
  kind: "transfer",
  fromAccountId: "bank",
  toAccountId: "thomas",
  amountFils: "200000",
  date: "2026-10-21",
  reference: "BANK-TO-THOMAS",
  recordedBy: "owner",
};
const purchase: CustodyPurchase = {
  id: "purchase-1",
  kind: "purchase",
  fromAccountId: "thomas",
  costId: "approved-receipt-1",
  projectId: "project-1",
  amountFils: "35000",
  date: "2026-10-21",
  reference: "SITE-RECEIPT-1",
  recordedBy: "owner",
};

describe("custody transaction classification and reconciliation", () => {
  it("tracks Thomas AED 2,000 transfer then AED 350 purchase as AED 1,650 cash", () => {
    const initial = createCustodyState(accounts, opening);
    const funded = transferCustody(initial, transfer);
    expect(custodyBalanceFils(funded, "thomas")).toBe("200000");
    expect(custodyBalanceFils(funded, "bank")).toBe("800000");
    expect(transactionClassification(transfer)).toEqual({
      cashMovementFils: "200000",
      purchaseOutflowFils: "0",
      isInternalTransfer: true,
    });
    expect(custodyPurchaseOutflowFils(funded)).toBe("0");
    const spent = recordCustodyPurchase(funded, purchase);
    expect(custodyBalanceFils(spent, "thomas")).toBe("165000");
    expect(custodyPurchaseOutflowFils(spent)).toBe("35000");
    expect(transactionClassification(purchase).isInternalTransfer).toBe(false);
    expect(custodyReconciliation(spent)).toEqual({
      openingFils: "1000000",
      closingFils: "965000",
      purchaseOutflowFils: "35000",
      differenceFils: "0",
      balanced: true,
    });
    expect(initial.transactions).toHaveLength(0);
  });

  it("shows running balances and allows an ordinary return transfer without cost", () => {
    let state = transferCustody(
      createCustodyState(accounts, opening),
      transfer,
    );
    state = recordCustodyPurchase(state, purchase);
    state = transferCustody(state, {
      ...transfer,
      id: "return-1",
      fromAccountId: "thomas",
      toAccountId: "bank",
      amountFils: "50000",
      reference: "THOMAS-RETURN",
    });
    expect(
      custodyStatement(state, "thomas").map((line) => [
        line.movementFils,
        line.balanceFils,
      ]),
    ).toEqual([
      ["200000", "200000"],
      ["-35000", "165000"],
      ["-50000", "115000"],
    ]);
    expect(custodyPurchaseOutflowFils(state)).toBe("35000");
    expect(custodyReconciliation(state).balanced).toBe(true);
  });

  it("is idempotent by transaction ID and blocks duplicate linked purchase costs", () => {
    const funded = transferCustody(
      createCustodyState(accounts, opening),
      transfer,
    );
    expect(transferCustody(funded, transfer)).toBe(funded);
    expect(() =>
      transferCustody(funded, { ...transfer, amountFils: "100000" }),
    ).toThrow(/different content/);
    const spent = recordCustodyPurchase(funded, purchase);
    expect(recordCustodyPurchase(spent, purchase)).toBe(spent);
    expect(() =>
      recordCustodyPurchase(spent, { ...purchase, id: "purchase-2" }),
    ).toThrow(/cannot be paid twice/);
  });

  it("rejects negative balances, self-transfers, invalid references and malformed accounts", () => {
    const state = createCustodyState(accounts, opening);
    expect(() =>
      transferCustody(state, { ...transfer, amountFils: "1100000" }),
    ).toThrow(/insufficient available balance/);
    expect(() =>
      transferCustody(state, { ...transfer, toAccountId: "bank" }),
    ).toThrow(/must differ/);
    expect(() =>
      recordCustodyPurchase(state, {
        ...purchase,
        fromAccountId: "bank",
        costId: "",
      }),
    ).toThrow(/Purchase cost ID/);
    expect(() =>
      createCustodyState([{ ...accounts[2], holderId: undefined }], []),
    ).toThrow(/Cash holder/);
    expect(() =>
      createCustodyState(accounts, [{ accountId: "missing", amountFils: "1" }]),
    ).toThrow(/existing account/);
  });
});
