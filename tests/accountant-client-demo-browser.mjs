import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";

const output = process.env.AZZORA_DEMO_EVIDENCE_DIR || "tmp/accountant-client-demo";
const shareUrl = process.env.AZZORA_SHARE_URL;
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const checks = [];
const pageErrors = [];

async function openProtected(page) {
  if (shareUrl) {
    const response = await page.goto(shareUrl);
    expect(response?.ok()).toBe(true);
  }
}

try {
  for (const width of [390, 430, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(`${width}: ${error.message}`));
    await openProtected(page);
    await page.goto(`${auditUrl}/#/accountant-preview`);
    await expect(page.getByRole("heading", { name: "Accountant workspace" })).toBeVisible();
    const before = await page.evaluate(() => localStorage.getItem("azzora-demo-v1"));
    await page.getByRole("link", { name: "Explore the synthetic Accountant scenario" }).click();
    await expect(page.getByText("DEMO ONLY — Not Secure Login")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Follow the money" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Customer invoice example" })).toContainText("DEMO-INV-01");
    await expect(page.getByRole("region", { name: "Supplier bill example" })).toContainText("DEMO-BILL-02");
    await expect(page.getByRole("region", { name: "Expense submission example" })).toContainText("Project materials");
    await expect(page.getByRole("region", { name: "Purchase price variation example" })).toContainText("+20.00%");
    await page.screenshot({ path: `${output}/accountant-scenario-${width}.png`, fullPage: true });
    checks.push(`${width}: protected-route demo entry and four scenario cards`);

    await page.getByRole("button", { name: "Inspect invoice aging" }).click();
    const ar = page.getByRole("table", { name: "Customer receivables from fictional invoices" });
    const ap = page.getByRole("table", { name: "Supplier payables from fictional supplier bills" });
    await expect(ar).toContainText("DEMO-INV-01");
    await expect(ar).toContainText("AED 12,000.00");
    await expect(ar).toContainText("AED 3,000.00");
    await expect(ap).toContainText("AED 4,000.00");
    await expect(ap).toContainText("AED 2,000.00");
    await page.screenshot({ path: `${output}/accountant-aging-${width}.png`, fullPage: true });
    checks.push(`${width}: targeted AR/AP aging and balances`);

    const nav = page.getByRole("navigation", { name: "Accountant reports" });
    for (const [button, heading] of [
      ["Overview", "Accounting position"],
      ["General Ledger", "General Ledger"],
      ["Trial Balance", "Trial Balance"],
      ["Profit & Loss", "Profit & Loss"],
      ["Balance Sheet", "Balance Sheet"],
    ]) {
      await nav.getByRole("button", { name: button, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    checks.push(`${width}: journal report navigation`);

    await nav.getByRole("button", { name: "Scenario" }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Follow the money" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    checks.push(`${width}: refresh, no saved-record write, no page overflow`);
    await context.close();
  }
  expect(pageErrors).toEqual([]);
} finally {
  fs.writeFileSync(`${output}/results.json`, JSON.stringify({ checks, pageErrors }, null, 2));
  await browser.close();
}
console.log(`PASS ${checks.length} Accountant client-demo checks; ${pageErrors.length} page errors.`);
