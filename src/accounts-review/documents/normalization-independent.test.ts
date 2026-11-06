import { describe, expect, it } from "vitest";
import { blankFields } from "./model";
import { normalizeExtractionContent } from "./normalization";

const valid = () => ({
  fields: {
    ...blankFields(),
    documentType: "invoice",
    supplier: "Independent Fictional Supplier",
    date: "2026-11-06",
    reference: "NEW-508",
    currency: "AED",
    items: [
      {
        description: "Copper fittings",
        quantity: "3",
        unit: "each",
        unitRate: "12.50",
        discount: "0.00",
        tax: "1.88",
        total: "39.38",
        productId: "",
      },
      {
        description: "Site tape",
        quantity: "2",
        unit: "roll",
        unitRate: "5.00",
        discount: "0.00",
        tax: "0.50",
        total: "10.50",
        productId: "",
      },
    ],
    subtotal: "47.50",
    tax: "2.38",
    total: "49.88",
    kind: "supplier-bill",
  },
  uncertain: [],
});
describe("independent partial extraction acceptance — no provider calls", () => {
  it("preserves supplier and every readable row when subtotal is omitted", () => {
    const input = valid();
    delete (input.fields as Partial<typeof input.fields>).subtotal;
    const output = normalizeExtractionContent(input);
    expect(output.fields.supplier).toBe(input.fields.supplier);
    expect(output.fields.items).toEqual(input.fields.items);
    expect(output.fields.tax).toBe("2.38");
    expect(output.fields.total).toBe("49.88");
    expect(output.fields.subtotal).toBe("");
    expect(output.uncertain).toContain("subtotal");
    expect(output.completeness).toBe("partial");
  });
  it("contains one malformed item rate without dropping its description or neighboring rows", () => {
    const input = valid();
    input.fields.items[0].unitRate = "not legible";
    const output = normalizeExtractionContent(input);
    expect(output.fields.items).toHaveLength(2);
    expect(output.fields.items[0]).toMatchObject({
      description: "Copper fittings",
      quantity: "3",
      unitRate: "",
      tax: "1.88",
      total: "39.38",
    });
    expect(output.fields.items[1]).toEqual(input.fields.items[1]);
    expect(output.uncertain).toContain("items.0.unitRate");
    expect(
      output.fieldIssues.some(
        (x) => x.field === "items.0.unitRate" && x.original === "not legible",
      ),
    ).toBe(true);
  });
  it("normalizes Arabic digits and explicit currency formatting while preserving values", () => {
    const input = valid() as unknown as {
      fields: Record<string, unknown>;
      uncertain: string[];
    };
    input.fields.date = "٢٠٢٦/١١/٠٦";
    input.fields.subtotal = "AED ١٬٢٣٤٫٥٠";
    input.fields.tax = "٦١٫٧٣";
    input.fields.total = "١٢٩٦٫٢٣ درهم";
    input.fields.currency = "درهم";
    const output = normalizeExtractionContent(input);
    expect(output.fields.date).toBe("2026-11-06");
    expect(output.fields.subtotal).toBe("1234.50");
    expect(output.fields.tax).toBe("61.73");
    // An unsupported suffix can remain uncertain, but may never alter the monetary value.
    expect(["1296.23", ""]).toContain(output.fields.total);
    expect(output.fields.currency).toBe("AED");
  });
  it("does not invent zeros for missing printed amounts or infer a quantity from total/rate", () => {
    const input = valid();
    input.fields.subtotal = "";
    input.fields.tax = "";
    input.fields.items[0].quantity = "";
    input.fields.items[0].tax = "";
    const output = normalizeExtractionContent(input);
    expect(output.fields.subtotal).toBe("");
    expect(output.fields.tax).toBe("");
    expect(output.fields.items[0].quantity).toBe("");
    expect(output.fields.items[0].tax).toBe("");
    expect(output.fields.total).toBe("49.88");
  });
  it("retains inconsistent printed figures instead of repairing the arithmetic", () => {
    const input = valid();
    input.fields.items[0].total = "39.39";
    input.fields.total = "101.02";
    const output = normalizeExtractionContent(input);
    expect(output.fields.items[0].total).toBe("39.39");
    expect(output.fields.total).toBe("101.02");
    expect(output.fields.subtotal).toBe("47.50");
  });
  it("rejects ambiguous amount formatting without rounding it or erasing other evidence", () => {
    for (const amount of ["1,25", "12.345", "-2.00", "NaN", "Infinity"]) {
      const input = valid();
      input.fields.items[0].unitRate = amount;
      const output = normalizeExtractionContent(input);
      expect(output.fields.items[0].unitRate).toBe("");
      expect(output.fields.supplier).toBe(input.fields.supplier);
      expect(output.uncertain).toContain("items.0.unitRate");
    }
  });
  it("accepts safe numeric JSON formatting without generating a monetary calculation", () => {
    const input = valid() as unknown as {
      fields: Record<string, unknown>;
      uncertain: string[];
    };
    input.fields.subtotal = 47.5;
    input.fields.tax = 2.38;
    const output = normalizeExtractionContent(input);
    expect(output.fields.subtotal).toBe("47.5");
    expect(output.fields.tax).toBe("2.38");
    expect(output.fields.total).toBe("49.88");
  });
  it("contains an invalid calendar date and leaves a missing date missing", () => {
    const input = valid();
    input.fields.date = "2026-02-31";
    const output = normalizeExtractionContent(input);
    expect(output.fields.date).toBe("");
    expect(output.fields.reference).toBe("NEW-508");
    expect(output.uncertain).toContain("date");
    input.fields.date = "";
    expect(normalizeExtractionContent(input).fields.date).toBe("");
  });
  it("removes invented matching IDs and preserves the usable invoice", () => {
    const input = valid() as unknown as {
      fields: Record<string, unknown>;
      uncertain: string[];
    };
    Object.assign(input.fields, {
      categoryId: "arbitrary-category",
      ledgerId: "bank",
      projectId: "other-company-project",
      customerId: "other-company-customer",
    });
    (input.fields.items as Array<Record<string, unknown>>)[0].productId =
      "invented-product";
    const output = normalizeExtractionContent(input);
    for (const key of [
      "categoryId",
      "ledgerId",
      "projectId",
      "customerId",
    ] as const) {
      expect(output.fields[key] || "").toBe("");
      expect(output.uncertain).toContain(key);
    }
    expect(output.fields.items[0].productId).toBe("");
    expect(output.uncertain).toContain("items.0.productId");
    expect(output.fields.total).toBe("49.88");
  });
  it("keeps a quotation identified independently from purchase classification", () => {
    const input = valid();
    input.fields.documentType = "quotation";
    const output = normalizeExtractionContent(input);
    expect(output.fields.documentType).toBe("quotation");
    expect(output.fields.items).toHaveLength(2);
  });
  it("preserves valid fields when the returned item container is malformed", () => {
    const input = valid() as unknown as {
      fields: Record<string, unknown>;
      uncertain: string[];
    };
    input.fields.items = { description: "bad container" };
    const output = normalizeExtractionContent(input);
    expect(output.fields.items).toEqual([]);
    expect(output.fields.supplier).toBe("Independent Fictional Supplier");
    expect(output.fields.total).toBe("49.88");
    expect(output.uncertain).toContain("items");
  });
  it("does not mutate the original provider object during normalization", () => {
    const input = valid() as unknown as {
      fields: Record<string, unknown>;
      uncertain: string[];
    };
    input.fields.dueDate = null;
    input.fields.tax = 2.38;
    const original = structuredClone(input);
    normalizeExtractionContent(input);
    expect(input).toEqual(original);
  });
  it("refuses a completely unusable output rather than reporting empty success", () => {
    for (const input of [
      null,
      [],
      {},
      { fields: {}, uncertain: [] },
      { fields: { supplier: { post: "bank" } }, uncertain: [] },
    ])
      expect(() => normalizeExtractionContent(input)).toThrow();
  });
  it("does not silently present the first 80 of an oversized invoice as complete", () => {
    const input = valid();
    input.fields.items = Array.from({ length: 81 }, () => ({
      ...input.fields.items[0],
    }));
    const output = normalizeExtractionContent(input);
    expect(output.completeness).toBe("partial");
    expect(output.reviewOnly).toBe(true);
    expect(output.uncertain).toContain("items");
    expect(output.fieldIssues.some((x) => x.field === "items")).toBe(true);
  });
});
