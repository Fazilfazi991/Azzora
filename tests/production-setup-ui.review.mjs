/** Local UI acceptance with an explicit fictional, in-memory API. Not hosted/Auth evidence. */
import { build, preview } from "vite";
import { build as bundle } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { browserOptions } from "./browser-runtime.mjs";
process.env.VITE_AZZORA_STAGING = "1";
process.env.VITE_AZZORA_PRODUCTION = "1";
const browser = await chromium.launch(browserOptions);
let staticServer;
const out = "tmp/production-setup-ui";
mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
try {
  await bundle({
    stdin: {
      contents: `export {createEmptyProductionCompany} from './src/finance/production-policy.ts'; export {emptyOperations} from './src/operations/migration.ts'; export {reviewSnapshot} from './src/accounts-review/domain.ts'; export {applySharedCommand} from './src/staging/domain.ts'; export {serializeCanonical, hydrateCanonical} from './src/staging/canonical.ts';`,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile: `${out}/fixture.mjs`,
  });
  const {
    createEmptyProductionCompany,
    emptyOperations,
    reviewSnapshot,
    applySharedCommand,
    serializeCanonical,
    hydrateCanonical,
  } = await import(pathToFileURL(resolve(`${out}/fixture.mjs`)).href);
  await build({
    configFile: false,
    plugins: [react()],
    build: {
      outDir: "tmp/production-setup-ui-build",
      rollupOptions: {
        input: { main: "index.html", accountant: "accountant.html" },
      },
    },
  });
  staticServer = await preview({
    configFile: false,
    build: { outDir: "tmp/production-setup-ui-build" },
    preview: { host: "127.0.0.1", port: 5296, strictPort: true },
  });
  const settings = emptyOperations().settings;
  settings.company = {
    name: "Fictional UI setup",
    tradingName: "",
    location: "",
    phone: "",
    email: "",
    website: "",
    trn: "",
    bank: "",
    logo: "",
    invoiceTerms: "",
  };
  settings.tax = "Unconfigured";
  settings.vatPercentage = "";
  settings.retentionPercentage = "";
  let state = createEmptyProductionCompany({ settings });
  const user = "ui-fixture-accountant";
  state.manager.people.push({
    id: user,
    name: "Fictional UI accountant",
    role: "Accountant",
    email: "fictional-ui@example.invalid",
    phone: "",
    capacity: 100,
    status: "Active",
  });
  const actor = {
    userId: user,
    personId: user,
    companyId: "fictional-ui-only",
    sessionId: "local-ui",
    assurance: "aal2",
    grant: {
      userId: user,
      companyId: "fictional-ui-only",
      active: true,
      roles: ["accountant"],
      workspaces: ["accountant"],
      projectIds: [],
      capabilities: ["finance.read", "finance.draft"],
    },
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("**/api/staging/**", async (route) => {
    const url = new URL(route.request().url());
    const reply = (body, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === "/api/staging/auth/session")
      return reply({
        email: "fictional-ui@example.invalid",
        role: "accountant",
        workspace: "accountant",
        csrf: "local-ui",
        mode: "production-candidate",
        capabilities: ["finance.read", "finance.draft"],
      });
    if (url.pathname === "/api/staging/accounts/snapshot")
      return reply({
        ...reviewSnapshot(state.finance, "2026-11-13"),
        version: 1,
        documentAi: { enabled: false },
      });
    if (url.pathname === "/api/staging/accounts/action") {
      const action = route.request().postDataJSON();
      state = hydrateCanonical(
        serializeCanonical(
          applySharedCommand(
            state,
            { kind: "accounts.action", payload: { action } },
            actor,
          ),
        ),
      );
      return reply({
        id: action.id,
        snapshot: {
          ...reviewSnapshot(state.finance, "2026-11-13"),
          version: 2,
        },
      });
    }
    return reply({ error: "Unexpected local fixture route" }, 404);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5296/accountant.html#/banking", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Bank & cash", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Opening balances — setup draft", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Add opening line" }).click();
  await page
    .getByLabel("Account / customer / supplier")
    .fill("Fictional bank pending confirmation");
  await page.getByLabel("Debit (AED)").fill("123.45");
  await page.getByRole("button", { name: "+ Add opening line" }).click();
  await page.getByLabel("Entry type").nth(1).selectOption("customer-invoice");
  await page
    .getByLabel("Document / account reference")
    .nth(1)
    .fill("FICT-OUT-1");
  await page.getByRole("button", { name: "Save opening setup draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Opening setup draft saved" }),
  ).toBeVisible();
  expect(state.finance.accounting.journals).toHaveLength(0);
  expect(state.finance.invoices).toHaveLength(0);
  expect(state.finance.openingSetup.rows[1].debit).toBe("");
  checks.push(
    "Actual opening form saves incomplete/unbalanced draft through domain and canonical round-trip; blank retained; no journals or invoices.",
  );
  await page.reload();
  await page
    .getByText("Opening balances — setup draft", { exact: true })
    .click();
  await expect(page.getByLabel("Debit (AED)").first()).toHaveValue("123.45");
  await expect(page.getByLabel("Debit (AED)").nth(1)).toHaveValue("");
  await expect(
    page.getByText(
      "Opening trial balance does not reconcile. No balancing amount will be invented.",
    ),
  ).toBeVisible();
  checks.push(
    "Refresh/reopen retains outstanding-document reference, values and unresolved reconciliation warning.",
  );
  for (const width of [1440, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${out}/opening-${width}.png`,
      fullPage: true,
    });
  }
  checks.push(
    "Opening draft form has no page-level horizontal overflow at 1440/1024/768/430/390.",
  );
  await page.goto("http://127.0.0.1:5296/accountant.html#/new-invoice");
  await expect(
    page.getByRole("button", { name: "Issue document", exact: true }),
  ).toBeDisabled();
  expect(await page.getByLabel("Customer", { exact: true }).inputValue()).toBe(
    "",
  );
  checks.push(
    "Production invoice entry starts with no synthetic customer and issuance disabled.",
  );
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  let initialized = false;
  await ownerContext.route("**/api/staging/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/staging/auth/session")
      return route.fulfill({
        json: {
          email: "fictional-owner@example.invalid",
          role: "owner_admin",
          workspace: "manager",
          csrf: "owner-ui",
          mode: "production-candidate",
          capabilities: [
            "access.manage",
            "project.read",
            "project.write",
            "finance.read",
            "finance.draft",
          ],
          projectIds: [],
        },
      });
    if (path === "/api/staging/manager/snapshot")
      return initialized
        ? route.fulfill({
            json: {
              db: state.manager,
              version: 1,
              expenseSubmissions: [],
              accountantBills: [],
            },
          })
        : route.fulfill({
            status: 409,
            json: {
              error: "Company setup required",
              code: "production_company_setup_required",
            },
          });
    if (path === "/api/staging/manager/setup") {
      expect(route.request().headers()["x-azzora-csrf"]).toBe("owner-ui");
      expect(route.request().postDataJSON().idempotencyKey).toMatch(
        /^[a-f0-9-]{36}$/,
      );
      initialized = true;
      return route.fulfill({
        json: { initialized: true, financialPostingEnabled: false },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected local Owner fixture route" },
    });
  });
  const ownerPage = await ownerContext.newPage();
  ownerPage.on("pageerror", (error) => errors.push(error.message));
  await ownerPage.goto("http://127.0.0.1:5296/");
  await expect(
    ownerPage.getByRole("button", { name: "Create empty company workspace" }),
  ).toBeVisible();
  await ownerPage.screenshot({
    path: `${out}/owner-setup-1440.png`,
    fullPage: true,
  });
  await ownerPage.setViewportSize({ width: 390, height: 844 });
  expect(
    await ownerPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await ownerPage.screenshot({
    path: `${out}/owner-setup-390.png`,
    fullPage: true,
  });
  await ownerPage
    .getByRole("button", { name: "Create empty company workspace" })
    .click();
  await expect(
    ownerPage.getByText("AZZORA COMPANY WORKSPACE", { exact: true }),
  ).toBeVisible();
  expect(initialized).toBe(true);
  checks.push(
    "Owner initial setup screen renders desktop/mobile; explicit action sends CSRF and idempotency identity and opens shared Manager workspace.",
  );
  expect(errors).toEqual([]);
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify(
      {
        scope:
          "local rendered UI with in-memory fictional API; not hosted authorization",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, errors, output: out }));
} finally {
  await browser.close();
  if (staticServer)
    await new Promise((resolve) => staticServer.httpServer.close(resolve));
}
