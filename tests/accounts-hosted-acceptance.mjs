import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, reviewTlsOptions } from "./browser-runtime.mjs";
const base = process.env.AZZORA_ACCOUNTS_REVIEW_URL;
const share = process.env.AZZORA_REVIEW_SHARE_URL;
const password = process.env.AZZORA_REVIEW_PASSWORD;
const localHandler = process.env.AZZORA_REVIEW_LOCAL_HANDLER === "1";
if (localHandler && (!base || new URL(base).hostname !== "127.0.0.1"))
  throw Error("Local handler mode is restricted to loopback.");
if (!base || (!share && !localHandler) || !password)
  throw Error(
    "Hosted URL, share link and review password are required in the environment.",
  );
const output =
  process.env.AZZORA_ACCOUNTS_EVIDENCE || "tmp/accounts-hosted-review";
fs.mkdirSync(output, { recursive: true });
const checks = [];
if (!localHandler) {
  const publicResponse = await fetch(base + "/accountant.html", {
    redirect: "manual",
  });
  expect([401, 403, 302, 307]).toContain(publicResponse.status);
  checks.push("unshared deployment access blocked by Vercel protection");
}
const browser = await chromium.launch(browserOptions);
try {
  const context = await browser.newContext(reviewTlsOptions(base));
  const page = await context.newPage();
  await page.goto(share || base + "/accountant.html");
  const login = await context.request.post(
    base + "/api/accounts-review/login",
    {
      headers: { Origin: base },
      data: { email: "accountant@review.azzora.test", password },
    },
  );
  expect(login.status()).toBe(200);
  const auth = await login.json();
  const sessionCookie = (await context.cookies()).find(
    (item) => item.name === "__Host-azzora_accounts_review",
  );
  expect(
    sessionCookie.secure &&
      sessionCookie.httpOnly &&
      sessionCookie.sameSite === "Strict",
  ).toBe(true);
  const makeHeaders = (key) => ({
    Origin: base,
    "X-Azzora-CSRF": auth.csrf,
    "X-Azzora-Idempotency-Key": key,
  });
  const action = {
    kind: "receipt",
    documentId: "INV-26041",
    date: "2026-10-22",
    amount: "1.00",
    account: "bank",
  };
  const keys = [crypto.randomUUID(), crypto.randomUUID()];
  const responses = await Promise.all(
    keys.map((key) =>
      context.request.post(base + "/api/accounts-review/action", {
        headers: makeHeaders(key),
        data: action,
      }),
    ),
  );
  for (const response of responses)
    expect([200, 409]).toContain(response.status());
  const success = responses.filter((item) => item.status() === 200).length;
  expect(success).toBeGreaterThan(0);
  const snapshot = await (
    await context.request.get(base + "/api/accounts-review/snapshot")
  ).json();
  expect(snapshot.metrics.receivablesFils).toBe(
    String(1500000 - success * 100),
  );
  for (let i = 0; i < responses.length; i++)
    if (responses[i].status() === 409)
      expect(
        (
          await context.request.post(base + "/api/accounts-review/action", {
            headers: makeHeaders(keys[i]),
            data: action,
          })
        ).status(),
      ).toBe(200);
  const replayKey = crypto.randomUUID();
  const duplicate = await Promise.all(
    [0, 1].map(() =>
      context.request.post(base + "/api/accounts-review/action", {
        headers: makeHeaders(replayKey),
        data: action,
      }),
    ),
  );
  for (const response of duplicate)
    expect([200, 409]).toContain(response.status());
  const replay = await (
    await context.request.post(base + "/api/accounts-review/action", {
      headers: makeHeaders(replayKey),
      data: action,
    })
  ).json();
  expect(replay.snapshot.metrics.receivablesFils).toBe("1499700");
  checks.push(
    "concurrent distinct actions preserve every committed receipt; concurrent duplicate action posts once",
  );
  expect((await context.request.get(base + "/index.html")).status()).toBe(404);
  checks.push("Manager CRM entry point absent from dedicated review build");
  const copied = (await context.cookies())
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  expect(
    (
      await context.request.post(base + "/api/accounts-review/logout", {
        headers: { Origin: base, "X-Azzora-CSRF": auth.csrf },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await context.request.get(base + "/api/accounts-review/snapshot", {
        headers: { Cookie: copied },
      })
    ).status(),
  ).toBe(401);
  checks.push(
    "hosted Secure HttpOnly cookie and server-side logout revocation verified",
  );
  await context.close();
  const routes = [
    "dashboard",
    "invoices",
    "new-invoice",
    "bills",
    "document-entry",
    "receipts",
    "supplier-payments",
    "expenses",
    "banking",
    "ledger",
    "pnl",
    "balance",
    "aging",
  ];
  for (const width of [1440, 1024, 768, 390]) {
    const ctx = await browser.newContext({
      ...reviewTlsOptions(base),
      viewport: { width, height: 900 },
    });
    const view = await ctx.newPage();
    await view.goto(share || base + "/accountant.html");
    await view.screenshot({
      path: `${output}/login-${width}.png`,
      fullPage: true,
    });
    await view.getByLabel("Demo password").fill(password);
    await view.getByRole("button", { name: /Sign in to review/ }).click();
    await expect(view.locator("h1")).toHaveText("Financial dashboard");
    for (const route of routes) {
      await view.evaluate((value) => {
        location.hash = "#/" + value;
      }, route);
      const headings = {
        dashboard: "Financial dashboard",
        invoices: "Sales invoices",
        "new-invoice": "New invoice",
        bills: "Purchase bills",
        "document-entry": "Read a bill",
        receipts: "Customer receipts",
        "supplier-payments": "Supplier payments",
        expenses: "Expenses",
        banking: "Bank & cash",
        ledger: "General ledger",
        pnl: "Profit & loss",
        balance: "Balance sheet",
        aging: "Receivable & payable aging",
      };
      await expect(view.locator("h1")).toHaveText(headings[route]);
      expect(
        await view.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await view.screenshot({
        path: `${output}/route-${route}-${width}.png`,
        fullPage: true,
      });
    }
    checks.push(
      `${width}px: all 13 Accountant routes render without page-level overflow`,
    );
    const current = await (
      await ctx.request.get(base + "/api/accounts-review/session")
    ).json();
    await ctx.request.post(base + "/api/accounts-review/logout", {
      headers: { Origin: base, "X-Azzora-CSRF": current.csrf },
    });
    await ctx.close();
  }
  fs.writeFileSync(
    output + "/hosted-acceptance.json",
    JSON.stringify(
      {
        checks,
        routeWidthChecks: 52,
        environment: localHandler
          ? "local HTTPS hosted-handler harness (not a Vercel deployment)"
          : "protected Vercel Preview",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ checks, routeWidthChecks: 52, localHandler }, null, 2),
  );
} finally {
  await browser.close();
}
