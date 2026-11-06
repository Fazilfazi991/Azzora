// Independent genuine-response acceptance. Default is OFFLINE; no keys or paid calls.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium, expect as baseExpect } from "@playwright/test";
import { browserOptions } from "./browser-runtime.mjs";
const expect = baseExpect.configure({ timeout: 90000 });
const manifest = JSON.parse(
  fs.readFileSync(
    "tests/fixtures/general-document-entry/manifest.json",
    "utf8",
  ),
);
const old = new Set(
  JSON.parse(
    fs.readFileSync("tests/fixtures/document-entry/manifest.json", "utf8"),
  ).map((x) => x.sha256),
);
for (const doc of manifest.documents) {
  const bytes = fs.readFileSync(doc.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), doc.sha256);
  assert.ok(bytes.length <= 2_000_000 && doc.pages <= 5 && doc.fictional);
  assert.ok(!old.has(doc.sha256), "Do not reuse the old model corpus.");
}
if (process.env.AZZORA_QA_GENERAL_DOCUMENT_RUN !== "1") {
  console.log(
    JSON.stringify({
      status: "offline-ready",
      documents: manifest.documents.length,
      providerCalls: 0,
      note: "No login, upload or network call. Hosted genuine responses require explicit fictional authorization and reconciled shared budget.",
    }),
  );
  process.exit(0);
}
assert.equal(
  process.env.AZZORA_QA_PAID_AUTHORIZATION,
  "owner-fictional-shared-usd5",
);
assert.equal(
  process.env.AZZORA_QA_SHARED_BUDGET_READY,
  "1",
  "Coordinator must confirm the existing shared allowance; never start another USD5 ledger.",
);
const base = process.env.AZZORA_ACCOUNTS_REVIEW_URL,
  sha = process.env.AZZORA_TESTED_SHA;
assert.match(
  new URL(base).hostname,
  /^azzora-accounts-client-review-[a-z0-9]+-faziils-projects\.vercel\.app$/,
  "An immutable dedicated Accounts Preview is required.",
);
assert.match(sha || "", /^[a-f0-9]{40}$/);
const apiPrefix = process.env.AZZORA_QA_API_PREFIX || "/api/staging/accounts";
assert.ok(
  ["/api/staging/accounts", "/api/accounts-review"].includes(apiPrefix),
);
const selected = (process.env.AZZORA_QA_DOCUMENT_IDS || "")
  .split(",")
  .filter(Boolean);
assert.ok(
  selected.length > 0 &&
    selected.length <= 10 &&
    new Set(selected).size === selected.length,
  "Explicitly select the authorized fictional documents.",
);
const docs = selected.map((id) => {
  const d = manifest.documents.find((x) => x.id === id);
  assert.ok(d, "Unknown fixture " + id);
  return d;
});
const out =
  process.env.AZZORA_ACCOUNTS_EVIDENCE || "tmp/general-document-hosted";
fs.mkdirSync(out, { recursive: true });
const report = {
  testedSHA: sha,
  base,
  startedAt: new Date().toISOString(),
  selected,
  rows: [],
  checks: [],
  browserErrors: [],
  native503: [],
  screenshots: [],
  pdfOriginalPages: [],
  uploadRequestCount: 0,
  actualProviderChargesUsd: null,
  actualChargesStatus:
    "unverified; token tariff estimates are not provider billing",
  notes: [
    "Only new fictional originals; the manifest is never sent as a prompt or admission registry.",
    "No automatic retries, financial conversion or resets.",
    "Prior native Blob503 failures are not erased by a later passing run.",
  ],
};
const privateValues = [process.env.AZZORA_REVIEW_PASSWORD].filter(
  (value) => typeof value === "string" && value.length > 0,
);
const redacted = (value) =>
  privateValues.reduce(
    (message, secret) => message.replaceAll(secret, "[REDACTED]"),
    String(value),
  );
