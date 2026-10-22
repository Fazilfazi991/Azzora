import { describe, expect, it } from "vitest";
import {
  blankReviewLine,
  calculateItemLines,
  comparableCatalogPrice,
  reviewFilsToDecimal,
  type ReviewLineInput,
} from "./item-lines";

const line = (overrides: Partial<ReviewLineInput> = {}): ReviewLineInput => ({
  description: "Plumbing item",
  quantity: "10",
  unit: "Nos",
  rate: "6.00",
  ...overrides,
});
const product = {
  id: "p1",
  name: "Plumbing item",
  unit: "Nos",
  supplier: "Demo Supplier",
  rate: "6.00",
};

describe("item-wise document calculations", () => {
  it("calculates the client's purchase example and sums rounded integer fils", () => {
    const result = calculateItemLines([
      line(),
      line({ description: "Plumbing item B", quantity: "5", rate: "20" }),
      line({ description: "Pipe Fitting", quantity: "3", rate: "15" }),
    ]);
    expect(result.items.map((item) => item.amountFils)).toEqual([
      "6000",
      "10000",
      "4500",
    ]);
    expect(result.subtotalFils).toBe("20500");
    expect(reviewFilsToDecimal(result.subtotalFils)).toBe("205.00");
  });

  it("rounds half-up for each line using all four quantity/rate decimals", () => {
    expect(
      calculateItemLines([
        line({ quantity: "1", rate: "0.005" }),
        line({ quantity: "1", rate: "0.005" }),
      ]).subtotalFils,
    ).toBe("2");
    expect(
      calculateItemLines([line({ quantity: "0.0001", rate: "49.9999" })])
        .subtotalFils,
    ).toBe("0");
    expect(
      calculateItemLines([line({ quantity: "0.0001", rate: "50.0000" })])
        .subtotalFils,
    ).toBe("1");
    expect(
      calculateItemLines([line({ quantity: "1.2345", rate: "2.3456" })])
        .subtotalFils,
    ).toBe("290");
  });

  it("handles amounts beyond floating-point safe precision without losing a fils", () => {
    expect(
      calculateItemLines([
        line({ quantity: "999999999999999999", rate: "0.01" }),
      ]).subtotalFils,
    ).toBe("999999999999999999");
    expect(reviewFilsToDecimal("999999999999999999")).toBe(
      "9999999999999999.99",
    );
  });

  it("allows zero rates, trims stored text and preserves optional details without a measurement formula", () => {
    expect(
      calculateItemLines([
        line({
          quantity: " 2 ",
          rate: "0",
          description: " Tile ",
          details: " Weight 30 kg ",
          productId: " p1 ",
        }),
      ]).items[0],
    ).toEqual({
      description: "Tile",
      quantity: "2",
      unit: "Nos",
      rate: "0",
      details: "Weight 30 kg",
      productId: "p1",
      amountFils: "0",
    });
  });

  it("recalculates edits and removals without mutating input or treating stale amounts as authoritative", () => {
    const inputs = [line(), line({ quantity: "1", rate: "1" })];
    const original = structuredClone(inputs);
    expect(calculateItemLines(inputs).subtotalFils).toBe("6100");
    expect(
      calculateItemLines([{ ...inputs[0], quantity: "5" }]).subtotalFils,
    ).toBe("3000");
    expect(inputs).toEqual(original);
    expect(
      calculateItemLines([{ ...line(), amountFils: "1" } as ReviewLineInput])
        .subtotalFils,
    ).toBe("6000");
  });

  it.each([
    "",
    "-1",
    "0",
    "0.0000",
    "1.23456",
    ".5",
    "1.",
    "1e3",
    "NaN",
    "Infinity",
    "1,000",
    "1 000",
  ])("rejects invalid quantity %s", (quantity) => {
    expect(() => calculateItemLines([line({ quantity })])).toThrow(/quantity/);
  });
  it.each([
    "",
    "-0.01",
    "1.23456",
    ".5",
    "1.",
    "1e3",
    "NaN",
    "Infinity",
    "1,000",
  ])("rejects invalid rate %s", (rate) => {
    expect(() => calculateItemLines([line({ rate })])).toThrow(/rate/);
  });

  it("requires a real row, required text and bounded input", () => {
    expect(() => calculateItemLines([])).toThrow(/between 1 and 80/);
    expect(
      calculateItemLines(Array.from({ length: 80 }, () => line())).items,
    ).toHaveLength(80);
    expect(() =>
      calculateItemLines(Array.from({ length: 81 }, () => line())),
    ).toThrow(/between 1 and 80/);
    expect(() => calculateItemLines([line({ description: " " })])).toThrow(
      /description/,
    );
    expect(() =>
      calculateItemLines([line({ description: "a".repeat(501) })]),
    ).toThrow(/description/);
    expect(() => calculateItemLines([line({ unit: "" })])).toThrow(/unit/);
    expect(() =>
      calculateItemLines([line({ details: "a".repeat(1001) })]),
    ).toThrow(/details/);
    expect(() =>
      calculateItemLines([line({ quantity: "9".repeat(19) })]),
    ).toThrow(/quantity/);
    expect(() =>
      calculateItemLines([null as unknown as ReviewLineInput]),
    ).toThrow(/invalid item/);
    expect(() =>
      calculateItemLines([line({ rate: 1 as unknown as string })]),
    ).toThrow(/rate/);
  });

  it("creates independent editable defaults", () => {
    const first = blankReviewLine();
    first.quantity = "2";
    expect(blankReviewLine()).toEqual({
      description: "",
      quantity: "1",
      unit: "Nos",
      rate: "",
    });
  });
});

describe("comparable catalog price notices", () => {
  it("flags increases/decreases only for a matching supplier and unit", () => {
    expect(
      comparableCatalogPrice(line({ rate: "7" }), "Demo Supplier", [product]),
    ).toEqual({
      referenceRate: "6.00",
      currentRate: "7",
      direction: "increase",
    });
    expect(
      comparableCatalogPrice(
        line({
          productId: "p1",
          description: "Custom description",
          rate: "5.0000",
        }),
        " demo supplier ",
        [product],
      )?.direction,
    ).toBe("decrease");
    expect(
      comparableCatalogPrice(line({ rate: "6.0000" }), "Demo Supplier", [
        product,
      ]),
    ).toBeUndefined();
  });

  it("does not infer a price history from an unmatched or ambiguous reference", () => {
    expect(
      comparableCatalogPrice(line({ rate: "8" }), "Other supplier", [product]),
    ).toBeUndefined();
    expect(
      comparableCatalogPrice(line({ rate: "8", unit: "Kg" }), "Demo Supplier", [
        product,
      ]),
    ).toBeUndefined();
    expect(
      comparableCatalogPrice(
        line({ rate: "8", productId: "missing" }),
        "Demo Supplier",
        [product],
      ),
    ).toBeUndefined();
    expect(
      comparableCatalogPrice(line({ rate: "8" }), "Demo Supplier", [
        product,
        { ...product, id: "p2" },
      ]),
    ).toBeUndefined();
    expect(
      comparableCatalogPrice(line({ rate: "invalid" }), "Demo Supplier", [
        product,
      ]),
    ).toBeUndefined();
    expect(
      comparableCatalogPrice(line({ rate: "8" }), "", [product]),
    ).toBeUndefined();
  });
});
