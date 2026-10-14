import { expect } from "@playwright/test";
import { auditUrl } from "./browser-runtime.mjs";

export const qaOutput = process.env.QA_EVIDENCE_DIR || "tmp/agent-3-strict";
export async function selectSiteAuthor(dialog) {
  const author = dialog.getByLabel("Demo site author", { exact: true });
  if (await author.count()) await author.selectOption("person-3");
}
// Obtain a fictional fresh-context fixture through the public export UI. Works
// with dev and static production servers; never imports /src from a browser.
export async function exportDemo(page) {
  await page.goto(`${auditUrl}/#/settings`);
  await page.locator("main h1").first().waitFor();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export demo data", exact: true })
    .click();
  const download = await event;
  const stream = await download.createReadStream();
  if (!stream) throw Error("Export has no readable download stream.");
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function readOriginalExport(page) {
  const event = page.waitForEvent("download");
  const recovery = page.getByRole("region", {
    name: "Saved data recovery",
    exact: true,
  });
  const scope = (await recovery.count()) ? recovery : page;
  await scope
    .getByRole("button", { name: "Export original saved data", exact: true })
    .click();
  const stream = await (await event).createReadStream();
  if (!stream) throw Error("Original export has no readable stream.");
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
export async function assertWhitespaceSiteRejected(page) {
  await page.goto(`${auditUrl}/#/site-updates`);
  await page
    .getByRole("button", { name: "+ Post Site Update", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await selectSiteAuthor(dialog);
  await dialog.getByLabel("Work completed", { exact: true }).fill("   ");
  await dialog
    .getByRole("button", { name: "Post Update", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  const rejected = dialog
    .getByRole("alert")
    .filter({ hasText: /completed|work|required|content/i })
    .first();
  await expect(rejected).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("azzora-demo-v1")),
  );
  expect(saved?.updates.some((u) => !u.completed.trim()) || false).toBe(false);
}
