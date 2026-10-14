import { chromium, expect as baseExpect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import {
  qaOutput,
  exportDemo,
  readOriginalExport,
  assertWhitespaceSiteRejected,
} from "./agent-3-helpers.mjs";

const expect = baseExpect.configure({ timeout: 1800 });
const output = path.join(qaOutput, "critical");
fs.mkdirSync(output, { recursive: true });
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sourceSha = git("rev-parse", "HEAD");
const kind = process.env.QA_RUN_KIND || "prep";
const selection = process.env.QA_CASE_FILTER || "";
if (kind === "final" && selection)
  throw Error("Final certification cannot use QA_CASE_FILTER.");
if (process.env.QA_SOURCE_SHA && process.env.QA_SOURCE_SHA !== sourceSha)
  throw Error("QA_SOURCE_SHA differs from the checkout HEAD.");
if (
  kind === "final" &&
  (!process.env.QA_SOURCE_SHA ||
    git("diff", "HEAD", "--", "src", "tests") ||
    git("ls-files", "--others", "--exclude-standard", "src", "tests"))
)
  throw Error(
    "Final gate needs QA_SOURCE_SHA and unchanged committed application/harness source.",
  );
const browser = await chromium.launch(browserOptions);
const checks = [];
const startedAt = new Date().toISOString();
const manifest = {
  selection,
  harnessHashes: Object.fromEntries(
    [
      "tests/agent-3-critical.mjs",
      "tests/agent-3-helpers.mjs",
      "tests/browser-runtime.mjs",
    ].map((file) => [
      file,
      createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    ]),
  ),
  kind,
  sourceSha,
  auditUrl,
  cwd: process.cwd(),
  node: process.version,
  browser: browser.version(),
  startedAt,
  dirtyPaths: git("status", "--short"),
  lockSha256: (await import("node:crypto"))
    .createHash("sha256")
    .update(fs.readFileSync("package-lock.json"))
    .digest("hex"),
};
let sequence = 0;
async function check(name, width, run) {
  if (selection && !new RegExp(selection).test(name)) return;
  const context = await browser.newContext({
    viewport: { width, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const row = { name, width, status: "running", errors };
  checks.push(row);
  try {
    await page.goto(auditUrl);
    await page.locator("main h1").first().waitFor();
    await run(page);
    expect(errors, "normal/recovery UI must not emit runtime errors").toEqual(
      [],
    );
    row.status = "passed";
  } catch (error) {
    row.status = "failed";
    row.failure = String(error);
  } finally {
    row.screenshot = `${++sequence}-${width}.png`;
    try {
      await page.screenshot({ path: path.join(output, row.screenshot) });
    } catch (error) {
      row.screenshotFailure = String(error);
      row.status = "failed";
    }
    await context.close();
    console.log(`${row.status.toUpperCase()}: ${width}px ${name}`);
  }
}
const openTask = async (page) => {
  await page.goto(`${auditUrl}/#/tasks`);
  const trigger = page.getByRole("button", {
    name: "+ Create Task",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  return trigger;
};
try {
  for (const width of [1440, 1024, 768, 390]) {
    await check("A3-001 named Quick Add dialog", width, async (page) => {
      await page
        .getByRole("button", { name: "Quick Add", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Quick Add", exact: true }),
      ).toBeVisible();
    });
    await check(
      "A3-002 padding retains draft; real backdrop closes",
      width,
      async (page) => {
        await page.goto(`${auditUrl}/#/customers`);
        await page
          .getByRole("button", { name: "Add New Customer", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByLabel("Customer/company name", { exact: true })
          .fill("QA padding draft");
        await dialog.click({ position: { x: 3, y: 3 } });
        await expect(
          dialog.getByLabel("Customer/company name", { exact: true }),
        ).toHaveValue("QA padding draft");
        await page.mouse.click(1, 1);
        await expect(dialog).toHaveCount(0);
      },
    );
    await check(
      "A3-009 Escape restores task opener focus",
      width,
      async (page) => {
        const trigger = await openTask(page);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(trigger).toBeFocused();
      },
    );
    await check(
      "A3-010 nested Escape retains parent draft and focus",
      width,
      async (page) => {
        await page
          .getByRole("button", { name: "Quick Add", exact: true })
          .click();
        await page
          .getByRole("dialog", { name: "Quick Add", exact: true })
          .getByRole("button", { name: "+ New Project", exact: true })
          .click();
        const parent = page.getByRole("dialog");
        await parent
          .getByLabel("Project name", { exact: true })
          .fill("QA retained parent");
        const childTrigger = parent.getByRole("button", {
          name: "+ Add New Customer",
          exact: true,
        });
        await childTrigger.click();
        await expect(page.getByRole("dialog")).toHaveCount(2);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(1);
        await expect(
          parent.getByLabel("Project name", { exact: true }),
        ).toHaveValue("QA retained parent");
        await expect(childTrigger).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      },
    );
    await check(
      "A3-013 required task field stays unobscured",
      width,
      async (page) => {
        await openTask(page);
        const dialog = page.getByRole("dialog");
        // Navigation down the long drawer is part of the original reproduction.
        for (let index = 0; index < 24; index++)
          await page.keyboard.press("Tab");
        await dialog.getByLabel("Task name", { exact: true }).fill("");
        await dialog.getByLabel("Schedule proposal reason").fill("Validate required task name in drawer");
        await dialog
          .getByRole("button", { name: "Save Changes", exact: true })
          .click();
        await expect(dialog).toBeVisible();
        const geometry = await dialog.evaluate((d) => {
          const input = d.querySelector("input:invalid"),
            head = d.querySelector(".modal-head");
          if (!input || !head) return null;
          const a = input.getBoundingClientRect(),
            b = head.getBoundingClientRect(),
            bounds = d.getBoundingClientRect();
          return {
            invalid: !input.validity.valid,
            focused: input === document.activeElement,
            top: a.top,
            bottom: a.bottom,
            headBottom: b.bottom,
            dialogBottom: bounds.bottom,
          };
        });
        expect(geometry).not.toBeNull();
        expect(geometry.invalid).toBe(true);
        expect(geometry.focused).toBe(true);
        expect(geometry.top).toBeGreaterThanOrEqual(geometry.headBottom - 1);
        expect(geometry.bottom).toBeLessThanOrEqual(geometry.dialogBottom);
      },
    );
    await check(
      "drawer forward/back Tab containment with reduced motion",
      width,
      async (page) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await openTask(page);
        for (const key of ["Tab", "Shift+Tab"]) {
          for (let index = 0; index < 32; index++) {
            await page.keyboard.press(key);
            expect(
              await page
                .getByRole("dialog")
                .evaluate((d) => d.contains(document.activeElement)),
            ).toBe(true);
          }
        }
      },
    );
    await check("A3-011 warning contrast meets 4.5:1", width, async (page) => {
      const colors = await page
        .locator(".badge.warn")
        .first()
        .evaluate((e) => ({
          fg: getComputedStyle(e).color,
          bg: getComputedStyle(e).backgroundColor,
        }));
      const lum = (color) => {
        const channels = color.match(/[\d.]+/g).map(Number);
        if (channels.length === 4 && channels[3] !== 1)
          throw Error("Contrast probe requires opaque computed badge colors.");
        const c = channels
          .slice(0, 3)
          .map((n) => n / 255)
          .map((n) =>
            n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
          );
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      };
      const fg = lum(colors.fg),
        bg = lum(colors.bg);
      expect(
        (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    });
    await check(
      "A3-008 whitespace site content rejected with active actor",
      width,
      assertWhitespaceSiteRejected,
    );
  }
  await check(
    "A3-007 closed mobile sidebar never receives Tab",
    390,
    async (page) => {
      await page.reload();
      await page.locator("main h1").first().waitFor();
      for (let index = 0; index < 15; index++) {
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => {
          const e = document.activeElement,
            r = e.getBoundingClientRect();
          return {
            sidebar: !!e.closest(".sidebar:not(.open)"),
            left: r.left,
            right: r.right,
          };
        });
        expect(focus.sidebar).toBe(false);
        expect(focus.left).toBeGreaterThanOrEqual(0);
        expect(focus.right).toBeLessThanOrEqual(390);
      }
    },
  );
  await check(
    "mobile menu Escape closes and restores visible opener",
    390,
    async (page) => {
      const trigger = page.getByRole("button", {
        name: "Open navigation",
        exact: true,
      });
      await trigger.click();
      await expect(page.locator(".sidebar")).toHaveClass(/open/);
      await page.keyboard.press("Escape");
      await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
      await expect(trigger).toBeFocused();
    },
  );
  for (const corrupt of [
    "malformed JSON",
    "missing people",
    "missing phases",
    "orphan project customer",
  ]) {
    await check(
      `A3-006 protected fallback and raw export: ${corrupt}`,
      1440,
      async (page) => {
        const db = await exportDemo(page);
        if (corrupt === "missing people") delete db.people;
        if (corrupt === "missing phases") delete db.phases;
        if (corrupt === "orphan project customer")
          db.projects[0].clientId = "qa-no-customer";
        const raw =
          corrupt === "malformed JSON" ? "{qa-broken-json" : JSON.stringify(db);
        await page.evaluate(
          (value) => localStorage.setItem("azzora-demo-v1", value),
          raw,
        );
        await page.reload();
        await expect(
          page
            .getByRole("alert")
            .filter({ hasText: /read-only|could not be loaded|incompatible/i })
            .first(),
        ).toBeVisible();
        await expect(page.locator("main h1").first()).toBeVisible();
        expect(await readOriginalExport(page)).toBe(raw);
        await page.goto(`${auditUrl}/#/customers`);
        await page
          .getByRole("button", { name: "Add New Customer", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByLabel("Customer/company name", { exact: true })
          .fill("QA must stay read-only");
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Save Customer", exact: true })
          .click();
        await expect(
          page
            .getByRole("alert")
            .filter({ hasText: /writes are disabled|read-only/i })
            .first(),
        ).toBeVisible();
        expect(
          await page.evaluate(() => localStorage.getItem("azzora-demo-v1")),
        ).toBe(raw);
      },
    );
  }
} finally {
  const failures = checks.filter((c) => c.status !== "passed");
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        ...manifest,
        finishedAt: new Date().toISOString(),
        checks,
        passed: checks.length - failures.length,
        failed: failures.length,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
const failures = checks.filter((c) => c.status !== "passed");
console.log(
  `${checks.length - failures.length} passed; ${failures.length} failed; kind=${kind}; source=${sourceSha}`,
);
if (failures.length)
  throw Error(
    `Strict critical gate failed: ${failures.map((c) => c.name + " at " + c.width).join("; ")}`,
  );
