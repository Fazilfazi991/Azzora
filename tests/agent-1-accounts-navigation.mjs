import { chromium, expect } from "@playwright/test";
import { buildSync } from "esbuild";
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { auditUrl, browserOptions } from "./browser-runtime.mjs";

const out =
  process.env.QA_ACCOUNTS_EVIDENCE_DIR || "tmp/agent-1-accounts-navigation";
const phase = process.env.QA_ACCOUNTS_PHASE || "baseline";
const requireProminence = process.argv.includes("--require-prominent-accounts");
fs.mkdirSync(out, { recursive: true });
const sourceSha = execFileSync(
  "git",
  ["rev-parse", process.env.QA_ACCOUNTS_SOURCE_SHA || "HEAD"],
  {
    encoding: "utf8",
  },
).trim();
const sourceTree = execFileSync("git", ["rev-parse", sourceSha + ":src"], {
  encoding: "utf8",
}).trim();
// Generate only disposable QA records through the actual domain functions.
// No application source, owner browser profile, or production records are modified.
const bundle = buildSync({
  stdin: {
    contents: `
export {seed} from './src/domain/seed';
export {initializeCommercial} from './src/commercial/migration';
export {blankLine,changeQuotationStatus} from './src/quotation/repository';
export {convertQuotation,invoiceFromQuotation,saveInvoice,issueInvoice,postPayment,saveExpense} from './src/commercial/repository';
export {financials,aed} from './src/commercial/calculations';
export {emptyFilter} from './src/commercial/model';
export {uid,today,addDays} from './src/domain/logic';`,
    resolveDir: process.cwd(),
    sourcefile: "accounts-fixture.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  logLevel: "silent",
}).outputFiles[0].text;
const fixtureModule = new Module(
  path.join(process.cwd(), "accounts-fixture.cjs"),
);
fixtureModule.filename = fixtureModule.id;
fixtureModule.paths = Module._nodeModulePaths(process.cwd());
fixtureModule._compile(bundle, fixtureModule.filename);
const a = fixtureModule.exports,
  db = a.seed();
a.initializeCommercial(db);
const project = db.projects[0],
  customer = db.clients.find((c) => c.id === project.clientId),
  q = db.quotations[0];
Object.assign(q, {
  date: a.today(),
  customerId: customer.id,
  projectId: project.id,
  customer: { ...q.customer, name: customer.name },
  project: { name: project.name, location: project.location },
  discount: "0",
  amountWordsOverride: "",
  vatEnabled: true,
  vatPercentage: "5",
  sections: [
    {
      id: a.uid(),
      number: "1",
      title: "Disposable Accounts QA scope",
      rows: [
        {
          ...a.blankLine(),
          description: "Disposable navigation fixture",
          quantity: "2",
          rate: "500",
        },
      ],
    },
  ],
  payments: [
    {
      id: a.uid(),
      number: "1",
      description: "Full QA scope",
      percentage: "100",
      notes: "",
    },
  ],
});
a.changeQuotationStatus(db, q.id, "Finalized");
a.changeQuotationStatus(db, q.id, "Accepted");
a.convertQuotation(db, q.id, project.id);
const draft = a.invoiceFromQuotation(db, q.id);
draft.date = a.addDays(a.today(), -10);
draft.due = a.addDays(a.today(), -7);
a.saveInvoice(db, draft);
a.issueInvoice(db, draft.id);
const invoice = db.invoices.find((i) => i.id === draft.id);
const receipt = a.postPayment(db, {
  id: a.uid(),
  number: "",
  invoiceId: draft.id,
  customerId: customer.id,
  projectId: project.id,
  date: a.today(),
  amount: "200",
  method: "Bank Transfer",
  reference: "QA-ACCOUNTS-RECEIPT",
  bank: "Disposable QA Bank",
  notes: "Isolated regression fixture",
  attachments: [],
  postingKey: a.uid(),
  createdAt: new Date().toISOString(),
});
const expense = a.saveExpense(db, {
  id: a.uid(),
  reference: "",
  projectId: project.id,
  category: "Materials",
  supplier: "Disposable QA Supplier",
  date: a.today(),
  description: "Navigation fixture cost",
  amount: "100",
  vat: "5",
  paidAmount: "50",
  method: "Cash",
  attachmentReference: "QA-NAV-BILL",
  attachments: [],
  createdAt: new Date().toISOString(),
});
const financial = a.financials(db, a.emptyFilter);
expect([
  financial.contract,
  financial.invoiced,
  financial.collected,
  financial.outstanding,
  financial.overdue,
  financial.costs,
  financial.paidCosts,
  financial.profit,
]).toEqual([100000n, 105000n, 20000n, 85000n, 85000n, 10000n, 5000n, 90000n]);
expect(financial.margin).toBe(90);
const fixtureRaw = JSON.stringify(db),
  fixtureHash = createHash("sha256").update(fixtureRaw).digest("hex");
const expectedKpis = [
  ["Total Contract Value excl. VAT", "AED 1,000.00"],
  ["Total Invoiced incl. VAT", "AED 1,050.00"],
  ["Total Collected", "AED 200.00"],
  ["Outstanding Receivables", "AED 850.00"],
  ["Overdue Amount", "AED 850.00"],
  ["Total Recorded Expenses excl. VAT", "AED 100.00"],
  ["Estimated Project Gross Profit", "AED 900.00"],
  ["Estimated Gross Margin", "90.00%"],
];
const routes = [
  ["accounts", "overview", "Overview"],
  ["accounts/invoices", "invoices", "Invoices"],
  ["accounts/payments", "payments", "Payments"],
  ["accounts/expenses", "expenses", "Expenses"],
  ["accounts/receivables", "receivables", "Receivables"],
  ["accounts/project-financials", "project-financials", "Project Financials"],
];
const checks = [],
  observations = [],
  errors = [];
const browser = await chromium.launch(browserOptions);
let activePage;
function record(width, name) {
  checks.push({ width, name, status: "passed" });
}
async function menu(page) {
  const nav = page.locator("#main-navigation");
  if ((await nav.getAttribute("inert")) !== null || !(await nav.isVisible())) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  }
  await expect(nav).toBeVisible();
  return nav;
}
async function reveal(link) {
  const ancestors = link.locator("xpath=ancestor::details[not(@open)]");
  for (let i = (await ancestors.count()) - 1; i >= 0; i--) {
    await ancestors.nth(i).locator(":scope > summary").click();
  }
  await expect(link).toBeVisible();
}
async function unchanged(page) {
  expect(
    await page.evaluate(() => localStorage.getItem("azzora-demo-v1")),
  ).toBe(fixtureRaw);
}
async function current(page, route, key, label) {
  await expect(page).toHaveURL(auditUrl + "/#/" + route);
  await expect(page.locator("main h1").first()).toHaveText("Accounts");
  const active = page.locator("main nav.tabs a.active");
  await expect(active).toHaveCount(1);
  await expect(active).toHaveText(label);
  await expect(active).toHaveAttribute("href", "#/accounts/" + key);
  await expect(
    page.locator('#main-navigation a[href="#/accounts"]'),
  ).toHaveAttribute("aria-current", "page");
}
async function routeData(page, key) {
  if (key === "overview") {
    for (const [label, value] of expectedKpis) {
      const card = page
        .locator(".commercial-kpis .kpi")
        .filter({ has: page.locator("small", { hasText: label }) });
      await expect(card).toHaveCount(1);
      await expect(card.locator("strong")).toHaveText(value);
    }
  } else if (key === "invoices") {
    const row = page.locator("tbody tr").filter({ hasText: invoice.number });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("1,050.00");
    await expect(row).toContainText("850.00");
  } else if (key === "payments") {
    await expect(
      page.locator("tbody tr").filter({ hasText: receipt.number }),
    ).toContainText("200.00");
  } else if (key === "expenses") {
    const row = page.locator("tbody tr").filter({ hasText: expense.reference });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("100.00");
    await expect(row).toContainText("50.00");
  } else if (key === "receivables") {
    await expect(page.locator("tbody")).toContainText("850.00");
  } else {
    const row = page.locator("tbody tr").filter({ hasText: project.code });
    await expect(row).toHaveCount(1);
    for (const value of [
      "1,000.00",
      "1,050.00",
      "200.00",
      "850.00",
      "100.00",
      "900.00",
      "90.00",
    ])
      await expect(row).toContainText(value);
  }
}
async function measureAccounts(link) {
  return link.evaluate((el) => {
    const box = el.getBoundingClientRect();
    let clip = {
      top: Math.max(0, box.top),
      left: Math.max(0, box.left),
      bottom: Math.min(innerHeight, box.bottom),
      right: Math.min(innerWidth, box.right),
    };
    const scrollers = [];
    for (let p = el.parentElement; p; p = p.parentElement) {
      const css = getComputedStyle(p),
        r = p.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(css.overflowY)) {
        clip.top = Math.max(clip.top, r.top);
        clip.bottom = Math.min(clip.bottom, r.bottom);
        if (p.scrollHeight > p.clientHeight)
          scrollers.push({
            tag: p.tagName,
            className: p.className,
            clientHeight: p.clientHeight,
            scrollHeight: p.scrollHeight,
            scrollTop: p.scrollTop,
          });
      }
    }
    return {
      rect: { top: box.top, bottom: box.bottom },
      visibleHeight: Math.max(0, clip.bottom - clip.top),
      height: box.height,
      fullyVisible: box.height > 0 && clip.bottom - clip.top >= box.height - 1,
      scrollers,
    };
  });
}
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
    });
    await context.addInitScript((raw) => {
      if (localStorage.getItem("azzora-demo-v1") === null)
        localStorage.setItem("azzora-demo-v1", raw);
    }, fixtureRaw);
    const page = (activePage = await context.newPage());
    page.on("pageerror", (e) => errors.push({ width, message: e.message }));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push({ width, message: m.text() });
    });
    await page.goto(auditUrl + "/#/dashboard");
    await expect(page.locator("main h1")).toHaveText("Executive Overview");
    const nav = await menu(page);
    const accounts = nav.locator('a[href="#/accounts"]');
    await expect(accounts).toHaveCount(1);
    const visibility = await measureAccounts(accounts);
    observations.push({
      width,
      name: "Accounts initial prominence",
      ...visibility,
    });
    await page.screenshot({
      path: `${out}/${phase}-sidebar-dashboard-${width}.png`,
      fullPage: false,
    });
    if (requireProminence)
      expect(
        visibility.fullyVisible,
        `Accounts initially clipped at ${width}`,
      ).toBe(true);
    await reveal(accounts);
    await accounts.focus();
    await expect(accounts).toBeFocused();
    await page.keyboard.press("Enter");
    await current(page, "accounts", "overview", "Overview");
    await routeData(page, "overview");
    await unchanged(page);
    record(width, "Accounts reachable by keyboard from the actual sidebar");
    for (const [route, key, label] of routes) {
      await page.goto(auditUrl + "/#/" + route);
      await current(page, route, key, label);
      await routeData(page, key);
      await unchanged(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `horizontal overflow ${route} ${width}`,
      ).toBe(true);
      await page.screenshot({
        path: `${out}/${phase}-${key}-${width}.png`,
        fullPage: true,
      });
      record(
        width,
        `direct URL, active state, real totals, no overflow and unchanged data: #/${route}`,
      );
      await page.reload();
      await current(page, route, key, label);
      await routeData(page, key);
      await unchanged(page);
      record(width, `refresh preserves #/${route}`);
    }
    // Follow the tab links, then use native browser history in both directions.
    await page.goto(auditUrl + "/#/accounts");
    await current(page, "accounts", "overview", "Overview");
    for (const [route, key, label] of routes.slice(1)) {
      const tab = page.locator(`main nav.tabs a[href="#/${route}"]`);
      await tab.focus();
      await expect(tab).toBeFocused();
      await page.keyboard.press("Enter");
      await current(page, route, key, label);
      await routeData(page, key);
      await unchanged(page);
      record(width, `keyboard Accounts tab ${label}`);
    }
    for (let i = routes.length - 2; i >= 0; i--) {
      await page.goBack();
      await current(page, ...routes[i]);
      await unchanged(page);
      record(width, `browser Back #/${routes[i][0]}`);
    }
    for (let i = 1; i < routes.length; i++) {
      await page.goForward();
      await current(page, ...routes[i]);
      await unchanged(page);
      record(width, `browser Forward #/${routes[i][0]}`);
    }
    if (width === 390) {
      const opener = page.getByRole("button", {
        name: "Open navigation",
        exact: true,
      });
      await opener.click();
      await expect(nav).toBeVisible();
      await expect(page.locator(".main-shell")).toHaveAttribute("inert", "");
      const first = nav
        .locator("a[href],button:not([disabled]),select:not([disabled])")
        .filter({ visible: true })
        .first();
      await first.focus();
      await page.keyboard.press("Shift+Tab");
      expect(
        await nav.evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Tab");
      expect(
        await nav.evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
      await expect(nav).toHaveAttribute("inert", "");
      await unchanged(page);
      record(
        width,
        "mobile menu focus containment, Escape dismissal and opener restoration",
      );
    }
    await context.close();
    activePage = null;
  }

  // Short-height regression reproduces the owner's clipped Accounts entry.
  for (const [width, viewportHeight] of [
    [1440, 768],
    [1024, 768],
    [768, 768],
    [390, 667],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: viewportHeight },
    });
    await context.addInitScript((raw) => {
      if (localStorage.getItem("azzora-demo-v1") === null)
        localStorage.setItem("azzora-demo-v1", raw);
    }, fixtureRaw);
    const page = (activePage = await context.newPage());
    page.on("pageerror", (e) =>
      errors.push({ width, viewportHeight, message: e.message }),
    );
    page.on("console", (m) => {
      if (m.type() === "error")
        errors.push({ width, viewportHeight, message: m.text() });
    });
    await page.goto(auditUrl + "/#/dashboard");
    await expect(page.locator("main h1")).toHaveText("Executive Overview");
    const nav = await menu(page),
      accounts = nav.locator('a[href="#/accounts"]');
    const visibility = await measureAccounts(accounts);
    observations.push({
      width,
      viewportHeight,
      name: "Accounts short-height prominence",
      ...visibility,
    });
    await page.screenshot({
      path:
        out +
        "/" +
        phase +
        "-short-sidebar-" +
        width +
        "x" +
        viewportHeight +
        ".png",
      fullPage: false,
    });
    if (requireProminence)
      expect(
        visibility.fullyVisible,
        "Accounts clipped at " + width + "x" + viewportHeight,
      ).toBe(true);
    await unchanged(page);
    await context.close();
    activePage = null;
  }
  if (errors.length) throw Error(JSON.stringify(errors));
  fs.writeFileSync(
    `${out}/browser-results.json`,
    JSON.stringify(
      {
        sourceSha,
        sourceTree,
        url: auditUrl,
        phase,
        fixtureHash,
        counts: {
          invoices: db.invoices.length,
          payments: db.payments.length,
          expenses: db.expenses.length,
          contracts: db.contracts.length,
        },
        checks,
        observations,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${checks.length} Accounts navigation/data checks; ${observations.filter((o) => !o.fullyVisible).length} initial-prominence observations; no browser errors.`,
  );
} catch (error) {
  if (activePage)
    await activePage
      .screenshot({ path: `${out}/failure.png`, fullPage: true })
      .catch(() => {});
  fs.writeFileSync(
    `${out}/browser-results.json`,
    JSON.stringify(
      {
        sourceSha,
        sourceTree,
        url: auditUrl,
        phase,
        fixtureHash,
        checks,
        observations,
        errors,
        failure: String(error),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
