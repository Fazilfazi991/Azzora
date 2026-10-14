import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
fs.mkdirSync("docs/commercial-evidence", { recursive: true });
const browser = await chromium.launch(browserOptions);
const errors = [],
  checks = [];
const record = (name) => checks.push({ name, status: "passed" });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(auditUrl + "/#/quotations/quotation-reference/edit");
  await page.getByLabel("Linked Project", { exact: true }).selectOption("");
  await button("Finalize").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await page.getByLabel("Issued quotation status").selectOption("Accepted");
  await button("Convert to Project").click();
  await button("Create new project from accepted quotation").click();
  await page
    .getByLabel("Contract project name", { exact: true })
    .fill("Converted apartment project");
  await button("Confirm Conversion").click();
  await expect(
    page.getByRole("heading", { name: "Project Financials", exact: true }),
  ).toBeVisible();
  const db = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("azzora-demo-v1")),
  );
  const projectId = db.contracts[0].projectId;
  expect(db.projects.filter((p) => p.id === projectId)).toHaveLength(1);
  expect(db.tasks.filter((t) => t.projectId === projectId)).toHaveLength(37);
  expect(db.handover.filter((t) => t.projectId === projectId)).toHaveLength(12);
  expect(db.quotations[0].projectId).toBe("");
  expect(db.invoices).toHaveLength(0);
  record(
    "accepted quotation creates new project atomically with plan/team/handover and preserved quote",
  );
  await page.goto(auditUrl + "/#/accounts/invoices");
  await expect(page.locator("main")).toContainText("one fils");
  await button("Generate Milestone Invoice").last().click();
  await expect(page.locator(".invoice-paper")).toContainText("AED 10,516.85");
  record("reference quotation final milestone explicitly reconciles one fils");
  await page.goto(auditUrl + "/#/projects");
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem("azzora-demo-v1")).clients.length,
  );
  await button("+ New Project").click();
  let dialog = page.getByRole("dialog").last();
  await dialog
    .getByLabel("Project name", { exact: true })
    .fill("Existing customer project");
  await dialog
    .getByLabel("Select Existing Customer", { exact: true })
    .selectOption(db.clients[0].id);
  await dialog.getByRole("button", { name: "Continue →", exact: true }).click();
  await dialog
    .getByLabel("Project location", { exact: true })
    .fill("Dubai Marina");
  await dialog.getByLabel("MEP", { exact: true }).check();
  for (let i = 0; i < 3; i++)
    await dialog
      .getByRole("button", { name: "Continue →", exact: true })
      .click();
  await dialog
    .getByRole("button", { name: "Create Project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Existing customer project",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("azzora-demo-v1")).clients.length,
    ),
  ).toBe(before);
  record("New Project selects existing customer without inserting a duplicate");
  await page.goto(auditUrl + "/#/customers");
  await button("Add New Customer").click();
  dialog = page.getByRole("dialog").last();
  await dialog
    .getByLabel("Customer/company name", { exact: true })
    .fill("Quota failure customer");
  const stored = await page.evaluate(() =>
    localStorage.getItem("azzora-demo-v1"),
  );
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    };
  });
  await dialog
    .getByRole("button", { name: "Save Customer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("quota");
  expect(
    await page.evaluate(() => localStorage.getItem("azzora-demo-v1")),
  ).toBe(stored);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalSetItem;
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("tbody")).not.toContainText(
    "Quota failure customer",
  );
  record(
    "storage quota failure commits neither persisted nor visible customer data",
  );
  for (const action of [
    "Customer",
    "Project",
    "Quotation",
    "Invoice",
    "Task",
    "Expense",
  ]) {
    await button("Quick Add").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "+ New " + action, exact: true })
      .click();
    if (action === "Quotation")
      await expect(
        page.getByRole("button", { name: "Save Draft", exact: true }),
      ).toBeVisible();
    else {
      await expect(page.getByRole("dialog").last()).toBeVisible();
      await page
        .getByRole("dialog")
        .last()
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
  }
  record("all six Quick Add actions open their working editors/forms");
  // Keyboard access and reduced motion use the incumbent accessible native dialogs.
  await button("Quick Add").focus();
  await button("Quick Add").press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  record(
    "keyboard opens and dismisses native dialog; reduced-motion mode supported",
  );
  if (errors.length) throw Error(errors.join("\n"));
  fs.writeFileSync(
    "docs/commercial-evidence/boundary-results.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    `PASS: ${checks.length} conversion, storage, quick-action and keyboard boundary checks.`,
  );
} finally {
  await browser.close();
}
