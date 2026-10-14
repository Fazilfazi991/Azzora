import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const url = auditUrl;
const out =
  process.env.QA_OPERATIONAL_EVIDENCE_DIR || "docs/operational-evidence";
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const sourceTree = execFileSync("git", ["rev-parse", "HEAD:src"], {
  encoding: "utf8",
}).trim();
// The journey produces a complete isolated fixture through the public UI.
const fixtureRaw = fs.readFileSync(`${out}/qa-data-1440.json`, "utf8");
const fixture = JSON.parse(fixtureRaw);
const fixtureManifest = JSON.parse(
  fs.readFileSync(`${out}/fixture-manifest-1440.json`, "utf8"),
);
expect(
  fixtureManifest.sourceTree,
  "fixture must come from this application's current committed source tree",
).toBe(sourceTree);
expect(fixtureManifest.url).toBe(url);
expect(fixtureManifest.fixtureSha256).toBe(
  createHash("sha256").update(fixtureRaw).digest("hex"),
);
if (process.env.QA_RUN_KIND === "final")
  expect(fixtureManifest.sourceSha).toBe(sourceSha);
const browser = await chromium.launch(browserOptions),
  checks = [],
  errors = [];
let failure;
const record = (name) => checks.push({ name, status: "passed" });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url);
  await page.evaluate(
    (db) => localStorage.setItem("azzora-demo-v1", JSON.stringify(db)),
    fixture,
  );
  await page.reload();
  const go = (route) => page.goto(`${url}/#/${route}`);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const label = (name) => page.getByLabel(name, { exact: true });
  const dialog = () => page.getByRole("dialog").last();
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1")));
  for (const [action, field] of [
    ["Supplier", "Supplier company name"],
    ["Variation", "Variation title"],
    ["Purchase Request", "Material requirements"],
    ["Purchase Order", "Approved supplier quotation"],
    ["Credit Note", "Credit invoice"],
  ]) {
    await go("dashboard");
    await button("Quick Add").click();
    await dialog()
      .getByRole("button", { name: `+ New ${action}`, exact: true })
      .click();
    await expect(dialog().getByLabel(field, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    record(`Quick Add ${action} opens its real form; Escape closes it`);
  }
  for (const [type, value, route] of [
    ["Supplier", fixture.operations.suppliers[0].code, "suppliers/"],
    ["Variation", fixture.operations.variations[0].number, "variations/"],
    [
      "Purchase Request",
      fixture.operations.requests[0].number,
      "procurement/requests",
    ],
    [
      "Purchase Order",
      fixture.operations.orders[0].number,
      "procurement/orders",
    ],
    ["Supplier Bill", fixture.operations.bills[0].number, "procurement/bills"],
    [
      "Credit Note",
      fixture.operations.credits[0].number,
      "accounts/credit-notes/",
    ],
  ]) {
    await label("Global search").fill(value);
    const hit = page.locator(".search-results button").filter({
      has: page.locator("small", { hasText: new RegExp(`^${type}$`) }),
    });
    await expect(hit).toHaveCount(1);
    await hit.click();
    await expect(page).toHaveURL(new RegExp(route));
    await expect(label("Global search")).toHaveValue("");
    record(`Global search resolves ${type} and navigates`);
  }
  await go("procurement/payments");
  await button("Reverse Supplier Payment").first().click();
  await dialog()
    .getByLabel("Correction/cancellation reason", { exact: true })
    .fill("Incorrect bank posting reversed");
  await dialog()
    .getByRole("button", { name: "Save Record Correction", exact: true })
    .click();
  let db = await saved();
  expect(
    db.operations.supplierPayments.filter((p) => p.reversedAt),
  ).toHaveLength(1);
  const reversed = db.operations.supplierPayments.find((p) => p.reversedAt);
  expect(reversed.reason).toBe("Incorrect bank posting reversed");
  const expense = db.expenses.find((e) => e.supplierBillId === reversed.billId);
  expect(Number(expense.paidAmount)).toBe(22);
  expect(db.payments).toEqual(fixture.payments);
  record(
    "Supplier payment reversal restores payable and expense paid amount without altering customer receipts",
  );
  await go("accounts/refunds");
  await button("Reverse Refund").click();
  await dialog()
    .getByLabel("Refund reversal reason", { exact: true })
    .fill("Refund bank transfer returned");
  await dialog()
    .getByRole("button", { name: "Confirm Refund Reversal", exact: true })
    .click();
  db = await saved();
  expect(db.operations.refunds[0].reversedAt).toBeTruthy();
  expect(db.payments).toEqual(fixture.payments);
  await expect(page.locator("main")).toContainText(/AED [−-]25\.00/);
  record(
    "Refund reversal retains history and restores customer credit independently of receipts",
  );
  // Set up an assigned review that loses its reviewer, then recover through the UI.
  const projectId = fixture.operations.orders[0].projectId;
  await go(`projects/${projectId}/procurement/materials`);
  await button("New Material Requirement").click();
  await dialog()
    .getByLabel("Procurement project", { exact: true })
    .selectOption(projectId);
  await dialog()
    .getByLabel("Material/service name", { exact: true })
    .fill("QA approver-reassignment material");
  await dialog()
    .getByLabel("Material specification", { exact: true })
    .fill("QA independent approval route");
  await dialog().getByLabel("Material unit", { exact: true }).fill("Nos");
  await dialog().getByLabel("Quantity required", { exact: true }).fill("1");
  await dialog()
    .getByRole("button", { name: "Save Material Requirement", exact: true })
    .click();
  const materialId = (await saved()).operations.materials.find(
    (m) => m.name === "QA approver-reassignment material",
  ).id;
  await go(`projects/${projectId}/procurement/requests`);
  await button("New Purchase Request").click();
  await dialog()
    .getByLabel("Material requirements", { exact: true })
    .selectOption(materialId);
  await dialog()
    .getByRole("button", { name: "Save Purchase Request", exact: true })
    .click();
  await label("Assigned demo approver").selectOption("person-1");
  await button("Submit Purchase Request").click();
  await go("team");
  await page
    .locator(".team-card")
    .filter({
      has: page.getByRole("heading", {
        name: fixture.people.find((p) => p.id === "person-1").name,
        exact: true,
      }),
    })
    .click();
  await dialog()
    .getByRole("button", { name: "Deactivate Employee", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo actor", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByLabel("Reason", { exact: true })
    .fill("QA assigned reviewer left before approval");
  await dialog()
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await go("approvals");
  await label("Decision comments").fill(
    "Original reviewer left; owner assumes review",
  );
  await button("Assign this demo actor").click();
  await button("Approve").click();
  db = await saved();
  const approval = db.operations.approvals.at(-1);
  expect(approval.status).toBe("Approved");
  expect(approval.approverId).toBe("person-0");
  expect(
    db.activities.some(
      (a) =>
        a.action === "Approval reassigned" && a.entityId === approval.entityId,
    ),
  ).toBe(true);
  record(
    "Inactive approver reassignment records the reason and replacement actor before approval",
  );
  await go("settings");
  await page
    .getByText("VAT, numbering and closure policy", { exact: true })
    .click();
  await label("Invoice prefix").fill("QA-INV-");
  await label("Next invoice sequence").fill("90");
  await label("Default tax treatment").selectOption("Exempt");
  await label("Default payment terms days").fill("12");
  await label("Default invoice terms").fill("Payment due in twelve days");
  await label(
    "Block operational handover until commercial obligations are clear",
  ).check();
  await page
    .locator("input[type=file]")
    .setInputFiles("public/assets/azzora-logo.png");
  await expect(page.getByAltText("Company logo preview")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await button("Save Company & Financial Settings").click();
  db = await saved();
  expect(db.operations.settings.company.logo).toMatch(/^data:image\/png/);
  expect(db.operations.orders[0].companySnapshot).toEqual(
    fixture.operations.orders[0].companySnapshot,
  );
  expect(db.invoices[0].snapshot).toEqual(fixture.invoices[0].snapshot);
  record(
    "Uploaded logo and settings persist while approved/issued historical snapshots remain identical",
  );
  await button("Quick Add").click();
  await dialog()
    .getByRole("button", { name: "+ New Invoice", exact: true })
    .click();
  await expect(
    dialog().getByLabel("Item 1 tax treatment", { exact: true }),
  ).toHaveValue("Exempt");
  await expect(
    dialog().getByLabel("Invoice payment terms", { exact: true }),
  ).toHaveValue("Payment due in twelve days");
  const date = await dialog()
    .getByLabel("Invoice date", { exact: true })
    .inputValue();
  const due = await dialog()
    .getByLabel("Due date", { exact: true })
    .inputValue();
  expect((Date.parse(due) - Date.parse(date)) / 86400000).toBe(12);
  await dialog()
    .getByLabel("Invoice customer", { exact: true })
    .selectOption(fixture.clients[0].id);
  await dialog()
    .getByLabel("Item 1 description", { exact: true })
    .fill("New settings invoice");
  await dialog().getByLabel("Item 1 rate", { exact: true }).fill("25");
  await dialog()
    .getByRole("button", { name: "Save Draft Invoice", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  db = await saved();
  expect(db.invoices.at(-1).number).toBe("QA-INV-00090");
  record("New invoice uses saved numbering, tax and payment terms defaults");
  await go(`projects/${fixture.operations.orders[0].projectId}/handover`);
  await expect(page.locator("main")).toContainText(
    "configured financial blocking policy",
  );
  record(
    "Explicit financial blocking policy is surfaced in operational handover",
  );
  await go("team");
  await page
    .locator(".team-card")
    .filter({
      has: page.getByRole("heading", {
        name: fixture.people.find((p) => p.id === "person-0").name,
        exact: true,
      }),
    })
    .click();
  await dialog()
    .getByRole("button", { name: "Deactivate Employee", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo actor", { exact: true })
    .selectOption("person-2");
  await dialog()
    .getByLabel("Reason", { exact: true })
    .fill("QA replacement actor retains company settings access");
  await dialog()
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await go("settings");
  await label("Company phone").fill("+971 50 123 4567");
  await button("Save Company & Financial Settings").click();
  db = await saved();
  expect(db.operations.settings.company.phone).toBe("+971 50 123 4567");
  expect(db.activities[0].actorId).toBe("person-2");
  record(
    "Company settings remain editable under an active replacement actor after initial actor deactivation",
  );
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    `PASS: ${checks.length} operational boundary checks; no browser errors.`,
  );
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  fs.writeFileSync(
    `${out}/boundary-results.json`,
    JSON.stringify(
      { sourceSha, sourceTree, url, fixtureManifest, checks, errors, failure },
      null,
      2,
    ),
  );
  await browser.close();
}
