import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { exportDemo, qaOutput } from "./agent-3-helpers.mjs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";

// All fixture mutations are in a new, disposable context, never a user profile.
const phase = "strict";
const output = `${qaOutput}/audit`;
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const errors = [],
  checks = [],
  observations = [];
const routes = [
  "dashboard",
  "customers",
  "projects",
  "planning",
  "quotations",
  "accounts",
  "accounts/invoices",
  "accounts/payments",
  "accounts/expenses",
  "accounts/project-financials",
  "tasks",
  "team",
  "documents",
  "site-updates",
  "snags-qa",
  "handover",
  "reports",
  "settings",
  ...[
    "overview",
    "timeline",
    "tasks",
    "team",
    "documents",
    "site-updates",
    "snags-qa",
    "handover",
    "financials",
  ].map((tab) => `projects/project-0/${tab}`),
  "quotations/quotation-reference/edit",
  "quotations/quotation-reference/preview",
];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`${auditUrl}/#/${route}`);
      await page.locator("main h1").first().waitFor();
      // Lazy quotation preview must finish loading before measuring or capturing.
      if (route.endsWith("/preview"))
        await page.locator(".quote-sheet svg").first().waitFor();
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        unlabelled: [
          ...document.querySelectorAll(
            "main input, main select, main textarea",
          ),
        ]
          .filter(
            (e) =>
              !e.labels?.length &&
              !e.getAttribute("aria-label") &&
              !e.getAttribute("aria-labelledby") &&
              !["hidden", "submit", "button"].includes(e.type),
          )
          .map((e) => ({
            tag: e.tagName,
            type: e.type,
            placeholder: e.getAttribute("placeholder"),
          })),
      }));
      checks.push({ width, route, ...geometry });
      await page.screenshot({
        path: `${output}/${route.replaceAll("/", "_")}-${width}.png`,
      });
    }
    await page.getByRole("button", { name: "Quick Add", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    const named = await page
      .getByRole("dialog", { name: "Quick Add", exact: true })
      .count();
    observations.push({
      width,
      check: "dialog accessible name",
      passed: named === 1,
    });
    await page.screenshot({ path: `${output}/quick-add-${width}.png` });
    await expect(
      page.getByRole("dialog", { name: "Quick Add", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${auditUrl}/#/customers`);
  await page
    .getByRole("button", { name: "Add New Customer", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Customer/company name", { exact: true })
    .fill("QA Al Quoz Joinery LLC");
  // Dialog padding is inside the dialog, not the backdrop; retain unsaved edits.
  await dialog.click({ position: { x: 3, y: 3 } });
  const retained = (await dialog.count()) === 1;
  observations.push({
    check: "dialog padding retains unsaved form",
    passed: retained,
  });
  await expect(
    dialog.getByLabel("Customer/company name", { exact: true }),
  ).toHaveValue("QA Al Quoz Joinery LLC");
  if (retained) await page.keyboard.press("Escape");
  // Long but realistic UAE customer/project identities, isolated fixture only.
  const fixture = await exportDemo(page);
  fixture.clients[0].name =
    "QA Emirates Architectural Interiors and Bespoke Joinery Manufacturing LLC - Dubai Branch";
  fixture.projects[0].name =
    "QA Dubai International Financial Centre Executive Office Fit-Out and Bespoke Joinery Phase Two";
  await page.evaluate(
    (db) => localStorage.setItem("azzora-demo-v1", JSON.stringify(db)),
    fixture,
  );
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "projects",
      "projects/project-0/overview",
      "customers",
    ]) {
      await page.goto(`${auditUrl}/#/${route}`);
      await page.reload();
      await page.locator("main h1").first().waitFor();
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      checks.push({ width, route: "long-name/" + route, scrollWidth });
      await page.screenshot({
        path: `${output}/long-${route.replaceAll("/", "_")}-${width}.png`,
      });
    }
  }
  await context.close();
} finally {
  fs.writeFileSync(
    `${output}/results.json`,
    JSON.stringify({ phase, auditUrl, checks, observations, errors }, null, 2),
  );
  await browser.close();
}
expect(observations.every((c) => c.passed)).toBe(true);
expect(errors).toEqual([]);
expect(checks.filter((c) => c.scrollWidth > c.width)).toEqual([]);
console.log(
  `AUDIT: ${checks.length} route/layout passes; ${observations.filter((c) => c.passed).length}/${observations.length} targeted checks pass; ${errors.length} browser errors.`,
);
