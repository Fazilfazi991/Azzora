import test from "node:test";
import assert from "node:assert/strict";
import { activityPeriod, asOf, bills, deriveFixture, invoices, journals, overdueDays } from "./finance-fixture.mjs";

test("fictional journal balances and dashboard profit labels reconcile", () => {
  const report = deriveFixture();
  assert.equal(report.debitTotal, report.creditTotal);
  assert.equal(report.revenue, 2_000_000);
  assert.equal(report.costOfSales, 800_000);
  assert.equal(report.operatingExpenses, 100_000);
  assert.equal(report.grossProfit, 1_200_000);
  assert.equal(report.netProfit, 1_100_000);
  assert.equal(report.grossProfit - report.operatingExpenses, report.netProfit);
  assert.equal(report.assets, report.liabilitiesAndEquity);
  assert.equal(report.assets, 6_700_000);
  assert.equal(report.bank, 5_200_000);
  assert.equal(report.cash, 0);
  assert.equal(report.bankAndCash, 5_200_000);
  assert.equal(report.receivables, 1_500_000);
  assert.equal(report.payables, 600_000);
});

test("open document amounts agree with journal controls and original due dates remain visible", () => {
  const report = deriveFixture();
  assert.equal(invoices.reduce((sum, item) => sum + item.gross - item.paid, 0), report.receivables);
  assert.equal(bills.reduce((sum, item) => sum + item.gross - item.paid, 0), report.payables);
  assert.equal(invoices[0].due, "31 Aug 2026");
  assert.equal(overdueDays(invoices[0].dueISO), 51);
  assert.equal(overdueDays(invoices[1].dueISO), 11);
  assert.equal(overdueDays(bills[0].dueISO), 6);
  assert.equal(overdueDays(bills[1].dueISO), 0);
  assert.equal(invoices[1].paid, 500_000);
  assert.equal(bills[0].paid, 300_000);
  assert.match(activityPeriod, /January.*October/);
  assert.equal(asOf, "21 October 2026");
  assert.equal(journals.length, 7);
});
