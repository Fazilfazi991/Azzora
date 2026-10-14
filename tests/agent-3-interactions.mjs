import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";

const output = "docs/agent-3-evidence";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const checks = [],
  knownDefects = [];
const passed = (name) => checks.push({ name, status: "passed" });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${auditUrl}/#/tasks`);
    const trigger = page.getByRole("button", {
      name: "+ Create Task",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(Math.abs(bounds.x + bounds.width - width)).toBeLessThanOrEqual(1);
    expect(bounds.y).toBe(0);
    passed(
      `drawer is attached to right edge and within viewport at ${width}px`,
    );
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((d) => d.contains(document.activeElement)),
      ).toBe(true);
    }
    await dialog.getByLabel("Task name", { exact: true }).fill("");
    await dialog
      .getByRole("button", { name: "Save Changes", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    expect(
      await dialog
        .getByLabel("Task name", { exact: true })
        .evaluate((e) => e.validity.valueMissing),
    ).toBe(true);
    const validationGeometry = await dialog.evaluate((d) => {
      const input = d.querySelector("input:invalid");
      const head = d.querySelector(".modal-head");
      if (!input || !head) return null;
      const a = input.getBoundingClientRect(),
        b = head.getBoundingClientRect();
      return {
        inputTop: a.top,
        inputBottom: a.bottom,
        headerTop: b.top,
        headerBottom: b.bottom,
      };
    });
    if (
      validationGeometry &&
      validationGeometry.inputTop < validationGeometry.headerBottom &&
      validationGeometry.inputBottom > validationGeometry.headerTop
    )
      knownDefects.push({
        id: "A3-013",
        width,
        name: "Sticky drawer header obscures invalid task-name field",
        actual: validationGeometry,
      });
    await page.screenshot({ path: `${output}/drawer-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    if (!(await trigger.evaluate((e) => e === document.activeElement)))
      knownDefects.push({
        id: "A3-009",
        width,
        name: "Closing task drawer loses trigger focus",
      });
    passed(
      `drawer traps keyboard focus and rejects an empty task at ${width}px`,
    );
    // Native nested-dialog focus and parent draft retention.
    await page.getByRole("button", { name: "Quick Add", exact: true }).click();
    await page
      .getByRole("button", { name: "+ New Project", exact: true })
      .click();
    const parent = page.getByRole("dialog");
    await parent
      .getByLabel("Project name", { exact: true })
      .fill("QA Jumeirah Office - retained draft");
    const childTrigger = parent.getByRole("button", {
      name: "+ Add New Customer",
      exact: true,
    });
    await childTrigger.click();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    if ((await page.getByRole("dialog").count()) === 0) {
      knownDefects.push({
        id: "A3-010",
        width,
        name: "Escape from nested customer dialog also dismisses parent project wizard",
      });
    } else {
      await expect(
        parent.getByLabel("Project name", { exact: true }),
      ).toHaveValue("QA Jumeirah Office - retained draft");
      if (!(await childTrigger.evaluate((e) => e === document.activeElement)))
        knownDefects.push({
          id: "A3-009",
          width,
          name: "Closing nested dialog loses parent trigger focus",
        });
      await page.keyboard.press("Escape");
      passed(`nested dialog retains parent draft at ${width}px`);
    }
    await page
      .getByLabel("Global search", { exact: true })
      .fill("QA-impossible-customer-no-match");
    await expect(page.locator(".search-results")).toContainText(
      "No results found.",
    );
    await page.getByLabel("Global search", { exact: true }).fill("AZ-026");
    await page.locator(".search-results button").first().click();
    await expect(page).toHaveURL(/projects\/project-0\/overview/);
    passed(
      `global search empty state and project result navigate at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${auditUrl}/#/dashboard`);
  await page.reload();
  await page.locator("main h1").waitFor();
  await page.keyboard.press("Tab");
  const mobileFocus = await page.evaluate(() => {
    const e = document.activeElement,
      r = e.getBoundingClientRect();
    return {
      text: e.textContent,
      left: r.left,
      right: r.right,
      insideClosedSidebar: !!e.closest(".sidebar:not(.open)"),
    };
  });
  if (mobileFocus.insideClosedSidebar)
    knownDefects.push({
      id: "A3-007",
      name: "Closed mobile sidebar remains in keyboard order",
      actual: mobileFocus,
    });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveClass(/open/);
  await page
    .getByRole("button", { name: "Close navigation", exact: true })
    .click({ position: { x: 350, y: 10 } });
  await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
  passed("mobile sidebar opens and closes using its backdrop");
  // Owned operational form: whitespace currently passes native required validation.
  await page.goto(`${auditUrl}/#/site-updates`);
  await page
    .getByRole("button", { name: "+ Post Site Update", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Work completed", { exact: true })
    .fill("   ");
  await page.getByRole("button", { name: "Post Update", exact: true }).click();
  const whitespaceSaved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("azzora-demo-v1"))?.updates.some(
      (u) => u.completed === "   ",
    ),
  );
  if (whitespaceSaved)
    knownDefects.push({
      id: "A3-008",
      name: "Whitespace-only site update persists",
      actual: "completed is three spaces",
    });
  await context.close();
} catch (error) {
  checks.push({
    name: "interaction suite",
    status: "failed",
    error: String(error),
  });
  throw error;
} finally {
  fs.writeFileSync(
    `${output}/interactions.json`,
    JSON.stringify({ auditUrl, checks, knownDefects }, null, 2),
  );
  await browser.close();
}
console.log(
  `PASS: ${checks.length} interaction checks; ${new Set(knownDefects.map(d => d.id)).size} open defects (${knownDefects.length} observations).`,
);
