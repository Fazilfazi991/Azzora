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
import { exportDemo } from "./agent-3-helpers.mjs";
import {
  quotationStep,
  openQuotationCategory,
  openQuotationItem,
} from "./quotation-ux-helpers.mjs";
// Unexecuted owner-request contract until actual hierarchy controls are handed
// off. Reconcile selectors with reviewed UI before source/test freeze.
const out =
  process.env.QA_HIERARCHY_EVIDENCE ||
  "docs/integration-evidence/final-ui-qa/preparatory-hierarchy";
fs.mkdirSync(out, { recursive: true });
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim(),
  sha = git("rev-parse", "HEAD");
const hash = (p) =>
  crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const frozen = Object.fromEntries(
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
  for (const [p, h] of Object.entries(frozen)) expect(hash(p)).toBe(h);
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
const browser = await chromium.launch(browserOptions),
  button = (p, name) => p.getByRole("button", { name, exact: true });
const data = (p) =>
    p.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1"))),
  id = (p) => p.evaluate(() => location.hash.split("/")[2]);
const record = async (p, quoteId) =>
  (await data(p)).quotations.find((q) => q.id === quoteId);
const childButton = (row) =>
  row.locator("xpath=..").getByRole("button", {
    name: "Add Child Item",
    exact: true,
  });
const pass = (width, name) =>
  result.checks.push({ width, name, status: "passed" });
async function total(p, amount) {
  await quotationStep(p, 2);
  await expect(p.getByTestId("grand-total")).toHaveText(amount);
  await quotationStep(p, 1);
}
async function shot(p, width, name) {
  await p.evaluate(async () => {
    await document.fonts.ready;
    scrollTo(0, 0);
  });
  const file = path.join(out, `${name}-${width}.png`);
  await p.screenshot({ path: file });
  result.images.push({ width, name, path: file, sha256: hash(file) });
}
async function pdf(p, width, name, expected) {
  const dialog = p.getByRole("dialog", {
    name: "Quotation preview",
    exact: true,
  });
  await button(p, "Preview Quotation").click();
  await expect(
    dialog.locator(".quotation-live-preview__sheet svg"),
  ).not.toHaveCount(0);
  for (const token of expected)
    expect(
      (await dialog.locator("svg").allTextContents())
        .join("")
        .replace(/\s/g, ""),
    ).toContain(token.replace(/\s/g, ""));
  await shot(p, width, name);
  await dialog
    .locator(".quotation-live-preview__page")
    .nth(1)
    .scrollIntoViewIfNeeded();
  await shot(p, width, `${name}-boq`);
  const ev = p.waitForEvent("download");
  await button(dialog, "Download PDF").click();
  const file = path.join(out, `${name}-${width}.pdf`);
  await (await ev).saveAs(file);
  const python =
    process.env.AZZORA_PYTHON ||
    "C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
  const parsed = JSON.parse(
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
  expect(parsed.pages).toBe(
    await dialog.locator(".quotation-live-preview__sheet").count(),
  );
  expect(parsed.text.every((t) => t.trim().length > 40)).toBe(true);
  for (const token of expected)
    expect(parsed.text.join("").replace(/\s/g, "")).toContain(
      token.replace(/\s/g, ""),
    );
  result.pdfs.push({
    width,
    name,
    path: file,
    sha256: hash(file),
    pages: parsed.pages,
  });
  await button(dialog, "Back to Editing").click();
}
function structure(section) {
  expect(new Set(section.rows.map((r) => r.id)).size).toBe(section.rows.length);
  expect(new Set(section.rows.map((r) => r.number)).size).toBe(
    section.rows.length,
  );
  let parentCount = 0,
    parent = null,
    childCount = 0;
  for (const row of section.rows) {
    if (!row.parentId) {
      parentCount++;
      parent = row;
      childCount = 0;
      expect(row.number).toBe(`2.${parentCount}`);
    } else {
      childCount++;
      expect(row.parentId).toBe(parent.id);
      expect(row.number).toBe(`${parent.number}.${childCount}`);
    }
  }
}
try {
  guard();
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => result.errors.push({ width, error: e.message }));
    p.on("console", (m) => {
      if (m.type() === "error") result.errors.push({ width, error: m.text() });
    });
    await p.goto(auditUrl + "/#/quotations");
    await button(p, "New quotation").click();
    const quoteId = await id(p);
    await selectQuotationCustomer(p, "client-0");
    await selectQuotationProject(p, "project-0");
    await p
      .locator("summary")
      .filter({ hasText: "Document snapshot details" })
      .click();
    await p
      .getByLabel("Job / Project Name on document", { exact: true })
      .fill(
        "Fictional Marina fit-out: painting and ceiling finishes across two occupied floors",
      );
    await p
      .getByLabel("Project Location on document", { exact: true })
      .fill(
        "Fictional Marina Tower, level 18, east and west residential wings, Dubai Marina, Dubai, UAE",
      );
    await quotationStep(p, 1);
    for (const name of ["Preliminaries", "Painting Works"]) {
      await button(p, "Add Work Category").click();
      const cat = p
        .getByTestId("quote-section")
        .nth(name === "Preliminaries" ? 0 : 1);
      await openQuotationCategory(cat);
      await cat.getByLabel("Work category name", { exact: true }).fill(name);
    }
    const cat = p.getByTestId("quote-section").nth(1);
    await openQuotationCategory(cat);
    expect((await record(p, quoteId)).sections[1].number).toBe("2");
    await button(cat, "Add Parent Work Description").click();
    let rows = cat.getByTestId("quote-line");
    await openQuotationItem(rows.nth(0));
    await rows.nth(0).locator(":scope > summary").click();
    await expect(rows.nth(0)).not.toHaveAttribute("open", "");
    await expect(childButton(rows.nth(0))).toBeVisible();
    await openQuotationItem(rows.nth(0));
    await rows
      .nth(0)
      .getByLabel("Description", { exact: true })
      .fill(
        "Supply and apply interior emulsion paint\nincluding surface preparation, protection of occupied rooms and final cleaning",
      );
    const childNames = ["Living Room", "Bedroom 1", "Bedroom 2"],
      quantities = ["40", "20", "25"];
    for (let i = 0; i < 3; i++) {
      await openQuotationItem(rows.nth(0));
      await childButton(rows.nth(0)).click();
      await openQuotationItem(rows.nth(i + 1));
      await rows
        .nth(i + 1)
        .getByLabel("Description", { exact: true })
        .fill(childNames[i]);
      await rows
        .nth(i + 1)
        .getByLabel("Quantity", { exact: true })
        .fill(quantities[i]);
      await rows
        .nth(i + 1)
        .getByLabel("Rate / Unit", { exact: true })
        .fill("35");
    }
    let section = (await record(p, quoteId)).sections[1];
    expect(section.rows.map((r) => r.number)).toEqual([
      "2.1",
      "2.1.1",
      "2.1.2",
      "2.1.3",
    ]);
    const firstIds = section.rows.map((r) => r.id);
    for (const child of section.rows.slice(1))
      expect(child.parentId).toBe(firstIds[0]);
    await total(p, "AED 3,123.75");
    pass(
      width,
      "category2 → nonpriced parent2.1 → three priced children2.1.1/2/3;2975net without parent double-charge",
    );
    await openQuotationCategory(cat);
    await button(cat, "Add Parent Work Description").click();
    await openQuotationItem(rows.nth(4));
    await rows.nth(4).locator(":scope > summary").click();
    await expect(rows.nth(4)).not.toHaveAttribute("open", "");
    await expect(childButton(rows.nth(4))).toBeVisible();
    await openQuotationItem(rows.nth(4));
    await rows
      .nth(4)
      .getByLabel("Description", { exact: true })
      .fill("Ceiling Painting");
    await childButton(rows.nth(4)).click();
    await openQuotationItem(rows.nth(5));
    await rows
      .nth(5)
      .getByLabel("Description", { exact: true })
      .fill("Living Room Ceiling");
    await rows.nth(5).getByLabel("Quantity", { exact: true }).fill("10");
    await rows.nth(5).getByLabel("Rate / Unit", { exact: true }).fill("20");
    section = (await record(p, quoteId)).sections[1];
    expect(section.rows[4].number).toBe("2.2");
    expect(section.rows[5].number).toBe("2.2.1");
    structure(section);
    await total(p, "AED 3,333.75");
    pass(
      width,
      "second parent2.2 andchild2.2.1;3175net/158.75VAT/3333.75gross",
    );
    for (const pricing of ["FOC", "By Client", "Excluded"]) {
      await openQuotationCategory(cat);
      await openQuotationItem(rows.nth(4));
      await childButton(rows.nth(4)).click();
      const index = (await record(p, quoteId)).sections[1].rows.length - 1;
      await openQuotationItem(rows.nth(index));
      await rows
        .nth(index)
        .getByLabel("Description", { exact: true })
        .fill("Special " + pricing);
      await rows
        .nth(index)
        .getByLabel("Pricing Type", { exact: true })
        .selectOption(pricing);
    }
    await total(p, "AED 3,333.75");
    structure((await record(p, quoteId)).sections[1]);
    pass(
      width,
      "FOC/By Client/Excluded descendants retain hierarchy and contribute zero",
    );
    await openQuotationCategory(cat);
    await openQuotationItem(rows.nth(2));
    await button(rows.nth(2), "Delete row").click();
    section = (await record(p, quoteId)).sections[1];
    expect(section.rows[2].id).toBe(firstIds[3]);
    expect(section.rows[2].number).toBe("2.1.2");
    await openQuotationItem(rows.nth(0));
    await childButton(rows.nth(0)).click();
    section = (await record(p, quoteId)).sections[1];
    const insertedIndex = section.rows.findIndex(
      (r) =>
        r.parentId === firstIds[0] &&
        ![firstIds[1], firstIds[3]].includes(r.id),
    );
    expect(insertedIndex).toBe(3);
    await openQuotationItem(rows.nth(insertedIndex));
    await rows
      .nth(insertedIndex)
      .getByLabel("Description", { exact: true })
      .fill("Inserted replacement bedroom");
    await rows
      .nth(insertedIndex)
      .getByLabel("Quantity", { exact: true })
      .fill("20");
    await rows
      .nth(insertedIndex)
      .getByLabel("Rate / Unit", { exact: true })
      .fill("35");
    await rows
      .nth(insertedIndex)
      .getByRole("button", { name: /Move row .* up/ })
      .click();
    section = (await record(p, quoteId)).sections[1];
    structure(section);
    expect(section.rows[1].id).toBe(firstIds[1]);
    expect(section.rows[3].id).toBe(firstIds[3]);
    await total(p, "AED 3,333.75");
    pass(
      width,
      "delete/insert/reorder child renumbers deterministically and keeps surviving internal IDs",
    );
    await openQuotationCategory(cat);
    await openQuotationItem(rows.nth(0));
    await rows
      .nth(0)
      .getByRole("button", { name: "Duplicate parent & children", exact: true })
      .click();
    section = (await record(p, quoteId)).sections[1];
    structure(section);
    const parents = section.rows.filter((r) => !r.parentId);
    expect(parents).toHaveLength(3);
    const duplicate = parents[1];
    const duplicateChildren = section.rows.filter(
      (r) => r.parentId === duplicate.id,
    );
    expect(duplicateChildren).toHaveLength(3);
    expect(duplicateChildren.map((r) => r.description)).toEqual(
      section.rows
        .filter((r) => r.parentId === firstIds[0])
        .map((r) => r.description),
    );
    expect(duplicateChildren.every((r) => !firstIds.includes(r.id))).toBe(true);
    await total(p, "AED 6,457.50");
    await openQuotationCategory(cat);
    let secondIndex = section.rows.findIndex((r) => r.id === parents[2].id);
    await openQuotationItem(rows.nth(secondIndex));
    await rows
      .nth(secondIndex)
      .getByRole("button", { name: /Move row .* up/ })
      .click();
    section = (await record(p, quoteId)).sections[1];
    structure(section);
    expect(section.rows.filter((r) => !r.parentId).map((r) => r.id)).toEqual([
      firstIds[0],
      parents[2].id,
      duplicate.id,
    ]);
    const duplicateIndex = section.rows.findIndex((r) => r.id === duplicate.id);
    const duplicateNumber = section.rows[duplicateIndex].number;
    await openQuotationItem(rows.nth(duplicateIndex));
    await rows
      .nth(duplicateIndex)
      .getByRole("button", { name: "Delete parent & children", exact: true })
      .click();
    const removal = p.getByRole("dialog", {
      name: `Delete parent ${duplicateNumber} and its 3 child item(s)?`,
      exact: true,
    });
    await expect(removal).toBeVisible();
    await button(removal, "Cancel").click();
    expect((await record(p, quoteId)).sections[1].rows).toEqual(section.rows);
    await rows
      .nth(duplicateIndex)
      .getByRole("button", { name: "Delete parent & children", exact: true })
      .click();
    await button(removal, "Confirm").click();
    section = (await record(p, quoteId)).sections[1];
    structure(section);
    expect(
      section.rows.some(
        (r) => r.id === duplicate.id || r.parentId === duplicate.id,
      ),
    ).toBe(false);
    await total(p, "AED 3,333.75");
    pass(
      width,
      "duplicate andmove parent operate oncomplete contiguous subtree withnew IDs;delete removesonlyduplicate group",
    );
    await button(p, "Save Draft").click();
    const saved = await record(p, quoteId);
    await p.reload();
    expect(await record(p, quoteId)).toEqual(saved);
    await quotationStep(p, 1);
    await openQuotationCategory(cat);
    structure(saved.sections[1]);
    await shot(p, width, "hierarchy-editor");
    const hierarchyImage = path.join(out, `hierarchy-boq-${width}.png`);
    await cat.screenshot({
      path: hierarchyImage,
      style: ".topbar, .mobile-nav { visibility: hidden !important; }",
    });
    result.images.push({
      width,
      name: "hierarchy-boq",
      path: hierarchyImage,
      sha256: hash(hierarchyImage),
    });
    await pdf(p, width, "hierarchy-client-preview", [
      "2.1",
      "2.1.1",
      "2.1.2",
      "2.1.3",
      "2.2",
      "2.2.1",
      "Living Room",
      "Fictional Marina Tower",
      "surface preparation",
      "3,333.75",
    ]);
    expect(await record(p, quoteId)).toEqual(saved);
    pass(
      width,
      "save/reload preservesIDs/hierarchy;realSVG/downloadnumbering andtotals agree",
    );
    await context.close();
    guard();
  }
  const fixturePath =
    process.env.QA_HISTORICAL_FIXTURE ||
    "docs/integration-evidence/final-ui-qa/before/historical-issued-reference.json";
  const authentic = fs.existsSync(fixturePath)
    ? JSON.parse(fs.readFileSync(fixturePath))
    : null;
  if (process.env.QA_HISTORICAL_FIXTURE && !authentic)
    throw Error(`Historical fixture not found: ${fixturePath}`);
  if (authentic)
    expect(hash(fixturePath)).toBe(
      "dbd5a18d900d7a5853a477abf5a88ee21048ffc643ca002972645c702c227926",
    );
  result.historicalFixture = authentic
    ? {
        path: fixturePath,
        sha256: hash(fixturePath),
        origin:
          "Published aebd068 base; public-UI finalized reference before implementation",
      }
    : {
        origin:
          "Reconstructed fictional issued record from the app's existing seeded reference",
        limitation:
          "Authentic old-issued migration needs QA_HISTORICAL_FIXTURE pointing to the ignored published-base export.",
      };
  for (const width of [1440, 1024, 768, 390]) {
    const c = await browser.newContext({ viewport: { width, height: 1000 } });
    const p = await c.newPage();
    const current = await exportDemo(p);
    const historical = authentic
      ? authentic.quotations.find((q) => q.id === "quotation-reference")
      : (() => {
          const seed = current.quotations.find(
            (q) => q.id === "quotation-reference",
          );
          expect(seed).toBeTruthy();
          const issued = structuredClone(seed);
          const date = "2026-10-14T11:57:20.345Z";
          issued.status = "Finalized";
          issued.finalizedAt = date;
          issued.history.push({
            date,
            action: "Draft → Finalized",
            notes:
              "Fictional regression record derived from the seeded reference",
            snapshot: JSON.stringify(seed),
          });
          return issued;
        })();
    expect(historical.status).toBe("Finalized");
    expect(current.clients.some((x) => x.id === historical.customerId)).toBe(
      true,
    );
    expect(current.projects.some((x) => x.id === historical.projectId)).toBe(
      true,
    );
    current.quotations = current.quotations
      .filter((x) => x.id !== historical.id)
      .concat(historical);
    await c.addInitScript(
      (db) => localStorage.setItem("azzora-demo-v1", JSON.stringify(db)),
      current,
    );
    await p.goto("about:blank");
    await p.goto(auditUrl + "/#/quotations/quotation-reference/edit");
    expect(await record(p, historical.id)).toEqual(historical);
    await quotationStep(p, 1);
    await pdf(p, width, "historical-issued-reference", [
      "Demolition",
      "Tiling",
      "Gypsum",
      "Plumbing",
      "210,336.79",
    ]);
    expect(await record(p, historical.id)).toEqual(historical);
    await p.reload();
    expect(await record(p, historical.id)).toEqual(historical);
    pass(
      width,
      "oldissued reference/manualnumbers/historysnapshots remain unchanged throughnew preview/download/reload",
    );
    await c.close();
    guard();
  }
  expect(result.errors).toEqual([]);
  result.status = "passed";
  console.log(`PASS: ${result.checks.length} hierarchy regression groups.`);
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
