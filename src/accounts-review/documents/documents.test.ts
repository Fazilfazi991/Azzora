import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyReviewAction,
  createReviewState,
  reviewSnapshot,
} from "../domain";
import {
  blankFields,
  fieldsSchema,
  type EntryFields,
  type Upload,
} from "./model";
import { extractDocument } from "./service";
import {
  categories,
  inspectFields,
  lineNet,
  saveDocumentDraft,
  suggest,
} from "./review";
import {
  createChatExtractor,
  createMistralOcr,
  digestOf,
  sampleExtractor,
} from "./providers";
import { sampleDocuments } from "./samples";

const manifest = JSON.parse(
  readFileSync("tests/fixtures/document-entry/manifest.json", "utf8"),
) as {
  id: string;
  path: string;
  sha256: string;
  groundTruth: EntryFields;
  expectedPrintedMathWarning: boolean;
}[];
const upload = (n = 0): Upload => {
  const row = manifest[n];
  return {
    name: row.path.split("/").pop()!,
    mime: row.path.endsWith("pdf")
      ? "application/pdf"
      : row.path.endsWith("jpg")
        ? "image/jpeg"
        : "image/png",
    data: readFileSync(row.path).toString("base64"),
  };
};
const save = (id: string, fields: EntryFields, revision = 0) => ({
  kind: "document-draft" as const,
  reviewId: id,
  revision,
  fields,
  confirmed: true as const,
  rememberSupplier: true,
});
const readyFields = (fields: EntryFields): EntryFields => ({
  ...fields,
  projectId: fields.kind === "company-expense" ? "" : "demo-apartment",
  reference: fields.reference || "REVIEWED-REF",
});
describe("synthetic document corpus (not live AI accuracy)", () => {
  it.each(manifest)(
    "$id: file digest, safe replay contract and printed-math warnings",
    async (row) => {
      const file = upload(manifest.indexOf(row));
      expect(digestOf(file)).toBe(row.sha256);
      const previous = createReviewState(),
        result = await extractDocument(previous, file);
      const doc = result.state.documentEntries!.reviews[0];
      expect(doc.extraction.mode).toBe("synthetic-replay");
      expect(doc.extraction.fields).toEqual(row.groundTruth);
      expect(doc.warnings.some((w) => w.code === "totals")).toBe(
        row.expectedPrintedMathWarning,
      );
      expect(result.state.accounting).toEqual(previous.accounting);
      expect(previous.documentEntries).toBeUndefined();
      expect(reviewSnapshot(result.state).metrics).toEqual(
        reviewSnapshot(previous).metrics,
      );
    },
  );
  it("has 40 distinct authorized synthetic files", () =>
    expect(new Set(sampleDocuments.map((d) => d.sha256)).size).toBe(40));
});
describe("review-only finance boundaries", () => {
  it("does not apply a remembered supplier rule over a conflicting document classification", async () => {
    const r = await extractDocument(createReviewState(), upload());
    const fields = readyFields(r.state.documentEntries!.reviews[0].fields);
    const saved = saveDocumentDraft(r.state, save(r.id, fields), "now");
    expect(
      suggest(
        {
          ...fields,
          kind: "company-expense",
          categoryId: "",
          projectName: "",
          projectId: "",
        },
        saved,
      ),
    ).toMatchObject({
      kind: "company-expense",
      categoryId: "company-expenses",
      projectId: "",
    });
  });
  it("leaves ambiguous normalized project/product/customer matches unassigned", () => {
    const state = createReviewState();
    state.documentCatalog = {
      suppliers: [],
      projects: [
        { id: "a", name: "Apartment" },
        { id: "b", name: "Apartment" },
      ],
      customers: [
        { id: "a", name: "Customer" },
        { id: "b", name: "Customer" },
      ],
      products: [],
    };
    expect(
      suggest(
        {
          ...blankFields(),
          projectName: "Apartment",
          customerName: "Customer",
        },
        state,
      ),
    ).toMatchObject({ projectId: "", customerId: "" });
  });
  it("additively reads old review state without resetting any record", () => {
    const state = createReviewState(),
      before = structuredClone(state);
    expect(reviewSnapshot(state).documentEntries.reviews).toEqual([]);
    expect(state).toEqual(before);
  });
  it("validates type signatures before extraction and rejects bad/massive uploads", async () => {
    let called = false;
    const provider = {
      extract: async () => {
        called = true;
        return sampleExtractor.extract(upload());
      },
    };
    await expect(
      extractDocument(
        createReviewState(),
        { name: "x.png", mime: "image/png", data: btoa("not an image") },
        provider,
      ),
    ).rejects.toThrow(/match/);
    await expect(
      extractDocument(
        createReviewState(),
        { ...upload(), data: "a".repeat(2800001) },
        provider,
      ),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
  it("opens an unknown image as manual, never fabricates extracted values", async () => {
    const file = upload();
    file.data = Buffer.concat([
      Buffer.from(file.data, "base64"),
      Buffer.from("different"),
    ]).toString("base64");
    const result = await extractDocument(createReviewState(), file);
    const d = result.state.documentEntries!.reviews[0];
    expect(d.extraction.mode).toBe("manual");
    expect(d.fields).toEqual(blankFields());
  });
  it("deduplicates the same bytes even under another filename", async () => {
    const result = await extractDocument(createReviewState(), upload());
    const second = await extractDocument(result.state, {
      ...upload(),
      name: "another.png",
    });
    expect(second.id).toBe(result.id);
    expect(second.reused).toBe(true);
    expect(second.state.attachments).toHaveLength(1);
  });
  it("saves editable fields, original extraction and immutable correction revisions without any posting", async () => {
    const initial = createReviewState(),
      result = await extractDocument(initial, upload());
    const doc = result.state.documentEntries!.reviews[0];
    const fields = readyFields(doc.fields);
    fields.supplier = "Corrected fictional supplier";
    const next = saveDocumentDraft(
        result.state,
        save(result.id, fields),
        "2026-10-22T12:00:00Z",
      ),
      saved = next.documentEntries!.reviews[0];
    expect(saved.status).toBe("Draft");
    expect(saved.mapping).toEqual({
      categoryId: "project-materials",
      accountId: "cost",
      accountCode: "5000",
    });
    expect(saved.extraction).toEqual(doc.extraction);
    expect(saved.corrections[0].before.supplier).toBe("Sample Supplier B");
    expect(next.accounting).toEqual(initial.accounting);
    expect(next.bills).toEqual(initial.bills);
    expect(next.expenses).toEqual(initial.expenses);
    expect(next.receipts).toEqual(initial.receipts);
    expect(result.state.documentEntries!.reviews[0].corrections).toHaveLength(
      0,
    );
    expect(() =>
      saveDocumentDraft(next, save(result.id, fields), "later"),
    ).toThrow(/changed/);
    const edited = applyReviewAction(next, {
      ...save(result.id, { ...fields, reference: "EDIT-2" }, 1),
      id: "action2",
    });
    expect(edited.documentEntries!.reviews[0].corrections).toHaveLength(2);
    expect(edited.accounting).toEqual(initial.accounting);
  });
  it("requires explicit review and rejects arbitrary account / journal fields", async () => {
    const r = await extractDocument(createReviewState(), upload()),
      fields = readyFields(r.state.documentEntries!.reviews[0].fields);
    for (const overrides of [
      { confirmed: false },
      { fields: { ...fields, ledgerAccountId: "bank" } },
      { journal: [] },
    ])
      expect(() =>
        saveDocumentDraft(
          r.state,
          { ...save(r.id, fields), ...overrides },
          "now",
        ),
      ).toThrow();
  });
  it("rejects scope mismatch, nonexistent projects/products and inactive COA mapping", async () => {
    const r = await extractDocument(createReviewState(), upload()),
      fields = readyFields(r.state.documentEntries!.reviews[0].fields);
    for (const value of [
      { ...fields, categoryId: "company-expenses" },
      { ...fields, projectId: "not-real" },
      { ...fields, items: [{ ...fields.items[0], productId: "hallucinated" }] },
    ])
      expect(() =>
        saveDocumentDraft(r.state, save(r.id, value), "now"),
      ).toThrow();
    r.state.accounting = {
      ...r.state.accounting,
      accounts: r.state.accounting.accounts.map((a) =>
        a.id === "cost" ? { ...a, status: "Archived" } : a,
      ),
    };
    expect(() => saveDocumentDraft(r.state, save(r.id, fields), "now")).toThrow(
      /unavailable/,
    );
  });
  it("remembers only explicitly confirmed supplier defaults, no model training or CRM writes", async () => {
    const r = await extractDocument(createReviewState(), upload()),
      fields = readyFields(r.state.documentEntries!.reviews[0].fields);
    const noRemember = saveDocumentDraft(
      r.state,
      { ...save(r.id, fields), rememberSupplier: false },
      "now",
    );
    expect(noRemember.documentEntries!.defaults).toHaveLength(0);
    const remembered = saveDocumentDraft(r.state, save(r.id, fields), "now");
    expect(
      suggest(
        { ...fields, projectId: "", categoryId: "", kind: "unknown" },
        remembered,
      ).categoryId,
    ).toBe("project-materials");
  });
  it("matches exact normalized references, leaves ambiguous/unmatched records unassigned", () => {
    const s = createReviewState(),
      f = {
        ...blankFields(),
        supplier: "sample supplier b",
        projectName: "Sample apartment renovation",
        customerName: "Sample Client A",
        kind: "supplier-bill" as const,
        items: [
          {
            description: "Interior paint",
            quantity: "2",
            unit: "tin",
            unitRate: "60",
            tax: "6",
            total: "126",
            productId: "",
          },
        ],
      };
    expect(suggest(f, s)).toMatchObject({
      supplier: "Sample Supplier B",
      projectId: "demo-apartment",
      customerId: "Sample Client A",
    });
    expect(suggest(f, s).items[0].productId).toBe("demo-paint");
    expect(suggest({ ...f, projectName: "maybe apartment" }, s).projectId).toBe(
      "",
    );
  });
  it("flags price changes only with matching supplier, product and unit", () => {
    const state = createReviewState(),
      f = suggest(sampleDocuments[0].fields, state);
    expect(inspectFields(f, state).some((w) => w.code === "price-0")).toBe(
      true,
    );
    expect(
      inspectFields(
        { ...f, items: [{ ...f.items[0], unit: "litre" }] },
        state,
      ).some((w) => w.code === "price-0"),
    ).toBe(false);
  });
  it("flags reference duplicates and missing fields independently of SHA", async () => {
    const r = await extractDocument(createReviewState(), upload()),
      d = r.state.documentEntries!.reviews[0];
    expect(
      inspectFields(d.fields, r.state, "other").some(
        (w) => w.code === "duplicate",
      ),
    ).toBe(true);
    expect(inspectFields(blankFields(), r.state).map((w) => w.code)).toContain(
      "missing-total",
    );
  });
  it("uses integer fils with half-up rounding, rejects invalid/negative/NaN dates and amounts", () => {
    expect(lineNet("0.5", "0.01")).toBe(1n);
    expect(lineNet("1.125", "2.00")).toBe(225n);
    for (const total of ["-1", "NaN", "1e9", "1.001", "Infinity"])
      expect(fieldsSchema.safeParse({ ...blankFields(), total }).success).toBe(
        false,
      );
    expect(
      fieldsSchema.safeParse({ ...blankFields(), date: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("all draft category mappings reuse existing demo expense account types", () => {
    const s = createReviewState();
    for (const c of categories)
      expect(["Cost of Sales", "Expense"]).toContain(
        s.accounting.accounts.find((a) => a.id === c.expenseAccountId)?.type,
      );
  });
});
describe("interchangeable server providers (mock transport only)", () => {
  it("rejects overlong OCR output instead of silently returning the first pages", async () => {
    const f = upload(1),
      approval = {
        reference: "test-only",
        allowedDigests: new Set([digestOf(f)]),
        maxRequests: 1,
      };
    const transport = (async () =>
      Response.json({
        pages: Array.from({ length: 6 }, () => ({ markdown: "fictional" })),
      })) as typeof fetch;
    await expect(
      createMistralOcr("test", approval, transport).read(f),
    ).rejects.toThrow(/no partial draft/);
  });
  const file = upload(),
    approval = {
      reference: "fictional-test-only",
      allowedDigests: new Set([digestOf(file)]),
      maxRequests: 1,
    };
  it("never calls a transport without an explicit approval reference and allowlisted digest", async () => {
    let calls = 0;
    const transport = (async () => {
      calls++;
      throw Error("unexpected");
    }) as typeof fetch;
    await expect(
      createChatExtractor(
        "qwen",
        "test",
        { ...approval, reference: "" },
        undefined,
        transport,
      ).extract(file),
    ).rejects.toThrow(/approved/);
    await expect(
      createChatExtractor(
        "deepseek",
        "test",
        { ...approval, allowedDigests: new Set() },
        undefined,
        transport,
      ).extract(file),
    ).rejects.toThrow(/approved/);
    expect(calls).toBe(0);
  });
  it.each(["qwen", "deepseek"] as const)(
    "%s parses strict output, records usage, enforces one call and sends credentials only in server headers",
    async (name) => {
      let body = "";
      const transport = (async (_url, init) => {
        body = String(init?.body);
        expect((init?.headers as Record<string, string>).Authorization).toBe(
          "Bearer test-server-key",
        );
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fields: sampleDocuments[0].fields,
                  uncertain: [],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 200, completion_tokens: 150 },
        });
      }) as typeof fetch;
      const p = createChatExtractor(
          name,
          "test-server-key",
          approval,
          undefined,
          transport,
        ),
        result = await p.extract(file);
      expect(result.inputTokens).toBe(200);
      expect(result.costUsd).toBeNull();
      expect(body).not.toContain("test-server-key");
      await expect(p.extract(file)).rejects.toThrow(/budget/);
    },
  );
  it("rejects malformed provider JSON and prompt-injected ledger output without retry", async () => {
    const transport = (async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                fields: { ...sampleDocuments[0].fields, journal: [] },
                uncertain: [],
              }),
            },
          },
        ],
      })) as typeof fetch;
    await expect(
      createChatExtractor(
        "qwen",
        "test",
        approval,
        undefined,
        transport,
      ).extract(file),
    ).rejects.toThrow();
  });
  it("keeps PDF extraction gated on an approved OCR adapter", async () => {
    const pdf = upload(1);
    await expect(
      createChatExtractor("qwen", "test", {
        ...approval,
        allowedDigests: new Set([digestOf(pdf)]),
      }).extract(pdf),
    ).rejects.toThrow(/OCR/);
  });
  it("OCR rejects unapproved documents and failed service responses", async () => {
    const p = createMistralOcr("test", { ...approval, reference: "" });
    await expect(p.read(file)).rejects.toThrow(/approved/);
    const fail = (async () =>
      new Response(null, { status: 429 })) as typeof fetch;
    await expect(
      createMistralOcr("test", approval, fail).read(file),
    ).rejects.toThrow(/429/);
  });
  it("fixture content integrity differs from filename-based matching", () =>
    expect(createHash("sha256").update("01.png").digest("hex")).not.toBe(
      digestOf(file),
    ));
});
