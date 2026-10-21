import { describe, expect, it } from "vitest";
import {
  addCatalogProduct,
  emptyProductPrices,
  normalizedNetUnitPriceMinor,
  purchasePriceAlert,
  recordPurchasePrice,
  type PurchasePriceInput,
} from "./product-prices";

const product = {
  id: "product-plumbing-a",
  sku: "PLUMB-A",
  name: "Plumbing Item A",
  comparisonUnit: "each",
};
const prior: PurchasePriceInput = {
  id: "price-1",
  productId: product.id,
  supplierId: "supplier-a",
  sourceDocumentId: "bill-1",
  sourceLineId: "line-1",
  purchaseDate: "2026-10-01",
  currency: "AED",
  unit: "each",
  taxBasis: "exclusive-standard",
  quantityUnits: "1",
  subtotalMinor: "500",
  discountMinor: "0",
  vatMinor: "25",
};
const current: PurchasePriceInput = {
  ...prior,
  id: "price-2",
  sourceDocumentId: "bill-2",
  sourceLineId: "line-2",
  purchaseDate: "2026-10-21",
  subtotalMinor: "600",
  vatMinor: "30",
};
const catalog = () => addCatalogProduct(emptyProductPrices(), product);

describe("stable product identity and normalized purchase prices", () => {
  it("keeps a stable ID/SKU and rejects duplicate catalog identities", () => {
    const state = catalog();
    expect(state.products[0]).toMatchObject({ id: product.id, sku: "PLUMB-A" });
    expect(() =>
      addCatalogProduct(state, { ...product, id: "other", sku: "plumb-a" }),
    ).toThrow(/unique/);
    expect(() =>
      addCatalogProduct(state, { ...product, sku: "different" }),
    ).toThrow(/unique/);
  });

  it("detects AED 5 to AED 6 as a 20% same-supplier increase", () => {
    const state = recordPurchasePrice(catalog(), prior);
    const alert = purchasePriceAlert(state, current);
    expect(alert).toMatchObject({
      kind: "increase",
      scope: "same-supplier",
      previous: { id: "price-1", netUnitPriceMinor: "500" },
      currentNetUnitPriceMinor: "600",
      differenceMinor: "100",
      changePercent: "+20.00%",
    });
    const recorded = recordPurchasePrice(state, current);
    expect(recorded.observations.map((item) => item.id)).toEqual([
      "price-1",
      "price-2",
    ]);
    expect(recordPurchasePrice(recorded, current)).toBe(recorded);
  });

  it("detects decreases, unchanged rates, and discounts without float rounding", () => {
    const state = recordPurchasePrice(catalog(), prior);
    expect(
      purchasePriceAlert(state, {
        ...current,
        subtotalMinor: "400",
        vatMinor: "20",
      }),
    ).toMatchObject({
      kind: "decrease",
      differenceMinor: "-100",
      changePercent: "-20.00%",
    });
    expect(
      purchasePriceAlert(state, { ...current, subtotalMinor: "500" }),
    ).toMatchObject({ kind: "unchanged", changePercent: "0.00%" });
    expect(
      normalizedNetUnitPriceMinor({
        ...current,
        subtotalMinor: "1100",
        discountMinor: "100",
        quantityUnits: "2",
      }),
    ).toBe("500");
    expect(
      purchasePriceAlert(state, {
        ...current,
        subtotalMinor: "700",
        discountMinor: "100",
      }).kind,
    ).toBe("increase");
  });

  it("separates same-supplier and any-supplier comparison", () => {
    const state = recordPurchasePrice(catalog(), prior);
    const otherSupplier = { ...current, supplierId: "supplier-b" };
    expect(purchasePriceAlert(state, otherSupplier).kind).toBe(
      "first-purchase",
    );
    expect(
      purchasePriceAlert(state, otherSupplier, "any-supplier"),
    ).toMatchObject({
      kind: "increase",
      previous: { supplierId: "supplier-a" },
    });
  });

  it("fails closed on unit, currency or tax-basis mismatch", () => {
    const state = recordPurchasePrice(catalog(), prior);
    expect(() =>
      purchasePriceAlert(state, { ...current, unit: "pack" }),
    ).toThrow(/unit differs/);
    expect(() =>
      purchasePriceAlert(state, { ...current, currency: "USD" }),
    ).toThrow(/Currencies differ/);
    expect(() =>
      purchasePriceAlert(state, { ...current, taxBasis: "inclusive-standard" }),
    ).toThrow(/Tax bases differ/);
  });

  it("preserves source history and blocks conflicting retries or duplicated source lines", () => {
    const state = recordPurchasePrice(catalog(), prior);
    expect(() =>
      recordPurchasePrice(state, { ...prior, subtotalMinor: "600" }),
    ).toThrow(/different data/);
    expect(() =>
      recordPurchasePrice(state, {
        ...current,
        sourceDocumentId: "bill-1",
        sourceLineId: "line-1",
      }),
    ).toThrow(/already in price history/);
    expect(state.observations[0].subtotalMinor).toBe("500");
  });
});
