// Independent acceptance: fictional isolated sessions, immutable candidates only.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { browserOptions, reviewTlsOptions } from "./browser-runtime.mjs";

// Resolve QA dependencies from the Coordinator's isolated, patched installation.
const require = createRequire(path.resolve(process.env.AZZORA_QA_PACKAGE_ROOT || process.cwd(), "package.json"));
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 30000 });
const { DOMMatrix, ImageData, Path2D } = require("@napi-rs/canvas");
globalThis.DOMMatrix ??= DOMMatrix;
globalThis.ImageData ??= ImageData;
globalThis.Path2D ??= Path2D;
const { getDocument } = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
const base = process.env.AZZORA_ACCOUNTS_REVIEW_URL;
const password = process.env.AZZORA_REVIEW_PASSWORD;
const sha = process.env.AZZORA_TESTED_SHA;
assert.ok(base && password && /^[a-f0-9]{40}$/.test(sha || ""), "Exact SHA, candidate URL and privately injected demo credential are required.");
const host = new URL(base).hostname;
assert.ok(host === "127.0.0.1" || /^azzora-accounts-client-review-[a-z0-9]+-faziils-projects\.vercel\.app$/.test(host), "Stable aliases and Manager production are prohibited QA mutation targets.");
const out = process.env.AZZORA_ACCOUNTS_EVIDENCE || "tmp/accounts-stabilization-independent";
fs.mkdirSync(out, { recursive: true });
const report = { testedSHA: sha, base, checks: [], requestIds: [], pdfs: [], responsive: [], accessibility: [], errors: [], liveAI: "disabled; no paid requests" };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const seen = new Set();
const browser = await chromium.launch(browserOptions);
let AxeBuilder;
if (process.env.AZZORA_QA_AXE_MODULE) AxeBuilder = require(process.env.AZZORA_QA_AXE_MODULE).default;
function correlation(response, label) {
  const value = response.headers()["x-azzora-request-id"];
  assert.match(value || "", uuid, `${label} must carry a server UUIDv4`);
  assert.ok(!seen.has(value), `${label} must have its own request correlation ID`);
  seen.add(value);
  report.requestIds.push({ label, status: response.status(), requestId: value });
  return value;
}
try {
  const context = await browser.newContext({ ...reviewTlsOptions(base), viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  const suppliedId = crypto.randomUUID();
  const denied = await context.request.get(base + "/api/accounts-review/snapshot", { headers: { "X-Azzora-Request-ID": suppliedId } });
  assert.equal(denied.status(), 401);
  assert.notEqual(correlation(denied, "unauthenticated snapshot"), suppliedId);
  const origin = await context.request.post(base + "/api/accounts-review/login", { headers: { Origin: "https://invalid.example" }, data: {} });
  assert.equal(origin.status(), 403);
  correlation(origin, "wrong origin");
  const method = await context.request.put(base + "/api/accounts-review/login");
  assert.equal(method.status(), 405);
  correlation(method, "unsupported method");
  report.checks.push("Server-generated correlation IDs cover unauthenticated/origin/method failures and ignore caller IDs");

  await page.goto(base + "/accountant.html");
  await expect(page.getByRole("heading", { name: "Sign in to Accounts", exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("azzora-demo-v1", "STABILIZATION_MANAGER_SENTINEL"));
  await page.getByLabel("Demo password").fill(password);
  await page.getByRole("button", { name: /Sign in to review/ }).click();
  await expect(page.getByRole("heading", { name: "Financial dashboard", exact: true, level: 1 })).toBeVisible();
  const authResponse = await context.request.get(base + "/api/accounts-review/session");
  correlation(authResponse, "session");
  const auth = await authResponse.json();
  const headers = { Origin: base, "X-Azzora-CSRF": auth.csrf };
  const snapshot = async () => {
    const response = await context.request.get(base + "/api/accounts-review/snapshot");
    assert.equal(response.status(), 200);
    correlation(response, "snapshot");
    return response.json();
  };
  const action = async input => {
    const response = await context.request.post(base + "/api/accounts-review/action", { headers: { ...headers, "X-Azzora-Idempotency-Key": crypto.randomUUID() }, data: input });
    assert.equal(response.status(), 200, await response.text());
    correlation(response, input.kind);
    return response.json();
  };
  const invalid = await context.request.post(base + "/api/accounts-review/action", { headers, data: { kind: "receipt" } });
  assert.equal(invalid.status(), 400);
  correlation(invalid, "invalid action key");
  const missing = await context.request.get(base + "/api/accounts-review/not-a-route");
  assert.equal(missing.status(), 404);
  correlation(missing, "unknown route");
  const initial = await snapshot();
  assert.equal(initial.documentAi.enabled, false);
  const bank = await action({ kind: "create-cash-account", name: "QA voucher receiving bank", type: "bank" });
  const receipt = await action({ kind: "receipt", documentId: "INV-26041", date: initial.asOf, amount: "12.34", account: bank.id, reference: "QA-RECEIPT-VOUCHER" });
  const payment = await action({ kind: "supplier-payment", documentId: "BILL-26031", date: initial.asOf, amount: "5.67", account: "bank", reference: "QA-PAYMENT-VOUCHER" });
  const settled = payment.snapshot;
  for (const metric of ["revenueFils", "costOfSalesFils", "operatingExpensesFils", "netProfitFils"]) assert.equal(settled.metrics[metric], initial.metrics[metric]);
  assert.equal(BigInt(settled.metrics.receivablesFils), BigInt(initial.metrics.receivablesFils) - 1234n);
  assert.equal(BigInt(settled.metrics.payablesFils), BigInt(initial.metrics.payablesFils) - 567n);
  assert.equal(settled.cashAccounts.find(item => item.id === bank.id).balanceFils, "1234");
  assert.equal(settled.trial.balanced, true);
  assert.equal(settled.balance.balanced, true);
  report.checks.push("Invoice-specific receipt/payment allocations use the selected bank and reconcile without changing revenue or expenses");

  async function voucher(kind, id, reference, party, amount, accountName) {
    const selection = new URLSearchParams({ from: settled.period.from, to: settled.period.to, asOf: settled.asOf });
    const response = await context.request.get(base + "/api/accounts-review/pdf/" + encodeURIComponent(kind + ":" + id) + "?" + selection);
    assert.equal(response.status(), 200);
    correlation(response, kind + " voucher PDF");
    assert.match(response.headers()["content-type"], /application\/pdf/);
    const bytes = await response.body();
    fs.writeFileSync(`${out}/${kind}-voucher.pdf`, bytes);
    const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const pages = pdf.numPages;
    let text = "";
    for (let number = 1; number <= pdf.numPages; number++) text += " " + (await (await pdf.getPage(number)).getTextContent()).items.map(item => item.str || "").join(" ");
    await pdf.destroy();
    const sourceDocument = kind === "receipt" ? "INV-26041" : "BILL-26031";
    for (const expected of [id, sourceDocument, reference, party, amount, accountName, initial.asOf]) assert.ok(text.includes(expected), `${kind} PDF must contain ${expected}`);
    assert.match(text, /fictional/i);
    assert.match(text, /VAT.*pending/i);
    assert.match(text, kind === "receipt" ? /receipt/i : /payment/i);
    report.pdfs.push({ kind, pages, bytes: bytes.length });
  }
  await voucher("receipt", receipt.id, "QA-RECEIPT-VOUCHER", "Sample Client A", "12.34", "QA voucher receiving bank");
  await voucher("payment", payment.id, "QA-PAYMENT-VOUCHER", "Sample Supplier B", "5.67", "Business bank");
  const afterExports = await snapshot();
  assert.deepEqual(afterExports.metrics, settled.metrics);
  assert.deepEqual(afterExports.receipts, settled.receipts);
  assert.deepEqual(afterExports.supplierPayments, settled.supplierPayments);
  report.checks.push("Receipt/payment PDF exports show source allocation, party, date, actual account, reference, exact amount and fictional/VAT notices without writes");

  for (const [route, heading, id, linkName] of [["receipts", "Customer receipts", receipt.id, /Download receipt voucher/], ["supplier-payments", "Supplier payments", payment.id, /Download payment voucher/]]) {
    await page.goto(base + "/accountant.html#/" + route);
    await page.reload(); // The API setup intentionally bypasses normal UI state refresh.
    await expect(page.getByRole("heading", { name: heading, level: 1, exact: true })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: id });
    await expect(row.getByRole("link", { name: linkName })).toBeVisible();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${out}/${route}-${width}.png`, fullPage: true });
      report.responsive.push({ route, width, status: "pass" });
      if (AxeBuilder) {
        const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        report.accessibility.push({ route, width, violations: scan.violations });
      }
    }
  }
  report.checks.push("Voucher links are reachable in desktop/mobile posted lists with contained table scrolling");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/accountant.html#/expenses");
  await expect(page.getByRole("heading", { name: "Expenses", exact: true, level: 1 })).toBeVisible();
  const beforeExpense = await snapshot();
  await page.getByLabel("Payee", { exact: true }).fill("QA ambiguous response expense");
  await page.getByLabel("Expense Ledger").selectOption("project-materials");
  await page.getByLabel("Amount · AED (VAT excluded)", { exact: true }).fill("3.21");
  await page.getByRole("combobox", { name: "Project", exact: true }).selectOption("demo-apartment");
  let attempts = 0, retainedKey, errorReference;
  await page.route("**/api/accounts-review/action**", async route => {
    if (route.request().postDataJSON()?.kind !== "expense") return route.continue();
    attempts++;
    const key = route.request().headers()["x-azzora-idempotency-key"];
    if (attempts === 1) {
      retainedKey = key;
      const committed = await route.fetch();
      assert.equal(committed.status(), 200);
      errorReference = committed.headers()["x-azzora-request-id"];
      assert.match(errorReference || "", uuid);
      return route.fulfill({ status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private", "X-Azzora-Request-ID": errorReference }, body: JSON.stringify({ error: "The review service is temporarily unavailable. Please retry." }) });
    }
    assert.equal(key, retainedKey, "Explicit retry of unchanged details must reuse the original idempotency key");
    return route.continue();
  });
  await page.getByRole("button", { name: "Record paid expense", exact: true }).click();
  await expect.poll(() => errorReference).toMatch(uuid);
  await expect(page.getByRole("alert").filter({ hasText: errorReference })).toBeVisible();
  await expect(page.getByLabel("Payee", { exact: true })).toHaveValue("QA ambiguous response expense");
  await expect(page.getByRole("button", { name: "Record paid expense", exact: true })).toBeEnabled();
  await page.waitForTimeout(500);
  assert.equal(attempts, 1, "No automatic financial POST retry is permitted");
  const committedOnce = await snapshot();
  assert.equal(committedOnce.expenses.length, beforeExpense.expenses.length + 1);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${out}/contained-error-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Record paid expense", exact: true }).click();
  await expect(page.getByText("Paid expense recorded in the fictional demo ledger.", { exact: true })).toBeVisible();
  assert.equal(attempts, 2);
  const retried = await snapshot();
  assert.deepEqual(retried.metrics, committedOnce.metrics);
  assert.deepEqual(retried.expenses, committedOnce.expenses);
  assert.equal(BigInt(retried.metrics.costOfSalesFils), BigInt(beforeExpense.metrics.costOfSalesFils) + 321n);
  assert.equal(BigInt(retried.metrics.bankFils), BigInt(beforeExpense.metrics.bankFils) - 321n);
  assert.equal(retried.trial.balanced, true);
  assert.equal(retried.balance.balanced, true);
  report.checks.push("Ambiguous committed response shows correlation ID, preserves form, makes no automatic retry, and explicit same-key retry creates no duplicate posting");
  assert.equal(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")), "STABILIZATION_MANAGER_SENTINEL");
  assert.equal(report.errors.length, 0);
  assert.equal(report.accessibility.flatMap(scan => scan.violations).length, 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /Log out/ }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Accounts", exact: true })).toBeVisible();
  const revoked = await context.request.get(base + "/api/accounts-review/snapshot");
  assert.equal(revoked.status(), 401);
  correlation(revoked, "revoked session");
  report.checks.push("Manager browser records are preserved and logout revokes the Accountant session");
  report.status = "pass";
  console.log(JSON.stringify({ checks: report.checks.length, pdfs: report.pdfs.length, responsive: report.responsive.length, axeScans: report.accessibility.length, errors: report.errors }));
} catch (error) {
  report.status = "fail";
  report.failure = String(error.stack || error).replaceAll(password, "[REDACTED]");
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(out + "/results.json", JSON.stringify(report, null, 2));
  await browser.close();
}
