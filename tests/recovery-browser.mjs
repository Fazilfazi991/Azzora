import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
const out = "docs/integration-evidence/recovery";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const checks = [], errors = [];
try {
  const fixtureContext = await browser.newContext();
  const fixturePage = await fixtureContext.newPage();
  await fixturePage.goto(auditUrl + "/#/settings");
  const exported = fixturePage.waitForEvent("download");
  await fixturePage.getByRole("button", { name: "Export demo data", exact: true }).click();
  const download = await exported; await download.saveAs(out + "/valid-fixture.json");
  const fixture = JSON.parse(fs.readFileSync(out + "/valid-fixture.json", "utf8"));
  await fixtureContext.close();
  const missing = key => { const v = structuredClone(fixture); delete v[key]; return JSON.stringify(v); };
  const partial = structuredClone(fixture); partial.operations = { version: 1 };
  const orphan = structuredClone(fixture); orphan.tasks[0].phaseId = "missing-phase";
  const cases = [["malformed", "{ original invalid JSON"], ["null", "null"], ["missing-people", missing("people")], ["missing-phases", missing("phases")], ["partial-operations", JSON.stringify(partial)], ["orphan-task", JSON.stringify(orphan)]];
  for (const width of [1440, 1024, 768, 390]) {
    for (const [name, raw] of cases) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
      await context.addInitScript(raw => localStorage.setItem("azzora-demo-v1", raw), raw);
      const page = await context.newPage(); page.on("pageerror", e => errors.push({ width, name, error: e.message }));
      await page.goto(auditUrl + "/#/dashboard");
      const recovery = page.getByRole("region", { name: "Saved data recovery" });
      await expect(recovery).toBeVisible();
      await expect(recovery.getByRole("heading", { name: "Your saved records are protected" })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(raw);
      const event = page.waitForEvent("download");
      await recovery.getByRole("button", { name: "Export original saved data", exact: true }).click();
      const file = `${out}/${name}-${width}.json`; await (await event).saveAs(file);
      expect(fs.readFileSync(file, "utf8")).toBe(raw);
      await recovery.getByRole("button", { name: "Retry saved data", exact: true }).click();
      await expect(recovery).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(raw);
      await recovery.getByRole("link", { name: "Recovery settings" }).click();
      await expect(page.locator("main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
      await page.getByLabel("Quotation number prefix", { exact: true }).fill("ATTEMPT-");
      expect(await page.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(raw);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (name === "missing-people") await page.screenshot({ path: `${out}/recovery-${width}.png`, fullPage: true });
      checks.push({ width, name, passed: true, rawBackupExact: true, writesBlocked: true, recoveryReachable: true });
      await context.close();
    }
  }
  const context = await browser.newContext();
  await context.addInitScript(raw => localStorage.setItem("azzora-demo-v1", raw), JSON.stringify(fixture));
  const page = await context.newPage(); await page.goto(auditUrl + "/#/settings");
  const before = await page.evaluate(() => localStorage.getItem("azzora-demo-v1"));
  await expect(page.getByRole("region", { name: "Saved data recovery" })).toHaveCount(0);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  const originalPrefix = await page.getByLabel("Quotation number prefix", { exact: true }).inputValue();
  await page.getByLabel("Quotation number prefix", { exact: true }).fill("UNSAVED-");
  await expect(page.getByLabel("Quotation number prefix", { exact: true })).toHaveValue(originalPrefix);
  expect(await page.evaluate(() => localStorage.getItem("azzora-demo-v1"))).toBe(before);
  checks.push({ name: "quota-failure", passed: true, visibleStateUnchanged: true, rawUnchanged: true });
  await context.close();
  expect(errors).toEqual([]);
} finally {
  fs.writeFileSync(out + "/results.json", JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
console.log(`PASS ${checks.length} recovery/rollback browser cases; ${errors.length} page errors.`);
