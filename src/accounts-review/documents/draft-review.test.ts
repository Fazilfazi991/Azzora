import { expect, it } from "vitest";
import { applyReviewAction, createReviewState } from "../domain";
import { blankFields } from "./model";
import {
  assertReviewReadyForPosting,
  inspectFields,
  saveDocumentDraft,
} from "./review";
import { unitSuggestions } from "./UnitAutocomplete";

const fields = () => ({
  ...blankFields(),
  supplier: "Fictional Supplier",
  reference: "TWELVE",
  currency: "AED" as const,
  subtotal: "999.00",
  tax: "0.00",
  total: "999.00",
  discount: "",
  items: Array.from({ length: 12 }, (_, i) => ({
    description: `Fictional item ${i + 1}`,
    quantity: i === 7 ? "2" : "1",
    unit: i === 10 ? " drm " : "DRM",
    unitRate: i === 7 ? "60.00" : "10.00",
    discount: i === 3 ? "0.00" : i === 4 ? "2.00" : "",
    tax: "0.00",
    total: i === 7 ? "125.00" : i === 4 ? "8.00" : "10.00",
    productId: "",
  })),
});
const action = () => ({
  kind: "document-manual" as const,
  id: "DOC-TWELVE",
  fields: fields(),
  confirmed: true as const,
  rememberSupplier: false,
});
it("saves twelve incomplete rows with blank/zero/nonzero discounts and warnings, preserving originals and all financial data", () => {
  const state = createReviewState(),
    before = structuredClone(state),
    next = applyReviewAction(state, action()),
    doc = next.documentEntries!.reviews[0];
  expect(state).toEqual(before);
  expect(next.accounting).toEqual(before.accounting);
  expect(next.invoices).toEqual(before.invoices);
  expect(next.bills).toEqual(before.bills);
  expect(doc.fields).toEqual(fields());
  expect(doc.fields.items[10].unit).toBe(" drm ");
  expect(
    doc.warnings.some(
      (w) =>
        w.code === "line-math-7" &&
        w.field === "items.7.total" &&
        w.message.includes("125.00") &&
        w.message.includes("120.00"),
    ),
  ).toBe(true);
  expect(doc.warnings.some((w) => w.code === "subtotal-lines")).toBe(true);
  expect(doc.warnings.some((w) => w.code === "product-0")).toBe(true);
  expect(doc.mapping).toBeUndefined();
  expect(() => assertReviewReadyForPosting(doc.fields, next)).toThrow();
});
it("keeps signed/excess discounts as unresolved draft warnings but rejects them for posting", () => {
  for (const discount of ["-1.00", "20.00"]) {
    const f = fields();
    f.items[0].discount = discount;
    const next = applyReviewAction(createReviewState(), {
      ...action(),
      fields: f,
    });
    expect(next.documentEntries!.reviews[0].fields.items[0].discount).toBe(
      discount,
    );
    expect(
      inspectFields(f, next).some((w) => w.field === "items.0.discount"),
    ).toBe(true);
    expect(() => assertReviewReadyForPosting(f, next)).toThrow();
  }
});
it("rejects malformed amounts with exact field feedback, confirmation, stale revisions and unavailable resources atomically", () => {
  const state = applyReviewAction(createReviewState(), action()),
    before = structuredClone(state),
    f = fields();
  f.items[7].discount = "oops";
  try {
    saveDocumentDraft(
      state,
      {
        kind: "document-draft",
        reviewId: "DOC-TWELVE",
        revision: 1,
        fields: f,
        confirmed: true,
        rememberSupplier: false,
      },
      "now",
    );
    throw Error("expected error");
  } catch (e) {
    expect(e).toMatchObject({
      status: 422,
      issues: [{ field: "items.7.discount" }],
    });
  }
  for (const extra of [
    { revision: 0 },
    { confirmed: false },
    { reviewId: "another-user" },
    { fields: { ...fields(), projectId: "unauthorized" } },
  ])
    expect(() =>
      saveDocumentDraft(
        state,
        {
          kind: "document-draft",
          reviewId: "DOC-TWELVE",
          revision: 1,
          fields: fields(),
          confirmed: true,
          rememberSupplier: false,
          ...extra,
        },
        "now",
      ),
    ).toThrow();
  expect(state).toEqual(before);
});
it("deduplicates and filters suggestions without changing saved units", () => {
  const values = [" drm ", "DRM", "dRm", "  CUSTOM  UNIT "];
  expect(unitSuggestions(values, "d")).toContain("DRM");
  expect(unitSuggestions(values).filter((v) => v === "DRM")).toHaveLength(1);
  expect(unitSuggestions(values, "custom")).toEqual(["CUSTOM UNIT"]);
  expect(values[0]).toBe(" drm ");
  expect(unitSuggestions([], "custom")).toEqual([]);
});
