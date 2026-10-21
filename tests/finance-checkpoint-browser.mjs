import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";

const output = process.env.AZZORA_FINANCE_EVIDENCE_DIR || "tmp/finance-c2";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const checks = [];
const pageErrors = [];
try {
  for (const width of [390, 430, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(`${width}: ${error.message}`));
    await page.goto(`${auditUrl}/#/accountant-preview`);
    await expect(page.getByRole("heading", { name: "Accountant workspace" })).toBeVisible();
    await expect(page.getByText("Browser-local synthetic demo")).toBeVisible();
    await expect(page.getByText(/no secure login, trusted role authorization/)).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("azzora-demo-v1"));
    await page.screenshot({ path: `${output}/accountant-overview-${width}.png`, fullPage: true });
    checks.push(`${width}: route and explicit demo boundary`);

    const nav = page.getByRole("navigation", { name: "Accountant reports" });
    for (const [name, heading] of [
      ["General Ledger", "General Ledger"],
      ["Trial Balance", "Trial Balance"],
      ["Profit & Loss", "Profit & Loss"],
      ["Balance Sheet", "Balance Sheet"],
      ["AR / AP", "Receivables & Payables"],
    ]) {
      await nav.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    checks.push(`${width}: six accessible report views`);
    await expect(page.getByText("Existing CRM document balances")).toBeVisible();
    await expect(page.getByRole("table", { name: "Customer receivables from existing CRM documents" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Supplier payables from existing CRM documents" })).toBeVisible();
    await page.screenshot({ path: `${output}/accountant-ar-ap-${width}.png`, fullPage: true });
    checks.push(`${width}: read-only legacy AR/AP tables`);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    checks.push(`${width}: no page-level horizontal overflow`);
    expect(await page.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(raw);
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(raw);
    checks.push(`${width}: viewing and refreshing do not write saved records`);
    await context.close();
  }
  const populatedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const populatedPage = await populatedContext.newPage();
  await populatedPage.goto(`${auditUrl}/#/accounts/invoices`);
  await populatedPage.getByRole("button", { name: "New Invoice", exact: true }).click();
  const invoiceDialog = populatedPage.getByRole("dialog").last();
  await invoiceDialog.getByLabel("Invoice customer").selectOption({ index: 1 });
  await invoiceDialog.getByLabel("Item 1 description").fill("Synthetic browser acceptance item");
  await invoiceDialog.getByLabel("Item 1 rate").fill("100");
  await invoiceDialog.getByRole("button", { name: "Save Draft Invoice" }).click();
  await populatedPage.getByRole("button", { name: "Issue Invoice" }).click();
  const beforeReport = await populatedPage.evaluate(() => localStorage.getItem("azzora-demo-v1"));
  await populatedPage.goto(`${auditUrl}/#/accountant-preview`);
  await populatedPage.getByRole("navigation", { name: "Accountant reports" }).getByRole("button", { name: "AR / AP" }).click();
  const customerTable = populatedPage.getByRole("table", { name: "Customer receivables from existing CRM documents" });
  await expect(customerTable).toContainText("INV-");
  await expect(customerTable).toContainText("AED 105.00");
  expect(await populatedPage.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(beforeReport);
  await populatedPage.screenshot({ path: `${output}/accountant-ar-ap-populated-1440.png`, fullPage: true });
  checks.push("issued invoice appears in read-only AR aging without a report-view write");
  await populatedContext.close();

  const recoveryContext = await browser.newContext({ acceptDownloads: true });
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto(`${auditUrl}/#/settings`);
  const backupDownload = recoveryPage.waitForEvent("download");
  await recoveryPage.getByRole("button", { name: "Export demo data", exact: true }).click();
  const backupPath = `${output}/valid-fixture.json`;
  await (await backupDownload).saveAs(backupPath);
  const raw = await recoveryPage.evaluate((fixture) => {
    const current = JSON.parse(fixture);
    current.financeFixture = { mode: "synthetic-demo", id: "checkpoint2" };
    current.finance = { mode: "live" };
    const malformed = JSON.stringify(current);
    localStorage.setItem("azzora-demo-v1", malformed);
    return malformed;
  }, fs.readFileSync(backupPath, "utf8"));
  await recoveryPage.reload();
  await expect(recoveryPage.getByRole("region", { name: "Saved data recovery" })).toBeVisible();
  expect(await recoveryPage.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(raw);
  checks.push("malformed optional finance is preserved in read-only recovery");
  await recoveryContext.close();
  expect(pageErrors).toEqual([]);
} finally {
  fs.writeFileSync(`${output}/results.json`, JSON.stringify({ checks, pageErrors }, null, 2));
  await browser.close();
}
console.log(`PASS ${checks.length} Accountant browser checks; ${pageErrors.length} page errors.`);
