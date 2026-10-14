import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import {
  quotationStep,
  quotationAdvanced,
  openQuotationCategory,
  openQuotationItem,
  quotationSteps,
} from "./quotation-ux-helpers.mjs";
const url = auditUrl,
  out =
    process.env.QA_QUOTATION_UX_EVIDENCE_DIR ||
    "docs/integration-evidence/quotation-ux/preparatory";
fs.mkdirSync(out, { recursive: true });
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim(),
  hash = (p) =>
    crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sourceSha = git("rev-parse", "HEAD"),
  sourceTree = git("rev-parse", "HEAD:src"),
  final = process.env.QA_RUN_KIND === "final";
const sourceFiles = Object.fromEntries(
  git("ls-files", "src")
    .split("\n")
    .filter(Boolean)
    .map((p) => [p, hash(p)]),
);
const guard = () => {
  for (const [p, h] of Object.entries(sourceFiles))
    expect(hash(p), p + " source changed during run").toBe(h);
  if (final) {
    expect(sourceSha).toBe(process.env.QA_SOURCE_SHA);
    expect(git("rev-parse", "HEAD")).toBe(sourceSha);
    expect(git("status", "--short", "--", "src", "tests")).toBe("");
  }
};
const checks = [],
  errors = [],
  screenshots = [],
  pdfs = [];
let failure, activePage;
const browser = await chromium.launch(browserOptions),
  startedAt = new Date().toISOString();
const check = (width, name) => checks.push({ width, name, status: "passed" });
const customerName = "Olive Courtyard Interiors LLC",
  projectName = "Marina Courtyard Apartment Refresh";
async function context(width) {
  const c = await browser.newContext({ viewport: { width, height: 1000 } });
  await c.addInitScript(() => {
    window.print = () => {
      window.__quotationUxPrinted = true;
    };
  });
  const p = await c.newPage();
  activePage = p;
  p.on("pageerror", (e) => errors.push({ width, error: e.message }));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push({ width, error: m.text() });
  });
  return { c, p };
}
const db = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1")));
const raw = (p) => p.evaluate(() => localStorage.getItem("azzora-demo-v1"));
const qid = (p) => p.evaluate(() => location.hash.split("/")[2]);
const button = (p, n) => p.getByRole("button", { name: n, exact: true });
const field = (p, n) => p.getByLabel(n, { exact: true });
const dialog = (p) => p.getByRole("dialog");
const dfield = (p, n) => dialog(p).getByLabel(n, { exact: true });
const dbutton = (p, n) =>
  dialog(p).getByRole("button", { name: n, exact: true });
