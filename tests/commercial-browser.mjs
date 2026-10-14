import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import {
  quotationStep,
  openQuotationCategory,
  openQuotationItem,
} from "./quotation-ux-helpers.mjs";

const url = auditUrl;
const output =
  process.env.QA_COMMERCIAL_EVIDENCE_DIR || "docs/commercial-evidence";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const checks = [],
  errors = [];
const check = (width, name) => checks.push({ width, name, status: "passed" });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    await context.addInitScript(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const goto = (route) => page.goto(url + "/#/" + route);
    const dialog = () => page.getByRole("dialog").last();
    const button = (name) => page.getByRole("button", { name, exact: true });
    const dbutton = (name) =>
      dialog().getByRole("button", { name, exact: true });
    const label = (name) => page.getByLabel(name, { exact: true });
    const dlabel = (name) => dialog().getByLabel(name, { exact: true });
    await goto("customers");
    await button("Add New Customer").click();
    const name = "QA Commercial " + width;
    await dlabel("Customer/company name").fill(name);
    await dlabel("Contact person").fill("Commercial contact");
    await dlabel("Primary mobile number").fill("+971 50 123 4567");
    await dlabel("Email").fill(`accounts${width}@example.com`);
    await dlabel("Billing address").fill("Dubai Marina, UAE");
    await dlabel("TRN/VAT number").fill("100000000000001");
    await dialog().locator("summary").click();
    await dbutton("Add contact").click();
    await dlabel("Contact 1 name").fill("Accounts contact");
    await dlabel("Contact 1 email").fill("second@example.com");
    await dbutton("Save Customer").click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    const customerId = await page.evaluate(() => location.hash.split("/")[2]);
    check(width, "customer creation, contacts and live profile");
    await page.screenshot({
      path: `${output}/customer-${width}.png`,
      fullPage: true,
    });
    await goto("customers");
    await label("Search customers").fill("accounts" + width);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await button("Add New Customer").click();
    await dlabel("Customer/company name").fill(" QA-Commercial " + width + ".");
    await expect(dialog().getByRole("alert")).toContainText(
      "Possible duplicate",
    );
    await expect(dbutton("Save Customer")).toBeDisabled();
    await dbutton("Cancel").click();
    check(width, "customer search and duplicate warning");
    await goto("quotations");
    await button("New quotation").click();
    await quotationStep(page, 0);
    const quotationId = await page.evaluate(() => location.hash.split("/")[2]);
    await label("Linked Customer").selectOption(customerId);
    await quotationStep(page, 1);
    await button("Add Work Category").click();
    let section = page.getByTestId("quote-section").first();
    await openQuotationCategory(section);
    await section
      .getByLabel("Work category name", { exact: true })
      .fill("Commercial fit-out");
    await section
      .getByRole("button", { name: "Add Priced Item", exact: true })
      .click();
    await openQuotationItem(section.getByTestId("quote-line").first());
    await section
      .getByLabel("Description", { exact: true })
      .fill("Supply and installation");
    await section.getByLabel("Quantity", { exact: true }).fill("2.5");
    await section.getByLabel("Rate / Unit", { exact: true }).fill("400");
    await quotationStep(page, 2);
    await expect(page.getByTestId("grand-total")).toHaveText("AED 1,050.00");
    // Add another customer inside the populated quotation. BOQ must survive.
    await quotationStep(page, 0);
    await button("+ Add Customer").click();
    await dlabel("Customer/company name").fill("Quotation inline " + width);
    await dlabel("Email").fill(`inline${width}@example.com`);
    await dbutton("Save Customer").click();
    const inlineCustomerId = await label("Linked Customer").inputValue();
    await quotationStep(page, 2);
    await expect(page.getByTestId("grand-total")).toHaveText("AED 1,050.00");
    await quotationStep(page, 1);
    await expect(page.getByTestId("quote-line")).toHaveCount(1);
    check(width, "quotation inline customer creation preserves BOQ");
    await quotationStep(page, 0);
    await button("+ Create Project").click();
    await expect(dlabel("Select Existing Customer")).toHaveValue(
      inlineCustomerId,
    );
    await dlabel("Project name").fill("Commercial fit-out " + width);
    await dbutton("Continue →").click();
    await dlabel("Project location").fill("Dubai Marina");
    await dlabel("Civil").check();
    await dbutton("Continue →").click();
    await dbutton("Continue →").click();
    await dbutton("Continue →").click();
    await dbutton("Create Project").click();
    await expect(dialog()).toHaveCount(0);
    const projectId = await label("Linked Project").inputValue();
    expect(projectId).toBeTruthy();
    await quotationStep(page, 2);
    await expect(page.getByTestId("grand-total")).toHaveText("AED 1,050.00");
    check(
      width,
      "quotation creates connected standard project without BOQ loss",
    );
    await button("Save Draft").click();
    await page.reload();
    await quotationStep(page, 0);
    await expect(label("Linked Customer")).toHaveValue(inlineCustomerId);
    await expect(label("Linked Project")).toHaveValue(projectId);
    await quotationStep(page, 2);
    await expect(page.getByTestId("grand-total")).toHaveText("AED 1,050.00");
    await quotationStep(page, 4);
    await button("Finalize").click();
    await dbutton("Confirm").click();
    await label("Issued quotation status").selectOption("Accepted");
    await expect(button("Return to draft")).toBeDisabled();
    await button("Convert to Project").click();
    await expect(dlabel("Conversion project")).toHaveValue(projectId);
    await dbutton("Confirm Conversion").click();
    await expect(
      page.getByRole("heading", { name: "Project Financials", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".commercial-kpis")).toContainText(
      "AED 1,000.00",
    );
    let saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("azzora-demo-v1")),
    );
    expect(saved.clients.filter((c) => c.id === inlineCustomerId)).toHaveLength(
      1,
    );
    expect(saved.contracts).toHaveLength(1);
    expect(saved.invoices).toHaveLength(0);
    check(
      width,
      "issue, immutable acceptance, existing-project conversion and no automatic invoices",
    );
    await goto(`quotations/${quotationId}/edit`);
    await quotationStep(page, 4);
    await expect(
      page.getByRole("link", { name: "Open Contract Project", exact: true }),
    ).toBeVisible();
    await expect(button("Convert to Project")).toHaveCount(0);
    await goto("accounts/invoices");
    await button("Generate Milestone Invoice").first().click();
    await expect(
      page.getByRole("heading", { name: "INV-00001", exact: true, level: 1 }),
    ).toBeVisible();
    const invoiceId = await page.evaluate(() => location.hash.split("/")[3]);
    await button("Issue Invoice").click();
    await expect(button("Edit Draft")).toHaveCount(0);
    await expect(page.locator(".invoice-paper")).toContainText("AED 525.00");
    let pdf = page.waitForEvent("download");
    await button("Download Invoice PDF").click();
    let download = await pdf;
    const pdfPath = `${output}/invoice-${width}.pdf`;
    await download.saveAs(pdfPath);
    expect(fs.readFileSync(pdfPath).subarray(0, 4).toString()).toBe("%PDF");
    const popupEvent = page.waitForEvent("popup");
    await button("Print Invoice").click();
    const popup = await popupEvent;
    await expect(popup.locator(".invoice-paper")).toContainText("INV-00001");
    await popup.close();
    check(
      width,
      "milestone invoice, preserved issuance, PDF download and print",
    );
    await button("Record Payment").click();
    await dlabel("Payment amount AED").fill("600");
    await dlabel("Payment reference").fill("OVER-ALLOCATION");
    await dbutton("Post Receipt").click();
    await expect(page.getByRole("alert")).toContainText("cannot exceed");
    await dlabel("Payment amount AED").fill("200");
    await dlabel("Payment reference").fill("PARTIAL-1");
    await dbutton("Post Receipt").click();
    await expect(page.locator("main .badge").first()).toHaveText(
      "Partially Paid",
    );
    await expect(page.locator("main")).toContainText("AED 325.00");
    await goto("accounts/payments");
    await page.locator("main details summary").first().click();
    await button("Reverse Payment").click();
    await dlabel("Reversal reason").fill("Wrong collection amount");
    await dbutton("Confirm Reversal").click();
    await goto(`accounts/invoices/${invoiceId}`);
    await expect(page.locator("main")).toContainText("AED 525.00");
    await button("Record Payment").click();
    await dlabel("Payment reference").fill("CORRECTED-FULL-1");
    await dbutton("Post Receipt").click();
    await expect(page.locator("main .badge").first()).toHaveText("Paid");
    check(
      width,
      "over-allocation prevention, partial receipt, reversal and full corrected receipt",
    );
    await goto("accounts/invoices");
    await expect(button("Generate Milestone Invoice")).toHaveCount(2);
    await button("New Invoice").click();
    await dlabel("From accepted quotation").selectOption(quotationId);
    await dbutton("Save Draft Invoice").click();
    await expect(page.getByRole("alert")).toContainText("already has invoices");
    await dbutton("Cancel").click();
    check(
      width,
      "milestone association and full quotation duplicate billing prevention",
    );
    await goto("accounts/expenses");
    await button("New Expense").click();
    await dlabel("Expense project").selectOption(projectId);
    await dlabel("Supplier/vendor").fill("QA Materials");
    await dlabel("Expense description").fill("Recorded material delivery");
    await dlabel("Expense amount excl. VAT AED").fill("100");
    await dlabel("Expense VAT AED").fill("5");
    await dlabel("Expense paid amount incl. VAT AED").fill("50");
    await dbutton("Save Expense").click();
    await expect(page.locator("tbody")).toContainText("Partially Paid");
    await goto(`projects/${projectId}/financials`);
    await expect(page.locator(".commercial-kpis")).toContainText("AED 900.00");
    await expect(page.locator(".commercial-kpis")).toContainText("90.00%");
    await page.screenshot({
      path: `${output}/financials-${width}.png`,
      fullPage: true,
    });
    check(width, "incurred expenses versus cash and contract-based margin");
    await goto("accounts/overview");
    await expect(page.locator(".commercial-kpis")).toContainText("AED 525.00");
    await expect(page.locator(".commercial-kpis")).toContainText("AED 900.00");
    await page.screenshot({
      path: `${output}/accounts-${width}.png`,
      fullPage: true,
    });
    await goto("dashboard");
    await expect(page.locator(".commercial-dashboard")).toContainText(
      "AED 525.00",
    );
    await expect(page.locator(".commercial-dashboard")).toContainText(
      "AED 900.00",
    );
    check(width, "dashboard and Accounts totals agree");
    await goto(`customers/${inlineCustomerId}/statement`);
    await expect(page.locator("tbody")).toContainText("Reversal");
    await expect(
      page.locator("tbody tr").last().locator("td").last(),
    ).toHaveText("0.00");
    await goto(`customers/${inlineCustomerId}/overview`);
    await button("Edit Customer").click();
    await dlabel("Customer/company name").fill("Renamed inline " + width);
    await dbutton("Save Customer").click();
    await goto(`accounts/invoices/${invoiceId}`);
    await expect(page.locator(".invoice-paper")).toContainText(
      "Quotation inline " + width,
    );
    await expect(page.locator(".invoice-paper")).not.toContainText(
      "Renamed inline " + width,
    );
    check(
      width,
      "live customer statement and preserved invoice billing snapshot",
    );
    await goto("reports");
    const reportOptions = await label("Report")
      .locator("option")
      .allTextContents();
    for (const report of reportOptions) {
      await label("Report").selectOption(report);
      const event = page.waitForEvent("download");
      await button("Export CSV").click();
      const file = await event;
      await file.saveAs(
        `${output}/${width}-${report.replaceAll(/[^a-z0-9]/gi, "-")}.csv`,
      );
    }
    pdf = page.waitForEvent("download");
    await button("Export PDF").click();
    download = await pdf;
    await download.saveAs(`${output}/report-${width}.pdf`);
    check(width, "ten report CSV exports and report PDF");
    // Manual invoice path, due calculation and cancellation history.
    await goto("accounts/invoices");
    await button("New Invoice").click();
    await dlabel("Invoice customer").selectOption(customerId);
    await dlabel("Invoice date").fill("2026-01-01");
    await dlabel("Due date").fill("2026-01-31");
    await dlabel("Item 1 description").fill("Manual scope");
    await dlabel("Item 1 rate").fill("100");
    await dbutton("Save Draft Invoice").click();
    await button("Issue Invoice").click();
    await expect(page.locator("main .badge").first()).toHaveText("Overdue");
    await button("Cancel / Void").click();
    await dlabel("Cancellation reason").fill("Scope withdrawn");
    await dbutton("Confirm Cancellation").click();
    await expect(page.locator("main .badge").first()).toHaveText("Cancelled");
    check(
      width,
      "manual invoice, overdue calculation and audited cancellation",
    );
    await goto(`customers/${customerId}/overview`);
    await button("Archive Customer").click();
    await dbutton("Confirm").click();
    await expect(button("Restore Customer")).toBeVisible();
    await button("Restore Customer").click();
    await dbutton("Confirm").click();
    check(width, "customer archive and restore preserve history");
    await label("Global search").fill("INV-00001");
    await expect(page.locator(".search-results")).toContainText("INV-00001");
    await page.locator(".search-results button").first().click();
    await expect(
      page.getByRole("heading", { name: "INV-00001", exact: true, level: 1 }),
    ).toBeVisible();
    check(width, "global commercial search navigation");
    await button("Quick Add").click();
    for (const action of [
      "+ New Customer",
      "+ New Project",
      "+ New Quotation",
      "+ New Invoice",
      "+ New Task",
      "+ New Expense",
    ])
      await expect(dbutton(action)).toBeVisible();
    await dbutton("+ New Expense").click();
    await expect(dlabel("Expense project")).toBeVisible();
    await dbutton("Cancel").click();
    check(width, "six quick actions and functional expense form");
    saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("azzora-demo-v1")),
    );
    fs.writeFileSync(`${output}/qa-data-${width}.json`, JSON.stringify(saved));
    await page.reload();
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("azzora-demo-v1")),
      ),
    ).toEqual(saved);
    check(width, "commercial persistence after reload");
    for (const route of [
      "customers",
      `customers/${inlineCustomerId}/projects`,
      `customers/${inlineCustomerId}/quotations`,
      `customers/${inlineCustomerId}/invoices`,
      `customers/${inlineCustomerId}/payments`,
      `customers/${inlineCustomerId}/statement`,
      "accounts/overview",
      "accounts/invoices",
      "accounts/payments",
      "accounts/expenses",
      "accounts/receivables",
      "accounts/project-financials",
      `accounts/invoices/${invoiceId}`,
      `projects/${projectId}/financials`,
      "reports",
    ]) {
      await goto(route);
      await page.locator("main h1").first().waitFor();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow ${route} at ${width}`,
      ).toBe(true);
      check(width, "responsive " + route);
    }
    await context.close();
  }
  // Protect unreadable data from fallback writes; only explicit reset can replace it.
  const page = await browser.newPage();
  await page.goto(url);
  await page.evaluate(() =>
    localStorage.setItem("azzora-demo-v1", "{broken data"),
  );
  await page.reload();
  await page.goto(url + "/#/customers");
  await page
    .getByRole("button", { name: "Add New Customer", exact: true })
    .click();
  await page
    .getByLabel("Customer/company name", { exact: true })
    .fill("Must not overwrite");
  await page
    .getByRole("button", { name: "Save Customer", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Saved data recovery", exact: true })
      .getByRole("alert"),
  ).toContainText("Writes are disabled");
  expect(
    await page.evaluate(() => localStorage.getItem("azzora-demo-v1")),
  ).toBe("{broken data");
  check(1440, "unreadable stored data remains protected from writes");
  if (errors.length) throw Error(errors.join("\n"));
  fs.writeFileSync(
    `${output}/browser-results.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    `PASS: ${checks.length} commercial journey and responsive checks; no browser errors.`,
  );
} catch (error) {
  fs.writeFileSync(
    `${output}/browser-results.json`,
    JSON.stringify({ checks, errors, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
