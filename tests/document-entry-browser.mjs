import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import { browserOptions } from "./browser-runtime.mjs";
const base = process.env.AZZORA_ACCOUNTS_REVIEW_URL || "http://127.0.0.1:5289";
const password =
  process.env.AZZORA_REVIEW_PASSWORD ||
  JSON.parse(fs.readFileSync("tmp/local-test-secret.json", "utf8")).password;
const out = "tmp/document-entry-evidence";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(browserOptions),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const checks = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (name) => checks.push(name);
try {
  await page.goto(`${base}/accountant.html`);
  await page.evaluate(() =>
    localStorage.setItem("azzora-demo-v1", "DOCUMENT_AUTOMATION_SENTINEL"),
  );
  await page.getByLabel("Demo password").fill(password);
  await page.getByRole("button", { name: /Sign in to review/ }).click();
  await expect(
    page.getByRole("heading", { name: "Financial dashboard", exact: true }),
  ).toBeVisible();
  const session = await (
    await context.request.get(`${base}/api/accounts-review/session`)
  ).json();
  await context.request.post(`${base}/api/accounts-review/reset`, {
    headers: { Origin: base, "X-Azzora-CSRF": session.csrf },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Financial dashboard", exact: true }),
  ).toBeVisible();
  const before = await (
    await context.request.get(`${base}/api/accounts-review/snapshot`)
  ).json();
  await page.goto(`${base}/accountant.html#/bills`);
  await page.getByRole("link", { name: "Read a bill · save draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Read a bill", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${out}/01-upload-desktop.png`,
    fullPage: true,
  });
  check("existing Purchase bills links to document-entry workflow");
  await page
    .getByLabel("Upload document", { exact: true })
    .setInputFiles("public/document-samples/01.png");
  await expect(page.getByLabel("Supplier name", { exact: true })).toHaveValue(
    "Sample Supplier B",
  );
  await expect(
    page.getByLabel("Document total · AED", { exact: true }),
  ).toHaveValue("126.00");
  await expect(
    page.getByText("Synthetic sample replay (not AI)", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Original uploaded bill" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Original uploaded bill" }),
  ).toHaveJSProperty("naturalWidth", 800);
  check("uploaded image preview and explicit synthetic suggestions");
  await expect(
    page.getByRole("button", { name: "Confirm & save draft" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/changed from AED 50.00 to AED 60.00/),
  ).toBeVisible();
  check("uncertain fields, price-change flag and mandatory human confirmation");
  await page.getByLabel("Document total · AED", { exact: true }).fill("125.00");
  await expect(
    page.getByText("Subtotal plus tax does not equal the document total."),
  ).toBeVisible();
  await page.getByLabel("Document total · AED", { exact: true }).fill("126.00");
  await page
    .getByLabel("Project", { exact: true })
    .selectOption("demo-apartment");
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${out}/02-review-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    check(`document review responsive layout ${width}px`);
  }
  await page
    .getByLabel(
      "Remember this supplier’s classification and category in this demo session",
    )
    .check();
  await page
    .getByLabel(
      "I checked all fields and any warnings against the original document",
    )
    .check();
  await page
    .getByLabel("Item 1 description", { exact: true })
    .fill("Interior paint reviewed");
  await expect(
    page.getByRole("button", { name: "Confirm & save draft" }),
  ).toBeDisabled();
  check("editing an extracted field requires renewed confirmation");
  await page
    .getByLabel(
      "I checked all fields and any warnings against the original document",
    )
    .check();
  await page.getByRole("button", { name: "Confirm & save draft" }).click();
  await expect(
    page.getByText(
      "Draft saved. No bill, payment or journal was posted. You can reopen and edit this draft below.",
    ),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/03-draft-mobile.png`, fullPage: true });
  const after = await (
    await context.request.get(`${base}/api/accounts-review/snapshot`)
  ).json();
  expect(after.metrics).toEqual(before.metrics);
  expect(after.bills).toEqual(before.bills);
  expect(after.expenses).toEqual(before.expenses);
  expect(after.documentEntries.reviews[0].status).toBe("Draft");
  expect(after.documentEntries.defaults).toHaveLength(1);
  check(
    "saved draft and supplier default leave all financial modules unchanged",
  );
  await page.reload();
  await page.getByRole("button", { name: "Review SYNTH-01" }).click();
  await expect(
    page.getByLabel("Item 1 description", { exact: true }),
  ).toHaveValue("Interior paint reviewed");
  check("refresh and reopen preserve reviewed edits and original extraction");
  await page
    .getByLabel("Upload document", { exact: true })
    .setInputFiles("public/document-samples/01.png");
  await expect(
    page.getByText(
      "This exact file was already uploaded. Opened its existing review without creating a duplicate.",
    ),
  ).toBeVisible();
  const dedup = await (
    await context.request.get(`${base}/api/accounts-review/snapshot`)
  ).json();
  expect(dedup.documentEntries.reviews).toHaveLength(1);
  check("same-file retry opens existing draft without duplicate attachment");
  await page
    .getByLabel("Upload document", { exact: true })
    .setInputFiles("public/document-samples/02.pdf");
  await expect(
    page.getByLabel("Invoice / receipt reference", { exact: true }),
  ).toHaveValue("SYNTH-02");
  await expect(
    page.getByRole("img", { name: "Original PDF page 1" }),
  ).toHaveAttribute("data-rendered", "true");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/04-pdf-desktop.png`, fullPage: true });
  check("PDF upload, suggestions and original-document viewer route");
  await page
    .getByLabel("Upload document", { exact: true })
    .setInputFiles("tests/fixtures/document-entry/22.pdf");
  await expect(
    page.getByLabel("Invoice / receipt reference", { exact: true }),
  ).toHaveValue("SYNTH-22");
  await expect(
    page.getByRole("img", { name: "Original PDF page 1" }),
  ).toHaveAttribute("data-rendered", "true");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Original PDF page 2" }),
  ).toHaveAttribute("data-rendered", "true");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${out}/06-multipage-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${out}/07-multipage-mobile.png`,
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Original PDF page 1" }),
  ).toHaveAttribute("data-rendered", "true");
  await page.setViewportSize({ width: 1440, height: 1000 });
  check(
    "multi-page PDF renders both pages with accessible controls on desktop and mobile",
  );
  await page
    .getByLabel("Upload document", { exact: true })
    .setInputFiles("public/document-samples/03.png");
  await expect(
    page.getByLabel("Invoice / receipt reference", { exact: true }),
  ).toHaveValue("SYNTH-03");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${out}/05-bilingual-desktop.png`,
    fullPage: true,
  });
  check("Arabic/English synthetic sample review");
  // Unknown bytes must not receive canned results just because the file is named like a sample.
  const bytes = Buffer.concat([
    fs.readFileSync("public/document-samples/01.png"),
    Buffer.from("unregistered-copy"),
  ]);
  await page
    .getByLabel("Upload document", { exact: true })
    .setInputFiles({ name: "01.png", mimeType: "image/png", buffer: bytes });
  await expect(page.getByLabel("Supplier name", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByText(
      "Not enabled. Original suggestions are preserved with each correction.",
    ),
  ).toBeVisible();
  check("unregistered upload stays manual and no field is invented");
  expect(
    await page.evaluate(() => localStorage.getItem("azzora-demo-v1")),
  ).toBe("DOCUMENT_AUTOMATION_SENTINEL");
  check("Manager browser-local records preserved");
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Accounts" }),
  ).toBeVisible();
  check("separate Accountant logout flow");
} finally {
  fs.writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ checks, errors, passed: checks.length }, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify({ passed: checks.length, errors }));
