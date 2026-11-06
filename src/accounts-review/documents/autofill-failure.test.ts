import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createReviewState,
  applyReviewAction,
  reviewSnapshot,
} from "../domain";
import { ReviewConflict, type ReviewStore } from "../hosted-store";
import { createDeepSeekRuntime } from "./deepseek-runtime";
import { extractDocument } from "./service";
import { disabledExtractor, parseChatExtractionResponse } from "./providers";
import { sampleDocuments } from "./samples";
import { DocumentExtractionError } from "./extraction-status";

class Store implements ReviewStore {
  values = new Map<string, { value: unknown; version: string }>();
  serial = 0;
  async read<T>(path: string) {
    return (
      (structuredClone(this.values.get(path)) as
        { value: T; version: string } | undefined) ?? null
    );
  }
  async write<T>(path: string, value: T, version?: string) {
    if (this.values.get(path)?.version !== version)
      throw new ReviewConflict("Conflict");
    this.values.set(path, {
      value: structuredClone(value),
      version: String(++this.serial),
    });
  }
  async remove() {
    throw Error("Never delete budget history");
  }
}
const file = {
  name: "fictional.png",
  mime: "image/png",
  data: readFileSync("tests/fixtures/document-entry/07.png").toString("base64"),
};
const env = {
  AZZORA_AI_ENABLED: "true",
  AZZORA_AI_CLIENT_DEMO_APP_CAP: "5",
  AZZORA_AI_PROVIDER: "deepseek",
  DEEPSEEK_MODEL: "deepseek-flash",
  DEEPSEEK_API_KEY: "mock-server-key",
};
const body = (fields: unknown = sampleDocuments[6].fields) => ({
  id: "actual-mocked-response",
  model: "deepseek-flash",
  usage: { prompt_tokens: 100, completion_tokens: 80 },
  choices: [
    {
      finish_reason: "stop",
      message: { content: JSON.stringify({ fields, uncertain: [] }) },
    },
  ],
});

