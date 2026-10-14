import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import {
  selectQuotationCustomer,
  selectQuotationProject,
} from "./quotation-picker-helpers.mjs";
import {
  quotationStep,
  quotationAdvanced,
  openQuotationCategory,
  openQuotationItem,
} from "./quotation-ux-helpers.mjs";
// Preparation contract: exact preview labels/selectors must be reconciled with
// the completed owner implementation before combined source/test freeze.
const out =
  process.env.QA_LIVE_PREVIEW_EVIDENCE ||
  "docs/integration-evidence/final-ui-qa/preparatory-live-preview";
fs.mkdirSync(out, { recursive: true });
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const hash = (p) =>
  crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sha = git("rev-parse", "HEAD"),
  frozen = Object.fromEntries(
    git(
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
      .filter(Boolean)
      .map((p) => [p, hash(p)]),
  );
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
const result = {
  sha,
  kind: process.env.QA_RUN_KIND || "preparatory",
  url: auditUrl,
  startedAt: new Date().toISOString(),
  checks: [],
  images: [],
  pdfs: [],
  errors: [],
};
const browser = await chromium.launch(browserOptions);
const raw = (p) => p.evaluate(() => localStorage.getItem("azzora-demo-v1"));
const qid = (p) => p.evaluate(() => location.hash.split("/")[2]);
const db = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1")));
const button = (p, name) => p.getByRole("button", { name, exact: true });
const preview = (p) =>
  p.getByRole("dialog", { name: "Quotation preview", exact: true });
const pass = (width, name) =>
  result.checks.push({ width, name, status: "passed" });
async function shot(p, width, name) {
  await p.evaluate(async () => {
    await document.fonts.ready;
    scrollTo(0, 0);
  });
  const file = path.join(out, `${name}-${width}.png`);
  await p.screenshot({ path: file });
  result.images.push({ width, name, path: file, sha256: hash(file) });
}
async function open(p) {
  const opener = button(p, "Preview Quotation");
  await expect(opener).toHaveCount(1);
  await opener.focus();
  await p.keyboard.press("Enter");
  await expect(preview(p)).toBeVisible();
  await expect(
    preview(p).locator(".quotation-live-preview__sheet svg"),
  ).not.toHaveCount(0);
  return opener;
}
async function close(p, opener, step, before, escape = false) {
  if (escape) await p.keyboard.press("Escape");
  else await button(preview(p), "Back to Editing").click();
  await expect(preview(p)).toHaveCount(0);
  await expect(opener).toBeFocused();
  const nav = p.getByRole("navigation", {
    name: "Quotation steps",
    exact: true,
  });
  await expect(nav.getByRole("button").nth(step)).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(await raw(p)).toBe(before);
}
async function exportPdf(p, width, name, expected) {
  const scope = preview(p),
    pages = await scope.locator(".quotation-live-preview__sheet").count();
  const event = p.waitForEvent("download");
  await button(scope, "Download PDF").click();
  const file = path.join(out, `${name}-${width}.pdf`);
  await (await event).saveAs(file);
  const python =
    process.env.AZZORA_PYTHON ||
    "C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
  const data = JSON.parse(
    execFileSync(
      python,
      [
        "-c",
        "import json,sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print(json.dumps({'pages':len(r.pages),'text':[p.extract_text() or '' for p in r.pages]}))",
        file,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(data.pages).toBe(pages);
  expect(data.text.every((t) => t.trim().length > 40)).toBe(true);
  for (const token of expected)
    expect(data.text.join("").replace(/\s/g, "")).toContain(
      token.replace(/\s/g, ""),
    );
  result.pdfs.push({ width, name, path: file, sha256: hash(file), pages });
  return pages;
}
try {
  guard();
  for (const width of [1440, 1024, 768, 390]) {
    const c = await browser.newContext({ viewport: { width, height: 1000 } });
    await c.addInitScript(() => (window.print = () => {}));
    const p = await c.newPage();
    let expectedAssetAbort = false;
    p.on("pageerror", (e) => result.errors.push({ width, error: e.message }));
    p.on("console", (m) => {
      if (m.type() !== "error") return;
      if (
        expectedAssetAbort &&
        /quotation\/logo\.png|ERR_FAILED/.test(m.text())
      )
        return;
      result.errors.push({ width, error: m.text() });
    });
    await p.goto(auditUrl + "/#/quotations");
    await button(p, "New quotation").click();
    const id = await qid(p);
    await quotationStep(p, 1);
    const empty = await raw(p);
    await button(p, "View Example").click();
    await expect(p.getByRole("dialog")).toContainText(/fictional/i);
    await p.keyboard.press("Escape");
    expect(await raw(p)).toBe(empty);
    let opener = await open(p);
    await expect(preview(p)).toContainText("DRAFT / NOT ISSUED");
    await shot(p, width, "empty-draft-real-preview");
    await close(p, opener, 1, empty, true);
    expect((await db(p)).quotations.find((q) => q.id === id).status).toBe(
      "Draft",
    );
    expect(
      (await db(p)).quotations.find((q) => q.id === id).issuedAt,
    ).toBeUndefined();
    pass(
      width,
      "empty/incomplete real draft preview and separate fictional example preserve inputs, step, focus and unissued status",
    );
    await quotationStep(p, 0);
    await selectQuotationCustomer(p, "client-0");
    await selectQuotationProject(p, "project-0");
    await p
      .locator("summary")
      .filter({ hasText: "Document snapshot details" })
      .click();
    const name = "Fictional QA live preview " + width;
    await p
      .getByLabel("Job / Project Name on document", { exact: true })
      .fill(name);
    await p
      .getByLabel("Project Location on document", { exact: true })
      .fill("Dubai fictional QA site");
    const data = [
      ["Painting", "40", "35"],
      ["Flooring", "25", "90"],
      ["Joinery", "2", "650"],
    ];
    const desc =
      "Supply and coordinate interior fit-out finishes; protect adjoining surfaces, confirm setting-out and finish transitions with the site team. ".repeat(
        8,
      ) + "END OF CURRENT UNSAVED DESCRIPTION";
    await quotationStep(p, 1);
    for (let i = 0; i < data.length; i++) {
      await button(p, "Add Work Category").click();
      const cat = p.getByTestId("quote-section").nth(i);
      await openQuotationCategory(cat);
      await cat
        .getByLabel("Work category name", { exact: true })
        .fill(data[i][0]);
      await button(cat, "Add Direct Priced Item").click();
      const item = cat.getByTestId("quote-line");
      await openQuotationItem(item);
      await item
        .getByLabel("Description", { exact: true })
        .fill(desc + " " + data[i][0]);
      await item.getByLabel("Quantity", { exact: true }).fill(data[i][1]);
      await item.getByLabel("Rate / Unit", { exact: true }).fill(data[i][2]);
    }
    await quotationStep(p, 2);
    await p.getByLabel("Quotation discount AED", { exact: true }).fill("150");
    await p.getByLabel("VAT enabled", { exact: true }).check();
    await p.getByLabel("VAT percentage", { exact: true }).fill("5");
    await expect(p.getByTestId("grand-total")).toHaveText("AED 5,040.00");
    await quotationStep(p, 3);
    for (let i = 0; i < 3; i++) {
      await p
        .getByLabel("Payment percentage", { exact: true })
        .nth(i)
        .fill(["50", "40", "10"][i]);
      await p
        .getByLabel("Payment description", { exact: true })
        .nth(i)
        .fill(["Advance on acceptance", "Progress inspection", "Handover"][i]);
    }
    const term = p.getByLabel("Term text", { exact: true }).nth(0),
      details = term.locator("xpath=ancestor::details[1]");
    if ((await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
    await term.fill(
      "FICTIONAL CURRENT LIVE PREVIEW TERMS: coordinate access and obtain approval before work.",
    );
    const snapshot = await raw(p),
      quote = (await db(p)).quotations.find((q) => q.id === id);
    expect(quote.status).toBe("Draft");
    expect(quote.issuedAt).toBeUndefined();
    for (let step = 0; step < 5; step++) {
      await quotationStep(p, step);
      opener = await open(p);
      const surface = preview(p);
      await expect(surface).toContainText("DRAFT / NOT ISSUED");
      const svg = await surface
          .locator(".quotation-live-preview__sheet svg")
          .allTextContents(),
        text = svg.join("").replace(/\s/g, "");
      for (const token of [
        name,
        "END OF CURRENT UNSAVED DESCRIPTION",
        "4,950.00",
        "150.00",
        "240.00",
        "5,040.00",
        "Advance on acceptance",
        "Progress inspection",
        "Handover",
        "FICTIONAL CURRENT LIVE PREVIEW TERMS",
      ])
        expect(text).toContain(token.replace(/\s/g, ""));
      expect(
        await surface.locator(".quotation-live-preview__sheet").count(),
      ).toBeGreaterThanOrEqual(3);
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (step === 1) {
        await shot(p, width, "current-boq-live-preview");
        const count = await exportPdf(p, width, "current-draft", [
          "5,040.00",
          "END OF CURRENT UNSAVED DESCRIPTION",
          "FICTIONAL CURRENT LIVE PREVIEW TERMS",
        ]);
        const ev = p.waitForEvent("popup");
        await button(surface, "Print").click();
        const popup = await ev;
        await popup.waitForLoadState();
        await expect(popup.locator(".sheet")).toHaveCount(count);
        const native = path.join(out, `current-native-${width}.pdf`);
        await popup.pdf({
          path: native,
          preferCSSPageSize: true,
          printBackground: true,
        });
        result.pdfs.push({
          width,
          name: "native",
          path: native,
          sha256: hash(native),
          pages: count,
        });
        await popup.close();
        if (width === 390) {
          expectedAssetAbort = true;
          await p.route("**/assets/quotation/logo.png", (route) =>
            route.abort(),
          );
          await button(surface, "Download PDF").click();
          await expect(surface.getByRole("alert")).toContainText(
            "Could not download the quotation PDF.",
          );
          await p.unroute("**/assets/quotation/logo.png");
          expectedAssetAbort = false;
          await expect(button(surface, "Download PDF")).toBeEnabled();
          await p.evaluate(() => {
            window.__qaOriginalOpen = window.open;
            window.open = () => null;
          });
          await button(surface, "Print").click();
          await expect(surface.getByRole("alert")).toContainText(
            "Could not print the quotation.",
          );
          await p.evaluate(() => {
            window.open = window.__qaOriginalOpen;
            delete window.__qaOriginalOpen;
          });
          await expect(button(surface, "Print")).toBeEnabled();
          pass(
            width,
            "failed PDF asset and blocked print popup show recoverable errors without changing draft",
          );
        }
      }
      await close(p, opener, step, snapshot, step % 2 === 0);
      expect((await db(p)).quotations.find((q) => q.id === id)).toEqual(quote);
      pass(
        width,
        `Step${step + 1} current-data SVG preview; all amounts/BOQ/terms; close restores exact step/opener/saved data`,
      );
    }
    await quotationStep(p, 1);
    const cat = p.getByTestId("quote-section").nth(0);
    await openQuotationCategory(cat);
    const row = cat.getByTestId("quote-line");
    await openQuotationItem(row);
    await expect(row.getByLabel("Description", { exact: true })).toHaveValue(
      desc + " Painting",
    );
    await expect(row.getByLabel("Quantity", { exact: true })).toHaveValue("40");
    await expect(row.getByLabel("Rate / Unit", { exact: true })).toHaveValue(
      "35",
    );
    await p.reload();
    await quotationStep(p, 2);
    await expect(p.getByTestId("grand-total")).toHaveText("AED 5,040.00");
    expect((await db(p)).quotations.find((q) => q.id === id)).toEqual(quote);
    pass(
      width,
      "no explicit Save Draft/issuance needed; long draft input and full data survive preview/download/print/reload",
    );
    await c.close();
    guard();
  }
  expect(result.errors).toEqual([]);
  result.status = "passed";
  console.log(`PASS: ${result.checks.length} independent live-preview groups.`);
} catch (error) {
  result.status = "failed";
  result.failure = String(error);
  throw error;
} finally {
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(out, "browser-results.json"),
    JSON.stringify(result, null, 2),
  );
  await browser.close();
}
