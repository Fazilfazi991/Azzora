// Default is a no-network readiness report. Paid evaluation requires explicit owner
// approval, separate server credentials, and a provider-account billing/spend cap.
import fs from "node:fs";
import crypto from "node:crypto";
import { createServer, loadEnv } from "vite";
import { openBenchmarkSpend } from "./benchmark-spend-transport.mjs";
const local = loadEnv("benchmark", process.cwd(), "");
for (const name of ["QWEN_API_KEY", "DEEPSEEK_API_KEY"])
  if (!process.env[name] && local[name]) process.env[name] = local[name];
const manifest = JSON.parse(
  fs.readFileSync("tests/fixtures/document-entry/manifest.json", "utf8"),
);
const output = "tmp/document-entry-evidence/model-benchmark.json";
fs.mkdirSync("tmp/document-entry-evidence", { recursive: true });
const approvalRef = "owner-approved-synthetic-only-usd5-2026-10-22";
const selected = process.env.AZZORA_BENCHMARK_PROVIDER;
const readiness = {
  status: "approved-blocked-provider-setup-required",
  approvalRef,
  combinedBudgetUsd: 5,
  sampleCount: manifest.length,
  externalCalls: 0,
  actualApiCostUsd: 0,
  averageApiCostPerDocumentUsd: null,
  extractionAccuracy: null,
  categoryAccuracy: null,
  incorrectAmounts: null,
  responseTimeMs: null,
  retries: null,
  userCorrections: null,
  candidates: ["qwen3.7-flash-2026-07-15", "deepseek-flash"],
  note: "Synthetic replay and schema tests are not evidence of model accuracy. No paid provider is connected to the application.",
};
if (!["qwen", "deepseek"].includes(selected)) {
  fs.writeFileSync(output, JSON.stringify(readiness, null, 2) + "\n");
  console.log(JSON.stringify(readiness));
} else {
  const key =
    selected === "qwen"
      ? process.env.QWEN_API_KEY
      : process.env.DEEPSEEK_API_KEY;
  if (!key)
    throw Error(
      "Provide the approved provider key in this server process only.",
    );
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const { createChatExtractor, digestOf } = await server.ssrLoadModule(
      "/src/accounts-review/documents/providers.ts",
    );
    const { suggest } = await server.ssrLoadModule(
      "/src/accounts-review/documents/review.ts",
    );
    const { createReviewState } = await server.ssrLoadModule(
      "/src/accounts-review/domain.ts",
    );
    const approval = {
      reference: approvalRef,
      allowedDigests: new Set(manifest.map((d) => d.sha256)),
      maxRequests: 40,
    };
    const budget = await server.ssrLoadModule(
      "/src/accounts-review/documents/benchmark-budget.ts",
    );
    const spend = openBenchmarkSpend(
      budget,
      selected,
      key,
      "tmp/document-entry-evidence/provider-cap-evidence.json",
    );
    try {
      const prepared = JSON.parse(
        fs.readFileSync(
          "tmp/document-entry-evidence/prepared/inventory.json",
          "utf8",
        ),
      );
      const provider = createChatExtractor(
          selected,
          key,
          approval,
          undefined,
          spend.transport,
        ),
        rows = [];
      const flat = (object, prefix = "") =>
        Object.fromEntries(
          Object.entries(object).flatMap(([key, value]) =>
            typeof value === "object" && value !== null
              ? Object.entries(flat(value, `${prefix}${key}.`))
              : [[`${prefix}${key}`, String(value)]],
          ),
        );
      const numericField = (key) =>
        /(quantity|unitRate|tax|total|subtotal)$/.test(key);
      const decimal = (value) => {
        if (!/^\d+(\.\d+)?$/.test(value || "")) return value;
        const [whole, fraction = ""] = value.split(".");
        const tail = fraction.replace(/0+$/, "");
        return BigInt(whole).toString() + (tail ? `.` + tail : "");
      };
      const same = (key, a, b) =>
        numericField(key) ? decimal(a) === decimal(b) : a === b;
      for (const sample of manifest) {
        const file = {
          name: sample.path.split("/").pop(),
          mime: sample.path.endsWith(".pdf")
            ? "application/pdf"
            : sample.path.endsWith(".jpg")
              ? "image/jpeg"
              : "image/png",
          data: fs.readFileSync(sample.path).toString("base64"),
        };
        if (digestOf(file) !== sample.sha256)
          throw Error(
            "Corpus digest changed; review the new input before enabling a provider.",
          );
        const started = performance.now();
        try {
          const entry = prepared.find((d) => d.sourceSha256 === sample.sha256);
          let pages;
          if (file.mime === "application/pdf") {
            if (!entry?.pages.length)
              throw Error("Offline PDF images are missing.");
            pages = entry.pages.map((p) => {
              const bytes = fs.readFileSync(p.path);
              if (
                crypto.createHash("sha256").update(bytes).digest("hex") !==
                p.sha256
              )
                throw Error(
                  "Prepared page digest changed; rejecting unknown input.",
                );
              return { mime: p.mime, data: bytes.toString("base64") };
            });
          }
          spend.selectDocument(sample.sha256);
          const result = await provider.extract(file, pages),
            expected = flat(sample.groundTruth),
            actual = flat(result.fields);
          const scored = Object.keys(expected).filter((k) => !k.endsWith("Id")),
            correct = scored.filter((k) => same(k, actual[k], expected[k]));
          const numeric = scored.filter((k) =>
            /(quantity|unitRate|tax|total|subtotal)$/.test(k),
          );
          const classified = suggest(result.fields, createReviewState());
          rows.push({
            id: sample.id,
            status: "complete",
            provider: result.provider,
            sourceSha256: sample.sha256,
            extraction: result.fields,
            uncertain: result.uncertain,
            correctFields: correct.length,
            totalFields: scored.length,
            incorrectAmounts: numeric.filter(
              (k) => !same(k, actual[k], expected[k]),
            ).length,
            requiredFieldCorrections: scored.filter(
              (k) => !same(k, actual[k], expected[k]),
            ),
            suggestedCategory: classified.categoryId,
            categoryCorrect:
              classified.categoryId ===
              suggest(sample.groundTruth, createReviewState()).categoryId,
            classificationCorrect:
              result.fields.kind === sample.groundTruth.kind,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            requestId: result.requestId,
            ocrPages: result.ocrPages,
            latencyMs: result.latencyMs,
            retries: result.retries,
            actualApiCostUsd: null,
          });
        } catch (e) {
          rows.push({
            id: sample.id,
            status: "failed",
            latencyMs: performance.now() - started,
            error: e instanceof Error ? e.message : "Provider failure",
          });
        }
      }
      const complete = rows.filter((r) => r.status === "complete"),
        totalFields = complete.reduce((s, r) => s + r.totalFields, 0);
      const report = {
        status: "measured-extraction-billing-pending",
        approvalRef,
        provider: selected,
        samples: 40,
        completed: complete.length,
        failed: 40 - complete.length,
        fieldAccuracy: totalFields
          ? complete.reduce((s, r) => s + r.correctFields, 0) / totalFields
          : null,
        incorrectAmounts: complete.reduce((s, r) => s + r.incorrectAmounts, 0),
        classificationAccuracy: complete.length
          ? complete.filter((r) => r.classificationCorrect).length /
            complete.length
          : null,
        categoryAccuracy: complete.length
          ? complete.filter((r) => r.categoryCorrect).length / complete.length
          : null,
        p95LatencyMs: rows.length
          ? rows.map((r) => r.latencyMs).sort((a, b) => a - b)[
              Math.ceil(rows.length * 0.95) - 1
            ]
          : null,
        meanLatencyMs: complete.length
          ? complete.reduce((s, r) => s + r.latencyMs, 0) / complete.length
          : null,
        averageApiCostPerDocumentUsd: null,
        actualApiCostUsd: null,
        budgetExposureMicroUsd: budget.exposure(spend.snapshot()),
        separateOcrServiceUsed: false,
        note: "Measured field differences estimate necessary corrections; real user corrections need the review audit. Reconcile provider billing including OCR and failed requests before selecting a winner.",
        rows,
      };
      fs.writeFileSync(
        output.replace(".json", `-${selected}.json`),
        JSON.stringify(report, null, 2) + "\n",
      );
      console.log(JSON.stringify({ ...report, rows: undefined }));
    } finally {
      spend.close();
    }
  } finally {
    await server.close();
  }
}
