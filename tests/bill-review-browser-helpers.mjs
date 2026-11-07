export async function fillReview12(page, fields, autocomplete = false) {
  while (
    await page
      .getByRole("button", { name: "Remove item 1", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Remove item 1", exact: true })
      .click();
  await page.getByLabel("Supplier name", { exact: true }).fill(fields.supplier);
  await page.getByLabel("Document date", { exact: true }).fill(fields.date);
  await page
    .getByLabel("Invoice / receipt reference", { exact: true })
    .fill(fields.reference);
  await page
    .getByRole("combobox", { name: "Currency", exact: true })
    .selectOption(fields.currency);
  for (let n = 0; n < fields.items.length; n++) {
    await page.getByRole("button", { name: "+ Add item", exact: true }).click();
    for (const key of [
      "description",
      "quantity",
      "unitRate",
      "discount",
      "tax",
      "total",
    ]) {
      const v = fields.items[n][key];
      if (v)
        await page.getByLabel(`Item ${n + 1} ${key}`, { exact: true }).fill(v);
    }
    const unit = page.getByLabel(`Item ${n + 1} unit`, { exact: true });
    if (n === 0) await unit.fill("DRM");
    else if (autocomplete && n === 1) {
      await unit.fill("D");
      await unit.press("ArrowDown");
      await unit.press("Enter");
    } else if (autocomplete && n === 2) {
      await unit.fill("D");
      await page
        .getByRole("option", { name: /^DRM(?: — Drum)?$/, exact: false })
        .click();
    } else await unit.fill(n < 3 ? "DRM" : fields.items[n].unit);
  }
  await page
    .getByLabel("Subtotal · AED", { exact: true })
    .fill(fields.subtotal);
  await page.getByLabel("Tax · AED", { exact: true }).fill(fields.tax);
  await page
    .getByLabel("Document total · AED", { exact: true })
    .fill(fields.total);
}
