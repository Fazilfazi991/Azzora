import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import {
  quotationStep,
  quotationAdvanced,
  openQuotationCategory,
  openQuotationItem,
} from "./quotation-ux-helpers.mjs";
const browser = await chromium.launch(browserOptions);
fs.mkdirSync("docs/boq", { recursive: true });
for (const width of [1440, 1024, 768, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.goto(auditUrl + "/#/quotations");
  await page
    .getByRole("button", { name: "New quotation", exact: true })
    .click();
  await quotationAdvanced(page);
  await page
    .getByRole("button", { name: "Add Work Category", exact: true })
    .click();
  const section = page.getByTestId("quote-section").first();
  await openQuotationCategory(section);
  await section
    .getByLabel("Work category name", { exact: true })
    .fill("Civil works");
  await section
    .getByRole("button", { name: "Add Heading (No Price)", exact: true })
    .click();
  await section
    .getByRole("button", { name: "Add Priced Item", exact: true })
    .click();
  const rows = section.getByTestId("quote-line");
  await expect(rows).toHaveCount(2);
  await openQuotationItem(rows.nth(0));
  await rows
    .nth(0)
    .getByLabel("Description", { exact: true })
    .fill("Floor finishes");
  await openQuotationItem(rows.nth(1));
  await rows
    .nth(1)
    .getByLabel("Description", { exact: true })
    .fill("Supply and install porcelain tiles");
  await rows.nth(1).getByLabel("Quantity", { exact: true }).fill("2.5");
  await rows.nth(1).getByLabel("Rate / Unit", { exact: true }).fill("90");
  await section
    .getByRole("button", { name: "Add Subcategory", exact: true })
    .click();
  await expect(page.getByTestId("quote-section")).toHaveCount(2);
  await openQuotationCategory(page.getByTestId("quote-section").nth(1));
  await expect(
    page.getByTestId("quote-section").nth(1).getByLabel("Parent category"),
  ).not.toHaveValue("");
  const parent = page
    .getByTestId("quote-section")
    .nth(1)
    .getByLabel("Parent category");
  const parentId = await parent.inputValue();
  await parent.selectOption("");
  await expect(page.getByTestId("quote-section").nth(1)).not.toHaveClass(
    /boq-subsection/,
  );
  await parent.selectOption(parentId);
  await expect(page.getByTestId("quote-section").nth(1)).toHaveClass(
    /boq-subsection/,
  );
  await quotationStep(page, 2);
  await expect(page.getByTestId("grand-total")).toHaveText("AED 236.25");
  await quotationStep(page, 1);
  await openQuotationCategory(section);
  await openQuotationItem(rows.nth(1));
  const more = section.locator(".boq-more summary");
  await more.focus();
  await more.press("Enter");
  await expect(
    section.getByRole("button", { name: "Duplicate section", exact: true }),
  ).toBeVisible();
  await more.press("Escape");
  await expect(more).toBeFocused();
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/boq/${process.env.BOQ_PHASE || "after"}-${width}.png`,
    fullPage: true,
  });
  await page.locator(".boq-builder").screenshot({
    style: ".topbar, .mobile-nav { visibility: hidden !important; }",
    path: `docs/boq/${process.env.BOQ_PHASE || "after"}-boq-${width}.png`,
  });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
  console.log(
    `PASS BOQ visual ${width}: nesting/detach/reattach, AED 236.25, keyboard menu focus, screenshots and exact document width`,
  );
  await page.close();
}
await browser.close();
