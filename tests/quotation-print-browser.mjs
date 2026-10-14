import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { browserOptions } from "./browser-runtime.mjs";

const url =
  process.env.AZZORA_URL ||
  process.env.AZZORA_TEST_URL ||
  "http://127.0.0.1:5189";
const output =
  process.env.AZZORA_PRINT_EVIDENCE || "docs/agent-2-print-evidence/verified";
const bundledPython =
  "C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const python =
  process.env.AZZORA_PYTHON ||
  (fs.existsSync(bundledPython) ? bundledPython : "python");
const inspectPdf = (file) =>
  JSON.parse(
    execFileSync(
      python,
      [
        "-X",
        "utf8",
        "-c",
        `
import json,sys
from pypdf import PdfReader
r=PdfReader(sys.argv[1])
pages=[]
for p in r.pages:
    fonts=sorted(set(str(v.get_object().get('/BaseFont','')) for v in p.get('/Resources',{}).get('/Font',{}).values()))
    pages.append({'text':p.extract_text() or '', 'width':float(p.mediabox.width), 'height':float(p.mediabox.height), 'fonts':fonts})
print(json.dumps({'pages':len(pages),'pageDetails':pages}))
`,
        path.resolve(file),
      ],
      { encoding: "utf8" },
    ),
  );
const normalize = (text) => text.normalize("NFKC").replace(/\s+/g, "");
const fileHash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const browser = await chromium.launch(browserOptions);
const records = [],
  errors = [],
  failures = [];
