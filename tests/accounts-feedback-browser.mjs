import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import { browserOptions, reviewTlsOptions } from "./browser-runtime.mjs";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

globalThis.DOMMatrix ??= DOMMatrix;
globalThis.ImageData ??= ImageData;
globalThis.Path2D ??= Path2D;
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

// Synthetic, isolated browser context. No credentials are embedded in this harness.
const base = process.env.AZZORA_ACCOUNTS_REVIEW_URL || "https://127.0.0.1:5293";
const password =
  process.env.AZZORA_REVIEW_PASSWORD ||
  JSON.parse(fs.readFileSync("tmp/accounts-preview-access.json", "utf8"))
    .password;
const output = process.env.AZZORA_ACCOUNTS_EVIDENCE || "tmp/accounts-feedback";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({
  ...reviewTlsOptions(base),
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const checks = [],
  errors = [];
const pdfEvidence = [];
page.on("pageerror", (error) => errors.push(error.message));
let csrf;
const snapshot = async () =>
  (await context.request.get(`${base}/api/accounts-review/snapshot`)).json();
async function action(input, expected = 200, key = crypto.randomUUID()) {
  const response = await context.request.post(
    `${base}/api/accounts-review/action`,
    {
      headers: {
        Origin: base,
        "X-Azzora-CSRF": csrf,
        "X-Azzora-Idempotency-Key": key,
      },
      data: input,
    },
  );
  expect(response.status(), await response.text()).toBe(expected);
  return response.json();
}
async function route(name) {
  await page.goto(`${base}/accountant.html#/${name}`);
  await page.waitForLoadState("networkidle");
}
async function fillItem(index, description, quantity, rate, unit = "Nos") {
  await page
    .getByLabel(`Item ${index} description`, { exact: true })
    .fill(description);
  await page
    .getByLabel(`Item ${index} quantity`, { exact: true })
    .fill(quantity);
  await page.getByLabel(`Item ${index} unit`, { exact: true }).fill(unit);
  await page.getByLabel(`Item ${index} rate`, { exact: true }).fill(rate);
}
async function captureWidths(name) {
  for (const width of [1440, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name} page overflow at ${width}`,
    ).toBe(true);
    await page.screenshot({
      path: `${output}/${name}-${width}.png`,
      fullPage: true,
    });
    const itemRegion = page.getByRole("region", {
      name: "Editable document items",
      exact: true,
    });
    if (width <= 768 && (await itemRegion.count())) {
      const scroll = await itemRegion.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        return {
          offset: element.scrollLeft,
          maximum: element.scrollWidth - element.clientWidth,
        };
      });
      expect(scroll.offset).toBeGreaterThan(0);
      expect(Math.abs(scroll.maximum - scroll.offset)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => scrollX)).toBe(0);
      if (width === 390)
        await page.screenshot({
          path: `${output}/${name}-${width}-scrolled.png`,
          fullPage: true,
        });
      await itemRegion.evaluate((element) => {
        element.scrollLeft = 0;
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function savePdf(id, filename) {
  const response = await context.request.get(
    `${base}/api/accounts-review/pdf/${encodeURIComponent(id)}`,
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const bytes = await response.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  fs.writeFileSync(`${output}/${filename}`, bytes);
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
  });
  try {
    const pdf = await task.promise;
    const facts = { filename, pages: pdf.numPages, text: [], outOfBounds: [] };
    const prefix = filename.replace(/\.pdf$/, "") + "-page-";
    for (const candidate of fs.readdirSync(output)) {
      if (
        candidate.startsWith(prefix) &&
        /^\d+\.png$/.test(candidate.slice(prefix.length))
      )
        fs.unlinkSync(`${output}/${candidate}`);
    }
    for (let number = 1; number <= pdf.numPages; number++) {
      const documentPage = await pdf.getPage(number);
      const content = await documentPage.getTextContent();
      facts.text.push(
        content.items
          .filter((item) => "str" in item)
          .map((item) => item.str)
          .join(" "),
      );
      const normal = documentPage.getViewport({ scale: 1 });
      for (const item of content.items.filter(
        (item) => "str" in item && item.str.trim(),
      )) {
        const [, , , , x, y] = item.transform;
        if (
          x < -1 ||
          y < -1 ||
          x + item.width > normal.width + 1 ||
          y > normal.height + 1
        )
          facts.outOfBounds.push({
            number,
            text: item.str,
            x,
            y,
            width: item.width,
          });
      }
      const viewport = documentPage.getViewport({ scale: 1.4 });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await documentPage.render({
        canvas,
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
      fs.writeFileSync(
        `${output}/${filename.replace(/\.pdf$/, "")}-page-${number}.png`,
        canvas.toBuffer("image/png"),
      );
    }
    expect(facts.outOfBounds, filename).toEqual([]);
    for (const [index, text] of facts.text.entries()) {
      if (
        text.includes("Description") &&
        text.includes("Qty") &&
        text.includes("Amount")
      ) {
        expect(
          /Synthetic long item \d+:|W{2,}|Plumbing Item [AB]|Pipe Fitting/.test(
            text,
          ),
          `${filename} page ${index + 1} must not orphan an item table header`,
        ).toBe(true);
      }
    }
    if (filename.startsWith("multipage")) {
      expect(facts.pages).toBeGreaterThan(1);
      const text = facts.text.join(" ");
      for (let index = 1; index <= 60; index++)
        expect(text).toContain(`Synthetic long item ${index}:`);
    }
    if (filename === "oversized-row-invoice.pdf") {
      expect(facts.pages).toBeGreaterThan(1);
      const wideCharacters = (
        facts.text.join(" ").match(/W{2,}/g) || []
      ).reduce((total, run) => total + run.length, 0);
      expect(wideCharacters).toBe(1500);
    }
    pdfEvidence.push(facts);
    fs.writeFileSync(
      `${output}/pdf-evidence.json`,
      JSON.stringify(pdfEvidence, null, 2),
    );
  } finally {
    await task.destroy();
  }
}

try {
  await page.goto(`${base}/accountant.html`);
  await expect(
    page.getByRole("heading", { name: "Sign in to Accounts", exact: true }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`${base}/api/accounts-review/snapshot`)
    ).status(),
  ).toBe(401);
  await page.evaluate(() =>
    localStorage.setItem("azzora-demo-v1", "ITEM_LEDGER_QA_SENTINEL"),
  );
  await page.getByLabel("Demo password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Sign in to review/ }).click();
  await expect(
    page.getByRole("heading", { name: "Financial dashboard", exact: true }),
  ).toBeVisible();
  csrf = (
    await (
      await context.request.get(`${base}/api/accounts-review/session`)
    ).json()
  ).csrf;
  expect(
    (
      await context.request.post(`${base}/api/accounts-review/reset`, {
        headers: { Origin: base, "X-Azzora-CSRF": csrf },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  const initial = await snapshot();
  checks.push("dedicated Accountant login and authenticated isolated session");

  await route("new-invoice");
  await page.getByLabel("Document type").selectOption("Normal Invoice");
  await page
    .getByLabel("Customer", { exact: true })
    .fill("Synthetic Item Client");
  await fillItem(1, "Plumbing Item A", "10", "6.00");
  await page.getByRole("button", { name: "+ Add Item", exact: true }).click();
  await fillItem(2, "Plumbing Item B", "5", "20.00");
  await page.getByRole("button", { name: "+ Add Item", exact: true }).click();
  await fillItem(3, "Pipe Fitting", "3", "15.00");
  await expect(page.getByLabel("Item subtotal", { exact: true })).toHaveText(
    "AED 205.00",
  );
  await page.getByLabel("Item 3 quantity", { exact: true }).fill("1.005");
  await page.getByLabel("Item 3 rate", { exact: true }).fill("1");
  await expect(page.getByLabel("Item 3 amount", { exact: true })).toHaveText(
    "1.01",
  );
  await page
    .getByRole("button", { name: "Remove item 3", exact: true })
    .click();
  await expect(page.getByLabel("Item subtotal", { exact: true })).toHaveText(
    "AED 160.00",
  );
  await page.getByRole("button", { name: "+ Add Item", exact: true }).click();
  await fillItem(3, "Pipe Fitting", "3", "15.00");
  await captureWidths("invoice-items");
  checks.push(
    "invoice add/edit/remove lines, 205.00 sample and half-up decimal boundary",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Recorded" }),
  ).toBeVisible();
  let after = await snapshot();
  const invoice = after.invoices.find(
    (record) => record.party === "Synthetic Item Client",
  );
  expect(invoice.amountFils).toBe("20500");
  expect(invoice.items).toHaveLength(3);
  expect(after.metrics.revenueFils).toBe(initial.metrics.revenueFils);
  await route("invoices");
  const invoiceRow = page.getByRole("row").filter({ hasText: invoice.id });
  await invoiceRow
    .getByRole("link", { name: "Edit draft", exact: true })
    .click();
  await expect(page.getByLabel("Item 2 quantity", { exact: true })).toHaveValue(
    "5",
  );
  await expect(page.getByLabel("Item subtotal", { exact: true })).toHaveText(
    "AED 205.00",
  );
  await page
    .getByRole("button", { name: "Issue document", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await snapshot()).invoices.find((record) => record.id === invoice.id)
          ?.status,
    )
    .toBe("Issued");
  after = await snapshot();
  const issuedInvoice = after.invoices.find(
    (record) => record.id === invoice.id,
  );
  expect(after.metrics.revenueFils).toBe(
    (BigInt(initial.metrics.revenueFils) + 20500n).toString(),
  );
  await action({ kind: "issue-invoice", id: invoice.id }, 400);
  await action(
    {
      kind: "update-invoice-draft",
      id: invoice.id,
      party: invoice.party,
      date: invoice.date,
      due: invoice.due,
      description: "Forbidden edit",
      invoiceType: "Normal Invoice",
      items: [
        { description: "Forbidden", quantity: "1", unit: "Nos", rate: "1" },
      ],
    },
    400,
  );
  expect(
    (await snapshot()).invoices.find((record) => record.id === invoice.id),
  ).toEqual(issuedInvoice);
  expect((await snapshot()).invoices.slice(0, initial.invoices.length)).toEqual(
    initial.invoices,
  );
  checks.push(
    "saved invoice draft reopens; issue posts once; issued/legacy records immutable",
  );
  await savePdf(invoice.id, "itemized-invoice.pdf");

  const historicalBill = await action({
    kind: "bill",
    party: "Sample Supplier B",
    date: "2026-10-21",
    due: "2026-10-22",
    description: "Synthetic comparable paint purchase",
    category: "Cost of Sales",
    poReference: "SYN-HISTORY",
    invoiceReference: "SYN-HISTORY-001",
    items: [
      {
        description: "Interior paint",
        quantity: "1",
        unit: "tin",
        rate: "50.00",
        productId: "demo-paint",
      },
    ],
    issue: true,
  });
  await route("bills");
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: historicalBill.id }),
  ).toBeVisible();
  await page
    .getByLabel("Item 1 product", { exact: true })
    .selectOption("demo-paint");
  await page.getByLabel("Item 1 rate", { exact: true }).fill("60.00");
  await expect(page.locator(".review-item-price-notice")).toContainText(
    "matching supplier/unit catalog reference",
  );
  await expect(
    page.getByLabel("Comparable purchase price changes", { exact: true }),
  ).toContainText(historicalBill.id);
  await page.getByLabel("Item 1 unit", { exact: true }).fill("Kg");
  await expect(page.locator(".review-item-price-notice")).toHaveCount(0);
  await expect(
    page.getByLabel("Comparable purchase price changes", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Supplier", { exact: true })
    .fill("Synthetic Plumbing Supplier");
  await page
    .getByLabel("Supplier invoice number", { exact: true })
    .fill("SYN-ITEMS-001");
  await fillItem(1, "Plumbing Item A", "10", "6.00");
  await page.getByRole("button", { name: "+ Add Item", exact: true }).click();
  await fillItem(2, "Plumbing Item B", "5", "20.00");
  await page.getByRole("button", { name: "+ Add Item", exact: true }).click();
  await fillItem(3, "Pipe Fitting", "3", "15.00");
  await expect(page.getByLabel("Item subtotal", { exact: true })).toHaveText(
    "AED 205.00",
  );
  await captureWidths("purchase-items");
  const beforeBill = await snapshot();
  await page
    .getByRole("button", { name: "Save bill draft", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot()).bills.length)
    .toBe(beforeBill.bills.length + 1);
  after = await snapshot();
  const bill = after.bills.find(
    (record) => record.invoiceReference === "SYN-ITEMS-001",
  );
  expect(bill.status).toBe("Draft");
  expect(bill.amountFils).toBe("20500");
  expect(after.metrics.payablesFils).toBe(beforeBill.metrics.payablesFils);
  await route("bills");
  await page
    .getByRole("row")
    .filter({ hasText: bill.id })
    .getByRole("link", { name: "Edit draft", exact: true })
    .click();
  await expect(page.getByLabel("Item 2 rate", { exact: true })).toHaveValue(
    "20.00",
  );
  await page
    .locator("#bill-manual-form")
    .getByRole("button", { name: "Issue bill", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await snapshot()).bills.find((record) => record.id === bill.id).status,
    )
    .toBe("Issued");
  await action({ kind: "issue-bill", id: bill.id }, 400);
  after = await snapshot();
  expect(after.metrics.payablesFils).toBe(
    (BigInt(beforeBill.metrics.payablesFils) + 20500n).toString(),
  );
  expect(
    after.bills.find((record) => record.id === bill.id).items,
  ).toHaveLength(3);
  await savePdf(bill.id, "itemized-bill.pdf");
  checks.push(
    "purchase lines persist; bill draft has no payable; explicit issue once and bill PDF",
  );

  // Multi-page PDFs are created from actual saved item snapshots, never an isolated PDF mock.
  const longItems = Array.from({ length: 60 }, (_, index) => ({
    description: `Synthetic long item ${index + 1}: professionally supplied fittings and installation materials with a deliberately long wrapping description for multi-page PDF verification.`,
    quantity: "1.25",
    unit: "Nos",
    rate: "12.3456",
  }));
  const longInvoice = await action({
    kind: "invoice",
    party: "Synthetic Multi-page Client",
    date: "2026-10-22",
    due: "2026-10-22",
    description: "Multi-page test",
    invoiceType: "Proforma",
    issue: true,
    items: longItems,
  });
  await savePdf(longInvoice.id, "multipage-invoice.pdf");
  const beforeProformaReceipt = await snapshot();
  await action(
    {
      kind: "receipt",
      documentId: longInvoice.id,
      date: "2026-10-22",
      amount: "1.00",
      account: "bank",
    },
    400,
  );
  expect(await snapshot()).toEqual(beforeProformaReceipt);
  const longBill = await action({
    kind: "bill",
    party: "Synthetic Multi-page Supplier",
    date: "2026-10-22",
    due: "2026-10-22",
    description: "Multi-page test",
    category: "Cost of Sales",
    poReference: "SYN-PO-MULTI",
    invoiceReference: "SYN-MULTI-001",
    items: longItems,
    issue: false,
  });
  await savePdf(longBill.id, "multipage-bill.pdf");
  const oversizedInvoice = await action({
    kind: "invoice",
    party: "Synthetic Oversized Row Client",
    date: "2026-10-22",
    due: "2026-10-22",
    description: "Maximum-length row wrapping",
    invoiceType: "Proforma",
    issue: true,
    items: [
      {
        description: "W".repeat(500),
        quantity: "1",
        unit: "Nos",
        rate: "1.00",
        details: "W".repeat(1000),
      },
    ],
  });
  await savePdf(oversizedInvoice.id, "oversized-row-invoice.pdf");
  checks.push(
    "60 long item invoice and bill PDFs downloaded from authenticated application endpoint",
  );
  await action({
    kind: "receipt",
    documentId: invoice.id,
    date: invoice.date,
    amount: "100.00",
    account: "bank",
  });
  await action({
    kind: "supplier-payment",
    documentId: bill.id,
    date: bill.date,
    amount: "50.25",
    account: "bank",
  });
  const settled = await snapshot();
  expect(
    settled.invoices.find((record) => record.id === invoice.id).outstandingFils,
  ).toBe("10500");
  expect(
    settled.bills.find((record) => record.id === bill.id).outstandingFils,
  ).toBe("15475");
  checks.push(
    "itemized invoice/bill partial settlements and proforma receipt refusal",
  );

  await route("expenses");
  const beforeLedger = await snapshot();
  await page
    .getByLabel("Payee", { exact: true })
    .fill("Synthetic Labour Vendor");
  await page
    .getByRole("button", { name: "+ Create New Ledger", exact: true })
    .click();
  const dialog = page.getByRole("group", {
    name: "Create expense ledger",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create Ledger", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Enter a ledger name");
  await dialog
    .getByLabel("Ledger Name", { exact: true })
    .fill("Synthetic Plumbing Labour");
  await dialog
    .getByLabel("Expense Group")
    .selectOption({ label: "Direct Expense" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${output}/create-ledger-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog
    .getByRole("button", { name: "Create Ledger", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("Payee", { exact: true })).toHaveValue(
    "Synthetic Labour Vendor",
  );
  await expect(
    page.getByLabel("Expense Ledger").locator("option:checked"),
  ).toContainText("Synthetic Plumbing Labour");
  let ledgers = (await snapshot()).expenseLedgers;
  const ledger = ledgers.find(
    (record) => record.name === "Synthetic Plumbing Labour",
  );
  expect(ledger).toBeTruthy();
  const beforeExpense = await snapshot();
  expect(beforeExpense.metrics).toEqual(beforeLedger.metrics);
  await page.reload();
  await page.getByLabel("Expense Ledger").selectOption(ledger.id);
  await page
    .getByRole("button", { name: "+ Create New Ledger", exact: true })
    .click();
  await dialog
    .getByLabel("Ledger Name", { exact: true })
    .fill(" synthetic   plumbing labour ");
  await dialog
    .getByRole("button", { name: "Create Ledger", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "+ Create New Ledger", exact: true }),
  ).toBeFocused();
  expect((await snapshot()).expenseLedgers).toEqual(ledgers);
  await page
    .getByLabel("Payee", { exact: true })
    .fill("Synthetic Labour Vendor");
  await page
    .getByLabel("Amount · AED (VAT excluded)", { exact: true })
    .fill("75.00");
  await page
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption(beforeExpense.documentCatalog.projects[0].id);
  await page
    .getByRole("button", { name: "Record paid expense", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot()).expenses.length)
    .toBe(beforeExpense.expenses.length + 1);
  after = await snapshot();
  expect(after.expenses.at(-1).ledgerId).toBe(ledger.id);
  expect(after.metrics.costOfSalesFils).toBe(
    (BigInt(beforeExpense.metrics.costOfSalesFils) + 7500n).toString(),
  );
  expect(after.metrics.operatingExpensesFils).toBe(
    beforeExpense.metrics.operatingExpensesFils,
  );
  expect(after.metrics.bankFils).toBe(
    (BigInt(beforeExpense.metrics.bankFils) - 7500n).toString(),
  );
  await page.reload();
  const expenseRow = page
    .getByRole("row")
    .filter({ hasText: "Synthetic Labour Vendor" });
  await expenseRow.locator("summary").click();
  await expect(expenseRow).toContainText("Synthetic Plumbing Labour");
  await captureWidths("expense-ledgers");
  checks.push(
    "custom Direct ledger creation, duplicate refusal, reload/reuse, correct cost-of-sales and bank mapping",
  );

  for (const [name, group] of [
    ["Synthetic Office Care", "Administrative Expense"],
    ["Synthetic Operational Support", "Indirect Expense"],
  ]) {
    const beforeCreate = await snapshot();
    await page
      .getByRole("button", { name: "+ Create New Ledger", exact: true })
      .click();
    await dialog.getByLabel("Ledger Name", { exact: true }).fill(name);
    await dialog.getByLabel("Expense Group").selectOption({ label: group });
    await dialog
      .getByRole("button", { name: "Create Ledger", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect((await snapshot()).metrics).toEqual(beforeCreate.metrics);
    await page.getByLabel("Payee", { exact: true }).fill(`${name} Vendor`);
    await page
      .getByLabel("Amount · AED (VAT excluded)", { exact: true })
      .fill("25.00");
    await page
      .getByRole("button", { name: "Record paid expense", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot()).expenses.length)
      .toBe(beforeCreate.expenses.length + 1);
    const afterExpense = await snapshot();
    expect(afterExpense.metrics.operatingExpensesFils).toBe(
      (BigInt(beforeCreate.metrics.operatingExpensesFils) + 2500n).toString(),
    );
    expect(afterExpense.metrics.costOfSalesFils).toBe(
      beforeCreate.metrics.costOfSalesFils,
    );
  }
  const reconciled = await snapshot();
  expect(reconciled.trial.balanced).toBe(true);
  expect(reconciled.balance.balanced).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("azzora-demo-v1")),
  ).toBe("ITEM_LEDGER_QA_SENTINEL");
  checks.push(
    "all three expense groups persist; trial balance/Balance Sheet reconcile; Manager data sentinel preserved",
  );
  for (const name of [
    "dashboard",
    "receipts",
    "supplier-payments",
    "banking",
    "aging",
    "ledger",
    "pnl",
    "balance",
    "document-entry",
  ]) {
    await route(name);
    await expect(page.locator("main h1")).toBeVisible();
  }
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Accounts", exact: true }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`${base}/api/accounts-review/snapshot`)
    ).status(),
  ).toBe(401);
  checks.push(
    "all Accounting routes accessible; logout revokes authenticated API session",
  );
  expect(errors).toEqual([]);
  const results = {
    passed: checks.length,
    checks,
    errors,
    pdfDocuments: pdfEvidence.length,
    pdfPages: pdfEvidence.reduce(
      (total, document) => total + document.pages,
      0,
    ),
    primaryScreenshots: fs
      .readdirSync(output)
      .filter((file) =>
        /^(invoice-items|purchase-items|expense-ledgers)-(1440|1024|768|430|390)\.png$/.test(
          file,
        ),
      ).length,
    supplementaryScreenshots: fs
      .readdirSync(output)
      .filter((file) =>
        /^(create-ledger-(1440|390)|(invoice-items|purchase-items)-390-scrolled)\.png$/.test(
          file,
        ),
      ).length,
  };
  fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  await page
    .screenshot({ path: `${output}/failure.png`, fullPage: true })
    .catch(() => {});
  fs.writeFileSync(
    `${output}/results.json`,
    JSON.stringify({ checks, errors, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
