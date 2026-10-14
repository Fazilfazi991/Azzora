import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions } from "./browser-runtime.mjs";
const url = process.env.AZZORA_URL || "http://127.0.0.1:5173";
const out = "docs/agent-1-corrective-evidence";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(browserOptions),
  checks = [],
  errors = [];
let failure;
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      }),
      page = await context.newPage();
    const record = (name) => checks.push({ width, name, status: "passed" });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const go = (route) => page.goto(`${url}/#/${route}`),
      button = (name) => page.getByRole("button", { name, exact: true }),
      label = (name) => page.getByLabel(name, { exact: true });
    const dialog = () => page.getByRole("dialog").last(),
      dlabel = (name) => dialog().getByLabel(name, { exact: true }),
      dbutton = (name) => dialog().getByRole("button", { name, exact: true });
    const saved = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1")));
    await go("dashboard");
    await expect(page.locator("main h1")).toHaveText("Executive Overview");
    await page.bringToFront();
    await page.keyboard.press("Tab");
    const firstFocus = await page.evaluate(() => {
        const active = document.activeElement,
          r = active.getBoundingClientRect();
        return {
          tag: active.tagName,
          text: active.textContent?.trim().slice(0, 80),
          rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
          visible:
            r.left >= 0 &&
            r.right <= innerWidth &&
            r.top >= 0 &&
            r.bottom <= innerHeight,
        };
      });
    expect(firstFocus.visible, JSON.stringify({ width, firstFocus })).toBe(true);
    expect(await page.locator(".sidebar").evaluate((el) => el.inert)).toBe(
      width < 768,
    );
    record(
      "initial Tab reaches a visible control; closed mobile navigation is inert",
    );
    const contrast = await page
      .locator(".badge.warn")
      .evaluateAll((elements) => {
        const luminance = (color) => {
          const rgb = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((n) => n / 255)
            .map((n) =>
              n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
            );
          return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        };
        return elements.map((el) => {
          const style = getComputedStyle(el),
            a = luminance(style.color),
            b = luminance(style.backgroundColor);
          return {
            text: el.textContent,
            foreground: style.color,
            background: style.backgroundColor,
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          };
        });
      });
    expect(contrast.length).toBeGreaterThan(0);
    expect(contrast.every((row) => row.ratio >= 4.5)).toBe(true);
    fs.writeFileSync(
      `${out}/contrast-${width}.json`,
      JSON.stringify(contrast, null, 2),
    );
    record("every rendered warning badge meets normal-text 4.5:1 contrast");
    if (width < 768) {
      const open = button("Open navigation");
      await open.click();
      await expect(page.locator(".sidebar .brand")).toBeFocused();
      await expect(page.locator(".main-shell")).toHaveAttribute("inert", "");
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator(".sidebar footer a")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.locator(".sidebar .brand")).toBeFocused();
      await page.screenshot({ path: `${out}/mobile-navigation.png` });
      await page.keyboard.press("Escape");
      await expect(open).toBeFocused();
      await expect(open).toHaveAttribute("aria-expanded", "false");
      record(
        "mobile navigation contains keyboard focus and Escape restores its opener",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await button("More").click();
      await expect
        .poll(() =>
          page
            .locator(".sidebar .brand")
            .evaluate((el) => el.getBoundingClientRect().left >= 0),
        )
        .toBe(true);
      await button("Close navigation").click({
        position: { x: width - 10, y: 300 },
      });
      await expect(button("More")).toBeFocused();
      record(
        "normal-motion bottom navigation opens the same menu and backdrop close restores More",
      );
      await open.click();
      await page.setViewportSize({ width: 1024, height: 900 });
      await expect(page.locator(".sidebar")).not.toHaveAttribute("inert", "");
      await expect(page.locator(".main-shell")).not.toHaveAttribute(
        "inert",
        "",
      );
      await expect(page.locator(".sidebar .brand")).toBeVisible();
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
      record(
        "viewport changes restore desktop navigation and close the mobile menu",
      );
    }
    await page.screenshot({ path: `${out}/dashboard-${width}.png` });
    await go("tasks");
    await button("+ Create Task").click();
    await dbutton("Save Changes").click();
    await expect(dlabel("Task name")).toBeFocused();
    const geometry = () =>
      dlabel("Task name").evaluate((el) => {
        const field = el.getBoundingClientRect(),
          head = el
            .closest("dialog")
            .querySelector(".modal-head")
            .getBoundingClientRect();
        return {
          top: field.top,
          bottom: field.bottom,
          headerBottom: head.bottom,
          valid: el.validity.valid,
        };
      });
    await expect
      .poll(async () => {
        const g = await geometry();
        return g.top >= g.headerBottom + 8 && g.bottom <= 900;
      })
      .toBe(true);
    expect((await geometry()).valid).toBe(false);
    fs.writeFileSync(
      `${out}/invalid-field-${width}.json`,
      JSON.stringify(await geometry(), null, 2),
    );
    await page.screenshot({ path: `${out}/invalid-field-${width}.png` });
    record(
      "native validation scrolls the invalid task name below its sticky heading",
    );
    await page.keyboard.press("Tab");
    expect(
      await dialog().evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await dlabel("Notes").focus();
    expect(
      await dlabel("Notes").evaluate((el) => {
        const r = el.getBoundingClientRect(),
          head = el
            .closest("dialog")
            .querySelector(".modal-head")
            .getBoundingClientRect();
        return r.top >= head.bottom && r.bottom <= innerHeight;
      }),
    ).toBe(true);
    await page.keyboard.press("Escape");
    record("keyboard focus remains visible in the scrolling task drawer");
    await button("Quick Add").click();
    await dbutton("+ New Invoice").click();
    await dlabel("Invoice customer").selectOption("client-0");
    await dbutton("Add invoice item").click();
    await dbutton("Add invoice item").click();
    for (let index = 1; index <= 3; index++) {
      await dlabel(`Item ${index} description`).fill(`Rounding row ${index}`);
      await dlabel(`Item ${index} rate`).fill("0.01");
      await dlabel(`Item ${index} tax treatment`).selectOption("Inclusive");
    }
    await dlabel("Invoice discount AED").fill("0.02");
    await dbutton("Save Draft Invoice").click();
    await button("Issue Invoice").click();
    let db = await saved();
    const invoice = db.invoices[0],
      snapshot = JSON.stringify(invoice.snapshot);
    expect(invoice.snapshot).toMatchObject({ net: "1", vat: "0", grand: "1" });
    await page.screenshot({
      path: `${out}/one-fils-invoice-${width}.png`,
      fullPage: true,
    });
    record(
      "three one-fils Inclusive rows with two-fils discount save and issue with zero VAT",
    );
    await button("Record Payment").click();
    await dlabel("Payment amount AED").fill("0.01");
    await dlabel("Payment reference").fill("ONE-FILS-RECEIPT");
    await dbutton("Post Receipt").click();
    await go("accounts/credit-notes");
    await button("New Credit Note").click();
    await dlabel("Credit invoice").selectOption(invoice.id);
    await dlabel("Credit item adjustment").selectOption(invoice.lines[0].id);
    await dlabel("Gross credit amount AED").fill("0.01");
    await dlabel("Credit reason").fill("Return the remaining discounted item");
    await dbutton("Save Credit Note").click();
    await button("Submit Credit Note").click();
    await label("Decision comments").fill("One-fils item and VAT reconciled");
    await button("Approve").click();
    await button("Issue Credit Note").click();
    await button("Record Customer Refund").click();
    await dlabel("Refund amount AED").fill("0.01");
    await dlabel("Refund reference").fill("ONE-FILS-REFUND");
    await dlabel("Refund reason").fill("Return valid customer credit");
    await dbutton("Post Customer Refund").click();
    db = await saved();
    expect(db.operations.credits[0]).toMatchObject({
      net: "1",
      vat: "0",
      status: "Issued",
    });
    expect(db.operations.refunds[0].amount).toBe("0.01");
    expect(db.payments[0].amount).toBe("0.01");
    expect(JSON.stringify(db.invoices[0].snapshot)).toBe(snapshot);
    await go("customers/client-0/statement");
    await expect(
      page.locator("tbody tr").last().locator("td").last(),
    ).toHaveText("0.00");
    record(
      "item credit and valid refund reconcile the one-fils receipt without changing its invoice snapshot",
    );
    const before = await saved();
    await page.reload();
    expect(await saved()).toEqual(before);
    record("corrected financial transactions persist through reload");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    record("corrected customer statement stays within the viewport");
    await context.close();
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    `PASS: ${checks.length} corrective financial/accessibility browser checks; no browser errors.`,
  );
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  fs.writeFileSync(
    `${out}/browser-results.json`,
    JSON.stringify({ checks, errors, failure }, null, 2),
  );
  await browser.close();
}