describe("Auto-Fill failures stay distinct from manual selection and successful extraction", () => {
  it("authorizes only one exact owner-approved digest and enforces review-only across cached results", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const approved = {
        ...file,
        data: Buffer.concat([
          Buffer.from(file.data, "base64"),
          Buffer.from("OWNER APPROVED MOCK DOCUMENT"),
        ]).toString("base64"),
      };
      const digest = createHash("sha256")
        .update(Buffer.from(approved.data, "base64"))
        .digest("hex");
      const store = new Store(),
        transport = vi.fn(async () =>
          Response.json(
            body({ ...sampleDocuments[6].fields, documentType: "invoice" }),
          ),
        );
      const runtime = createDeepSeekRuntime({
        env: { ...env, AZZORA_AI_AUTHORIZED_DOCUMENT_SHA256: digest },
        store,
        transport,
      });
      expect(runtime.status()).toMatchObject({
        syntheticOnly: false,
        authorizedDocumentReview: true,
      });
      const r = await extractDocument(
          createReviewState(),
          approved,
          runtime.extractor,
        ),
        d = r.state.documentEntries!.reviews[0];
      expect(d.extraction.reviewOnly).toBe(true);
      expect(d.fields.documentType).toBe("quotation");
      expect(d.extraction.fields.documentType).toBe("invoice");
      const draft = applyReviewAction(r.state, {
        kind: "document-draft",
        id: "OWNER-REVIEW",
        reviewId: d.id,
        revision: 0,
        confirmed: true,
        rememberSupplier: false,
        fields: {
          ...d.fields,
          documentType: "invoice",
          kind: "supplier-bill",
          categoryId: "project-materials",
          projectId: "demo-apartment",
        },
      });
      for (const kind of [
        "create-bill-from-review",
        "create-expense-from-review",
      ] as const)
        expect(() =>
          applyReviewAction(draft, {
            kind,
            id: "NO-POST-OWNER",
            reviewId: d.id,
            revision: 1,
            confirmed: true,
            account: "bank",
          }),
        ).toThrow(/review drafts only/);
      expect((await runtime.extractor.extract(approved)).reviewOnly).toBe(true);
      expect(transport).toHaveBeenCalledTimes(1);
      const revoked = createDeepSeekRuntime({ env, store, transport });
      await expect(revoked.extractor.extract(approved)).rejects.toMatchObject({
        code: "not-authorized",
      });
      const other = {
        ...approved,
        data: Buffer.concat([
          Buffer.from(approved.data, "base64"),
          Buffer.from("DIFFERENT"),
        ]).toString("base64"),
      };
      await expect(runtime.extractor.extract(other)).rejects.toMatchObject({
        code: "not-authorized",
      });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(draft.accounting.journals).toEqual(r.state.accounting.journals);
    } finally {
      log.mockRestore();
    }
  });
  it("reproduces unauthorized photo rejection before preprocessing, spending or provider access", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const store = new Store(),
        transport = vi.fn(async () => Response.json(body()));
      const runtime = createDeepSeekRuntime({ env, store, transport });
      const upload = {
        ...file,
        data: Buffer.concat([
          Buffer.from(file.data, "base64"),
          Buffer.from("fictional unauthorized variant"),
        ]).toString("base64"),
      };
      const before = createReviewState();
      const result = await extractDocument(before, upload, runtime.extractor);
      const review = result.state.documentEntries!.reviews[0];
      expect(review.extraction).toMatchObject({
        mode: "manual",
        requestedMode: "auto",
        failureCode: "not-authorized",
        inputTokens: null,
        outputTokens: null,
      });
      expect(review.extraction.failureReason).toContain("No document was sent");
      expect(result.state.attachments.at(-1)?.data).toBe(upload.data);
      expect(reviewSnapshot(result.state).metrics).toEqual(
        reviewSnapshot(before).metrics,
      );
      expect(transport).not.toHaveBeenCalled();
      expect(store.values.size).toBe(0);
      const details = JSON.parse(String(log.mock.calls[0][1]));
      expect(details).toMatchObject({
        stage: "prepare",
        reasonCode: "not-authorized",
        httpStatus: null,
        inputTokens: null,
      });
      expect(JSON.stringify(details)).not.toContain(file.name);
    } finally {
      log.mockRestore();
    }
  });
  it("manual selection is explicit and has no AI failure", async () => {
    const r = await extractDocument(
      createReviewState(),
      file,
      disabledExtractor,
    );
    expect(r.state.documentEntries!.reviews[0].extraction).toMatchObject({
      mode: "manual",
      requestedMode: "manual",
    });
    expect(
      r.state.documentEntries!.reviews[0].extraction.failureCode,
    ).toBeUndefined();
  });
  it.each([
    "provider-unavailable",
    "response-invalid",
    "preparation-failed",
    "budget-blocked",
  ] as const)(
    "retains original and displays %s without accepting invented fields",
    async (code) => {
      const r = await extractDocument(createReviewState(), file, {
        extract: async () => {
          throw new DocumentExtractionError(code);
        },
      });
      const e = r.state.documentEntries!.reviews[0].extraction;
      expect(e.failureCode).toBe(code);
      expect(e.mode).toBe("manual");
      expect(e.fields.total).toBe("");
      expect(e.requestedMode).toBe("auto");
      expect(r.state.attachments).toHaveLength(1);
    },
  );
  it("normalizes safe numeric values and missing fields individually without erasing readable amounts", () => {
    const fields = {
      ...sampleDocuments[6].fields,
      dueDate: null,
      purchaseOrderReference: null,
      discount: null,
      department: null,
      ledgerId: null,
      documentType: null,
      items: sampleDocuments[6].fields.items.map((i) => ({
        ...i,
        discount: null,
      })),
    };
    const parsed = parseChatExtractionResponse(body(fields), {
      model: "deepseek-flash",
      latencyMs: 1,
    });
    expect(parsed.fields.total).toBe(fields.total);
    expect(parsed.fields.items[0].unitRate).toBe(fields.items[0].unitRate);
    expect(parsed.fields.documentType).toBe("unknown");
    expect(parsed.uncertain).toContain("dueDate");
    expect(parsed.uncertain).toContain("items.0.discount");
    const numeric = parseChatExtractionResponse(
      body({ ...fields, total: 123 }),
      {
        model: "deepseek-flash",
        latencyMs: 1,
      },
    );
    expect(numeric.fields.total).toBe("123");
    expect(numeric.fields.supplier).toBe(fields.supplier);
    const missing = parseChatExtractionResponse(
      body({ ...fields, tax: null }),
      {
        model: "deepseek-flash",
        latencyMs: 1,
      },
    );
    expect(missing.fields.tax).toBe("");
    expect(missing.uncertain).toContain("tax");
    expect(missing.fields.total).toBe(fields.total);
    expect(missing.fields.items[0].description).toBe(
      fields.items[0].description,
    );
  });
  it("allows a quotation review draft but cannot post it even after changing the editable type", async () => {
    const fields = {
      ...sampleDocuments[6].fields,
      documentType: "quotation" as const,
      kind: "supplier-bill" as const,
      projectId: "demo-apartment",
      categoryId: "project-materials",
    };
    const r = await extractDocument(createReviewState(), file, {
      extract: async () =>
        parseChatExtractionResponse(
          body({ ...fields, projectId: "", categoryId: "" }),
          { model: "deepseek-flash", latencyMs: 1 },
        ),
    });
    const d = r.state.documentEntries!.reviews[0];
    const draft = applyReviewAction(r.state, {
      kind: "document-draft",
      id: "SAVE-QUOTE",
      reviewId: d.id,
      revision: 0,
      confirmed: true,
      rememberSupplier: false,
      fields: {
        ...d.fields,
        documentType: "invoice",
        projectId: "demo-apartment",
        categoryId: "project-materials",
      },
    });
    for (const kind of [
      "create-bill-from-review",
      "create-expense-from-review",
    ] as const)
      expect(() =>
        applyReviewAction(draft, {
          kind,
          id: "NO-POST",
          reviewId: d.id,
          revision: 1,
          confirmed: true,
          account: "bank",
        }),
      ).toThrow(/quotation/);
    expect(draft.accounting.journals).toEqual(r.state.accounting.journals);
  });
  it("holds new requests before reservation when paid test authorization is unresolved", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const store = new Store(),
        transport = vi.fn(async () => Response.json(body()));
      const runtime = createDeepSeekRuntime({
        env: { ...env, AZZORA_AI_NEW_REQUESTS_ENABLED: "false" },
        store,
        transport,
      });
      await expect(runtime.extractor.extract(file)).rejects.toMatchObject({
        code: "configuration-required",
      });
      expect(store.values.size).toBe(0);
      expect(transport).not.toHaveBeenCalled();
      expect(JSON.parse(String(log.mock.calls[0][1]))).toMatchObject({
        stage: "reserve",
        preparedImageCount: 1,
        reasonCode: "configuration-required",
      });
    } finally {
      log.mockRestore();
    }
  });
});
