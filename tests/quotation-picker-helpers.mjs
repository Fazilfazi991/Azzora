import { expect } from "@playwright/test";

function picker(page, kind) {
  return page
    .locator(".quotation-record-picker")
    .nth(kind === "customer" ? 0 : 1);
}

export async function selectQuotationCustomer(page, id) {
  const control = picker(page, "customer");
  await control.locator("summary").click();
  await control.locator(`[data-record-id="${id}"]`).click();
  await expect(control.locator("summary")).toBeFocused();
}

export async function selectQuotationProject(page, id) {
  const control = picker(page, "project");
  await control.locator("summary").click();
  await control.locator(`[data-record-id="${id}"]`).click();
  await expect(control.locator("summary")).toBeFocused();
}

export async function clearQuotationProject(page) {
  const control = picker(page, "project");
  await control.locator("summary").click();
  const clear = control.getByRole("button", {
    name: "Use document snapshot (no linked project)",
  });
  if (await clear.count()) await clear.click();
  else await control.locator("summary").click();
}

export async function openQuotationCustomerForm(page) {
  const control = picker(page, "customer");
  await control.locator("summary").click();
  await control.getByRole("button", { name: "+ Add New Customer" }).click();
  return control.locator("summary");
}

export async function openQuotationProjectForm(page) {
  const control = picker(page, "project");
  await control.locator("summary").click();
  await control.getByRole("button", { name: "+ Add New Project" }).click();
  return control.locator("summary");
}

export async function quotationLinks(page, id) {
  return page.evaluate((quoteId) => {
    const db = JSON.parse(localStorage.getItem("azzora-demo-v1"));
    const quotation = db.quotations.find((q) => q.id === quoteId);
    return { customerId: quotation.customerId, projectId: quotation.projectId };
  }, id);
}
