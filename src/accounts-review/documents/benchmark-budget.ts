// Server-side evaluation safeguard. Monetary values are integer millionths of USD.
// Provider-account caps must ALSO be independently verified; this is not a substitute.
export const MAX_BENCHMARK_MICRO_USD = 5_000_000;
export type BenchmarkProvider = "qwen" | "deepseek";
export interface BudgetRecord {
  id: string;
  provider: BenchmarkProvider;
  reservedMicroUsd: number;
  meteredUpperMicroUsd?: number;
  status: "reserved" | "metered" | "uncertain";
}
export interface BudgetState {
  version: 1;
  limitMicroUsd: number;
  records: BudgetRecord[];
}
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
export const newBudget = (): BudgetState => ({
  version: 1,
  limitMicroUsd: MAX_BENCHMARK_MICRO_USD,
  records: [],
});
export function validateBudget(state: BudgetState): void {
  if (
    state.version !== 1 ||
    !integer(state.limitMicroUsd) ||
    state.limitMicroUsd > MAX_BENCHMARK_MICRO_USD ||
    !Array.isArray(state.records)
  )
    throw Error("Invalid benchmark dollar limit or ledger.");
  const ids = new Set<string>();
  for (const r of state.records) {
    if (
      !r.id ||
      ids.has(r.id) ||
      !["qwen", "deepseek"].includes(r.provider) ||
      !integer(r.reservedMicroUsd) ||
      r.reservedMicroUsd === 0 ||
      !["reserved", "metered", "uncertain"].includes(r.status) ||
      (r.status === "metered" &&
        (!integer(r.meteredUpperMicroUsd!) ||
          r.meteredUpperMicroUsd! > r.reservedMicroUsd))
    )
      throw Error("Invalid benchmark reservation history.");
    ids.add(r.id);
  }
  if (exposure(state) > state.limitMicroUsd)
    throw Error("Benchmark ledger exceeds the combined USD limit.");
}
export function exposure(
  state: BudgetState,
  provider?: BenchmarkProvider,
): number {
  return state.records
    .filter((r) => !provider || r.provider === provider)
    .reduce(
      (s, r) =>
        s +
        (r.status === "metered" ? r.meteredUpperMicroUsd! : r.reservedMicroUsd),
      0,
    );
}
export function reserveBudget(
  state: BudgetState,
  id: string,
  provider: BenchmarkProvider,
  maximum: number,
  providerCap: number,
): BudgetState {
  validateBudget(state);
  if (
    !["qwen", "deepseek"].includes(provider) ||
    !integer(maximum) ||
    maximum <= 0 ||
    !integer(providerCap) ||
    providerCap <= 0 ||
    providerCap > MAX_BENCHMARK_MICRO_USD
  )
    throw Error(
      "A verified provider cap and nonzero maximum charge are required.",
    );
  if (state.records.some((r) => r.id === id))
    throw Error(
      "This request is already reserved; review its result before retrying.",
    );
  if (
    exposure(state) + maximum > state.limitMicroUsd ||
    exposure(state, provider) + maximum > providerCap
  )
    throw Error("Request would exceed the combined or provider spending cap.");
  return {
    ...state,
    records: [
      ...state.records,
      { id, provider, reservedMicroUsd: maximum, status: "reserved" },
    ],
  };
}
export function meterBudget(
  state: BudgetState,
  id: string,
  upper: number | null,
): BudgetState {
  validateBudget(state);
  const r = state.records.find((r) => r.id === id);
  if (!r || r.status !== "reserved")
    throw Error("Only a pending reservation can be metered once.");
  if (upper !== null && (!integer(upper) || upper > r.reservedMicroUsd))
    throw Error(
      "Usage exceeded its reservation; stop and reconcile provider billing.",
    );
  const next = {
    ...state,
    records: state.records.map((r) =>
      r.id === id
        ? {
            ...r,
            ...(upper === null
              ? { status: "uncertain" as const }
              : { status: "metered" as const, meteredUpperMicroUsd: upper }),
          }
        : r,
    ),
  };
  validateBudget(next);
  return next;
}
export function tokenCostUpperMicroUsd(
  input: number,
  output: number,
  inputUsdPerMillion: number,
  outputUsdPerMillion: number,
): number {
  if (
    !integer(input) ||
    !integer(output) ||
    !Number.isFinite(inputUsdPerMillion) ||
    inputUsdPerMillion <= 0 ||
    !Number.isFinite(outputUsdPerMillion) ||
    outputUsdPerMillion <= 0
  )
    throw Error("Valid usage and verified token rates are required.");
  return Math.ceil(input * inputUsdPerMillion + output * outputUsdPerMillion);
}
