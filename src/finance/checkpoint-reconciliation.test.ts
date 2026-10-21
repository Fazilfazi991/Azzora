import { describe, expect, it } from "vitest";
import { addAccount, addPeriod, emptyAccounting, postJournal } from "../accounting/core";
import { createCustodyState, custodyBalanceFils, custodyReconciliation, recordCustodyPurchase, transactionClassification, transferCustody } from "./custody";

describe("synthetic custody and journal reconciliation", () => {
  it("treats Thomas's advance as a transfer and recognizes only the linked purchase once", () => {
    const custodyAccounts = [
      { id: "bank", name: "Company bank", kind: "bank" as const, currency: "AED" as const },
      { id: "thomas", name: "Thomas cash", kind: "staff-holder" as const, holderId: "thomas-person", currency: "AED" as const },
    ];
    let custody = createCustodyState(custodyAccounts, [
      { accountId: "bank", amountFils: "200000" },
      { accountId: "thomas", amountFils: "0" },
    ]);
    const transfer = {
      kind: "transfer" as const,
      id: "transfer-to-thomas",
      date: "2026-10-21",
      amountFils: "200000",
      reference: "Synthetic advance",
      recordedBy: "fixture-actor",
      fromAccountId: "bank",
      toAccountId: "thomas",
    };
    custody = transferCustody(custody, transfer);
    expect(transactionClassification(transfer).purchaseOutflowFils).toBe("0");
    expect(custodyBalanceFils(custody, "thomas")).toBe("200000");

    let accounting = emptyAccounting();
    for (const [id, code, type] of [
      ["bank", "1000", "Asset"],
      ["thomas", "1010", "Asset"],
      ["materials", "5000", "Cost of Sales"],
    ] as const)
      accounting = addAccount(accounting, {
        id, code, name: id, type, postable: true, status: "Active",
      });
    accounting = addPeriod(accounting, {
      id: "october", start: "2026-10-01", end: "2026-10-31", status: "Open",
    });
    accounting = postJournal(accounting, {
      id: "journal-transfer", postingKey: "transfer-to-thomas", source: { kind: "Synthetic Fixture", id: "transfer-to-thomas", action: "Transfer" },
      date: "2026-10-21", recordedAt: "2026-10-21T10:00:00.000Z", memo: "Cash custody transfer", currency: "AED",
      lines: [
        { accountId: "thomas", debitFils: "200000", creditFils: "0" },
        { accountId: "bank", debitFils: "0", creditFils: "200000" },
      ],
    }).state;

    const purchase = {
      kind: "purchase" as const,
      id: "thomas-materials-payment",
      date: "2026-10-21",
      amountFils: "35000",
      reference: "Synthetic materials receipt",
      recordedBy: "fixture-actor",
      fromAccountId: "thomas",
      costId: "materials-cost-1",
      projectId: "fixture-project",
    };
    custody = recordCustodyPurchase(custody, purchase);
    accounting = postJournal(accounting, {
      id: "journal-purchase", postingKey: "materials-cost-1", source: { kind: "Synthetic Fixture", id: "materials-cost-1", action: "Purchase" },
      date: "2026-10-21", recordedAt: "2026-10-21T10:05:00.000Z", memo: "Materials paid by Thomas", currency: "AED",
      lines: [
        { accountId: "materials", debitFils: "35000", creditFils: "0" },
        { accountId: "thomas", debitFils: "0", creditFils: "35000" },
      ],
    }).state;

    const balance = (accountId: string) => accounting.journals.flatMap((entry) => entry.lines)
      .filter((line) => line.accountId === accountId)
      .reduce((sum, line) => sum + BigInt(line.debitFils) - BigInt(line.creditFils), 0n);
    expect(custodyBalanceFils(custody, "thomas")).toBe("165000");
    expect(balance("thomas")).toBe(165000n);
    expect(balance("materials")).toBe(35000n);
    expect(transactionClassification(purchase).purchaseOutflowFils).toBe("35000");
    expect(custodyReconciliation(custody)).toMatchObject({
      openingFils: "200000", closingFils: "165000", purchaseOutflowFils: "35000", differenceFils: "0", balanced: true,
    });
    expect(accounting.journals).toHaveLength(2);
  });
});
