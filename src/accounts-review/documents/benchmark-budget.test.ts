import { describe, expect, it } from "vitest";
import {
  exposure,
  meterBudget,
  newBudget,
  reserveBudget,
  tokenCostUpperMicroUsd,
  validateBudget,
} from "./benchmark-budget";
describe("combined USD 5 synthetic benchmark budget", () => {
  it("shares the limit across both providers, including process-reloaded history", () => {
    const a = reserveBudget(newBudget(), "q1", "qwen", 2_500_000, 2_500_000);
    const b = reserveBudget(
      JSON.parse(JSON.stringify(a)),
      "d1",
      "deepseek",
      2_500_000,
      2_500_000,
    );
    expect(exposure(b)).toBe(5_000_000);
    expect(() => reserveBudget(b, "d2", "deepseek", 1, 5_000_000)).toThrow(
      /cap/,
    );
    expect(newBudget().records).toHaveLength(0);
  });
  it("enforces the individual account allocation as well as the global cap", () => {
    const s = reserveBudget(newBudget(), "one", "qwen", 2_000_000, 2_500_000);
    expect(() => reserveBudget(s, "two", "qwen", 500_001, 2_500_000)).toThrow(
      /cap/,
    );
    expect(
      reserveBudget(s, "other", "deepseek", 500_001, 2_500_000).records,
    ).toHaveLength(2);
  });
  it("retains worst-case exposure for HTTP errors, timeouts and unknown billing", () => {
    const pending = reserveBudget(
      newBudget(),
      "timeout",
      "qwen",
      300_000,
      2_500_000,
    );
    const failed = meterBudget(pending, "timeout", null);
    expect(exposure(failed)).toBe(300_000);
    expect(failed.records[0].status).toBe("uncertain");
    expect(() =>
      reserveBudget(failed, "timeout", "qwen", 300_000, 2_500_000),
    ).toThrow(/already/);
  });
  it("releases only the verified unused reservation and never settles twice", () => {
    const pending = reserveBudget(
      newBudget(),
      "one",
      "qwen",
      300_000,
      2_500_000,
    );
    const metered = meterBudget(pending, "one", 500);
    expect(exposure(metered)).toBe(500);
    expect(() => meterBudget(metered, "one", 500)).toThrow(/once/);
    expect(() => meterBudget(pending, "one", 300_001)).toThrow(
      /stop and reconcile/,
    );
  });
  it("rejects excessive/tampered limits and invalid monetary inputs", () => {
    for (const limit of [5_000_001, -1, Infinity, NaN, 0.1])
      expect(() =>
        validateBudget({ ...newBudget(), limitMicroUsd: limit }),
      ).toThrow();
    expect(() =>
      reserveBudget(newBudget(), "bad", "qwen", -1, 2_500_000),
    ).toThrow();
    expect(() =>
      reserveBudget(newBudget(), "bad", "qwen", 1, 5_000_001),
    ).toThrow();
  });
  it("rounds costs upward without treating published rates as an invoice", () => {
    expect(tokenCostUpperMicroUsd(4000, 1000, 0.03, 0.13)).toBe(250);
    expect(tokenCostUpperMicroUsd(1, 1, 0.03, 0.13)).toBe(1);
    expect(() => tokenCostUpperMicroUsd(-1, 100, 0.03, 0.13)).toThrow();
  });
});
