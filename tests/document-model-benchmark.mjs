// Default is a no-network readiness report. Paid evaluation requires explicit owner
// approval, separate server credentials, and a provider-account billing/spend cap.
import fs from "node:fs";
import { createServer } from "vite";
const manifest = JSON.parse(
  fs.readFileSync("tests/fixtures/document-entry/manifest.json", "utf8"),
);
const output = "tmp/document-entry-evidence/model-benchmark.json";
fs.mkdirSync("tmp/document-entry-evidence", { recursive: true });
const approvalRef = process.env.AZZORA_BENCHMARK_APPROVAL_REF;
const selected = process.env.AZZORA_BENCHMARK_PROVIDER;
const readiness = {
  status: "not-run-owner-approval-required",
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
if (!approvalRef || !["qwen", "deepseek"].includes(selected)) {
  fs.writeFileSync(output, JSON.stringify(readiness, null, 2) + "\n");
  console.log(JSON.stringify(readiness));
} else {
  if (process.env.AZZORA_BENCHMARK_ACCOUNT_CAPPED !== "yes")
    throw Error(
      "Set a provider-account spend cap before an owner-approved benchmark.",
    );
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
    const { createChatExtractor, createMistralOcr, digestOf } =
      await server.ssrLoadModule("/src/accounts-review/documents/providers.ts");
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
    const ocr = process.env.MISTRAL_OCR_KEY
      ? createMistralOcr(process.env.MISTRAL_OCR_KEY, approval)
      : undefined;
    const provider = createChatExtractor(selected, key, approval, ocr),
      rows = [];
    const flat = (object, prefix = "") =>
      Object.fromEntries(
        Object.entries(object).flatMap(([key, value]) =>
          typeof value === "object" && value !== null
            ? Object.entries(flat(value, `${prefix}${key}.`))
            : [[`${prefix}${key}`, String(value)]],
        ),
      );
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
        const result = await provider.extract(file),
          expected = flat(sample.groundTruth),
          actual = flat(result.fields);
        const scored = Object.keys(expected).filter((k) => !k.endsWith("Id")),
          correct = scored.filter((k) => actual[k] === expected[k]);
        const numeric = scored.filter((k) =>
          /(quantity|unitRate|tax|total|subtotal)$/.test(k),
        );
        const classified = suggest(result.fields, createReviewState());
        rows.push({
          id: sample.id,
          status: "complete",
          provider: result.provider,
          correctFields: correct.length,
          totalFields: scored.length,
          incorrectAmounts: numeric.filter((k) => actual[k] !== expected[k])
            .length,
          requiredFieldCorrections: scored.filter(
            (k) => actual[k] !== expected[k],
          ),
          suggestedCategory: classified.categoryId,
          classificationCorrect: result.fields.kind === sample.groundTruth.kind,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
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
      meanLatencyMs: complete.length
        ? complete.reduce((s, r) => s + r.latencyMs, 0) / complete.length
        : null,
      averageApiCostPerDocumentUsd: null,
      actualApiCostUsd: null,
      note: "Measured field differences estimate necessary corrections; real user corrections need the review audit. Reconcile provider billing including OCR and failed requests before selecting a winner.",
      rows,
    };
    fs.writeFileSync(
      output.replace(".json", `-${selected}.json`),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify({ ...report, rows: undefined }));
  } finally {
    await server.close();
  }
}