const tidy = (x) =>
  String(x ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const decimal = (x) => {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(x));
  if (!m) return null;
  return (
    BigInt(m[1]) * 10000n + BigInt((m[2] || "").padEnd(4, "0").slice(0, 4))
  );
};
function equal(field, a, b) {
  if (b === "") return a === "" || a === undefined || a === null;
  return /(?:quantity|unitRate|discount|tax|subtotal|total)$/.test(field)
    ? decimal(a) !== null && decimal(a) === decimal(b)
    : tidy(a) === tidy(b);
}
function score(doc, fields) {
  const facts = [];
  for (const key of doc.scoredFields)
    facts.push({
      field: key,
      expected: doc.groundTruth[key],
      actual: fields[key],
      correct: equal(key, fields[key], doc.groundTruth[key]),
    });
  facts.push({
    field: "itemCount",
    expected: doc.groundTruth.items.length,
    actual: fields.items?.length,
    correct: fields.items?.length === doc.groundTruth.items.length,
  });
  doc.groundTruth.items.forEach((item, index) => {
    for (const key of [
      "description",
      "quantity",
      "unit",
      "unitRate",
      "discount",
      "tax",
      "total",
    ]) {
      const field = `items.${index}.${key}`;
      facts.push({
        field,
        expected: item[key],
        actual: fields.items?.[index]?.[key],
        correct: equal(field, fields.items?.[index]?.[key], item[key]),
      });
    }
  });
  return {
    correct: facts.filter((x) => x.correct).length,
    total: facts.length,
    itemCountCorrect: fields.items?.length === doc.groundTruth.items.length,
    monetaryMistakes: facts.filter(
      (x) =>
        !x.correct && /(?:unitRate|discount|tax|subtotal|total)$/.test(x.field),
    ),
    classificationCorrect: equal("kind", fields.kind, doc.groundTruth.kind),
    facts,
  };
}
const browser = await chromium.launch(browserOptions);
let page;
try {
  const storage = process.env.AZZORA_QA_STORAGE_STATE;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    ...(storage ? { storageState: storage } : {}),
  });
  context.setDefaultTimeout(90000);
  context.setDefaultNavigationTimeout(45000);
  page = await context.newPage();
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === apiPrefix + "/documents/extract"
    )
      report.uploadRequestCount++;
  });
  page.on("pageerror", (e) => report.browserErrors.push(redacted(e.message)));
  page.on("response", (r) => {
    if (r.status() === 503)
      report.native503.push({
        path: new URL(r.url()).pathname,
        at: new Date().toISOString(),
        requestId: r.headers()["x-azzora-request-id"] || null,
        vercelId: r.headers()["x-vercel-id"] || null,
      });
  });
  const publicContext = await browser.newContext();
  const denied = await publicContext.request.get(
    base + apiPrefix + "/snapshot",
  );
  assert.ok([401, 403].includes(denied.status()));
  await publicContext.close();
  report.checks.push("Unauthenticated snapshot is denied");
  await page.goto(base + "/accountant.html#/document-entry");
  if (!storage) {
    const password = process.env.AZZORA_REVIEW_PASSWORD;
    assert.ok(
      password,
      "Provide private authenticated storage state or a demo password through the process environment.",
    );
    await page.getByLabel("Demo password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /Sign in to review/ }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Read a bill", level: 1, exact: true }),
  ).toBeVisible();
  async function snapshot() {
    const r = await context.request.get(base + apiPrefix + "/snapshot");
    assert.equal(r.status(), 200, "Authenticated snapshot");
    return r.json();
  }
  const initial = await snapshot();
  assert.equal(initial.documentAi.enabled, true);
  const baseline = {
    metrics: initial.metrics,
    invoices: initial.invoices,
    bills: initial.bills,
    expenses: initial.expenses,
    receipts: initial.receipts,
    supplierPayments: initial.supplierPayments,
  };
  for (const doc of docs) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/accountant.html#/document-entry");
    await expect(
      page.getByRole("heading", { name: "Read a bill", level: 1, exact: true }),
    ).toBeVisible();
    const before = await snapshot();
    const prior = before.documentEntries.reviews.find(
      (x) => x.sha256 === doc.sha256,
    );
    const row = {
      id: doc.id,
      sha256: doc.sha256,
      layout: doc.layout,
      format: doc.format,
      pages: doc.pages,
      language: doc.language,
      startedAt: new Date().toISOString(),
      status: "pending",
      actualProviderChargeUsd: null,
    };
    report.rows.push(row);
    await page
      .getByLabel(
        "This is fictional test data and I authorize DeepSeek processing for this upload",
        { exact: true },
      )
      .check();
    const responsePending = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === apiPrefix + "/documents/extract" &&
        r.request().method() === "POST",
    );
    const started = Date.now();
    const requestsBeforeUpload = report.uploadRequestCount;
    await page
      .getByLabel("Upload document", { exact: true })
      .setInputFiles(doc.path);
    const response = await responsePending;
    assert.equal(
      report.uploadRequestCount - requestsBeforeUpload,
      1,
      "One explicit upload sends one extraction request; no automatic retries.",
    );
    row.wallLatencyMs = Date.now() - started;
    row.httpStatus = response.status();
    row.appRequestId = response.headers()["x-azzora-request-id"] || null;
    row.vercelRequestId = response.headers()["x-vercel-id"] || null;
    assert.equal(
      response.status(),
      200,
      "Native extraction HTTP failure remains a failure; never retry automatically.",
    );
    const payload = await response.json();
    const review = payload.snapshot.documentEntries.reviews.find(
      (x) => x.sha256 === doc.sha256,
    );
    assert.ok(review);
    row.mode = review.extraction.mode;
    row.provider = review.extraction.provider;
    row.requestId = review.extraction.requestId || null;
    row.inputTokens = review.extraction.inputTokens;
    row.outputTokens = review.extraction.outputTokens;
    row.processingLatencyMs = review.extraction.latencyMs;
    row.completeness = review.extraction.completeness || null;
    row.fieldIssues = review.extraction.fieldIssues || [];
    row.uncertain = review.extraction.uncertain;
    row.failureCode = review.extraction.failureCode || null;
    row.fresh =
      review.extraction.mode === "live" &&
      !/cached/i.test(review.extraction.provider) &&
      !prior;
    row.peakTariffUpperEstimateUsd =
      row.fresh &&
      Number.isSafeInteger(row.inputTokens) &&
      Number.isSafeInteger(row.outputTokens)
        ? Math.ceil(row.inputTokens * 0.3 + row.outputTokens * 1.2) / 1_000_000
        : null;
    assert.equal(
      review.extraction.mode,
      "live",
      "Manual fallback/synthetic replay is not genuine extraction success.",
    );
    assert.ok(row.requestId, "Retain actual provider request evidence.");
    row.score = score(doc, review.extraction.fields);
    row.status = "extracted";
    assert.deepEqual(
      payload.snapshot.metrics,
      baseline.metrics,
      "Extraction must not post.",
    );
    await expect(
      page.getByLabel("Supplier name", { exact: true }),
    ).toBeVisible();
    if (doc.format !== "pdf")
      await expect(
        page.getByRole("img", { name: "Original uploaded bill" }),
      ).toBeVisible();
    else {
      await expect(
        page.getByRole("img", { name: "Original PDF page 1", exact: true }),
      ).toHaveAttribute("data-rendered", "true");
      await expect(
        page.getByText(`Page 1 of ${doc.pages}`, { exact: true }),
      ).toBeVisible();
      const filename = `${doc.id}-original-page-1.png`;
      const bytes = await page
        .getByRole("img", { name: "Original PDF page 1", exact: true })
        .screenshot({ path: out + "/" + filename });
      row.firstPreviewPageSha256 = createHash("sha256")
        .update(bytes)
        .digest("hex");
      report.pdfOriginalPages.push({
        id: doc.id,
        page: 1,
        path: filename,
        rendered: true,
      });
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      const name = `${doc.id}-autofill-${width}.png`;
      await page.screenshot({ path: out + "/" + name, fullPage: true });
      report.screenshots.push(name);
    }
    if (doc.format === "pdf") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole("button", { name: "Next page", exact: true })
        .click();
      const canvas = page.getByRole("img", {
        name: "Original PDF page 2",
        exact: true,
      });
      await expect(canvas).toHaveAttribute("data-rendered", "true");
      await expect(
        page.getByText(`Page 2 of ${doc.pages}`, { exact: true }),
      ).toBeVisible();
      const filename = `${doc.id}-original-page-2.png`;
      const bytes = await canvas.screenshot({ path: out + "/" + filename });
      assert.notEqual(
        createHash("sha256").update(bytes).digest("hex"),
        row.firstPreviewPageSha256,
        "Page2 must actually paint a different original page.",
      );
      report.pdfOriginalPages.push({
        id: doc.id,
        page: 2,
        path: filename,
        rendered: true,
      });
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        const name = `${doc.id}-page2-${width}.png`;
        await page.screenshot({ path: out + "/" + name, fullPage: true });
        report.screenshots.push(name);
      }
    }
    // One explicit human correction/draft proves integration; never convert or issue.
    if (doc.id === "G01") {
      const original = structuredClone(review.extraction);
      const supplier = await page
        .getByLabel("Supplier name", { exact: true })
        .inputValue();
      await page
        .getByLabel("Supplier name", { exact: true })
        .fill(supplier + " reviewed");
      await page
        .getByRole("combobox", {
          name: "Suggested classification",
          exact: true,
        })
        .selectOption(doc.groundTruth.kind);
      await page
        .getByRole("combobox", { name: "Expense category", exact: true })
        .selectOption("project-materials");
      const authorizedProjects = payload.snapshot.documentCatalog.projects;
      const humanProject =
        authorizedProjects.find(
          (p) => tidy(p.name) === tidy(doc.groundTruth.projectName),
        ) || authorizedProjects[0];
      assert.ok(
        humanProject,
        "The authenticated fictional company must have an authorized project for this draft review.",
      );
      await page
        .getByRole("combobox", { name: "Project", exact: true })
        .selectOption(humanProject.id);
      row.humanCorrections = {
        supplier: supplier + " reviewed",
        classification: doc.groundTruth.kind,
        category: "project-materials",
        projectId: humanProject.id,
        projectName: humanProject.name,
        note: "Explicit QA reviewer selection; never counted as original model accuracy.",
      };
      await page
        .getByLabel(
          "I checked all fields and any warnings against the original document",
          { exact: true },
        )
        .check();
      await page
        .getByRole("button", { name: "Save reviewed draft", exact: true })
        .click();
      await expect(
        page.getByText(
          "Draft saved. No bill, payment or journal was posted. You can reopen and edit this draft below.",
          { exact: true },
        ),
      ).toBeVisible();
      const saved = await snapshot();
      const current = saved.documentEntries.reviews.find(
        (x) => x.id === review.id,
      );
      assert.equal(current.status, "Draft");
      assert.deepEqual(current.extraction, original);
      assert.equal(current.corrections.length, review.corrections.length + 1);
      assert.deepEqual(saved.metrics, baseline.metrics);
      report.checks.push(
        "Original extraction and correction preserved; SaveDraft does not change finances",
      );
    }
    if (doc.id === "G09") {
      assert.equal(review.fields.documentType, "quotation");
      assert.equal(review.extraction.reviewOnly, true);
      assert.equal(
        await page
          .getByRole("button", { name: "Create purchase bill", exact: true })
          .count(),
        0,
      );
      report.checks.push("Quotation identified and conversion unavailable");
    }
    fs.writeFileSync(out + "/results.json", JSON.stringify(report, null, 2));
  }
  const final = await snapshot();
  for (const [key, value] of Object.entries(baseline))
    if (value !== undefined)
      assert.deepEqual(
        final[key],
        value,
        "Draft review must not change " + key,
      );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Read a bill", level: 1, exact: true }),
  ).toBeVisible();
  report.checks.push("Refresh retains authenticated session/document history");
  const width = await page.viewportSize();
  if (width.width < 768)
    await page
      .getByRole("button", { name: "Open accountant navigation", exact: true })
      .click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  const afterLogout = await context.request.get(base + apiPrefix + "/snapshot");
  assert.ok([401, 403].includes(afterLogout.status()));
  report.checks.push("Logout revokes session access");
  assert.equal(report.browserErrors.length, 0);
  assert.equal(report.native503.length, 0);
  report.status = "workflow-pass-review-accuracy-separately";
} catch (error) {
  report.status = "failed";
  report.failure = redacted(error.stack || error);
  if (page)
    await page
      .screenshot({ path: out + "/failure.png", fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  const extracted = report.rows.filter((x) => x.status === "extracted");
  const facts = extracted.flatMap((row) => row.score.facts);
  const blank = (value) =>
    value === undefined || value === null || value === "";
  const estimated = extracted.filter(
    (row) => row.fresh && row.peakTariffUpperEstimateUsd !== null,
  );
  report.summary = {
    selected: docs.length,
    attempted: report.rows.length,
    extracted: extracted.length,
    fresh: extracted.filter((x) => x.fresh).length,
    completionRate: extracted.length / docs.length,
    correctFields: extracted.reduce((s, x) => s + x.score.correct, 0),
    scoredFields: extracted.reduce((s, x) => s + x.score.total, 0),
    classificationCorrect: extracted.filter(
      (x) => x.score.classificationCorrect,
    ).length,
    itemCountsCorrect: extracted.filter((x) => x.score.itemCountCorrect).length,
    monetaryMistakes: extracted.reduce(
      (s, x) => s + x.score.monetaryMistakes.length,
      0,
    ),
    quantityRateMistakes: facts.filter(
      (fact) => !fact.correct && /(?:quantity|unitRate)$/.test(fact.field),
    ).length,
    missingReadableFields: facts.filter(
      (fact) => !blank(fact.expected) && blank(fact.actual),
    ).length,
    filledUnprintedFields: facts.filter(
      (fact) => blank(fact.expected) && !blank(fact.actual),
    ).length,
    averageUploadResponseMs: report.rows.length
      ? report.rows.reduce((sum, row) => sum + (row.wallLatencyMs || 0), 0) /
        report.rows.length
      : null,
    unmeteredFreshResponses: extracted.filter(
      (row) => row.fresh && row.peakTariffUpperEstimateUsd === null,
    ).length,
    averageKnownPeakEstimatePerFreshDocumentUsd: estimated.length
      ? estimated.reduce(
          (sum, row) => sum + row.peakTariffUpperEstimateUsd,
          0,
        ) / estimated.length
      : null,
    actualProviderChargesUsd: null,
    peakTariffUpperEstimateUsd: extracted.reduce(
      (s, x) => s + (x.peakTariffUpperEstimateUsd || 0),
      0,
    ),
  };
  fs.writeFileSync(out + "/results.json", JSON.stringify(report, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      status: report.status,
      ...report.summary,
      browserErrors: report.browserErrors.length,
      native503: report.native503.length,
    }),
  );
}
