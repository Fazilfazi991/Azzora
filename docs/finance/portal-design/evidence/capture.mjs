import { chromium } from "../../../../../azzora-finance-integration/node_modules/@playwright/test/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5299/docs/finance/portal-design/index.html";
const evidence = import.meta.dirname;
const browser = await chromium.launch({ headless: true });
const widths = [1440, 1024, 768, 430, 390];
const routes = ["login", "dashboard", "sales", "invoice", "receipt", "expense", "ledger", "pnl", "balance"];
const results = [];
await mkdir(evidence, { recursive: true });

for (const width of widths) {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${base}#/${route}`, { waitUntil: "networkidle" });
    await page.locator(route === "login" ? "h2" : "h1").first().waitFor();
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth,
      body: document.body.scrollWidth,
      content: document.documentElement.scrollWidth,
      heading: document.querySelector("h1, h2")?.textContent?.trim(),
      logoLoaded: [...document.images].every(image => image.complete && image.naturalWidth > 0),
    }));
    const overflow = Math.max(geometry.body, geometry.content) > width + 1;
    if (route === "dashboard" || route === "login" || width === 1440 || width === 390) {
      await page.screenshot({ path: join(evidence, `${route}-${width}.png`), fullPage: true });
    }
    results.push({ route, width, ...geometry, overflow, errors });
    await page.close();
  }
}
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${base}#/dashboard`, { waitUntil: "networkidle" });
await mobile.getByRole("button", { name: "Open accountant navigation" }).click();
const mobileNavOpen = await mobile.locator("#sidebar").evaluate(element => getComputedStyle(element).transform === "matrix(1, 0, 0, 1, 0, 0)");
await mobile.screenshot({ path: join(evidence, "mobile-navigation-390.png"), fullPage: false });
await mobile.getByRole("button", { name: "Close accountant navigation" }).click();
const mobileNavCloses = await mobile.getByRole("button", { name: "Open accountant navigation" }).getAttribute("aria-expanded") === "false";
await mobile.getByRole("button", { name: "Open accountant navigation" }).click();
await mobile.getByRole("link", { name: /Sales & receivables/ }).click();
const navigationWorks = new URL(mobile.url()).hash === "#/sales";
await mobile.getByRole("combobox", { name: "Filter invoice type" }).selectOption("Proforma");
const filterWorks = await mobile.locator("#invoice-count").textContent() === "1";
await mobile.getByRole("combobox", { name: "Filter invoice status" }).selectOption("Draft");
const statusFilterWorks = await mobile.locator("#invoice-count").textContent() === "1";
await mobile.close();
await browser.close();
const summary = { checks: results.length, failures: results.filter(result => result.overflow || !result.logoLoaded || result.errors.length), mobileNavOpen, mobileNavCloses, navigationWorks, filterWorks, statusFilterWorks, results };
await writeFile(join(evidence, "visual-checks.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ checks: summary.checks, failures: summary.failures, mobileNavOpen, mobileNavCloses, navigationWorks, filterWorks, statusFilterWorks }, null, 2));
if (summary.failures.length || !mobileNavOpen || !mobileNavCloses || !navigationWorks || !filterWorks || !statusFilterWorks) process.exitCode = 1;
