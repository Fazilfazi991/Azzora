import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium, expect as baseExpect } from "@playwright/test";
import { jsPDF } from "jspdf";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { browserOptions } from "./browser-runtime.mjs";

globalThis.DOMMatrix ??= DOMMatrix;
globalThis.ImageData ??= ImageData;
globalThis.Path2D ??= Path2D;
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const expect = baseExpect.configure({ timeout: 20_000 });
const base = process.env.AZZORA_ACCOUNTS_REVIEW_URL;
const password = process.env.AZZORA_REVIEW_PASSWORD;
assert.ok(
  base && password,
  "Hosted URL and private demo credential are required.",
);
assert.ok(new URL(base).hostname.startsWith("azzora-accounts-client-review-"));
const out =
  process.env.AZZORA_ACCOUNTS_EVIDENCE ||
  "tmp/accounts-final-hosted/additional";
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [],
  assetComparison = [],
  pdfEvidence = [];
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const snapshot = async () =>
  (await context.request.get(base + "/api/accounts-review/snapshot")).json();
const route = async (name) => {
  await page.goto(base + "/accountant.html#/" + name);
  await page.waitForLoadState("networkidle");
};
async function pdf(id, file) {
  const response = await context.request.get(
    base + "/api/accounts-review/pdf/" + id,
  );
  expect(response.status()).toBe(200);
  const bytes = await response.body();
  fs.writeFileSync(out + "/" + file + ".pdf", bytes);
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
  });
  try {
    const document = await task.promise;
    let text = "";
    for (let number = 1; number <= document.numPages; number++) {
      const documentPage = await document.getPage(number);
      const content = await documentPage.getTextContent();
      text += content.items
        .filter((item) => "str" in item)
        .map((item) => item.str)
        .join(" ");
      const viewport = documentPage.getViewport({ scale: 1.4 });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await documentPage.render({
        canvas,
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
      fs.writeFileSync(
        `${out}/${file}-page-${number}.png`,
        canvas.toBuffer("image/png"),
      );
    }
    expect(text).toContain("FICTIONAL CLIENT REVIEW");
    expect(text).toContain("NOT A TAX OR PRODUCTION ACCOUNTING DOCUMENT");
    expect(text).toContain("VAT - policy pending");
    expect(text).toContain("Fictional fittings");
    expect(text).toContain("Fictional installation");
    pdfEvidence.push({ file, pages: document.numPages, text });
  } finally {
    await task.destroy();
  }
}
try {
  const response = await fetch(base + "/accountant.html", {
    redirect: "manual",
  });
  expect(response.status).toBe(200);
  const html = await response.text();
  const assets = [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g),
  ].map((match) => match[1]);
  assert.ok(assets.length >= 2);
  for (const asset of assets) {
    const hosted = Buffer.from(await (await fetch(base + asset)).arrayBuffer());
    const local = fs.readFileSync("dist" + asset);
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    expect(hash(hosted), asset).toBe(hash(local));
    assetComparison.push({
      asset,
      sha256: hash(hosted),
      identicalToTestedLocalBuild: true,
    });
  }
  checks.push(
    "Hosted entry JavaScript and CSS byte-identical to the tested local Accounts build",
  );
  await page.goto(base + "/accountant.html");
  await page.getByLabel("Demo password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Sign in to review/ }).click();
  await expect(
    page.getByRole("heading", { name: "Financial dashboard", exact: true }),
  ).toBeVisible();
  const session = await (
    await context.request.get(base + "/api/accounts-review/session")
  ).json();
  for (const [type, key] of [
    ["Tax Invoice", "tax"],
    ["Proforma", "proforma"],
  ]) {
    const before = await snapshot();
    await route("new-invoice");
    await page.getByLabel("Document type").selectOption(type);
    const party = "Fictional Hosted " + type + " Client";
    await page.getByLabel("Customer", { exact: true }).fill(party);
    await page
      .getByLabel("Item 1 description", { exact: true })
      .fill("Fictional fittings");
    await page.getByLabel("Item 1 quantity", { exact: true }).fill("2");
    await page.getByLabel("Item 1 rate", { exact: true }).fill("12.50");
    await page.getByRole("button", { name: "+ Add Item", exact: true }).click();
    await page
      .getByLabel("Item 2 description", { exact: true })
      .fill("Fictional installation");
    await page.getByLabel("Item 2 rate", { exact: true }).fill("5.00");
    await expect(
      page.getByLabel("Document grand total", { exact: true }),
    ).toContainText("30.00");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${out}/${key}-items-${width}.png`,
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await snapshot()).invoices.filter((item) => item.party === party)
            .length,
      )
      .toBe(1);
    let record = (await snapshot()).invoices.find(
      (item) => item.party === party,
    );
    expect(record).toMatchObject({
      invoiceType: type,
      status: "Draft",
      amountFils: "3000",
      taxFils: "0",
    });
    expect(record.items).toHaveLength(2);
    expect((await snapshot()).metrics).toEqual(before.metrics);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await route("new-invoice?edit=" + record.id);
    await page.reload();
    await expect(
      page.getByLabel("Item 2 description", { exact: true }),
    ).toHaveValue("Fictional installation");
    await page
      .getByRole("button", { name: "Issue document", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await snapshot()).invoices.find((item) => item.id === record.id)
            .status,
      )
      .toBe("Issued");
    const after = await snapshot();
    record = after.invoices.find((item) => item.id === record.id);
    if (type === "Proforma") expect(after.metrics).toEqual(before.metrics);
    else
      expect(after.metrics.revenueFils).toBe(
        (BigInt(before.metrics.revenueFils) + 3000n).toString(),
      );
    expect(record.taxStatus).toBe("Policy pending");
    await pdf(record.id, key + "-invoice");
    checks.push(
      `${type}: two-item UI entry, save/reopen/issue, pending VAT, correct journal boundary and hosted PDF`,
    );
  }
  const beforeUpload = await snapshot();
  const input = new jsPDF();
  input.setFontSize(11);
  [
    "Supplier: Fictional Hosted Materials",
    "Invoice No: SYN-HOSTED-TEXT-001",
    "Invoice Date: 2026-10-22",
    "Fictional fittings 2 Nos 12.50 0.00 25.00",
    "Subtotal: 25.00",
    "VAT: 0.00",
    "Total: 25.00",
  ].forEach((line, index) => input.text(line, 20, 20 + index * 10));
  const bytes = Buffer.from(input.output("arraybuffer"));
  const uploaded = await context.request.post(
    base + "/api/accounts-review/documents/extract",
    {
      headers: { Origin: base, "X-Azzora-CSRF": session.csrf },
      data: {
        file: {
          name: "fictional-hosted-text.pdf",
          mime: "application/pdf",
          data: bytes.toString("base64"),
        },
      },
    },
  );
  expect(uploaded.status(), await uploaded.text()).toBe(200);
  const upload = await uploaded.json();
  const review = upload.snapshot.documentEntries.reviews.find(
    (item) => item.id === upload.id,
  );
  expect(review.extraction.mode).toBe("local-pdf-text");
  expect(review.extraction.costUsd).toBe(0);
  expect(review.fields.reference).toBe("SYN-HOSTED-TEXT-001");
  expect(review.fields.total).toBe("25.00");
  expect(review.fields.items).toHaveLength(1);
  expect(upload.snapshot.metrics).toEqual(beforeUpload.metrics);
  checks.push(
    "Fresh selectable-text PDF reads supplier/reference/items/totals on Vercel, zero paid AI cost and no financial posting",
  );
  await context.request.post(base + "/api/accounts-review/logout", {
    headers: { Origin: base, "X-Azzora-CSRF": session.csrf },
  });
  expect(
    (
      await context.request.get(base + "/api/accounts-review/snapshot")
    ).status(),
  ).toBe(401);
  expect(errors).toEqual([]);
  const result = {
    url: base,
    checks,
    errors,
    assetComparison,
    pdfEvidence,
    passed: checks.length,
  };
  fs.writeFileSync(out + "/results.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, errors }));
} catch (error) {
  await page
    .screenshot({ path: out + "/failure.png", fullPage: true })
    .catch(() => {});
  fs.writeFileSync(
    out + "/results.json",
    JSON.stringify({ checks, errors, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
