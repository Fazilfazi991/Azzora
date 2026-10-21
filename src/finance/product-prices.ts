/**
 * Stable SKU and purchase-price history for synthetic/demo comparisons.
 * Net line amounts are supplied explicitly; this module never invents VAT or FX policy.
 */
export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  /** Rates may be compared only in this explicitly normalized unit. */
  comparisonUnit: string;
}

export interface PurchasePriceInput {
  id: string;
  productId: string;
  supplierId: string;
  sourceDocumentId: string;
  sourceLineId: string;
  purchaseDate: string;
  currency: string;
  unit: string;
  taxBasis: string;
  quantityUnits: string;
  /** Line subtotal before discount and excluding VAT, in minor currency units. */
  subtotalMinor: string;
  discountMinor: string;
  /** Source VAT is retained for review, not used in the comparable net rate. */
  vatMinor: string;
  comment?: string;
}

export interface PurchasePriceObservation extends PurchasePriceInput {
  /** Rounded once, half-up, after discount; never derived using binary floats. */
  netUnitPriceMinor: string;
}

export interface ProductPriceState {
  version: 1;
  products: readonly CatalogProduct[];
  observations: readonly PurchasePriceObservation[];
}

export type PriceComparisonScope = "same-supplier" | "any-supplier";

export interface PriceChangeAlert {
  kind: "first-purchase" | "increase" | "decrease" | "unchanged";
  scope: PriceComparisonScope;
  productId: string;
  supplierId: string;
  previous?: PurchasePriceObservation;
  currentNetUnitPriceMinor: string;
  differenceMinor?: string;
  changePercent?: string;
}

function required(value: string, label: string) {
  if (!value?.trim()) throw Error(`${label} is required.`);
}

function nonnegative(value: string, label: string) {
  if (!/^(0|[1-9]\d*)$/.test(value))
    throw Error(`${label} must be nonnegative integer minor units.`);
  return BigInt(value);
}

function positive(value: string, label: string) {
  const amount = nonnegative(value, label);
  if (amount === 0n) throw Error(`${label} must be positive.`);
  return amount;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Invalid purchase date.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw Error("Invalid purchase date.");
}

export const emptyProductPrices = (): ProductPriceState => ({
  version: 1,
  products: [],
  observations: [],
});

export function addCatalogProduct(
  state: ProductPriceState,
  input: CatalogProduct,
): ProductPriceState {
  for (const [value, label] of [
    [input.id, "Product ID"],
    [input.sku, "SKU"],
    [input.name, "Product name"],
    [input.comparisonUnit, "Comparison unit"],
  ])
    required(value, label);
  const sku = input.sku.trim().toUpperCase();
  if (
    state.products.some(
      (product) => product.id === input.id || product.sku === sku,
    )
  )
    throw Error("Product ID and SKU must be unique.");
  return {
    ...state,
    products: [...state.products, { ...input, sku }],
  };
}

/** Excludes explicit discount and supplied VAT without determining tax treatment. */
export function normalizedNetUnitPriceMinor(input: PurchasePriceInput): string {
  const quantity = positive(input.quantityUnits, "Purchase quantity");
  const subtotal = positive(input.subtotalMinor, "Purchase subtotal");
  const discount = nonnegative(input.discountMinor, "Purchase discount");
  nonnegative(input.vatMinor, "Purchase VAT");
  if (discount >= subtotal)
    throw Error("Discount must be below line subtotal.");
  const net = subtotal - discount;
  const rounded = (net + quantity / 2n) / quantity;
  if (rounded <= 0n)
    throw Error("Normalized purchase unit price must be positive.");
  return rounded.toString();
}

