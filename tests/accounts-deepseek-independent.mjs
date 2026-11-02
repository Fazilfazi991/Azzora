// Independent QA: disposable fictional login sessions only; never enables AI.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";
import { browserOptions, reviewTlsOptions } from "./browser-runtime.mjs";

const base = process.env.AZZORA_ACCOUNTS_REVIEW_URL;
const password = process.env.AZZORA_REVIEW_PASSWORD;
const sha = process.env.AZZORA_TESTED_SHA;
assert.ok(base && password && /^[a-f0-9]{40}$/.test(sha || ""), "Exact tested SHA, isolated candidate URL and private credential are required.");
const host = new URL(base).hostname;
assert.ok(host === "127.0.0.1" || /^azzora-accounts-client-review-[a-z0-9]+-faziils-projects\.vercel\.app$/.test(host), "Do not run QA mutation checks against a stable alias or Manager production.");
const out = process.env.AZZORA_ACCOUNTS_EVIDENCE || "tmp/accounts-deepseek-independent";
fs.mkdirSync(out, { recursive: true });
const report = { testedSHA: sha, base, generatedAt: new Date().toISOString(), checks: [], responsive: [], accessibility: [], errors: [], pdfs: [], liveAI: "disabled; no paid call or measured model accuracy" };
const browser = await chromium.launch(browserOptions);
let AxeBuilder;
if (process.env.AZZORA_QA_AXE_MODULE) {
  const require = createRequire(import.meta.url);
  AxeBuilder = require(process.env.AZZORA_QA_AXE_MODULE).default;
}
try {
  const context = await browser.newContext({ ...reviewTlsOptions(base), viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(base + "/accountant.html");
  await expect(page.getByRole("heading", { name: "Sign in to Accounts", exact: true })).toBeVisible();
  assert.equal((await context.request.get(base + "/api/accounts-review/snapshot")).status(), 401);
  await page.evaluate(() => localStorage.setItem("azzora-demo-v1", "INDEPENDENT_QA_MANAGER_SENTINEL"));
  await page.getByLabel("Demo password").fill(password);
  await page.getByRole("button", { name: /Sign in to review/ }).click();
  await expect(page.getByRole("heading", { name: "Financial dashboard", exact: true })).toBeVisible();
  const auth = await (await context.request.get(base + "/api/accounts-review/session")).json();
  const headers = { Origin: base, "X-Azzora-CSRF": auth.csrf };
  const reset = await context.request.post(base + "/api/accounts-review/reset", { headers });
  assert.equal(reset.status(), 200, "Reset only this disposable fictional test session.");
  async function snapshot(query = "") {
    const response = await context.request.get(base + "/api/accounts-review/snapshot" + query);
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  }
  async function action(input, expected = 200, key = crypto.randomUUID()) {
    const response = await context.request.post(base + "/api/accounts-review/action", { headers: { ...headers, "X-Azzora-Idempotency-Key": key }, data: input });
    assert.equal(response.status(), expected, await response.text());
    return response.json();
  }
  async function route(path, heading) {
    await page.goto(base + "/accountant.html#/" + path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  const initial = await snapshot();
  assert.equal(initial.documentAi.enabled, false, "No live AI activation is authorized by this QA harness.");
  const date = initial.asOf;
  await route("banking", "Bank & cash");
  await page.getByRole("button", { name: "+ New account", exact: true }).click();
  await page.getByLabel("Account name", { exact: true }).fill("Thomas Cash");
  await page.getByLabel("Account type").selectOption("staff");
  await page.getByLabel("Cash holder", { exact: true }).fill("Thomas");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Account created at zero balance. No financial posting.", { exact: true })).toBeVisible();
  let state = await snapshot();
  const thomas = state.cashAccounts.find(account => account.name === "Thomas Cash");
  assert.ok(thomas && thomas.balanceFils === "0");
  assert.deepEqual(state.metrics, initial.metrics);
  report.checks.push("Staff cash account created through UI at zero balance without posting");

  await page.getByRole("button", { name: "Transfer between accounts", exact: true }).click();
  await page.getByLabel("From account").selectOption("bank");
  await page.getByLabel("To account").selectOption(thomas.id);
  await page.getByLabel("Transfer amount · AED", { exact: true }).fill("100.00");
  await page.getByLabel("Transfer date", { exact: true }).fill(date);
  await page.getByLabel("Transfer reference", { exact: true }).fill("QA-THOMAS-FUNDING");
  await page.getByRole("button", { name: "Record transfer", exact: true }).click();
  await expect(page.getByText("Internal transfer recorded once. No expense or revenue created.", { exact: true })).toBeVisible();
  state = await snapshot();
  assert.equal(state.cashAccounts.find(account => account.id === thomas.id).balanceFils, "10000");
  for (const key of ["revenueFils", "costOfSalesFils", "operatingExpensesFils", "netProfitFils"]) assert.equal(state.metrics[key], initial.metrics[key]);
  assert.equal(BigInt(state.metrics.bankFils) + BigInt(state.metrics.cashFils), BigInt(initial.metrics.bankFils) + BigInt(initial.metrics.cashFils));
  report.checks.push("Internal transfer UI funds Thomas Cash; combined cash/P&L reconcile");

  const secondBank = await action({ kind: "create-cash-account", name: "QA second bank", type: "bank" });
  const manualBytes = fs.readFileSync("tests/fixtures/document-entry/01.png").toString("base64");
  const extractedResponse = await context.request.post(base + "/api/accounts-review/documents/extract", { headers, data: { file: { name: "fictional-independent-receipt.png", mime: "image/png", data: manualBytes }, mode: "manual" } });
  assert.equal(extractedResponse.status(), 200, await extractedResponse.text());
  const extracted = await extractedResponse.json();
  let doc = extracted.snapshot.documentEntries.reviews.find(item => item.id === extracted.id);
  assert.equal(doc.extraction.mode, "manual");
  assert.equal(doc.fields.total, "");
  const fields = { ...doc.fields, supplier: "Sample Supplier B", date, dueDate: "", reference: "QA-RECEIPT-NEW", currency: "AED", kind: "project-expense", categoryId: "project-materials", ledgerId: "project-materials", department: "MEP", projectName: "Sample apartment renovation", projectId: "demo-apartment", customerName: "", customerId: "", discount: "0.00", subtotal: "50.00", tax: "0.00", total: "50.00", items: [{ description: "QA electrical consumables", quantity: "2", unit: "each", unitRate: "25.00", discount: "0.00", tax: "0.00", total: "50.00", productId: "" }] };
  const beforeDraft = await snapshot();
  const saved = await action({ kind: "document-draft", reviewId: doc.id, revision: doc.revision, fields, confirmed: true, rememberSupplier: true });
  assert.deepEqual(saved.snapshot.metrics, beforeDraft.metrics);
  assert.equal(saved.snapshot.expenses.length, beforeDraft.expenses.length);
  doc = saved.snapshot.documentEntries.reviews.find(item => item.id === doc.id);
  assert.deepEqual(doc.extraction, extracted.snapshot.documentEntries.reviews[0].extraction);
  assert.equal(doc.corrections.length, 1);
  report.checks.push("Manual original/review corrections retained; Save Draft creates no transaction");
  const key = crypto.randomUUID();
  const conversion = { kind: "create-expense-from-review", reviewId: doc.id, revision: doc.revision, confirmed: true, account: thomas.id };
  const converted = await action(conversion, 200, key);
  const replayed = await action(conversion, 200, key);
  assert.equal(converted.id, replayed.id);
  assert.equal(converted.snapshot.expenses.length, beforeDraft.expenses.length + 1);
  assert.equal(replayed.snapshot.expenses.length, converted.snapshot.expenses.length);
  assert.equal(converted.snapshot.cashAccounts.find(account => account.id === thomas.id).balanceFils, "5000");
  assert.equal(BigInt(converted.snapshot.metrics.costOfSalesFils) - BigInt(beforeDraft.metrics.costOfSalesFils), 5000n);
  assert.equal(converted.snapshot.expenses.at(-1).departmentId, "MEP");
  await action(conversion, 400);
  report.checks.push("Explicit reviewed expense conversion posts once; Thomas payment/MEP classification/idempotency verified");

  const bill = await action({ kind: "bill", party: "Sample Supplier B", date, due: date, description: "QA itemized purchase", items: [{ description: "QA boards", quantity: "2", unit: "each", rate: "50.00" }], projectId: "demo-apartment", category: "Cost of Sales", poReference: "QA-PO", invoiceReference: "QA-BILL-NEW", departmentId: "JOINERY", issue: false });
  assert.equal(bill.snapshot.bills.find(item => item.id === bill.id).status, "Draft");
  const issued = await action({ kind: "issue-bill", id: bill.id });
  const paid = await action({ kind: "supplier-payment", documentId: bill.id, date, amount: "40.00", account: "bank", reference: "QA-SUPPLIER-PAYMENT" });
  assert.equal(paid.snapshot.bills.find(item => item.id === bill.id).outstandingFils, "6000");
  assert.equal(issued.snapshot.bills.find(item => item.id === bill.id).departmentId, "JOINERY");
  const invoice = await action({ kind: "invoice", party: "Sample Client A", date, due: date, description: "QA itemized sales", items: [{ description: "QA design service", quantity: "3", unit: "hour", rate: "20.00" }], invoiceType: "Normal Invoice", issue: false, projectId: "demo-apartment" });
  await action({ kind: "issue-invoice", id: invoice.id });
  const received = await action({ kind: "receipt", documentId: invoice.id, date, amount: "20.00", account: secondBank.id, reference: "QA-CUSTOMER-RECEIPT" });
  assert.equal(received.snapshot.invoices.find(item => item.id === invoice.id).outstandingFils, "4000");
  assert.equal(received.snapshot.cashAccounts.find(account => account.id === secondBank.id).balanceFils, "2000");
  assert.equal(BigInt(received.snapshot.metrics.revenueFils) - BigInt(initial.metrics.revenueFils), 6000n);
  assert.equal(BigInt(received.snapshot.metrics.costOfSalesFils) - BigInt(initial.metrics.costOfSalesFils), 15000n);
  assert.equal(BigInt(received.snapshot.metrics.netProfitFils) - BigInt(initial.metrics.netProfitFils), -9000n);
  assert.equal(received.snapshot.trial.balanced, true);
  assert.equal(received.snapshot.balance.balanced, true);
  report.checks.push("Itemized draft/issue invoices and bills, partial invoice-wise allocations and all basic reports reconcile");
  for (const [name, id] of [["purchase", bill.id], ["invoice", invoice.id], ["pnl", "pnl"], ["balance", "balance"]]) {
    const response = await context.request.get(base + "/api/accounts-review/pdf/" + id);
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-type"], /application\/pdf/);
    const bytes = await response.body();
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    fs.writeFileSync(out + "/" + name + ".pdf", bytes);
    report.pdfs.push({ name, bytes: bytes.length });
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bank & cash", exact: true })).toBeVisible();
  assert.equal((await snapshot()).cashAccounts.find(account => account.id === thomas.id).balanceFils, "5000");
  report.checks.push("Refresh persists accounts/posted balances and PDF endpoints produce valid documents");

  const routes = [["dashboard", "Financial dashboard"], ["invoices", "Sales invoices"], ["bills", "Purchase bills"], ["receipts", "Customer receipts"], ["supplier-payments", "Supplier payments"], ["expenses", "Expenses"], ["banking", "Bank & cash"], ["ledger", "General ledger"], ["pnl", "Profit & loss"], ["balance", "Balance sheet"], ["trial", "Trial balance"], ["aging", "Receivable & payable aging"], ["project-reports", "Project & department reports"], ["document-entry", "Read a bill"]];
  for (const [path, heading] of routes) {
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await route(path, heading);
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
      assert.ok(overflow.page <= width + 1, `${path} page overflow at ${width}: ${overflow.page}`);
      report.responsive.push({ path, width, status: "pass" });
      if (width === 1440 || width === 390) {
        await page.screenshot({ path: `${out}/${path}-${width}.png`, fullPage: true });
        if (AxeBuilder) {
          const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
          report.accessibility.push({ path, width, violations: scan.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })) });
        }
      }
    }
  }
  assert.equal(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")), "INDEPENDENT_QA_MANAGER_SENTINEL");
  assert.equal(report.errors.length, 0);
  assert.equal(report.accessibility.flatMap(item => item.violations).length, 0, "Accessibility findings: see QA report");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /Log out/ }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Accounts", exact: true })).toBeVisible();
  assert.equal((await context.request.get(base + "/api/accounts-review/snapshot")).status(), 401);
  report.checks.push("Manager browser data preserved; logout revokes private financial session");
  report.status = "pass";
  console.log(JSON.stringify({ checks: report.checks.length, responsive: report.responsive.length, axeScans: report.accessibility.length, pdfs: report.pdfs.length, errors: report.errors }, null, 2));
} catch (error) {
  report.status = "fail";
  report.failure = String(error.stack || error).replaceAll(password, "[REDACTED]");
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(out + "/results.json", JSON.stringify(report, null, 2));
  await browser.close();
}
