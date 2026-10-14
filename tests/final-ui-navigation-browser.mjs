import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import { exportDemo } from "./agent-3-helpers.mjs";

// Independent public-UI contract from the owner's final correction request.
// Deliberately not run as final until reviewed combined source/tests are frozen.
const groups = [
  ["Overview", ["dashboard"]],
  ["CRM & Commercial", ["customers", "projects", "quotations", "accounts"]],
  [
    "Project Execution",
    ["planning", "tasks", "team", "site-updates", "snags-qa", "documents"],
  ],
  [
    "Procurement & Controls",
    ["variations", "suppliers", "procurement", "approvals", "budgets"],
  ],
  ["Management", ["handover", "reports", "settings"]],
];
const titles = {
  dashboard: "Executive Overview",
  customers: "Customers",
  projects: "Project Directory",
  quotations: "Quotations",
  accounts: "Accounts",
  planning: "Planning & Timeline",
  tasks: "Task Workspace",
  team: "Team & Resource Allocation",
  "site-updates": "Site Updates",
  "snags-qa": "Snags & Quality Assurance",
  documents: "Document Register",
  variations: "Variations",
  suppliers: "Suppliers",
  procurement: "Procurement",
  approvals: "Approvals",
  budgets: "Budget & Forecast",
  handover: "Project Handover",
  reports: "Portfolio Reports",
  settings: "Settings",
};
const accountRoutes = [
  "accounts",
  "accounts/invoices",
  "accounts/payments",
  "accounts/expenses",
  "accounts/receivables",
  "accounts/project-financials",
];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const hash = (p) =>
  crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sha = git("rev-parse", "HEAD");
const frozenFiles = git(
  "ls-files",
  "src",
  "tests",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "eslint.config.js",
  "tsconfig.json",
  "index.html",
)
  .split("\n")
  .filter(Boolean);
const frozen = Object.fromEntries(frozenFiles.map((p) => [p, hash(p)]));
function guard() {
  expect(git("rev-parse", "HEAD")).toBe(sha);
  for (const [p, h] of Object.entries(frozen)) expect(hash(p), p).toBe(h);
  if (process.env.QA_RUN_KIND === "final") {
    expect(process.env.QA_SOURCE_SHA).toBe(sha);
    expect(
      git(
        "status",
        "--short",
        "--",
        "src",
        "tests",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "eslint.config.js",
        "tsconfig.json",
        "index.html",
      ),
    ).toBe("");
  }
}
const output =
  process.env.QA_FINAL_UI_EVIDENCE ||
  "docs/integration-evidence/final-ui-qa/preparatory-navigation";
fs.mkdirSync(output, { recursive: true });
const result = {
  sha,
  kind: process.env.QA_RUN_KIND || "preparatory",
  auditUrl,
  startedAt: new Date().toISOString(),
  frozen,
  checks: [],
  images: [],
  geometry: [],
  errors: [],
};
const browser = await chromium.launch(browserOptions);
const raw = (page) =>
  page.evaluate(() => localStorage.getItem("azzora-demo-v1"));
const pass = (width, name) =>
  result.checks.push({ width, name, status: "passed" });