fs.mkdirSync(output, { recursive: true });
let completed = false;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    const page = await context.newPage();
    function watch(target) {
      target.on("pageerror", (e) => errors.push({ width, message: e.message }));
      target.on("console", (m) => {
        if (m.type() === "error") errors.push({ width, message: m.text() });
      });
      target.on("response", (r) => {
        if (r.status() >= 400)
          errors.push({ width, message: `${r.status()} ${r.url()}` });
      });
    }
    watch(page);
    await page.goto(`${url}/#/quotations/quotation-reference/preview`);
    await expect(page.locator(".quote-sheet")).toHaveCount(7);
    const cases = [
      {
        kind: "reference",
        expectedPages: 7,
        amounts: ["200,320.75", "10,016.04", "210,336.79"],
      },
    ];
    for (let index = 0; index < 2; index++) {
      if (index === 1) {
        await page.goto(`${url}/#/quotations`);
        await page
          .getByRole("button", { name: "New quotation", exact: true })
          .click();
        await page
          .getByLabel("Linked Project", { exact: true })
          .selectOption("project-0");
        await page
          .getByLabel("Job / Project Name", { exact: true })
          .fill(`QA Native Print Workflow ${width}`);
        await page
          .getByLabel("Project Location", { exact: true })
          .fill("Dubai QA site");
        await page
          .getByRole("button", { name: "Add section", exact: true })
          .click();
        const section = page.getByTestId("quote-section").first();
        await section
          .getByLabel("Section description", { exact: true })
          .fill("Coordinated ceiling works");
        await section
          .getByRole("button", { name: "Add line", exact: true })
          .click();
        const row = section.getByTestId("quote-line").first();
        await row
          .getByLabel("Description", { exact: true })
          .fill("Native print regression line");
        await row.getByLabel("Quantity", { exact: true }).fill("2.5");
        await row.getByLabel("Rate / Unit", { exact: true }).fill("90");
        await expect(page.getByTestId("grand-total")).toHaveText("AED 236.25");
        await page
          .getByRole("button", { name: "Finalize", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Confirm", exact: true })
          .click();
        await page
          .getByLabel("Issued quotation status", { exact: true })
          .selectOption("Accepted");
        await expect(
          page.getByLabel("Issued quotation status", { exact: true }),
        ).toBeDisabled();
        await page
          .getByRole("button", { name: "Preview", exact: true })
          .click();
        await expect(page.locator(".quote-sheet")).toHaveCount(3);
        cases.push({
          kind: "workflow-accepted",
          expectedPages: 3,
          amounts: ["225.00", "11.25", "236.25"],
        });
      }
      const current = cases[index];
      const sheets = await page.locator(".quote-sheet").count();
      const savedBefore = await page.evaluate(() =>
        localStorage.getItem("azzora-demo-v1"),
      );
      const popupPromise = page.waitForEvent("popup");
      // This invokes the application Print action unchanged: no injected print CSS,
      // no replaced print function, and no mocked Page.pdf or fabricated PDF data.
      await page.getByRole("button", { name: "Print", exact: true }).click();
      const popup = await popupPromise;
      watch(popup);
      await popup.waitForLoadState("load");
      await popup.evaluate(() => document.fonts.ready);
      await popup.waitForLoadState("networkidle");
      await expect(popup.locator(".sheet")).toHaveCount(current.expectedPages);
      const geometry = await popup
        .locator(".sheet")
        .evaluateAll((elements) =>
          elements.map((el) => ({
            height: el.getBoundingClientRect().height,
            scrollHeight: el.scrollHeight,
            svgDisplay: getComputedStyle(el.querySelector("svg")).display,
          })),
        );
      const nativePath = `${output}/${current.kind}-native-${width}.pdf`;
      await popup.pdf({
        path: nativePath,
        printBackground: true,
        preferCSSPageSize: true,
      });
      await popup.close();
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download PDF", exact: true })
        .click();
      const download = await downloadPromise;
      expect(await download.failure()).toBeNull();
      const downloadPath = `${output}/${current.kind}-download-${width}.pdf`;
      await download.saveAs(downloadPath);
      const native = inspectPdf(nativePath),
        downloaded = inspectPdf(downloadPath);
      const savedAfter = await page.evaluate(() =>
        localStorage.getItem("azzora-demo-v1"),
      );
      const record = {
        ...current,
        width,
        renderedSheets: sheets,
        popupSheets: geometry.length,
        geometry,
        nativeFile: nativePath,
        nativeSha256: fileHash(nativePath),
        native,
        downloadFile: downloadPath,
        downloadSha256: fileHash(downloadPath),
        downloaded,
        savedDataUnchanged: savedAfter === savedBefore,
        passed: false,
      };
      records.push(record);
      try {
        // Actual PDF parser counts, not just DOM sheets, are the regression boundary.
        expect(
          native.pages,
          `${current.kind} ${width}: native page count`,
        ).toBe(sheets);
        expect(native.pages).toBe(current.expectedPages);
        expect(downloaded.pages).toBe(current.expectedPages);
        for (const [label, pdf] of [
          ["native", native],
          ["download", downloaded],
        ]) {
          for (const [pageIndex, printed] of pdf.pageDetails.entries()) {
            expect(
              printed.text.trim().length,
              `${label} page ${pageIndex + 1} must contain content`,
            ).toBeGreaterThan(40);
            expect(normalize(printed.text)).toContain(`Page${pageIndex + 1}`);
            expect(Math.abs(printed.width - 595.28)).toBeLessThan(1);
            expect(Math.abs(printed.height - 841.89)).toBeLessThan(1);
          }
          const text = normalize(pdf.pageDetails.map((p) => p.text).join("\n"));
          expect(text).toContain("AZZORA");
          for (const amount of current.amounts)
            expect(text, `${label} retains ${amount}`).toContain(amount);
        }
        expect(
          savedAfter,
          "Printing/downloading must preserve saved quotation and accepted history bytes",
        ).toBe(savedBefore);
        record.passed = true;
        console.log(
          `PASS ${current.kind} ${width}: ${native.pages} native / ${downloaded.pages} downloaded pages; all pages nonblank; saved data unchanged`,
        );
      } catch (error) {
        record.failure = String(error);
        failures.push(record.failure);
        console.log(
          `FAIL ${current.kind} ${width}: ${native.pages} native / ${downloaded.pages} downloaded pages; expected ${current.expectedPages}`,
        );
      }
    }
    await context.close();
  }
  expect(errors).toEqual([]);
  expect(
    failures,
    "Every native print case must pass ordinary assertions",
  ).toEqual([]);
  completed = true;
} finally {
  fs.writeFileSync(
    `${output}/pdf-results.json`,
    JSON.stringify(
      {
        url,
        runAt: new Date().toISOString(),
        completed,
        records,
        errors,
        failures,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
