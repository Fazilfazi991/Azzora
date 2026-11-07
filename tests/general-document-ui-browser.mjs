// UI contract tests only. Every API response is mocked; no provider is called.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { browserOptions } from "./browser-runtime.mjs";

const base = process.env.AZZORA_DOCUMENT_UI_URL || "http://127.0.0.1:5319";
if (new URL(base).hostname !== "127.0.0.1")
  throw Error("Mocked UI tests are restricted to the local loopback server.");
const out = "tmp/general-document-ui";
fs.mkdirSync(out, { recursive: true });
await build({
  stdin: {
    contents:
      'export { createReviewState, reviewSnapshot } from "./src/accounts-review/domain.ts"; export { blankFields } from "./src/accounts-review/documents/model.ts";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: `${out}/fixture-model.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const { createReviewState, reviewSnapshot, blankFields } = await import(
  pathToFileURL(path.resolve(`${out}/fixture-model.mjs`)).href
);
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  checks = [],
  requests = [];
page.on("pageerror", (error) => errors.push(error.message));
let snapshot = reviewSnapshot(createReviewState());
snapshot.documentAi = {
  enabled: true,
  provider: "deepseek",
  status: "ready",
  message: "UI CONTRACT TEST — fictional mocked responses. No provider calls.",
};
let resultKind = "partial",
  releaseExtraction;
let saveFailure = false;
const image = fs.readFileSync("public/document-samples/07.png");
const consent =
  "This is fictional test data and I authorize DeepSeek processing for this upload";
const json = (route, value) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(value),
  });

