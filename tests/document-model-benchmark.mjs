// Default is a no-network readiness report. Paid evaluation requires explicit owner
// approval, separate server credentials, and a provider-account billing/spend cap.
import fs from "node:fs";
import { createServer, loadEnv } from "vite";
const local = loadEnv("benchmark", process.cwd(), "");
for (const name of [
  "DEEPSEEK_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "AZZORA_AI_ENABLED",
  "AZZORA_AI_PROVIDER",
  "DEEPSEEK_MODEL",
])
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
  note: "Synthetic replay and schema tests are not evidence of model accuracy. Real calls require the same verified account and shared persistent allowance used by the portal; no credentials or billing evidence is assumed.",
};
if (!["qwen", "deepseek"].includes(selected)) {
  fs.writeFileSync(output, JSON.stringify(readiness, null, 2) + "\n");
  console.log(JSON.stringify(readiness));
} else {
  if (selected !== "deepseek")
    throw Error(
      "This DeepSeek integration checkpoint does not run Qwen or create a separate local USD5 allowance.",
    );
  const key =
    selected === "qwen"
      ? process.env.QWEN_API_KEY
      : process.env.DEEPSEEK_API_KEY;
  if (!key)
    throw Error(
      "Provide the approved provider key in this server process only.",
    );
  if (
    process.env.AZZORA_AI_ENABLED !== "true" ||
    process.env.AZZORA_AI_PROVIDER !== "deepseek" ||
    process.env.DEEPSEEK_MODEL !== "deepseek-flash"
  )
    throw Error(
      "Paid AI stays disabled until the explicit DeepSeek runtime configuration is verified.",
    );
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw Error(
      "Use the dedicated Accounts shared budget store; a local independent allowance is not permitted.",
    );
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const { digestOf } = await server.ssrLoadModule(
      "/src/accounts-review/documents/providers.ts",
    );
    const { suggest } = await server.ssrLoadModule(
      "/src/accounts-review/documents/review.ts",
    );
    const { createReviewState } = await server.ssrLoadModule(
      "/src/accounts-review/domain.ts",
    );
    const { createDeepSeekRuntime } = await server.ssrLoadModule(
      "/src/accounts-review/documents/deepseek-runtime.ts",
    );
    const { BlobReviewStore } = await server.ssrLoadModule(
      "/src/accounts-review/hosted-store.ts",
    );
    const approval = JSON.parse(
      fs.readFileSync(
        "tmp/document-entry-evidence/provider-cap-evidence.json",
        "utf8",
      ),
    );
    const oldLedger = "tmp/document-entry-evidence/combined-spend-ledger.json";
    if (
      fs.existsSync(oldLedger) &&
      JSON.stringify(JSON.parse(fs.readFileSync(oldLedger, "utf8"))) !==
        JSON.stringify(approval.priorBudget)
    )
      throw Error(
        "Local and hosted historical spend must be reconciled before this benchmark.",
      );
    const runtime = createDeepSeekRuntime({
      env: process.env,
      store: new BlobReviewStore(),
      approval,
    });
    if (!runtime.status().ready)
      throw Error(
        `DeepSeek setup is blocked: ${runtime.status().reason}. No paid call allowed.`,
      );
    const resultPath = output.replace(".json", `-${selected}.json`);
    const previous = fs.existsSync(resultPath)
      ? JSON.parse(fs.readFileSync(resultPath, "utf8"))
      : null;
    if (previous && previous.approvalRef !== approval.reference)
      throw Error(
        "An existing benchmark belongs to another approval; preserve and reconcile it before continuing.",
      );
    const provider = runtime.extractor,
      rows = previous?.rows || [];
    {
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
        // Preserve completed outputs and failed reservations; never pay again to
        // reconstruct a report or silently retry a previously failed document.
        if (rows.some((row) => row.id === sample.id)) continue;
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
          // Same selectable-text/scanned-PDF adapter as the hosted portal.
          // Source ground truth is scored only after the model returns.
          const result = await provider.extract(file),
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
            sourceSha256: sample.sha256,
            latencyMs: performance.now() - started,
            error: e instanceof Error ? e.message : "Provider failure",
          });
        }
        const checkpoint = `${resultPath}.pending.tmp`;
        fs.writeFileSync(
          checkpoint,
          JSON.stringify(
            {
              status: "in-progress-billing-pending",
              approvalRef: approval.reference,
              provider: selected,
              rows,
            },
            null,
            2,
          ),
        );
        fs.renameSync(checkpoint, resultPath);
      }
      const complete = rows.filter((r) => r.status === "complete"),
        totalFields = complete.reduce((s, r) => s + r.totalFields, 0);
      const report = {
        status: "measured-extraction-billing-pending",
        approvalRef: approval.reference,
        provider: selected,
        samples: manifest.length,
        completed: complete.length,
        failed: manifest.length - complete.length,
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
        budgetExposureMicroUsd: await runtime.budgetExposureMicroUsd(),
        separateOcrServiceUsed: false,
        note: "Measured field differences estimate necessary corrections; real user corrections need the review audit. Reconcile provider billing including OCR and failed requests before selecting a winner.",
        rows,
      };
      fs.writeFileSync(resultPath, JSON.stringify(report, null, 2) + "\n");
      console.log(JSON.stringify({ ...report, rows: undefined }));
    }
  } finally {
    await server.close();
  }
}
