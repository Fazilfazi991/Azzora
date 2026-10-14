import { chromium, expect } from "@playwright/test";
import { auditUrl, browserOptions } from "./browser-runtime.mjs";

const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({
  viewport: { width: 1024, height: 900 },
});
const page = await context.newPage();

try {
  await page.goto(auditUrl + "/#/quotations");
  await page.getByRole("button", { name: "New quotation" }).click();
  const step = (name) =>
    page
      .getByRole("navigation", { name: "Quotation steps" })
      .getByRole("button", { name });

  await step(/Scope of Work/i).click();
  await page.getByRole("button", { name: "Add Work Category" }).click();
  const category = page.getByTestId("quote-section").first();
  await category.getByLabel("Work category name").fill("Rounding check");
  await category
    .getByRole("button", { name: "Add Direct Priced Item" })
    .click();
  const item = category.getByTestId("quote-line").first();
  await item.getByLabel("Description").fill("One-fils allocation boundary");
  await item.getByLabel("Rate / Unit", { exact: true }).fill("3333.75");
  await expect(item.getByLabel("Amount", { exact: true })).toHaveText(
    "3,333.75",
  );

  await step(/Pricing Summary/i).click();
  await page.getByLabel("VAT enabled").uncheck();
  await expect(page.getByTestId("grand-total")).toHaveText("AED 3,333.75");

  await step(/Payment Schedule/i).click();
  const schedule = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "Payment Schedule" }) });
  const terms = schedule.locator(".quote-line");
  await expect(terms).toHaveCount(3);
  await expect(terms.nth(0).locator(".between strong")).toHaveText(
    "AED 1,666.88",
  );
  await expect(terms.nth(1).locator(".between strong")).toHaveText(
    "AED 1,500.19",
  );
  await expect(terms.nth(2).locator(".between strong")).toHaveText(
    "AED 166.68",
  );
  await expect(
    schedule.getByText("Payment amounts differ from the Grand Total"),
  ).toHaveCount(0);

  await terms.nth(2).getByLabel("Payment amount override").fill("166.69");
  await expect(terms.nth(2).locator(".between strong")).toHaveText(
    "AED 166.69",
  );
  await expect(
    schedule.getByText("Payment amounts differ from the Grand Total"),
  ).toBeVisible();

  console.log(
    "PASS: reconciled one-fils draft schedule and preserved manual override warning.",
  );
} finally {
  await context.close();
  await browser.close();
}