await page.route("**/api/accounts-review/**", async (route) => {
  const url = new URL(route.request().url());
  const endpoint = url.pathname.replace("/api/accounts-review", "");
  if (endpoint === "/session")
    return json(route, {
      role: "accountant",
      csrf: "ui-test",
      email: "fictional@example.invalid",
      mode: "fictional-local-review",
    });
  if (endpoint === "/snapshot") return json(route, snapshot);
  if (endpoint.startsWith("/attachment/"))
    return route.fulfill({ contentType: "image/png", body: image });
  if (endpoint === "/documents/extract") {
    const body = route.request().postDataJSON();
    requests.push(body);
    await new Promise((resolve) => {
      releaseExtraction = resolve;
    });
    if (resultKind === "unavailable")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Extraction is temporarily unavailable. Try again or enter the details manually.",
        }),
      });
    const fields = blankFields();
    if (resultKind !== "empty" && body.mode !== "manual")
      Object.assign(fields, {
        documentType: "invoice",
        supplier: "Fictional Cedar Supplies",
        reference: "UI-NEW-742",
        date: "2026-11-06",
        currency: "AED",
        items: [
          {
            description: "Timber boards",
            quantity: "3",
            unit: "each",
            unitRate: "20.00",
            tax: "",
            total: "60.00",
            productId: "",
          },
        ],
        total: "60.00",
        kind: "supplier-bill",
        categoryId: "project-materials",
        ledgerId: "project-materials",
        ...(resultKind === "complete"
          ? { subtotal: "60.00", tax: "0.00" }
          : {}),
      });
    const id = `UI-DOC-${requests.length}`;
    const manual = body.mode === "manual";
    const extraction = {
      fields: structuredClone(fields),
      uncertain:
        resultKind === "partial" && !manual ? ["subtotal", "items[0].tax"] : [],
      fieldIssues:
        resultKind === "partial" && !manual
          ? [
              {
                field: "subtotal",
                reason:
                  "Subtotal was not readable; compare with the original document.",
              },
            ]
          : [],
      completeness: resultKind === "complete" ? "complete" : "partial",
      provider: manual
        ? "Manual entry"
        : "UI mock provider (not a real AI result)",
      mode: manual ? "manual" : "live",
      requestedMode: body.mode,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      latencyMs: 0,
      retries: 0,
    };
    snapshot.documentEntries.reviews.push({
      id,
      sha256: id,
      attachmentId: id,
      createdAt: "2026-11-06T00:00:00Z",
      extraction,
      fields,
      status: "Review",
      revision: 0,
      warnings: [],
      corrections: [],
    });
    return json(route, { id, snapshot });
  }
  if (endpoint === "/action") {
    if (saveFailure)
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Line 1 — enter a valid discount amount.",
          issues: [
            {
              field: "items.0.discount",
              message: "Enter a valid amount or leave it blank.",
            },
          ],
        }),
      });
    const action = route.request().postDataJSON();
    expect(action.kind).toBe("document-draft");
    const doc = snapshot.documentEntries.reviews.find(
      (item) => item.id === action.reviewId,
    );
    doc.corrections.push({
      at: "2026-11-06T01:00:00Z",
      actor: "demo-accountant",
      before: structuredClone(doc.fields),
      after: structuredClone(action.fields),
    });
    doc.fields = action.fields;
    doc.status = "Draft";
    doc.revision += 1;
    return json(route, { id: doc.id, snapshot });
  }
  throw Error(`Unexpected mocked endpoint: ${endpoint}`);
});
async function upload(mode = "auto") {
  if (mode === "manual") {
    const count = requests.length;
    await page
      .getByRole("button", { name: "Enter Manually", exact: true })
      .click();
    await expect(
      page.getByLabel("Supplier name", { exact: true }),
    ).toBeVisible();
    expect(requests).toHaveLength(count);
    return;
  }
  releaseExtraction = undefined;
  if (mode === "auto") await page.getByLabel(consent, { exact: true }).check();
  await page
    .getByLabel(
      mode === "auto" ? "Upload document" : "Upload document for manual entry",
      { exact: true },
    )
    .setInputFiles({
      name: `fictional-${requests.length + 1}.png`,
      mimeType: "image/png",
      buffer: image,
    });
  await expect.poll(() => Boolean(releaseExtraction)).toBe(true);
  await expect(
    page.getByRole("status").filter({
      hasText:
        mode === "auto"
          ? "Extracting document details"
          : "Uploading original document for manual entry",
    }),
  ).toBeVisible();
  const status = page
    .getByRole("status")
    .filter({ hasText: "Extracting document details" });
  await expect(
    status.getByText(`fictional-${requests.length}.png`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Upload document", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enter Manually", exact: true }),
  ).toBeDisabled();
  if (requests.length === 1) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await status.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/loading-${width}.png` });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".entry-extraction-spinner")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    checks.push(
      "Extraction loading card, filename, duplicate-action prevention, desktop/mobile layout and reduced motion",
    );
  }
  releaseExtraction();
  await expect(status).toHaveCount(0);
  await expect(page.getByLabel("Supplier name", { exact: true })).toBeVisible();
}
try {
  await page.goto(`${base}/accountant.html#/document-entry`);
  await expect(
    page.getByRole("heading", { name: "Read a bill" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Upload document", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enter Manually", exact: true }),
  ).toBeEnabled();
  checks.push(
    "Auto-Fill requires explicit fictional-processing consent; manual blank form stays available",
  );

  for (const invalid of [
    {
      name: "oversized.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(2000001),
      message:
        "This file exceeds the 2 MB upload limit. Choose a smaller PDF, PNG or JPEG.",
    },
    {
      name: "unsupported.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("fictional test"),
      message: "This file format is not supported. Choose a PDF, PNG or JPEG.",
    },
  ]) {
    await page.getByLabel(consent, { exact: true }).check();
    await page.getByLabel("Upload document", { exact: true }).setInputFiles({
      name: invalid.name,
      mimeType: invalid.mimeType,
      buffer: invalid.buffer,
    });
    await expect(page.getByRole("alert")).toHaveText(invalid.message);
    await expect(page.locator(".entry-extraction-status")).toHaveCount(0);
    expect(requests).toHaveLength(0);
  }
  checks.push(
    "Oversized/unsupported files show specific errors without a false extraction state or request",
  );

  await upload();
  expect(requests[0].processing).toEqual({
    dataClass: "fictional",
    consent: true,
    policyVersion: "ai-fictional-v1",
  });
  await expect(
    page.getByText("Partially extracted — review highlighted fields.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Supplier name", { exact: true })).toHaveValue(
    "Fictional Cedar Supplies",
  );
  await expect(
    page.getByLabel("Item 1 description", { exact: true }),
  ).toHaveValue("Timber boards");
  await expect(page.getByLabel("Subtotal · AED", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByText(
      "Subtotal was not readable; compare with the original document.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page
      .getByLabel("Item 1 tax", { exact: true })
      .evaluate((input) =>
        input.closest("label").classList.contains("entry-uncertain"),
      ),
  ).toBe(true);
  await expect(
    page.getByRole("img", { name: "Original uploaded bill" }),
  ).toBeVisible();
  await expect(page.getByLabel(consent, { exact: true })).not.toBeChecked();
  checks.push(
    "Partial extraction preserves supplier, item rows and original; missing values remain blank and highlighted; consent resets per upload",
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `${out}/partial-mocked-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    checks.push(
      `partial-review desktop/mobile layout ${width}px has no page overflow`,
    );
  }

  const financialBefore = JSON.stringify({
    metrics: snapshot.metrics,
    bills: snapshot.bills,
    expenses: snapshot.expenses,
  });
  await expect(page.getByLabel("Expense Ledger", { exact: true })).toHaveValue(
    "project-materials",
  );
  await page
    .getByLabel("Suggested classification", { exact: true })
    .selectOption("company-expense");
  await expect(page.getByLabel("Expense Ledger", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Expense Ledger", { exact: true })
    .selectOption("legacy-operating");
  await page
    .getByLabel("Expense category", { exact: true })
    .selectOption("company-expenses");
  await expect(page.getByLabel("Expense Ledger", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Supplier name", { exact: true })).toHaveValue(
    "Fictional Cedar Supplies",
  );
  await expect(
    page.getByLabel("Item 1 description", { exact: true }),
  ).toHaveValue("Timber boards");
  await expect(
    page.getByLabel("Document total · AED", { exact: true }),
  ).toHaveValue("60.00");
  checks.push(
    "Changing classification or category clears a stale ledger while preserving extracted supplier, items and amounts",
  );
  await page
    .getByLabel("Expense Ledger", { exact: true })
    .selectOption("legacy-operating");
  await page.getByLabel("Subtotal · AED", { exact: true }).fill("60.00");
  await page.getByLabel("Tax · AED", { exact: true }).fill("0.00");
  await page.getByLabel("Item 1 tax", { exact: true }).fill("0.00");
  await page
    .getByLabel(
      "I checked all fields and any warnings against the original document",
    )
    .check();
  await page.getByRole("button", { name: "Save Review Draft" }).click();
  await expect(
    page.getByText(/Draft saved\. No bill, payment or journal was posted/),
  ).toBeVisible();
  const savedFeedback = page.locator(".entry-save-feedback");
  await expect(savedFeedback).toBeInViewport({ ratio: 1 });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page
      .getByRole("button", { name: "Save Review Draft", exact: true })
      .scrollIntoViewIfNeeded();
    await savedFeedback.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/save-feedback-${width}.png` });
  }
  saveFailure = true;
  await page
    .getByLabel(
      "I checked all fields and any warnings against the original document",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Save Review Draft", exact: true })
    .click();
  await expect(savedFeedback.getByRole("alert")).toHaveText(
    /Line 1 — enter a valid discount amount/,
  );
  await expect(savedFeedback).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `${out}/save-error-390.png` });
  await expect(savedFeedback.getByRole("status")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Go to affected field", exact: true })
    .click();
  await expect(
    page.getByLabel("Item 1 discount", { exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Supplier name", { exact: true })).toHaveValue(
    "Fictional Cedar Supplies",
  );
  saveFailure = false;
  await page
    .getByRole("button", { name: "Save Review Draft", exact: true })
    .click();
  await expect(savedFeedback.getByRole("status")).toBeInViewport({ ratio: 1 });
  await expect(savedFeedback.getByRole("alert")).toHaveCount(0);
  checks.push(
    "Save confirmation and error stay beside Save in the viewport; field navigation, data preservation and retry work",
  );
  expect(
    JSON.stringify({
      metrics: snapshot.metrics,
      bills: snapshot.bills,
      expenses: snapshot.expenses,
    }),
  ).toBe(financialBefore);
  expect(snapshot.documentEntries.reviews[0].extraction.fields.subtotal).toBe(
    "",
  );
  checks.push(
    "Review edits and Save Draft retain original extraction/correction history without financial commands (mocked transport)",
  );

  await upload("manual");
  expect(requests).toHaveLength(1);
  await expect(
    page.getByText("Manual entry selected · no AI request was made.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Supplier name", { exact: true })).toHaveValue(
    "",
  );
  checks.push(
    "Manual mode opens without an upload and sends no AI consent and clearly identifies its blank editable form",
  );

  resultKind = "empty";
  await upload();
  await expect(
    page.getByText(
      "No readable details extracted · enter the details manually or try a clearer document.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Extraction completed — review required.", { exact: true }),
  ).toHaveCount(0);
  checks.push("Empty provider result never claims extraction success");

  resultKind = "complete";
  await upload();
  await expect(
    page.getByText("Extraction completed — review required.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Document total · AED", { exact: true }),
  ).toHaveValue("60.00");
  checks.push(
    "Complete response maps visible fields while requiring human review",
  );
  resultKind = "unavailable";
  await upload();
  await expect(page.getByRole("alert")).toHaveText(
    "Extraction is temporarily unavailable. Try again or enter the details manually.",
  );
  await expect(page.getByLabel("Supplier name", { exact: true })).toHaveValue(
    "Fictional Cedar Supplies",
  );
  await expect(page.locator(".entry-extraction-status")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enter Manually", exact: true }),
  ).toBeEnabled();
  checks.push(
    "Failed extraction clears loading, restores controls and preserves the existing review",
  );
  snapshot.documentAi = {
    enabled: false,
    generalDocuments: false,
    provider: "deepseek",
    status: "disabled",
    message:
      "Live AI is disabled. Local PDF extraction and manual entry are available.",
  };
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Read a bill" }),
  ).toBeVisible();
  await expect(page.getByLabel(consent, { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Upload document", { exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Enter Manually", exact: true }),
  ).toBeEnabled();
  checks.push(
    "AI-off local extraction and manual entry remain available without false DeepSeek consent",
  );
  expect(errors).toEqual([]);
} finally {
  fs.writeFileSync(
    `${out}/results.json`,
    JSON.stringify(
      {
        scope:
          "Mocked UI contract tests; no real AI calls or extraction accuracy claims",
        checks,
        errors,
        requestCount: requests.length,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(
  JSON.stringify(
    { scope: "Mocked UI contract only", passed: checks.length, errors },
    null,
    2,
  ),
);