async function shot(p, width, name) {
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name + " page containment",
  ).toBe(true);
  const file = path.join(out, `${name}-${width}.png`);
  await p.screenshot({ path: file, fullPage: true });
  screenshots.push({
    width,
    name,
    path: file,
    sha256: hash(file),
    url: p.url(),
    layout: await p.evaluate(() => ({
      width: innerWidth,
      documentHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    })),
  });
}
async function wizard(p, name, customerId) {
  await expect(dialog(p)).toHaveCount(1);
  await dfield(p, "Project name").fill(name);
  if (customerId)
    await dfield(p, "Select Existing Customer").selectOption(customerId);
  await dbutton(p, "Continue →").click();
  await dfield(p, "Project location").fill(
    "Dubai Marina, Dubai · fictional QA site",
  );
  await dfield(p, "Civil").check();
  for (let n = 0; n < 3; n++) await dbutton(p, "Continue →").click();
  await dbutton(p, "Create Project").click();
  await expect(dialog(p)).toHaveCount(0);
}
async function total(p, text) {
  await quotationStep(p, 2);
  await expect(p.getByTestId("grand-total")).toHaveText(text);
}
async function nativeAndDownload(p, width, name, expectedTotal) {
  const before = await raw(p);
  await quotationStep(p, 4);
  const sheets = await p.locator(".quote-sheet").count();
  expect(sheets).toBeGreaterThan(1);
  const event = p.waitForEvent("download");
  await button(p, "Download PDF").click();
  const download = path.join(out, `${name}-download-${width}.pdf`);
  await (await event).saveAs(download);
  const ev = p.waitForEvent("popup");
  await button(p, "Print").click();
  const popup = await ev;
  await popup.waitForLoadState();
  await popup.evaluate(() => document.fonts.ready);
  await expect(popup.locator(".sheet")).toHaveCount(sheets);
  const native = path.join(out, `${name}-native-${width}.pdf`);
  await popup.pdf({
    path: native,
    preferCSSPageSize: true,
    printBackground: true,
  });
  await popup.close();
  const python =
    process.env.AZZORA_PYTHON ||
    "C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
  for (const file of [download, native]) {
    const data = JSON.parse(
      execFileSync(
        python,
        [
          "-c",
          "import json,sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print(json.dumps({'pages':len(r.pages),'text':[p.extract_text() or '' for p in r.pages]}))",
          path.resolve(file),
        ],
        { encoding: "utf8" },
      ),
    );
    expect(data.pages).toBe(sheets);
    expect(data.text.every((t) => t.trim().length > 40)).toBe(true);
    expect(data.text.join("").replace(/\s/g, "")).toContain(expectedTotal);
    pdfs.push({
      width,
      name,
      path: file,
      sha256: hash(file),
      pages: data.pages,
    });
  }
  expect(await raw(p)).toBe(before);
  check(
    width,
    name + " download/native pagination and totals preserve exact saved data",
  );
}
async function crossAndInline(width) {
  const { c, p } = await context(width);
  await p.goto(url + "/#/quotations");
  await p.locator('a[href="#/quotations/quotation-reference/edit"]').click();
  await button(p, "Save Draft").click();
  await expect.poll(() => raw(p)).not.toBe(null);
  const reference = structuredClone(
    (await db(p)).quotations.find((q) => q.id === "quotation-reference"),
  );
  await quotationAdvanced(p, true);
  const referenceCategory = p.getByTestId("quote-section").nth(0);
  await openQuotationCategory(referenceCategory);
  await openQuotationItem(referenceCategory.getByTestId("quote-line").nth(0));
  await p.evaluate(() => scrollTo(0, 0));
  await shot(p, width, "matched-reference-scope");
  await field(p, "Find a category or item").fill("Painting");
  await expect(p.getByTestId("quote-section")).not.toHaveCount(0);
  await button(p, "View worked example").click();
  await expect(dialog(p)).toHaveCount(1);
  await p.goBack();
  await p.goBack();
  await expect(
    p.getByRole("heading", { name: "Quotations", exact: true }),
  ).toBeVisible();
  await expect(dialog(p)).toHaveCount(0);
  await button(p, "New quotation").click();
  const id = await qid(p);
  expect(id).not.toBe(reference.id);
  await quotationStep(p, 1);
  await expect(field(p, "Find a category or item")).toHaveValue("");
  await expect(
    p.getByRole("checkbox", { name: "Advanced scope controls", exact: true }),
  ).not.toBeChecked();
  await expect(p.getByTestId("quote-section")).toHaveCount(0);
  await expect(
    p.getByText("Your scope is ready to begin.", { exact: true }),
  ).toBeVisible();
  await p.evaluate(() => scrollTo(0, 0));
  await shot(p, width, "matched-blank-simple-scope");
  expect((await db(p)).quotations.find((q) => q.id === reference.id)).toEqual(
    reference,
  );
  check(
    width,
    "cross-quotation SPA navigation resets search/mode/selection/modal without altering reference",
  );
  await quotationStep(p, 0);
  const opener = button(p, "+ Add Customer");
  await opener.focus();
  await p.keyboard.press("Enter");
  await dfield(p, "Customer/company name").fill("Cancelled inline draft");
  await p.keyboard.press("Escape");
  await expect(dialog(p)).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.press("Enter");
  await dfield(p, "Customer/company name").fill("QA Inline Courtyard " + width);
  await dfield(p, "Contact person").fill("Inline fictional contact");
  await dbutton(p, "Save Customer").click();
  const client = await field(p, "Linked Customer").inputValue();
  expect(client).toBeTruthy();
  const projectOpener = button(p, "+ Create Project");
  await projectOpener.focus();
  await p.keyboard.press("Enter");
  await expect(dfield(p, "Select Existing Customer")).toHaveValue(client);
  await p.keyboard.press("Escape");
  await expect(projectOpener).toBeFocused();
  await projectOpener.press("Enter");
  await wizard(p, "QA inline project " + width, client);
  expect(await field(p, "Linked Project").inputValue()).toBeTruthy();
  expect((await db(p)).quotations.find((q) => q.id === id).sections).toEqual(
    [],
  );
  check(
    width,
    "Step1 customer/project native dialogs keyboard/focus/linking retain empty quotation",
  );
  // Navigate every step with the keyboard; changed panels receive heading focus.
  const beforeNavigation = await raw(p);
  for (const i of [1, 2, 3, 4, 0]) {
    const trigger = p
      .getByRole("navigation", { name: "Quotation steps", exact: true })
      .getByRole("button", { name: quotationSteps[i], exact: true });
    await trigger.focus();
    await p.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-current", "step");
    await expect(
      p.locator(".quotation-guide__heading").getByRole("heading", {
        name: quotationSteps[i],
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      p.getByRole("region", { name: quotationSteps[i], exact: true }),
    ).toBeVisible();
  }
  expect(await raw(p)).toBe(beforeNavigation);
  check(
    width,
    "all five steps support keyboard activation and changed-panel heading focus without data writes",
  );
  await quotationStep(p, 1);
  await button(p, "View worked example").click();
  await dbutton(p, "Add example as a new work category").click();
  await expect(p.getByTestId("quote-section")).toHaveCount(1);
  const example = (await db(p)).quotations.find((q) => q.id === id).sections[0];
  expect(example.rows).toHaveLength(1);
  expect(example.rows[0]).toMatchObject({ quantity: "40", rate: "35" });
  await total(p, "AED 1,470.00");
  await quotationAdvanced(p);
  const cat = p.getByTestId("quote-section");
  await openQuotationCategory(cat);
  await cat
    .getByRole("button", { name: "Add Heading (No Price)", exact: true })
    .click();
  let rows = cat.getByTestId("quote-line");
  await openQuotationItem(rows.nth(1));
  await rows
    .nth(1)
    .getByLabel("Description", { exact: true })
    .fill("Advanced QA heading");
  await expect(
    rows.nth(1).getByLabel("Quantity", { exact: true }),
  ).toBeDisabled();
  await openQuotationItem(rows.nth(0));
  await rows
    .nth(0)
    .getByRole("button", { name: "Add Item Breakdown", exact: true })
    .click();
  await openQuotationItem(rows.nth(1));
  await rows
    .nth(1)
    .getByLabel("Description", { exact: true })
    .fill("Fictional complimentary protection");
  await rows
    .nth(1)
    .getByLabel("Pricing Type", { exact: true })
    .selectOption("FOC");
  let record = (await db(p)).quotations.find((q) => q.id === id);
  expect(record.sections[0].rows).toHaveLength(3);
  expect(record.sections[0].rows[1].parentId).toBe(example.rows[0].id);
  expect(record.sections[0].rows[2].pricingType).toBe("Heading");
  await cat
    .getByRole("button", { name: "Add Subcategory", exact: true })
    .click();
  record = (await db(p)).quotations.find((q) => q.id === id);
  expect(record.sections).toHaveLength(2);
  expect(record.sections[1].parentId).toBe(example.id);
  await total(p, "AED 1,470.00");
  await quotationAdvanced(p, false);
  expect((await db(p)).quotations.find((q) => q.id === id)).toEqual(record);
  expect((await db(p)).quotations.find((q) => q.id === reference.id)).toEqual(
    reference,
  );
  check(
    width,
    "explicit example append creates one category; advanced no-price heading, FOC breakdown and subcategory retain parents and total across Simple switch",
  );
  await c.close();
}
async function oliveJourney(width) {
  const { c, p } = await context(width);
  await p.goto(url + "/#/customers");
  await button(p, "Add New Customer").click();
  await dfield(p, "Customer/company name").fill(customerName);
  await dfield(p, "Contact person").fill("Maya Reed");
  await dfield(p, "Email").fill("maya@olive-courtyard.example");
  await dfield(p, "Billing address").fill("Dubai, UAE · fictional QA customer");
  await dbutton(p, "Save Customer").click();
  await expect(
    p.getByRole("heading", { name: customerName, exact: true }),
  ).toBeVisible();
  const customerId = await p.evaluate(() => location.hash.split("/")[2]);
  await shot(p, width, "01-customer");
  await p.goto(url + "/#/projects");
  await button(p, "+ New Project").click();
  await wizard(p, projectName, customerId);
  await expect(
    p.getByRole("heading", { name: projectName, exact: true }),
  ).toBeVisible();
  const projectId = await p.evaluate(() => location.hash.split("/")[2]);
  await shot(p, width, "02-project");
  await p.goto(url + "/#/quotations");
  await button(p, "New quotation").click();
  const id = await qid(p);
  await field(p, "Linked Customer").selectOption(customerId);
  await field(p, "Linked Project").selectOption(projectId);
  await shot(p, width, "03-quote-step1");
  await expect(
    p
      .getByRole("navigation", { name: "Quotation steps", exact: true })
      .getByRole("button"),
  ).toHaveCount(5);
  await expect(button(p, "Add Work Category")).toHaveCount(0);
  check(
    width,
    "fictional customer/project/quote relationships and only relevant Step1 controls",
  );
  const scope = await quotationStep(p, 1);
  await expect(scope.heading).toBeFocused();
  await expect(
    p.getByRole("checkbox", { name: "Advanced scope controls", exact: true }),
  ).not.toBeChecked();
  await expect(button(p, "Add Heading (No Price)")).toHaveCount(0);
  await expect(button(p, "Add Subcategory")).toHaveCount(0);
  const empty = await raw(p);
  await button(p, "View worked example").click();
  await expect(dialog(p)).toContainText("fictional");
  expect(await raw(p)).toBe(empty);
  await p.keyboard.press("Escape");
  expect(await raw(p)).toBe(empty);
  check(
    width,
    "empty simple path and viewing worked example do not auto-populate or mutate data",
  );
  const items = [
    [
      "Painting",
      "Prepare and paint internal walls",
      "40",
      "m²",
      "35",
      "1,400.00",
    ],
    ["Flooring", "Supply and install flooring", "25", "m²", "90", "2,250.00"],
    [
      "Joinery",
      "Supply and install joinery units",
      "2",
      "Nos",
      "650",
      "1,300.00",
    ],
  ];
  for (let i = 0; i < items.length; i++) {
    const [name, desc, qty, unit, rate, amount] = items[i];
    await button(p, "Add Work Category").click();
    await expect(p.getByTestId("quote-section")).toHaveCount(i + 1);
    const category = p.getByTestId("quote-section").nth(i);
    await openQuotationCategory(category);
    await category.getByLabel("Work category name", { exact: true }).fill(name);
    if (i === 0) await shot(p, width, "04-category");
    await category
      .getByRole("button", { name: "Add Priced Item", exact: true })
      .click();
    const row = category.getByTestId("quote-line");
    await expect(row).toHaveCount(1);
    await openQuotationItem(row);
    await row.getByLabel("Description", { exact: true }).fill(desc);
    await row.getByLabel("Quantity", { exact: true }).fill(qty);
    await row.getByLabel("Unit", { exact: true }).fill(unit);
    await row.getByLabel("Rate / Unit", { exact: true }).fill(rate);
    await expect(category.locator(":scope > summary")).toContainText(amount);
  }
  await shot(p, width, "05-priced-items");
  const scopeBefore = (await db(p)).quotations.find((q) => q.id === id);
  expect(scopeBefore.sections).toHaveLength(3);
  expect(scopeBefore.sections.flatMap((s) => s.rows)).toHaveLength(3);
  await quotationAdvanced(p, true);
  await field(p, "Find a category or item").fill("paint");
  await quotationStep(p, 2);
  await quotationStep(p, 1);
  await expect(field(p, "Find a category or item")).toHaveValue("paint");
  await expect(
    p.getByRole("checkbox", { name: "Advanced scope controls", exact: true }),
  ).toBeChecked();
  expect((await db(p)).quotations.find((q) => q.id === id)).toEqual(
    scopeBefore,
  );
  await field(p, "Find a category or item").fill("");
  await quotationAdvanced(p, false);
  await p.reload();
  await expect(
    p.getByRole("region", { name: quotationSteps[1], exact: true }),
  ).toBeVisible();
  expect((await db(p)).quotations.find((q) => q.id === id)).toEqual(
    scopeBefore,
  );
  for (let i = 0; i < 3; i++) {
    const category = p.getByTestId("quote-section").nth(i);
    await openQuotationCategory(category);
    const row = category.getByTestId("quote-line");
    await openQuotationItem(row);
    await expect(row.getByLabel("Quantity", { exact: true })).toHaveValue(
      items[i][2],
    );
    await expect(row.getByLabel("Rate / Unit", { exact: true })).toHaveValue(
      items[i][4],
    );
  }
  check(
    width,
    "same-record step/mode navigation and reload preserve all priced rows and presentation state as contracted",
  );
  const pricing = (await quotationStep(p, 2)).panel;
  await field(p, "Quotation discount AED").fill("150");
  await field(p, "VAT enabled").check();
  await field(p, "VAT percentage").fill("5");
  await expect(p.getByTestId("grand-total")).toHaveText("AED 5,040.00");
  await expect(pricing.locator(".quotation-calculated-grid")).toContainText(
    "AED 4,950.00",
  );
  await expect(pricing.locator(".quotation-calculated-grid")).toContainText(
    "AED 150.00",
  );
  await expect(pricing.locator(".quotation-calculated-grid")).toContainText(
    "AED 240.00",
  );
  await expect(field(p, "Amount in Words — manual override")).toBeHidden();
  await expect(pricing.locator(".quotation-pricing-category")).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const review = pricing.locator(".quotation-pricing-category").nth(i);
    expect(await review.getAttribute("open")).toBeNull();
    await review.locator(":scope > summary").click();
    await expect(review).toContainText("Quantity × unit rate:");
    await expect(review).toContainText(
      items[i][2] + " " + items[i][3] + " × AED " + items[i][4],
    );
    await expect(
      review.getByRole("status", {
        name: "Line amount for item " + (i + 1) + ".1",
        exact: true,
      }),
    ).toHaveText(items[i][5]);
    await expect(review.locator("output")).toHaveText(items[i][5]);
    await expect(review.locator("input,select,textarea")).toHaveCount(0);
    await expect(
      review.getByRole("link", {
        name: "Edit scope quantities and rates",
        exact: true,
      }),
    ).toBeEnabled();
  }
  await shot(p, width, "06-pricing");
  check(
    width,
    "pricing review exposes quantity×rate and readonly line amounts while exact discount/VAT totals remain independent",
  );
  const payments = (await quotationStep(p, 3)).panel;
  await expect(payments).toContainText("they do not add to the price");
  const percentages = payments.getByLabel("Payment percentage", {
    exact: true,
  });
  await expect(percentages).toHaveCount(3);
  const milestoneText = [
    ["Advance on acceptance", "Due on acceptance"],
    ["Progress stage", "Due at agreed progress inspection"],
    ["Handover", "Due at agreed handover"],
  ];
  for (let i = 0; i < 3; i++) {
    await percentages.nth(i).fill(["50", "40", "10"][i]);
    await payments
      .getByLabel("Payment description", { exact: true })
      .nth(i)
      .fill(milestoneText[i][0]);
    await payments
      .getByLabel("Due condition / Notes", { exact: true })
      .nth(i)
      .fill(milestoneText[i][1]);
  }
  expect(
    (await db(p)).quotations
      .find((q) => q.id === id)
      .payments.map((stage) => [stage.description, stage.notes]),
  ).toEqual(milestoneText);
  for (const amount of ["AED 2,520.00", "AED 2,016.00", "AED 504.00"])
    await expect(payments).toContainText(amount);
  await expect(
    payments
      .getByRole("alert")
      .filter({ hasText: "Payment percentages must total 100%." }),
  ).toHaveCount(0);
  await percentages.nth(1).fill("39");
  await expect(
    payments
      .getByRole("alert")
      .filter({ hasText: "Payment percentages must total 100%." }),
  ).toBeVisible();
  await percentages.nth(1).fill("40");
  await total(p, "AED 5,040.00");
  expect(
    (await db(p)).quotations
      .find((q) => q.id === id)
      .payments.map((stage) => [stage.description, stage.notes]),
  ).toEqual(milestoneText);
  await quotationStep(p, 3);
  await shot(p, width, "07-payments-terms");
  check(
    width,
    "50/40/10 milestones divide5040 exactly and invalid percentages do not increase quotation total",
  );
  await nativeAndDownload(p, width, "olive-draft", "5,040.00");
  await button(p, "Finalize").click();
  await dbutton(p, "Confirm").click();
  await expect(p.locator(".quote-toolbar .badge")).toHaveText("Finalized");
  const issued = (await db(p)).quotations.find((q) => q.id === id);
  await shot(p, width, "08-preview-issued");
  for (let i = 0; i < 5; i++) await quotationStep(p, i);
  await quotationAdvanced(p, true);
  for (let i = 0; i < 3; i++) {
    const category = p.getByTestId("quote-section").nth(i);
    await openQuotationCategory(category);
    const row = category.getByTestId("quote-line");
    await openQuotationItem(row);
    await expect(row.getByLabel("Rate / Unit", { exact: true })).toBeDisabled();
    await expect(
      category.getByRole("button", { name: "Add Priced Item", exact: true }),
    ).toBeDisabled();
  }
  await quotationAdvanced(p, false);
  await quotationStep(p, 2);
  const lockedReview = p.locator(".quotation-pricing-category").nth(0);
  await lockedReview.locator(":scope > summary").click();
  await lockedReview
    .getByRole("link", { name: "View scope details", exact: true })
    .click();
  await expect(
    p.getByRole("region", { name: quotationSteps[1], exact: true }),
  ).toBeVisible();
  expect((await db(p)).quotations.find((q) => q.id === id)).toEqual(issued);
  check(
    width,
    "issued step/mode/category/item/pricing navigation remains usable while data mutations stay locked",
  );
  await quotationStep(p, 4);
  await field(p, "Issued quotation status").selectOption("Sent");
  await field(p, "Issued quotation status").selectOption("Accepted");
  await button(p, "Convert to Project").click();
  await expect(dfield(p, "Conversion project")).toHaveValue(projectId);
  await dbutton(p, "Confirm Conversion").click();
  let data = await db(p);
  expect(data.projects.filter((x) => x.id === projectId)).toHaveLength(1);
  expect(data.contracts).toHaveLength(1);
  expect(data.contracts[0]).toMatchObject({
    projectId,
    quotationId: id,
    net: "480000",
    gross: "504000",
  });
  await expect(p.locator(".commercial-kpis")).toContainText("AED 4,800.00");
  await shot(p, width, "09-accepted-contract");
  check(
    width,
    "accepted quotation converts existing linked project once using4800net and5040gross snapshot",
  );
  await p.goto(url + "/#/accounts/invoices");
  await button(p, "New Invoice").click();
  await dfield(p, "From accepted quotation").selectOption(id);
  await expect(dfield(p, "Quotation payment milestone")).toHaveValue("");
  await expect(dialog(p).getByTestId("invoice-form-total")).toHaveText(
    "AED 5,040.00",
  );
  await dbutton(p, "Save Draft Invoice").click();
  await button(p, "Issue Invoice").click();
  data = await db(p);
  const invoice = data.invoices.find((i) => i.quotationId === id);
  expect(invoice.snapshot).toMatchObject({
    net: "480000",
    vat: "24000",
    grand: "504000",
  });
  const invoiceSnapshot = JSON.stringify(invoice.snapshot);
  await shot(p, width, "10-invoice");
  await button(p, "Record Payment").click();
  await dfield(p, "Payment amount AED").fill("1000");
  await dfield(p, "Payment reference").fill("OLIVE-FICTIONAL-RECEIPT-1000");
  await dbutton(p, "Post Receipt").click();
  await expect(p.locator(".invoice-paper")).toContainText("AED 4,040.00");
  await shot(p, width, "11-receipt");
  await p.goto(url + "/#/customers/" + customerId + "/statement");
  await expect(p.locator("tbody tr").last().locator("td").last()).toHaveText(
    "4040.00",
  );
  await shot(p, width, "12-statement");
  await p.goto(url + "/#/projects/" + projectId + "/financials");
  await expect(p.locator(".commercial-kpis")).toContainText("AED 4,800.00");
  await expect(p.locator(".commercial-kpis")).toContainText("AED 1,000.00");
  await expect(p.locator(".commercial-kpis")).toContainText("AED 4,040.00");
  await shot(p, width, "13-project-financials");
  data = await db(p);
  expect(
    JSON.stringify(data.invoices.find((i) => i.id === invoice.id).snapshot),
  ).toBe(invoiceSnapshot);
  expect(data.payments.filter((x) => x.invoiceId === invoice.id)).toHaveLength(
    1,
  );
  check(
    width,
    "full invoice/partial receipt/statement/project financials preserve tax snapshot and distinguish contract from cash",
  );
  fs.writeFileSync(
    path.join(out, `olive-data-${width}.json`),
    JSON.stringify(data),
  );
  await p.reload();
  await expect(
    p.getByRole("region", { name: "Saved data recovery", exact: true }),
  ).toHaveCount(0);
  expect(await db(p)).toEqual(data);
  check(
    width,
    "complete client commercial fixture hydrates losslessly after reload",
  );
  const original = structuredClone(data.quotations.find((q) => q.id === id));
  const contract = structuredClone(data.contracts[0]);
  await p.goto(url + "/#/quotations/" + id + "/preview");
  await nativeAndDownload(p, width, "olive-accepted", "5,040.00");
  const versions = p.locator(".quotation-version-actions");
  await versions.locator(":scope > summary").click();
  await button(p, "Create Revision").click();
  await dfield(p, "Revision notes").fill(
    "Fictional optional scope review; original contract preserved",
  );
  await dbutton(p, "Create draft revision").click();
  const revisionId = await qid(p);
  expect(revisionId).not.toBe(id);
  await quotationStep(p, 1);
  const revisionCategory = p.getByTestId("quote-section").nth(0);
  await openQuotationCategory(revisionCategory);
  const revisionRow = revisionCategory.getByTestId("quote-line");
  await openQuotationItem(revisionRow);
  await expect(
    revisionRow.getByLabel("Quantity", { exact: true }),
  ).toBeEnabled();
  await revisionRow.getByLabel("Quantity", { exact: true }).fill("41");
  await total(p, "AED 5,076.75");
  const revised = await db(p);
  expect(revised.quotations.find((q) => q.id === id)).toEqual(original);
  expect(revised.contracts[0]).toEqual(contract);
  expect(
    JSON.stringify(revised.invoices.find((i) => i.id === invoice.id).snapshot),
  ).toBe(invoiceSnapshot);
  expect(revised.quotations.find((q) => q.id === revisionId).status).toBe(
    "Draft",
  );
  check(
    width,
    "new editable revision changes only its scope and total; accepted source, existing contract and issued invoice snapshot remain exact",
  );
  await c.close();
}
try {
  guard();
  for (const width of [1440, 1024, 768, 390]) {
    await crossAndInline(width);
    guard();
    await oliveJourney(width);
    guard();
  }
  expect(errors).toEqual([]);
  console.log(`PASS: ${checks.length} independent guided quotation groups.`);
} catch (e) {
  failure = String(e);
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({
      path: path.join(out, "failure.png"),
      fullPage: true,
    });
  throw e;
} finally {
  fs.writeFileSync(
    path.join(out, "browser-results.json"),
    JSON.stringify(
      {
        kind: final ? "final" : "preparatory",
        sourceSha,
        sourceTree,
        sourceFiles,
        url,
        node: process.version,
        startedAt,
        finishedAt: new Date().toISOString(),
        checks,
        errors,
        failure,
        screenshots,
        pdfs,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
