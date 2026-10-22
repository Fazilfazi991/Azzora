import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, reviewTlsOptions } from "./browser-runtime.mjs";

const base = process.env.AZZORA_ACCOUNTS_REVIEW_URL || "http://127.0.0.1:5277";
const password = process.env.AZZORA_REVIEW_PASSWORD;
const shareUrl = process.env.AZZORA_REVIEW_SHARE_URL;
if (!password)
  throw Error(
    "Set AZZORA_REVIEW_PASSWORD to the local review server password before running browser tests.",
  );
const output = process.env.AZZORA_ACCOUNTS_EVIDENCE || "tmp/accounts-review";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const checks = [];
const errors = [];
try {
  const context = await browser.newContext({
    ...reviewTlsOptions(base),
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  if (shareUrl) await page.goto(shareUrl);
  await page.goto(`${base}/accountant.html`);
  await expect(
    page.getByRole("heading", { name: "Sign in to Accounts" }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`${base}/api/accounts-review/snapshot`)
    ).status(),
  ).toBe(401);
  await page.evaluate(() =>
    localStorage.setItem("azzora-demo-v1", "ACCOUNTANT_REVIEW_SENTINEL"),
  );
  await page
    .getByLabel("Demo Accountant email")
    .fill("manager@review.azzora.test");
  await page.getByLabel("Demo password").fill(password);
  await page.getByRole("button", { name: /Sign in to review/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid Accountant credentials",
  );
  checks.push("unauthenticated API denied; Manager identity denied");
  await page
    .getByLabel("Demo Accountant email")
    .fill("accountant@review.azzora.test");
  await page.getByRole("button", { name: /Sign in to review/ }).click();
  await expect(
    page.getByRole("heading", { name: "Financial dashboard" }),
  ).toBeVisible();
  const active = await (
    await context.request.get(`${base}/api/accounts-review/session`)
  ).json();
  await context.request.post(`${base}/api/accounts-review/reset`, {
    headers: { "X-Azzora-CSRF": active.csrf, Origin: base },
  });
  expect(
    (
      await context.request.post(`${base}/api/accounts-review/action`, {
        headers: {
          Origin: base,
          "X-Azzora-Idempotency-Key": crypto.randomUUID(),
        },
        data: { kind: "expense" },
      })
    ).status(),
  ).toBe(403);
  await page.reload();
  await expect(page.getByText("AED 11,000.00", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${output}/dashboard-1440.png`,
    fullPage: true,
  });
  checks.push("dedicated login routes to reconciled Accountant dashboard");

  await page.getByRole("link", { name: "Sales invoices" }).click();
  await expect(
    page.getByRole("heading", { name: "Sales invoices" }),
  ).toBeVisible();
  await page.screenshot({
    path: `${output}/invoices-1440.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "+ New invoice" }).click();
  await page
    .getByLabel("Document type")
    .selectOption({ label: "Normal Invoice" });
  await page.getByLabel("Amount · AED (VAT excluded)").fill("123.45");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Recorded NOR-");
  await page.getByRole("link", { name: "← Invoices" }).click();
  await expect(page.getByRole("button", { name: "Issue draft" })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Issue draft" }).last().click();
  await expect(page.getByRole("status")).toContainText("Issued NOR-");
  await page.reload();
  await expect(page.getByRole("button", { name: "Issue draft" })).toHaveCount(
    1,
  );
  await page
    .getByLabel("Filter document type")
    .selectOption({ label: "Proforma" });
  await expect(page.getByText("PRO-26009")).toBeVisible();
  await page.getByRole("button", { name: "Issue proforma" }).click();
  await expect(page.getByRole("status")).toContainText("Issued PRO-26009");
  await expect(page.getByText("Proforma · no posting")).toBeVisible();
  const proformaDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download demo PDF" }).click();
  await (await proformaDownload).saveAs(`${output}/proforma.pdf`);
  await page
    .getByLabel("Filter document type")
    .selectOption({ label: "All document types" });
  const invoiceDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download demo PDF" }).first().click();
  await (await invoiceDownload).saveAs(`${output}/invoice.pdf`);
  checks.push("invoice draft and issue update canonical demo journal once");

  await page.getByRole("link", { name: "Purchase bills & upload" }).click();
  await page.screenshot({ path: `${output}/bills-1440.png`, fullPage: true });
  await page.getByLabel("Bill image or PDF · up to 2 MB").setInputFiles({
    name: "too-large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(2_000_001, 65),
  });
  await page.getByRole("button", { name: "Record bill & upload" }).click();
  await expect(page.getByRole("alert")).toContainText("under 2 MB");
  await expect(page.getByLabel("Supplier")).toHaveValue("Sample Supplier B");
  await page.getByLabel("Bill image or PDF · up to 2 MB").setInputFiles({
    name: "sample-bill.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"),
  });
  await page.getByRole("button", { name: "Record bill & upload" }).click();
  await expect(page.getByRole("link", { name: "Download bill" })).toBeVisible();
  const afterBill = await (
    await context.request.get(`${base}/api/accounts-review/snapshot`)
  ).json();
  const privateAttachmentId = afterBill.bills.at(-1).attachmentId;
  checks.push("purchase bill and protected sample attachment recorded");

  await page.getByRole("link", { name: "Customer receipts" }).click();
  await page.getByLabel("Open invoice").selectOption("INV-26042");
  await page.getByLabel("Amount · AED").fill("3000.01");
  await page.getByRole("button", { name: "Record receipt" }).click();
  await expect(page.getByRole("alert")).toContainText("Allocation exceeds");
  await expect(page.getByLabel("Amount · AED")).toHaveValue("3000.01");
  await page.getByLabel("Open invoice").selectOption("INV-26041");
  await page.getByLabel("Amount · AED").fill("100.00");
  await page.getByRole("button", { name: "Record receipt" }).click();
  await expect(page.getByRole("status")).toContainText("Recorded DEMO-");
  await page.getByRole("link", { name: "Supplier payments" }).click();
  await page.getByLabel("Open bill").selectOption("BILL-26031");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("status")).toContainText("Recorded DEMO-");
  checks.push("receipt and supplier payment target selected documents");

  await page.getByRole("link", { name: "Expenses" }).click();
  await page.getByRole("button", { name: "Record paid expense" }).click();
  await expect(page.getByRole("status")).toContainText("Recorded DEMO-");
  checks.push("paid expense updates fictional bank and expense ledger");

  const key = crypto.randomUUID();
  const action = {
    kind: "expense",
    payee: "Sample Small Vendor",
    date: "2026-10-22",
    description: "Idempotency check",
    amount: "1.00",
    account: "bank",
  };
  const headers = {
    Origin: base,
    "X-Azzora-CSRF": active.csrf,
    "X-Azzora-Idempotency-Key": key,
  };
  const first = await (
    await context.request.post(`${base}/api/accounts-review/action`, {
      headers,
      data: action,
    })
  ).json();
  const replay = await (
    await context.request.post(`${base}/api/accounts-review/action`, {
      headers,
      data: action,
    })
  ).json();
  expect(replay.id).toBe(first.id);
  expect(replay.snapshot.expenses.length).toBe(first.snapshot.expenses.length);
  expect(
    (
      await context.request.post(`${base}/api/accounts-review/action`, {
        headers,
        data: { ...action, amount: "2.00" },
      })
    ).status(),
  ).toBe(409);
  checks.push("CSRF and idempotent action replay enforced by local API");
  await page.reload();

  for (const [name, heading, filename] of [
    ["Bank & cash", "Bank & cash", "banking-1440.png"],
    ["General ledger", "General ledger", "ledger-1440.png"],
    ["Profit & loss", "Profit & loss", "pnl-1440.png"],
    ["Balance sheet", "Balance sheet", "balance-1440.png"],
    ["AR / AP aging", "Receivable & payable aging", "aging-1440.png"],
  ]) {
    await page.getByRole("link", { name }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    if (name === "Balance sheet")
      await expect(page.getByText(/Difference: AED 0\.00/)).toBeVisible();
    await page.screenshot({ path: `${output}/${filename}`, fullPage: true });
  }
  checks.push("ledger, P&L, balance sheet and aging routes reconcile");
  for (const name of ["pnl", "balance"]) {
    const pdf = await context.request.get(
      `${base}/api/accounts-review/pdf/${name}`,
    );
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    fs.writeFileSync(`${output}/${name}.pdf`, await pdf.body());
  }
  checks.push("invoice browser download and both financial report PDFs pass");
  expect(
    await page.evaluate(() => localStorage.getItem("azzora-demo-v1")),
  ).toBe("ACCOUNTANT_REVIEW_SENTINEL");
  const oldCookies = (await context.cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Accounts" }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`${base}/api/accounts-review/snapshot`)
    ).status(),
  ).toBe(401);
  expect(
    (
      await context.request.get(`${base}/api/accounts-review/snapshot`, {
        headers: { Cookie: oldCookies },
      })
    ).status(),
  ).toBe(401);
  checks.push("logout revokes session; Manager CRM browser key preserved");
  await context.close();

  for (const width of [1024, 768, 390]) {
    const mobile = await browser.newContext({
      ...reviewTlsOptions(base),
      viewport: { width, height: 850 },
    });
    const view = await mobile.newPage();
    view.on("pageerror", (error) => errors.push(`${width}: ${error.message}`));
    if (shareUrl) await view.goto(shareUrl);
    await view.goto(`${base}/accountant.html`);
    await view.screenshot({
      path: `${output}/login-${width}.png`,
      fullPage: true,
    });
    await view.getByLabel("Demo password").fill(password);
    await view.getByRole("button", { name: /Sign in to review/ }).click();
    await expect(
      view.getByRole("heading", { name: "Financial dashboard" }),
    ).toBeVisible();
    const mobileSession = await (
      await mobile.request.get(`${base}/api/accounts-review/session`)
    ).json();
    if (mobileSession.mode === "fictional-hosted-review") {
      const isolated = await (
        await mobile.request.get(`${base}/api/accounts-review/snapshot`)
      ).json();
      expect(isolated.invoices).toHaveLength(4);
      expect(isolated.bills).toHaveLength(2);
      expect(
        (
          await mobile.request.get(
            `${base}/api/accounts-review/attachment/${privateAttachmentId}`,
          )
        ).status(),
      ).toBe(404);
    }
    await view.screenshot({
      path: `${output}/dashboard-${width}.png`,
      fullPage: true,
    });
    if (width < 900) {
      await view
        .getByRole("button", { name: "Open accountant navigation" })
        .click();
      await view.getByRole("link", { name: "Sales invoices" }).click();
      await view.screenshot({
        path: `${output}/invoices-${width}.png`,
        fullPage: true,
      });
      expect(
        await view.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    if (width < 900)
      await view
        .getByRole("button", { name: "Open accountant navigation" })
        .click();
    await view.getByRole("link", { name: "Purchase bills & upload" }).click();
    await expect(
      view.getByRole("heading", { name: "Purchase bills" }),
    ).toBeVisible();
    await view.screenshot({
      path: `${output}/bills-${width}.png`,
      fullPage: true,
    });
    expect(
      await view.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    checks.push(`${width}px: login, dashboard, bill upload, no page overflow`);
    if (width === 390) {
      const priorBills = await (
        await mobile.request.get(`${base}/api/accounts-review/snapshot`)
      ).json();
      await view.getByLabel("Bill image or PDF · up to 2 MB").setInputFiles({
        name: "mobile-fictional-bill.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 fictional mobile upload"),
      });
      await view.getByRole("button", { name: "Record bill & upload" }).click();
      await expect(view.getByRole("status")).toContainText("Recorded DEMO-");
      const savedBills = await (
        await mobile.request.get(`${base}/api/accounts-review/snapshot`)
      ).json();
      expect(savedBills.bills.length).toBe(priorBills.bills.length + 1);
      const savedBill = savedBills.bills.at(-1);
      const savedRow = view.getByRole("row").filter({ hasText: savedBill.id });
      await expect(
        savedRow.getByRole("link", { name: "Download bill" }),
      ).toBeVisible();
      await view.reload();
      await expect(
        savedRow.getByRole("link", { name: "Download bill" }),
      ).toBeVisible();
      checks.push(
        mobileSession.mode === "fictional-hosted-review"
          ? "390px: mobile upload persists after refresh; hosted session isolation verified"
          : "390px: exact uploaded bill persists after refresh in the local demo store",
      );
    }
    if (width < 900)
      await view
        .getByRole("button", { name: "Open accountant navigation" })
        .click();
    await view.getByRole("button", { name: "Log out" }).click();
    await expect(
      view.getByRole("heading", { name: "Sign in to Accounts" }),
    ).toBeVisible();
    await mobile.close();
  }
  expect(errors).toEqual([]);
  fs.writeFileSync(
    `${output}/results.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, screenshots: output }, null, 2));
} finally {
  await browser.close();
}
