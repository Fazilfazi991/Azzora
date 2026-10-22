import { describe, expect, it } from "vitest";
import type { ReviewDocument } from "./domain";
import { calculateItemLines, type ReviewLineInput } from "./item-lines";
import { purchasePriceWarnings } from "./review-purchase-prices";

const item = (
  rate = "6.00",
  productId: string | undefined = "SKU-1",
): ReviewLineInput => ({
  description: "Demo fitting",
  productId,
  quantity: "2",
  unit: "Nos",
  rate,
});
function bill(
  id: string,
  date: string,
  rate = "6.00",
  overrides: Partial<ReviewDocument> = {},
): ReviewDocument {
  const calculated = calculateItemLines([item(rate)]);
  return {
    id,
    party: "Demo Supplier",
    date,
    due: date,
    description: "Fittings",
    status: "Issued",
    items: calculated.items,
    amountFils: calculated.subtotalFils,
    subtotalFils: calculated.subtotalFils,
    taxFils: "0",
    ...overrides,
  };
}

describe("prior purchase price comparison", () => {
  it("uses the latest eligible issued purchase and reports exact rate change context", () => {
    const history = [
      bill("OLD", "2026-10-01", "5"),
      bill("LATEST", "2026-10-20", "6"),
    ];
    expect(
      purchasePriceWarnings(
        [item("7")],
        " demo   supplier ",
        "2026-10-22",
        history,
      ),
    ).toEqual([
      {
        lineIndex: 0,
        productId: "SKU-1",
        supplier: "Demo Supplier",
        unit: "Nos",
        currency: "AED",
        basis: "VAT-free",
        priorBillId: "LATEST",
        priorBillDate: "2026-10-20",
        priorRate: "6",
        currentRate: "7",
        direction: "increase",
      },
    ]);
    expect(
      purchasePriceWarnings(
        [item("4")],
        "Demo Supplier",
        "2026-10-22",
        history,
      )[0].direction,
    ).toBe("decrease");
    expect(
      purchasePriceWarnings(
        [item("6.0000")],
        "Demo Supplier",
        "2026-10-22",
        history,
      ),
    ).toEqual([]);
  });
  it("excludes current bill, future records and unissued drafts", () => {
    const history = [
      bill("OK", "2026-10-01"),
      bill("SELF", "2026-10-20", "8"),
      bill("FUTURE", "2026-10-23", "9"),
      bill("DRAFT", "2026-10-22", "10", { status: "Draft" }),
    ];
    expect(
      purchasePriceWarnings(
        [item("7")],
        "Demo Supplier",
        "2026-10-22",
        history,
        "SELF",
      )[0].priorBillId,
    ).toBe("OK");
  });
  it("requires exact SKU plus comparable supplier/unit and never guesses by description", () => {
    const history = [bill("B1", "2026-10-20")];
    expect(
      purchasePriceWarnings(
        [{ ...item("8"), productId: undefined }],
        "Demo Supplier",
        "2026-10-22",
        history,
      ),
    ).toEqual([]);
    expect(
      purchasePriceWarnings(
        [item("8", "sku-1")],
        "Demo Supplier",
        "2026-10-22",
        history,
      ),
    ).toEqual([]);
    expect(
      purchasePriceWarnings(
        [{ ...item("8"), unit: "Kg" }],
        "Demo Supplier",
        "2026-10-22",
        history,
      ),
    ).toEqual([]);
    expect(
      purchasePriceWarnings(
        [item("8")],
        "Another supplier",
        "2026-10-22",
        history,
      ),
    ).toEqual([]);
    expect(
      purchasePriceWarnings(
        [{ ...item("8"), unit: " nos " }],
        "Demo Supplier",
        "2026-10-22",
        history,
      ),
    ).toHaveLength(1);
  });
  it("requires explicit VAT-free arithmetic and rejects foreign currency or stale stored amounts", () => {
    const invalid = [
      bill("TAX", "2026-10-20", "6", { taxFils: "60" }),
      bill("UNKNOWN-TAX", "2026-10-20", "6", { taxFils: undefined }),
      bill("STALE", "2026-10-20", "6", { subtotalFils: "10" }),
      bill("BAD-TOTAL", "2026-10-20", "6", { amountFils: "10" }),
      { ...bill("USD", "2026-10-20"), currency: "USD" },
      bill("LEGACY", "2026-10-20", "6", { items: undefined }),
    ];
    expect(
      purchasePriceWarnings(
        [item("8")],
        "Demo Supplier",
        "2026-10-22",
        invalid,
      ),
    ).toEqual([]);
    const stale = bill("STORED-LINE", "2026-10-20");
    stale.items![0].amountFils = "1";
    expect(
      purchasePriceWarnings([item("8")], "Demo Supplier", "2026-10-22", [
        stale,
      ]),
    ).toEqual([]);
  });
  it("does not invent chronology when the latest date has conflicting comparable rates", () => {
    const history = [
      bill("A", "2026-10-20", "6"),
      bill("B", "2026-10-20", "7"),
    ];
    expect(
      purchasePriceWarnings(
        [item("8")],
        "Demo Supplier",
        "2026-10-22",
        history,
      ),
    ).toEqual([]);
    expect(
      purchasePriceWarnings([item("8")], "Demo Supplier", "2026-10-22", [
        history[0],
        bill("B", "2026-10-20", "6.0000"),
      ])[0].priorBillId,
    ).toBe("A");
  });
  it("keeps four-decimal price comparison even when line totals round to the same fils", () => {
    expect(
      purchasePriceWarnings([item("0.0002")], "Demo Supplier", "2026-10-22", [
        bill("PREV", "2026-10-20", "0.0001"),
      ])[0].direction,
    ).toBe("increase");
  });
  it("rejects invalid dates/rates and leaves input history unchanged", () => {
    const history = [bill("B1", "2026-10-20")];
    const original = structuredClone(history);
    expect(
      purchasePriceWarnings(
        [item("invalid")],
        "Demo Supplier",
        "2026-10-22",
        history,
      ),
    ).toEqual([]);
    expect(
      purchasePriceWarnings(
        [item("8")],
        "Demo Supplier",
        "2026-02-30",
        history,
      ),
    ).toEqual([]);
    expect(
      purchasePriceWarnings([item("8")], "Demo Supplier", "2026-10-22", [
        bill("BAD-DATE", "invalid"),
      ]),
    ).toEqual([]);
    purchasePriceWarnings([item("8")], "Demo Supplier", "2026-10-22", history);
    expect(history).toEqual(original);
  });
});