async function image(page, width, name, fullPage = false) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    scrollTo(0, 0);
  });
  const file = path.join(output, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage });
  result.images.push({ width, name, path: file, sha256: hash(file) });
}
async function openMenu(page, width) {
  if (width < 768) {
    const sidebar = page.getByRole("complementary", {
      name: "Main navigation",
      exact: true,
    });
    if (!(await sidebar.isVisible()))
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
  }
}
async function expandGroup(sidebar, label) {
  const text = sidebar.getByText(label, { exact: true });
  await expect(text).toHaveCount(1);
  // Either native disclosure, aria-expanded button, or a static semantic heading
  // meets the request's optional-collapse contract. No ambiguous item fallback.
  const control = await text.evaluate((el) => {
    const details = el.closest("details");
    if (details && details.querySelector("summary")?.contains(el))
      return { kind: "details", open: details.open };
    const button = el.closest("button");
    if (button)
      return { kind: "button", expanded: button.getAttribute("aria-expanded") };
    return { kind: "heading", role: el.getAttribute("role"), tag: el.tagName };
  });
  if (control.kind === "details" && !control.open) await text.click();
  else if (control.kind === "button") {
    expect(["true", "false"]).toContain(control.expanded);
    if (control.expanded === "false") await text.click();
  } else if (control.kind === "heading")
    expect(control.role === "heading" || /^H[1-6]$/.test(control.tag)).toBe(
      true,
    );
}
async function heading(page, route) {
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main h1")).toHaveText(titles[route.split("/")[0]]);
  await expect(page.locator("main h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function active(page, width, route) {
  await openMenu(page, width);
  const sidebar = page.getByRole("complementary", {
    name: "Main navigation",
    exact: true,
  });
  const modules = sidebar.getByRole("navigation", {
    name: "Modules",
    exact: true,
  });
  const key = route.split("/")[0];
  const group = groups.find(([, routes]) => routes.includes(key))[0];
  await expandGroup(sidebar, group);
  await expect(modules.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(modules.locator(`a[href="#/${key}"]`)).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(modules.locator(`a[href="#/${key}"]`)).toBeVisible();
  return sidebar;
}
try {
  guard();
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const setup = await context.newPage();
    const fixture = await exportDemo(setup);
    await setup.close();
    const fixtureFile = path.join(output, `fictional-seed-${width}.json`);
    fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
    await context.addInitScript(
      (data) => localStorage.setItem("azzora-demo-v1", JSON.stringify(data)),
      fixture,
    );
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      result.errors.push({ width, error: error.message }),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        result.errors.push({ width, error: message.text() });
    });
    await page.goto(`${auditUrl}/#/dashboard`);
    await heading(page, "dashboard");
    const original = await raw(page);
    await image(page, width, "dashboard-viewport");
    await image(page, width, "dashboard-full", true);
    await openMenu(page, width);
    const sidebar = page.getByRole("complementary", {
      name: "Main navigation",
      exact: true,
    });
    const modules = sidebar.getByRole("navigation", {
      name: "Modules",
      exact: true,
    });
    const accounts = modules.locator('a[href="#/accounts"]');
    await expect(accounts).toHaveCount(1);
    await expect(accounts).toBeVisible();
    const geometry = await accounts.evaluate((link) => {
      const rect = link.getBoundingClientRect(),
        scrollable = [];
      let el = link.parentElement;
      while (el && el.id !== "main-navigation") {
        const style = getComputedStyle(el);
        if (
          /auto|scroll/.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 1
        )
          scrollable.push({
            tag: el.tagName,
            className: el.className,
            height: el.clientHeight,
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop,
          });
        el = el.parentElement;
      }
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight },
        scrollable,
      };
    });
    expect(geometry.rect.x).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.y).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.y + geometry.rect.height).toBeLessThanOrEqual(900);
    expect(geometry.scrollable.length).toBeLessThanOrEqual(1);
    result.geometry.push({ width, ...geometry });
    await image(page, width, "sidebar-initial");
    pass(
      width,
      "Accounts is initially visible without scrolling; no nested scrolling ancestors",
    );
    const commercialToggle = sidebar.getByRole("button", {
      name: "CRM & Commercial",
      exact: true,
    });
    await expect(commercialToggle).toHaveAttribute("aria-expanded", "true");
    await commercialToggle.click();
    await expect(commercialToggle).toHaveAttribute("aria-expanded", "false");
    await expect(accounts).toBeHidden();
    await commercialToggle.click();
    await expect(commercialToggle).toHaveAttribute("aria-expanded", "true");
    await expect(accounts).toBeVisible();
    pass(width, "commercial disclosure collapses and reopens Accounts access");
    for (const [label, routes] of groups) {
      await openMenu(page, width);
      await expandGroup(sidebar, label);
      for (const route of routes) {
        await openMenu(page, width);
        await expandGroup(sidebar, label);
        const link = modules.locator(`a[href="#/${route}"]`);
        await expect(link).toHaveCount(1);
        await expect(link).toHaveAccessibleName(/\S/);
        await link.focus();
        await expect(link).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(`#/${route}$`));
        await heading(page, route);
        if (width === 390) await expect(sidebar).toBeHidden();
        await active(page, width, route);
        expect(await raw(page)).toBe(original);
        pass(
          width,
          `${label} → ${route}: keyboard link, heading, active state, unchanged records`,
        );
      }
    }
    for (const route of accountRoutes) {
      await page.goto(`${auditUrl}/#/${route}`);
      await heading(page, route);
      await active(page, width, route);
      if (width === 390) await page.keyboard.press("Escape");
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`#/${route}$`));
      await heading(page, route);
      await active(page, width, route);
      expect(await raw(page)).toBe(original);
      if (width === 390) await page.keyboard.press("Escape");
      await image(page, width, route.replaceAll("/", "-"));
      pass(
        width,
        `${route}: direct URL, refresh, Accounts current state, unchanged records`,
      );
    }
    await page.goto(`${auditUrl}/#/accounts/invoices`);
    await page.getByRole("link", { name: "Payments", exact: true }).click();
    await expect(page).toHaveURL(/#\/accounts\/payments$/);
    await page.goBack();
    await expect(page).toHaveURL(/#\/accounts\/invoices$/);
    await heading(page, "accounts/invoices");
    await page.goForward();
    await expect(page).toHaveURL(/#\/accounts\/payments$/);
    await heading(page, "accounts/payments");
    await active(page, width, "accounts/payments");
    pass(
      width,
      "Accounts SPA Back/Forward restores URL, heading and sidebar active state",
    );
    if (width === 390) {
      await page.keyboard.press("Escape");
      for (const name of ["Open navigation", "More"]) {
        const opener = page.getByRole("button", { name, exact: true });
        await opener.focus();
        await page.keyboard.press("Enter");
        await expect(sidebar).toBeVisible();
        for (let i = 0; i < 45; i++) {
          await page.keyboard.press("Tab");
          expect(
            await sidebar.evaluate((el) => el.contains(document.activeElement)),
          ).toBe(true);
        }
        for (let i = 0; i < 45; i++) {
          await page.keyboard.press("Shift+Tab");
          expect(
            await sidebar.evaluate((el) => el.contains(document.activeElement)),
          ).toBe(true);
        }
        await page.keyboard.press("Escape");
        await expect(sidebar).toBeHidden();
        await expect(opener).toBeFocused();
      }
      pass(
        width,
        "both mobile openers, forward/back Tab trap including groups, Escape and exact focus restoration",
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await raw(page)).toBe(original);
    await context.close();
    guard();
  }
  expect(result.errors).toEqual([]);
  result.status = "passed";
  console.log(`PASS: ${result.checks.length} final UI navigation groups.`);
} catch (error) {
  result.status = "failed";
  result.failure = String(error);
  throw error;
} finally {
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(output, "browser-results.json"),
    JSON.stringify(result, null, 2),
  );
  await browser.close();
}
