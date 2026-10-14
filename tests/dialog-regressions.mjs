import {
  quotationStep,
  quotationAdvanced,
  openQuotationCategory,
  openQuotationItem,
} from "./quotation-ux-helpers.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions } from "./browser-runtime.mjs";

const base = process.env.AZZORA_TEST_URL || "http://127.0.0.1:5187";
const output =
  process.env.AZZORA_DIALOG_EVIDENCE || "docs/agent-2-corrective-evidence";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const checks = [],
  errors = [];
function pass(width, name) {
  checks.push({ width, name, passed: true });
  console.log(`PASS ${width}: ${name}`);
}
const onlyDialog = (page) => page.getByRole("dialog");
const latestDialog = (page) => page.getByRole("dialog").last();
async function closed(page) {
  await expect(onlyDialog(page)).toHaveCount(0);
}
async function paddingClick(page, dialog) {
  const bounds = await dialog.boundingBox();
  if (!bounds) throw Error("Dialog has no bounds");
  await page.mouse.click(bounds.x + 3, bounds.y + 3);
}
async function quoteSnapshot(page, id) {
  return page.evaluate((id) => {
    const q = JSON.parse(
      localStorage.getItem("azzora-demo-v1"),
    ).quotations.find((q) => q.id === id);
    return {
      sections: q.sections,
      payments: q.payments,
      terms: q.terms,
      reference: q.reference,
      project: q.project,
      customerId: q.customerId,
    };
  }, id);
}
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push({ width, error: e.message }));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push({ width, error: m.text() });
    });
    page.on("response", (r) => {
      if (r.status() >= 400)
        errors.push({ width, error: `${r.status()} ${r.url()}` });
    });
    await page.goto(`${base}/#/team`);
    const addEmployee = page.getByRole("button", {
      name: "+ Add Employee",
      exact: true,
    });
    await addEmployee.focus();
    await page.keyboard.press("Enter");
    let dialog = onlyDialog(page);
    await expect(dialog).toHaveAccessibleName("Add Employee");
    await dialog
      .getByLabel("Employee name", { exact: true })
      .fill(`QA padding draft ${width}`);
    await paddingClick(page, dialog);
    await expect(dialog).toHaveCount(1);
    await expect(
      dialog.getByLabel("Employee name", { exact: true }),
    ).toHaveValue(`QA padding draft ${width}`);
    pass(width, "A3-002 interior padding retains unsaved employee draft");
    const tabbableCount = await dialog.evaluate(
      (d) =>
        [
          ...d.querySelectorAll("button,input,select,textarea,a[href],summary"),
        ].filter((e) => !e.disabled && e.getClientRects().length > 0).length,
    );
    for (let i = 0; i < tabbableCount + 3; i++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((d) => d.contains(document.activeElement)),
      ).toBe(true);
    }
    for (let i = 0; i < tabbableCount + 3; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(
        await dialog.evaluate((d) => d.contains(document.activeElement)),
      ).toBe(true);
    }
    pass(
      width,
      "A3-001 accessible dialog name and forward/backward Tab containment preserved",
    );
    const bounds = await dialog.boundingBox();
    await page.mouse.click(
      Math.max(1, bounds.x - 5),
      Math.max(1, bounds.y + 10),
    );
    await closed(page);
    await expect(addEmployee).toBeFocused();
    pass(
      width,
      "A3-002 outside backdrop dismisses only intended dialog and restores opener",
    );

    await page.goto(`${base}/#/tasks`);
    const createTask = page.getByRole("button", {
      name: "+ Create Task",
      exact: true,
    });
    await createTask.focus();
    await page.keyboard.press("Enter");
    await expect(onlyDialog(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await closed(page);
    await expect(createTask).toBeFocused();
    pass(width, "A3-009 task Escape restores connected keyboard trigger");
    await page.keyboard.press("Enter");
    await onlyDialog(page)
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await closed(page);
    await expect(createTask).toBeFocused();
    pass(width, "A3-009 successive drawer and close button restore trigger");

    await page.goto(`${base}/#/dashboard`);
    const newProject = page.getByRole("button", {
      name: "+ New Project",
      exact: true,
    });
    await newProject.focus();
    await page.keyboard.press("Enter");
    // Wizard titles can include its step label; use the visible project-name field as the stable parent identity.
    const parent = page
      .getByRole("dialog")
      .filter({ has: page.getByLabel("Project name", { exact: true }) });
    const projectName = `QA retained project ${width}`;
    await parent.getByLabel("Project name", { exact: true }).fill(projectName);
    const addCustomer = parent.getByRole("button", {
      name: "+ Add New Customer",
      exact: true,
    });
    await addCustomer.focus();
    await page.keyboard.press("Enter");
    let child = page.getByRole("dialog", { name: "Add Customer", exact: true });
    await child
      .getByLabel("Customer/company name", { exact: true })
      .fill("Discard only this child");
    await page.keyboard.press("Escape");
    await expect(onlyDialog(page)).toHaveCount(1);
    await expect(
      parent.getByLabel("Project name", { exact: true }),
    ).toHaveValue(projectName);
    await expect(addCustomer).toBeFocused();
    pass(
      width,
      "A3-010 nested customer Escape retains project draft and restores parent trigger",
    );
    await page.keyboard.press("Enter");
    child = page.getByRole("dialog", { name: "Add Customer", exact: true });
    await child
      .getByLabel("Customer/company name", { exact: true })
      .fill("Retain inner padding draft");
    await paddingClick(page, child);
    await expect(onlyDialog(page)).toHaveCount(2);
    await expect(
      child.getByLabel("Customer/company name", { exact: true }),
    ).toHaveValue("Retain inner padding draft");
    for (let i = 0; i < 35; i++) {
      await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
      expect(
        await child.evaluate((d) => d.contains(document.activeElement)),
      ).toBe(true);
    }
    await child
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(onlyDialog(page)).toHaveCount(1);
    await expect(addCustomer).toBeFocused();
    await expect(
      parent.getByLabel("Project name", { exact: true }),
    ).toHaveValue(projectName);
    pass(
      width,
      "Nested padding, Tab ownership and close button preserve parent project",
    );
    await page.keyboard.press("Enter");
    child = page.getByRole("dialog", { name: "Add Customer", exact: true });
    await child
      .getByLabel("Customer/company name", { exact: true })
      .fill(`QA saved inline customer ${width}`);
    await child
      .getByRole("button", { name: "Save Customer", exact: true })
      .click();
    await expect(onlyDialog(page)).toHaveCount(1);
    await expect(addCustomer).toBeFocused();
    await expect(
      parent.getByLabel("Project name", { exact: true }),
    ).toHaveValue(projectName);
    expect(
      await parent
        .getByLabel("Select Existing Customer", { exact: true })
        .inputValue(),
    ).not.toBe("");
    pass(
      width,
      "Successful inline customer save preserves project draft and focus",
    );
    await parent.evaluate((d) => {
      d.scrollTop = 0;
    });
    await page.screenshot({
      path: `${output}/project-retained-${width}.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await closed(page);
    await expect(newProject).toBeFocused();
    pass(width, "Parent project dismissal restores original page trigger");

    const quickAdd = page.getByRole("button", {
      name: "Quick Add",
      exact: true,
    });
    await quickAdd.focus();
    await page.keyboard.press("Enter");
    const quickProject = page
      .getByRole("dialog", { name: "Quick Add", exact: true })
      .getByRole("button", { name: "+ New Project", exact: true });
    await quickProject.focus();
    await page.keyboard.press("Enter");
    const quickParent = page.getByRole("dialog", {
      name: "New Project",
      exact: true,
    });
    await quickParent
      .getByLabel("Project name", { exact: true })
      .fill(`QA Quick Add retained ${width}`);
    const quickCustomer = quickParent.getByRole("button", {
      name: "+ Add New Customer",
      exact: true,
    });
    await quickCustomer.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(onlyDialog(page)).toHaveCount(1);
    await expect(quickCustomer).toBeFocused();
    await expect(
      quickParent.getByLabel("Project name", { exact: true }),
    ).toHaveValue(`QA Quick Add retained ${width}`);
    await page.keyboard.press("Escape");
    await closed(page);
    await expect(quickAdd).toBeFocused();
    pass(
      width,
      "Original Quick Add → project → customer regression retains draft and restores connected opener through replaced dialogs",
    );
    await page.goto(`${base}/#/quotations`);
    await page
      .getByRole("button", { name: "New quotation", exact: true })
      .click();
    const quoteId = await page.evaluate(() => location.hash.split("/")[2]);
    await page
      .getByLabel("Linked Project", { exact: true })
      .selectOption("project-0");
    await page
      .locator("summary")
      .filter({ hasText: "Reference & revision details" })
      .click();
    await page
      .getByLabel("Reference", { exact: true })
      .fill(`QA retained reference ${width}`);
    await quotationStep(page, 1);
    await page
      .getByRole("button", { name: "Add Work Category", exact: true })
      .click();
    const section = page.getByTestId("quote-section").first();
    await openQuotationCategory(section);
    await section
      .getByLabel("Work category name", { exact: true })
      .fill("Ceiling rectification scope");
    await section
      .getByRole("button", { name: "Add Priced Item", exact: true })
      .click();
    const line = section.getByTestId("quote-line").first();
    await openQuotationItem(line);
    await line
      .getByLabel("Description", { exact: true })
      .fill("Retained coordinated ceiling works");
    await line.getByLabel("Quantity", { exact: true }).fill("2.5");
    await line.getByLabel("Rate / Unit", { exact: true }).fill("90");
    const baseline = await quoteSnapshot(page, quoteId);
    await quotationStep(page, 2);
    const totalBefore = await page.getByTestId("grand-total").textContent();
    await quotationStep(page, 0);
    const quoteAddCustomer = page.getByRole("button", {
      name: "+ Add Customer",
      exact: true,
    });
    await quoteAddCustomer.focus();
    await page.keyboard.press("Enter");
    await onlyDialog(page)
      .getByLabel("Customer/company name", { exact: true })
      .fill("Cancelled quotation customer");
    await page.keyboard.press("Escape");
    await closed(page);
    await expect(quoteAddCustomer).toBeFocused();
    expect(await quoteSnapshot(page, quoteId)).toEqual(baseline);
    await quotationStep(page, 2);
    expect(await page.getByTestId("grand-total").textContent()).toBe(
      totalBefore,
    );
    await quotationStep(page, 0);
    pass(
      width,
      "Quotation customer cancellation preserves BOQ, terms, milestones and header draft",
    );
    const quoteCreateProject = page.getByRole("button", {
      name: "+ Create Project",
      exact: true,
    });
    await quoteCreateProject.focus();
    await page.keyboard.press("Enter");
    const quoteParent = page
      .getByRole("dialog")
      .filter({ has: page.getByLabel("Project name", { exact: true }) });
    const quoteProjectName = `QA quotation inline project ${width}`;
    await quoteParent
      .getByLabel("Project name", { exact: true })
      .fill(quoteProjectName);
    const nestedAdd = quoteParent.getByRole("button", {
      name: "+ Add New Customer",
      exact: true,
    });
    await nestedAdd.focus();
    await page.keyboard.press("Enter");
    await latestDialog(page)
      .getByLabel("Customer/company name", { exact: true })
      .fill("Cancelled nested quotation customer");
    await page.keyboard.press("Escape");
    await expect(onlyDialog(page)).toHaveCount(1);
    await expect(nestedAdd).toBeFocused();
    await expect(
      quoteParent.getByLabel("Project name", { exact: true }),
    ).toHaveValue(quoteProjectName);
    expect(await quoteSnapshot(page, quoteId)).toEqual(baseline);
    pass(
      width,
      "Quotation → project → customer Escape retains both parent draft and BOQ",
    );
    await page.keyboard.press("Escape");
    await closed(page);
    await expect(quoteCreateProject).toBeFocused();
    expect(await quoteSnapshot(page, quoteId)).toEqual(baseline);
    await quotationStep(page, 2);
    expect(await page.getByTestId("grand-total").textContent()).toBe(
      totalBefore,
    );
    await quotationStep(page, 0);
    pass(
      width,
      "Successive nested Escape returns through project to quotation trigger without BOQ loss",
    );
    await quoteAddCustomer.focus();
    await page.keyboard.press("Enter");
    await onlyDialog(page)
      .getByLabel("Customer/company name", { exact: true })
      .fill(`QA quotation saved customer ${width}`);
    await onlyDialog(page)
      .getByRole("button", { name: "Save Customer", exact: true })
      .click();
    await closed(page);
    await expect(quoteAddCustomer).toBeFocused();
    const saved = await quoteSnapshot(page, quoteId);
    expect(saved.sections).toEqual(baseline.sections);
    expect(saved.payments).toEqual(baseline.payments);
    expect(saved.terms).toEqual(baseline.terms);
    expect(saved.reference).toEqual(baseline.reference);
    expect(saved.customerId).not.toBe(baseline.customerId);
    await quotationStep(page, 2);
    expect(await page.getByTestId("grand-total").textContent()).toBe(
      totalBefore,
    );
    await quotationStep(page, 0);
    pass(
      width,
      "Successful quotation customer transition retains BOQ and restores connected trigger",
    );
    await quotationStep(page, 1);
    await openQuotationCategory(section);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${output}/quotation-retained-${width}.png`,
      animations: "disabled",
    });
    await page.reload();
    const reloaded = await quoteSnapshot(page, quoteId);
    expect(reloaded.sections).toEqual(saved.sections);
    expect(reloaded.reference).toBe(saved.reference);
    pass(width, "Quotation BOQ and header remain after reload");

    await page.goto(`${base}/#/site-updates`);
    await page
      .getByRole("button", { name: "+ Post Site Update", exact: true })
      .click();
    await onlyDialog(page)
      .getByLabel("Work completed", { exact: true })
      .fill("   ");
    await onlyDialog(page)
      .getByLabel("Demo site author", { exact: true })
      .selectOption("person-3");
    const updatesBefore = await page.evaluate(
      () => JSON.parse(localStorage.getItem("azzora-demo-v1")).updates.length,
    );
    await onlyDialog(page)
      .getByRole("button", { name: "Post Update", exact: true })
      .click();
    await expect(onlyDialog(page)).toHaveCount(1);
    await expect(onlyDialog(page).getByRole("alert")).toContainText(
      "completed work",
    );
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("azzora-demo-v1")).updates.length,
      ),
    ).toBe(updatesBefore);
    await page.keyboard.press("Escape");
    await closed(page);
    pass(width, "A3-008 whitespace-only site validation remains intact");
    await context.close();
  }
  expect(errors).toEqual([]);
  fs.writeFileSync(
    `${output}/browser-results.json`,
    JSON.stringify(
      {
        sourceBase: "dd220dfaca1e0f072d84c5895e8a8c0639345297",
        base,
        runAt: new Date().toISOString(),
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `${checks.length} strict dialog regression checks passed; zero browser errors`,
  );
} finally {
  await browser.close();
}
