import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions } from "./browser-runtime.mjs";
const url = process.env.AZZORA_URL || "http://127.0.0.1:5173";
const out = "docs/operational-evidence";
// The journey produces a complete isolated fixture through the public UI.
const fixture = JSON.parse(fs.readFileSync(`${out}/qa-data-1440.json`, "utf8"));
const browser = await chromium.launch(browserOptions),
  checks = [],
  errors = [];
let failure;
const record = (name) => checks.push({ name, status: "passed" });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
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
  await page.evaluate(async () => {
    const commands = await import("/src/operations/repository.ts");
    const db = JSON.parse(localStorage.getItem("azzora-demo-v1"));
    const prior = db.operations.requests[0];
    const material = commands.saveMaterial(
      db,
      { ...db.operations.materials[0], id: crypto.randomUUID(), number: "" },
      "person-0",
    );
    const pr = commands.saveRequest(
      db,
      {
        ...prior,
        id: crypto.randomUUID(),
        number: "",
        materialIds: [material.id],
        status: "Draft",
        notes: "Reassignment QA",
      },
      "person-0",
    );
    commands.submitApproval(
      db,
      "Purchase Request",
      pr.id,
      "Internal",
      "person-0",
      "person-1",
    );
    db.people.find((p) => p.id === "person-1").status = "Inactive";
    localStorage.setItem("azzora-demo-v1", JSON.stringify(db));
  });
  await page.reload();
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
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("azzora-demo-v1"));
    db.people.find((p) => p.id === "person-0").status = "Inactive";
    localStorage.setItem("azzora-demo-v1", JSON.stringify(db));
  });
  await page.reload();
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
    JSON.stringify({ checks, errors, failure }, null, 2),
  );
  await browser.close();
}