function normalizeObservation(
  state: ProductPriceState,
  input: PurchasePriceInput,
): PurchasePriceObservation {
  for (const [value, label] of [
    [input.id, "Price observation ID"],
    [input.productId, "Product ID"],
    [input.supplierId, "Supplier ID"],
    [input.sourceDocumentId, "Purchase source document"],
    [input.sourceLineId, "Purchase source line"],
    [input.currency, "Currency"],
    [input.unit, "Purchase unit"],
    [input.taxBasis, "Tax basis"],
  ])
    required(value, label);
  validDate(input.purchaseDate);
  const product = state.products.find((item) => item.id === input.productId);
  if (!product)
    throw Error("Price observation needs a catalog product ID/SKU.");
  if (product.comparisonUnit !== input.unit)
    throw Error(
      "Purchase unit differs from the product comparison unit; configure an explicit conversion first.",
    );
  if (!/^[A-Z]{3}$/.test(input.currency))
    throw Error("Currency must be a three-letter ISO code.");
  return { ...input, netUnitPriceMinor: normalizedNetUnitPriceMinor(input) };
}

export function recordPurchasePrice(
  state: ProductPriceState,
  input: PurchasePriceInput,
): ProductPriceState {
  const next = normalizeObservation(state, input);
  const prior = state.observations.find((item) => item.id === next.id);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(next))
      throw Error("Price observation ID was reused for different data.");
    return state;
  }
  if (
    state.observations.some(
      (item) =>
        item.sourceDocumentId === next.sourceDocumentId &&
        item.sourceLineId === next.sourceLineId,
    )
  )
    throw Error("Purchase source line is already in price history.");
  return { ...state, observations: [...state.observations, next] };
}

function formattedPercent(basisPoints: bigint): string {
  const sign = basisPoints < 0n ? "-" : "+";
  const absolute = basisPoints < 0n ? -basisPoints : basisPoints;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}%`;
}

/** Latest prior purchase in scope is the comparator; incompatible bases fail closed. */
export function purchasePriceAlert(
  state: ProductPriceState,
  input: PurchasePriceInput,
  scope: PriceComparisonScope = "same-supplier",
): PriceChangeAlert {
  if (!["same-supplier", "any-supplier"].includes(scope))
    throw Error("Choose a valid supplier comparison scope.");
  const current = normalizeObservation(state, input);
  const existingIndex = state.observations.findIndex(
    (item) => item.id === current.id,
  );
  const history = state.observations
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item, index }) =>
        item.productId === current.productId &&
        item.purchaseDate <= current.purchaseDate &&
        (existingIndex < 0 || index < existingIndex) &&
        (scope === "any-supplier" || item.supplierId === current.supplierId),
    )
    .sort(
      (a, b) =>
        b.item.purchaseDate.localeCompare(a.item.purchaseDate) ||
        b.index - a.index,
    );
  const previous = history[0]?.item;
  if (!previous) {
    return {
      kind: "first-purchase",
      scope,
      productId: current.productId,
      supplierId: current.supplierId,
      currentNetUnitPriceMinor: current.netUnitPriceMinor,
    };
  }
  if (previous.unit !== current.unit)
    throw Error(
      "Purchase units differ; normalize them before comparing prices.",
    );
  if (previous.currency !== current.currency)
    throw Error(
      "Currencies differ; exchange-rate policy is required before comparison.",
    );
  if (previous.taxBasis !== current.taxBasis)
    throw Error("Tax bases differ; a comparable tax treatment is required.");
  const prior = BigInt(previous.netUnitPriceMinor);
  const now = BigInt(current.netUnitPriceMinor);
  const difference = now - prior;
  const absolute = difference < 0n ? -difference : difference;
  const roundedBps = (absolute * 10000n + prior / 2n) / prior;
  const signedBps = difference < 0n ? -roundedBps : roundedBps;
  return {
    kind:
      difference > 0n ? "increase" : difference < 0n ? "decrease" : "unchanged",
    scope,
    productId: current.productId,
    supplierId: current.supplierId,
    previous: { ...previous },
    currentNetUnitPriceMinor: current.netUnitPriceMinor,
    differenceMinor: difference.toString(),
    changePercent: difference === 0n ? "0.00%" : formattedPercent(signedBps),
  };
}
