import { expect } from "@playwright/test";

// Public UI contract; no source imports or storage mutation. Assertions remain
// in each journey. These helpers only reach the relevant guided screen/control.
export const quotationSteps = [
  "Customer & Project",
  "Scope of Work / BOQ",
  "Pricing Summary",
  "Payment Schedule & Terms",
  "Preview & Issue",
];

export async function quotationStep(page, step) {
  const label = typeof step === "number" ? quotationSteps[step] : step;
  if (!quotationSteps.includes(label))
    throw Error(`Unknown quotation step: ${String(step)}`);
  const navigation = page.getByRole("navigation", {
    name: "Quotation steps",
    exact: true,
  });
  await expect(navigation).toHaveCount(1);
  await expect(navigation.getByRole("button")).toHaveCount(5);
  const trigger = navigation.getByRole("button", { name: label, exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-current", "step");
  const panel = page.getByRole("region", { name: label, exact: true });
  await expect(panel).toBeVisible();
  const heading = page
    .locator(".quotation-guide__heading")
    .getByRole("heading", { name: label, level: 2, exact: true });
  await expect(heading).toBeVisible();
  return { panel, heading, trigger, navigation };
}

export async function quotationAdvanced(page, enabled = true) {
  const { panel } = await quotationStep(page, 1);
  const toggle = panel.getByRole("checkbox", {
    name: "Advanced scope controls",
    exact: true,
  });
  // Presentation navigation must also remain usable on issued quotations.
  await expect(toggle).toBeEnabled();
  await toggle.setChecked(enabled);
  await expect(toggle).toBeChecked({ checked: enabled });
  return panel;
}

export async function openQuotationCategory(category) {
  await expect(category).toHaveCount(1);
  const summary = category.locator(":scope > summary");
  await expect(summary).toHaveCount(1);
  if ((await category.getAttribute("open")) === null) await summary.click();
  await expect(category).toHaveAttribute("open", "");
  await expect(
    category.getByLabel("Work category name", { exact: true }),
  ).toBeVisible();
  return category;
}

export async function openQuotationItem(row) {
  await expect(row).toHaveCount(1);
  const summary = row.locator(":scope > summary");
  await expect(summary).toHaveCount(1);
  if ((await row.getAttribute("open")) === null) await summary.click();
  await expect(row).toHaveAttribute("open", "");
  await expect(row.getByLabel("Description", { exact: true })).toBeVisible();
  return row;
}
