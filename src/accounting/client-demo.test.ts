import { describe, expect, it } from "vitest";
import { buildClientDemoScenario } from "./client-demo";

describe("isolated client accountant scenario", () => {
  it("keeps the older invoice aging when a receipt targets only the newer invoice", () => {
    const demo = buildClientDemoScenario();
    expect(demo.asOf).toBe("2026-10-21");
    expect(demo.customerReceipt.allocations).toEqual([
      { documentId: "demo:invoice-newer", amountFils: 500_000n },
    ]);
    expect(demo.arAp.receivables.map(({ outstandingFils, bucket }) => ({ outstandingFils, bucket }))).toEqual([
      { outstandingFils: "1200000", bucket: "31–60" },
      { outstandingFils: "300000", bucket: "1–30" },
    ]);
  });

  it("reconciles partial supplier settlements and synthetic reports", () => {
    const demo = buildClientDemoScenario();
    expect(demo.arAp.payables.map((row) => row.outstandingFils)).toEqual(["400000", "200000"]);
    expect(demo.supplierPayments.map((payment) => payment.allocations[0]?.documentId)).toEqual([
      "demo:bill-older", "demo:bill-newer",
    ]);
    expect(demo.reports.trialBalance.balanced).toBe(true);
    expect(demo.reports.trialBalance.rows.find((row) => row.accountId === "demo:ar")?.debitFils).toBe("1500000");
    expect(demo.reports.trialBalance.rows.find((row) => row.accountId === "demo:ap")?.creditFils).toBe("600000");
    expect(demo.reports.profitAndLoss.netProfitFils).toBe("1100000");
    expect(demo.reports.balanceSheet.balanced).toBe(true);
    expect(demo.reports.balanceSheet.differenceFils).toBe("0");
  });

  it("shows unposted project expenses and a comparable same-supplier price change", () => {
    const demo = buildClientDemoScenario();
    expect(demo.expenses.map((expense) => expense.status)).toEqual(["submitted", "submitted"]);
    expect(demo.expenses.map((expense) => expense.categoryId)).toEqual([
      "demo:materials", "demo:site-consumables",
    ]);
    expect(demo.priceAlert.kind).toBe("increase");
    expect(demo.priceAlert.previous?.netUnitPriceMinor).toBe("500");
    expect(demo.priceAlert.currentNetUnitPriceMinor).toBe("600");
    expect(demo.priceAlert.changePercent).toBe("+20.00%");
    expect(demo.reports.generalLedgers.every((ledger) => ledger.lines.every((line) => !line.journalId.startsWith("demo:expense-")))).toBe(true);
  });

  it("returns the same in-memory fixture on every call", () => {
    expect(buildClientDemoScenario()).toEqual(buildClientDemoScenario());
  });
});
