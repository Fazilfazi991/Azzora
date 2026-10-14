import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { auditUrl, browserOptions } from "./browser-runtime.mjs";

const browser = await chromium.launch(browserOptions);
const evidence = path.resolve("tmp/quotation-selector-boq");
fs.mkdirSync(evidence, { recursive: true });
const results = [];

for (const width of [1440, 1024, 768, 390]) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto(auditUrl + "/#/quotations");
    await page.getByRole("button", { name: "New quotation" }).click();
    const quoteId = await page.evaluate(() => location.hash.split("/")[2]);
    const step = (name) =>
      page
        .getByRole("navigation", { name: "Quotation steps" })
        .getByRole("button", { name });
    const record = () =>
      page.evaluate(
        (id) =>
          JSON.parse(localStorage.getItem("azzora-demo-v1")).quotations.find(
            (q) => q.id === id,
          ),
        quoteId,
      );

    await step(/Scope|BOQ/i).click();
    await page.getByRole("button", { name: "Add Work Category" }).click();
    const category = page.getByTestId("quote-section").first();
    await category.getByLabel("Work category name").fill("Demolition Work");
    await category
      .getByRole("button", { name: "Add Parent Work Description" })
      .click();
    const parent = category.getByTestId("quote-line").first();
    await expect(parent.locator("summary").first()).toHaveCSS(
      "background-color",
      "rgb(242, 242, 242)",
    );
    await parent
      .getByLabel("Description")
      .fill("Demolition and cart away of existing block wall");
    await expect(parent.getByLabel("Pricing Type")).toHaveValue("By Client");
    await parent.getByRole("button", { name: "Add Child Item" }).click();
    const child = category.getByTestId("quote-line").nth(1);
    await child.getByLabel("Description").fill("Kitchen");
    await child.getByLabel("Quantity").fill("8.4");
    await child.getByLabel("Rate / Unit", { exact: true }).fill("90");
    await expect(child.getByLabel("Amount", { exact: true })).toHaveText(
      "756.00",
    );
    await expect(category.locator(".quotation-category-summary")).toContainText(
      "1.00",
    );
    const beforeCustomer = await record();
    expect(beforeCustomer.sections[0].rows[0].boqRole).toBe("parent");
    expect(beforeCustomer.sections[0].rows[1].pricingType).toBe("Normal Rate");
    await page.screenshot({
      path: path.join(evidence, `boq-${width}.png`),
      fullPage: true,
    });

    await step(/Customer/i).click();
    const customer = page.locator(".quotation-record-picker").first();
    await customer.locator("summary").click();
    await customer
      .getByRole("searchbox", { name: "Search customer" })
      .fill("no existing match");
    await expect(
      customer.getByText("No matches.", { exact: false }),
    ).toBeVisible();
    await customer.getByRole("button", { name: "+ Add New Customer" }).click();
    const customerDialog = page.getByRole("dialog", { name: "Add Customer" });
    await customerDialog
      .getByLabel("Customer/company name")
      .fill(`Agent Two QA Customer ${width}`);
    await customerDialog.getByRole("button", { name: "Save Customer" }).click();
    await expect(customerDialog).toHaveCount(0);
    await expect(customer.locator("summary")).toBeFocused();
    const afterCustomer = await record();
    expect(afterCustomer.customerId).toBeTruthy();
    expect(afterCustomer.sections).toEqual(beforeCustomer.sections);
    await expect(step(/Customer/i)).toHaveAttribute("aria-current", "step");
    await page.screenshot({
      path: path.join(evidence, `customer-${width}.png`),
      fullPage: true,
    });

    const project = page.locator(".quotation-record-picker").nth(1);
    await project.locator("summary").click();
    await project.getByRole("button", { name: "+ Add New Project" }).click();
    const projectDialog = page.getByRole("dialog", { name: "New Project" });
    await expect(
      projectDialog.getByText("Linked from the quotation"),
    ).toBeVisible();
    await expect(
      projectDialog.getByLabel("Select Existing Customer"),
    ).toHaveCount(0);
    await projectDialog
      .getByLabel("Project name")
      .fill(`Agent Two QA Project ${width}`);
    await projectDialog.getByRole("button", { name: "Continue →" }).click();
    await projectDialog
      .getByLabel("Project location")
      .fill("Business Bay, Dubai");
    await projectDialog.getByLabel("Civil", { exact: true }).check();
    for (let i = 0; i < 3; i++)
      await projectDialog.getByRole("button", { name: "Continue →" }).click();
    await projectDialog.getByRole("button", { name: "Create Project" }).click();
    await expect(projectDialog).toHaveCount(0);
    await expect(project.locator("summary")).toBeFocused();
    const afterProject = await record();
    expect(afterProject.projectId).toBeTruthy();
    expect(afterProject.customerId).toBe(afterCustomer.customerId);
    expect(afterProject.sections).toEqual(beforeCustomer.sections);
    await expect(step(/Customer/i)).toHaveAttribute("aria-current", "step");
    await page.screenshot({
      path: path.join(evidence, `project-${width}.png`),
      fullPage: true,
    });

    await page.reload();
    await step(/Scope|BOQ/i).click();
    const loadedCategory = page.getByTestId("quote-section").first();
    if (
      !(await loadedCategory.evaluate((element) =>
        element.hasAttribute("open"),
      ))
    )
      await loadedCategory.locator("summary").first().click();
    const loadedParent = loadedCategory.getByTestId("quote-line").first();
    if (
      !(await loadedParent.evaluate((element) => element.hasAttribute("open")))
    )
      await loadedParent.locator("summary").first().click();
    await expect(
      loadedParent.getByRole("button", { name: "Add Child Item" }),
    ).toBeVisible();
    await expect(loadedCategory.getByTestId("quote-line")).toHaveCount(2);
    if (width === 1440) {
      for (const type of ["FOC", "Excluded", "By Client"]) {
        await loadedParent.getByLabel("Pricing Type").selectOption(type);
        await expect(
          loadedParent.getByLabel("Amount", { exact: true }),
        ).toHaveText(type);
        await expect(
          loadedParent.getByRole("button", { name: "Add Child Item" }),
        ).toBeVisible();
      }
      const loadedChild = loadedCategory.getByTestId("quote-line").nth(1);
      if (
        !(await loadedChild.evaluate((element) => element.hasAttribute("open")))
      )
        await loadedChild.locator("summary").first().click();
      for (const type of ["By Client", "FOC", "Excluded"]) {
        await loadedChild.getByLabel("Pricing Type").selectOption(type);
        await expect(
          loadedChild.getByLabel("Rate / Unit", { exact: true }),
        ).toHaveText(type);
        await expect(
          loadedChild.getByLabel("Amount", { exact: true }),
        ).toHaveText(type);
      }
      await loadedChild.getByLabel("Pricing Type").selectOption("Normal Rate");
      await expect(
        loadedChild.getByLabel("Amount", { exact: true }),
      ).toHaveText("756.00");
      await expect(
        loadedCategory.locator(".quotation-section-subtotal"),
      ).toContainText("AED 756.00");

      await step(/Customer/i).click();
      const duplicatePicker = page.locator(".quotation-record-picker").nth(1);
      await duplicatePicker.locator("summary").click();
      await duplicatePicker
        .getByRole("button", { name: "+ Add New Project" })
        .click();
      const duplicateDialog = page.getByRole("dialog", { name: "New Project" });
      await duplicateDialog
        .getByLabel("Project name")
        .fill(`Agent Two QA Project ${width}`);
      await duplicateDialog.getByRole("button", { name: "Continue →" }).click();
      await duplicateDialog
        .getByLabel("Project location")
        .fill("Business Bay, Dubai");
      await duplicateDialog.getByLabel("Civil", { exact: true }).check();
      await duplicateDialog.getByRole("button", { name: "Continue →" }).click();
      await expect(duplicateDialog.getByRole("alert")).toContainText(
        "already exists",
      );
      await page.keyboard.press("Escape");
      await expect(duplicateDialog).toHaveCount(0);
      expect((await record()).projectId).toBe(afterProject.projectId);

      const otherCustomer = await page.evaluate(
        (currentId) =>
          JSON.parse(localStorage.getItem("azzora-demo-v1")).clients.find(
            (c) => c.id !== currentId && c.status !== "Archived",
          ),
        afterCustomer.customerId,
      );
      const changeCustomer = page.locator(".quotation-record-picker").first();
      await changeCustomer.locator("summary").click();
      await changeCustomer
        .getByRole("button", { name: new RegExp(otherCustomer.name) })
        .click();
      const changed = await record();
      expect(changed.customerId).toBe(otherCustomer.id);
      expect(changed.projectId).toBe("");
      expect(changed.sections[0].rows).toHaveLength(2);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    results.push({
      width,
      customerId: afterCustomer.customerId,
      projectId: afterProject.projectId,
      status: "passed",
    });
  } finally {
    await context.close();
  }
}
await browser.close();
console.log(
  JSON.stringify({ checks: results, screenshots: evidence }, null, 2),
);
