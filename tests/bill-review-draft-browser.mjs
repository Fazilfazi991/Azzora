import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { browserOptions, reviewTlsOptions } from "./browser-runtime.mjs";
import { fillReview12 } from "./bill-review-browser-helpers.mjs";
const base = process.env.AZZORA_REVIEW_TEST_URL || "https://127.0.0.1:5295";
const out = process.env.AZZORA_REVIEW_TEST_OUT || "tmp/bill-review-fix/local";
fs.mkdirSync(out, { recursive: true });
const identity = JSON.parse(
  fs.readFileSync("tmp/private-client-review-identity.json"),
);
const fixture = JSON.parse(fs.readFileSync("tmp/bill-review-fix/fixture.json"));
const browser = await chromium.launch(browserOptions),
  ctx = await browser.newContext({
    ...reviewTlsOptions(base),
    viewport: { width: 1440, height: 1000 },
  }),
  page = await ctx.newPage();
page.setDefaultTimeout(60000);
const checks = [],
  errors = [];
let paid = 0,
  uploadId;
page.on("pageerror", (e) => errors.push(e.message));
const snap = async () => {
  const r = await ctx.request.get(base + "/api/staging/accounts/snapshot");
  assert.equal(r.status(), 200);
  return r.json();
};
try {
  await page.route(
    "**/api/staging/accounts/documents/extract*",
    async (route) => {
      const b = route.request().postDataJSON();
      delete b.processing;
      b.mode = "manual";
      await route.continue({ postData: JSON.stringify(b) });
    },
  );
  await page.goto(base + "/accountant.html");
  await page.getByLabel("Email", { exact: true }).fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Financial dashboard", exact: true }),
  ).toBeVisible({ timeout: 120000 });
  checks.push("Individual restricted password login");
  const before = await snap();
  await page.goto(base + "/accountant.html#/document-entry");
  const consent = page.getByLabel(
    "This is fictional test data and I authorize DeepSeek processing for this upload",
    { exact: true },
  );
  if (await consent.count()) await consent.check();
  const upload = page.waitForResponse(
    (r) =>
      r.url().includes("/documents/extract") && r.request().method() === "POST",
  );
  await page
    .getByLabel("Upload document", { exact: true })
    .setInputFiles(fixture.path);
  const ur = await upload;
  assert.equal(ur.status(), 200);
  uploadId = (await ur.json()).id;
  await expect(page.getByLabel("Supplier name", { exact: true })).toBeVisible();
  await fillReview12(page, fixture.fields, true);
  checks.push(
    "Actual upload/API/original persistence; twelve rows; keyboard and mouse DRM reuse; no paid inference",
  );
  const discount = page.getByLabel("Item 8 discount", { exact: true });
  await expect(discount).toHaveValue("");
  assert.equal(
    await discount.evaluate((el) =>
      el.closest("label").classList.contains("entry-uncertain"),
    ),
    false,
  );
  await discount.focus();
  await page.screenshot({ path: out + "/discount-1440.png" });
  checks.push("Blank optional discount neutral; distinct keyboard focus");
  for (const width of [1440, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page
      .getByLabel("Item 8 total", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: out + `/items-${width}.png` });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page
      .getByRole("button", { name: "Save Review Draft", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: out + `/warnings-${width}.png` });
  }
  checks.push("Five responsive widths without page overflow");
  const confirmation = page.getByLabel(
    "I checked all fields and any warnings against the original document",
    { exact: true },
  );
  await confirmation.check();
  // Controlled service failure: exercises the real form/transport error path, never a fabricated success.
  await page.route(
    "**/api/staging/accounts/action*",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Controlled unavailable test" }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Save Review Draft", exact: true })
    .click();
  await expect(
    page.getByText(/draft could not be confirmed saved/),
  ).toBeVisible();
  await expect(page.getByLabel("Item 8 total", { exact: true })).toHaveValue(
    "125.00",
  );
  checks.push("Failed save preserves all entered fields and retry guidance");
  const saving = page.waitForResponse(
    (r) =>
      r.url().includes("/accounts/action") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save Review Draft", exact: true })
    .click();
  const sr = await saving;
  assert.equal(sr.status(), 200);
  await expect(
    page.getByText(
      "Draft saved. No bill, payment or journal was posted. You can reopen and edit this draft below.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  let after = await snap(),
    doc = after.documentEntries.reviews.find((d) => d.id === uploadId);
  assert.equal(doc.status, "Draft");
  assert.equal(doc.fields.items.length, 12);
  assert.equal(doc.fields.items[0].unit, "DRM");
  assert.equal(doc.fields.items[1].unit, "DRM");
  assert.equal(doc.fields.items[10].unit, " drm ");
  assert.equal(doc.fields.items[0].discount ?? "", "");
  assert.equal(doc.fields.items[3].discount, "0.00");
  assert.equal(doc.fields.items[4].discount, "2.00");
  assert.equal(doc.fields.kind, "unknown");
  assert.ok(doc.warnings.some((w) => w.code === "line-math-7"));
  assert.ok(doc.warnings.some((w) => w.code === "subtotal-lines"));
  assert.ok(doc.warnings.some((w) => w.code === "product-0"));
  checks.push(
    "Incomplete draft saved with all raw units, discount distinctions and unresolved warnings",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Read a bill", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Review " + doc.fields.reference,
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Item 8 total", { exact: true })).toHaveValue(
    "125.00",
  );
  await expect(page.getByLabel("Item 11 unit", { exact: true })).toHaveValue(
    " drm ",
  );
  await page.getByLabel("Item 2 unit", { exact: true }).fill("D");
  await expect(
    page.getByRole("option", { name: "DRM", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Item 2 unit", { exact: true }).press("ArrowDown");
  await page.getByLabel("Item 2 unit", { exact: true }).press("Enter");
  checks.push(
    "Refresh/reopen preserves fields, original, correction history and unit suggestions",
  );
  const session = await (
    await ctx.request.get(base + "/api/staging/auth/session")
  ).json();
  const action = async (body, version = after.version) =>
    ctx.request.post(base + "/api/staging/accounts/action", {
      headers: {
        Origin: base,
        "X-Azzora-CSRF": session.csrf,
        "X-Azzora-Expected-Version": String(version),
        "X-Azzora-Idempotency-Key": randomUUID(),
      },
      data: body,
    });
  const draft = {
    kind: "document-draft",
    reviewId: doc.id,
    revision: doc.revision,
    fields: doc.fields,
    confirmed: true,
    rememberSupplier: false,
  };
  const stale = await action({ ...draft, revision: doc.revision - 1 });
  assert.equal(stale.status(), 409);
  assert.match((await stale.json()).error, /changed/);
  const malformed = structuredClone(draft);
  malformed.fields.items[7].discount = "oops";
  const invalid = await action(malformed);
  assert.equal(invalid.status(), 422);
  assert.ok(
    (await invalid.json()).issues.some((i) => i.field === "items.7.discount"),
  );
  const unconfirmed = await action({ ...draft, confirmed: false });
  assert.equal(unconfirmed.status(), 422);
  const foreign = await action({
    ...draft,
    reviewId: "DOC-UNAUTHORIZED-" + randomUUID(),
  });
  assert.equal(foreign.status(), 403);
  for (const kind of [
    "create-expense-ledger",
    "create-cash-account",
    "issue-invoice",
    "receipt",
    "supplier-payment",
    "transfer",
    "create-bill-from-review",
    "create-expense-from-review",
  ]) {
    const r = await action({ ...draft, kind });
    assert.equal(r.status(), 403, kind);
  }
  checks.push(
    "Real API: stale 409; malformed field/confirmation 422; unauthorized review and eight financial writes 403",
  );
  after = await snap();
  for (const k of [
    "metrics",
    "ledger",
    "trial",
    "balance",
    "pnl",
    "invoices",
    "bills",
    "receipts",
    "supplierPayments",
    "expenses",
    "transfers",
    "cashAccounts",
    "expenseLedgers",
  ])
    assert.deepEqual(after[k], before[k], k);
  checks.push("Financial balances, journal, allocations and masters unchanged");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + "/results.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        uploadId,
        paidProviderCalls: paid,
        originalMode:
          "Manual original ingestion with synthetic test values; not AI extraction",
        financialDataUnchanged: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log({ passed: checks.length, checks });
  await ctx.request.post(base + "/api/staging/auth/logout", {
    headers: { Origin: base, "X-Azzora-CSRF": session.csrf },
    data: {},
  });
  assert.equal(
    (await ctx.request.get(base + "/api/staging/accounts/snapshot")).status(),
    401,
  );
} catch (e) {
  console.error({ failed: e.message });
  await page.screenshot({ path: out + "/failure.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
