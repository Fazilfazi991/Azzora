import { expect, it } from "vitest";
import {
  applyReviewAction,
  createReviewState,
  type ReviewAction,
  type ReviewRecordingContext,
} from "./domain";
import { createEmptyProductionFinance } from "../finance/production-policy";
const date = "2026-11-11",
  recordedAt = "2026-11-11T19:42:03.456Z";
const fixture = () =>
  createEmptyProductionFinance({
    accounts: createReviewState().accounting.accounts,
    periods: [
      { id: "test", start: "2026-01-01", end: "2026-12-31", status: "Open" },
    ],
  });
const invoice = (id = "SYN-1"): ReviewAction => ({
  kind: "invoice",
  id,
  party: "Synthetic customer",
  date,
  due: date,
  description: "Synthetic invoice",
  amount: "10.00",
  issue: true,
  invoiceType: "Normal Invoice",
});
const recording: ReviewRecordingContext = { mode: "production", recordedAt };
it("production journal recording time comes only from separate trusted context, never posting date or action fields", () => {
  const before = fixture(),
    next = applyReviewAction(
      before,
      {
        ...invoice(),
        recordedAt: "1999-01-01T00:00:00.000Z",
      } as unknown as ReviewAction,
      recording,
    );
  expect(next.accounting.journals[0]).toMatchObject({ date, recordedAt });
  expect(before.accounting.journals).toEqual([]);
  expect(next.accounting.journals[0].recordedAt).not.toBe(
    date + "T12:00:00.000Z",
  );
});
it("staging/default recordings retain their existing deterministic timestamps", () => {
  const next = applyReviewAction(fixture(), invoice());
  expect(next.accounting.journals[0].recordedAt).toBe(date + "T12:00:00.000Z");
});
it("rejects invalid or stale clocks without manufacturing a timestamp or changing history", () => {
  const first = applyReviewAction(fixture(), invoice(), recording),
    before = structuredClone(first);
  for (const value of [
    "bad",
    "2026-11-11T19:42:03Z",
    "2026-11-10T19:42:03.456Z",
    recordedAt,
  ])
    expect(() =>
      applyReviewAction(first, invoice("SYN-2"), {
        mode: "production",
        recordedAt: value,
      }),
    ).toThrow(/timestamp|clock/);
  expect(first).toEqual(before);
  const next = applyReviewAction(first, invoice("SYN-2"), {
    mode: "production",
    recordedAt: "2026-11-11T19:42:03.457Z",
  });
  expect(next.accounting.journals[0]).toEqual(first.accounting.journals[0]);
  expect(next.accounting.journals[1].recordedAt).toBe(
    "2026-11-11T19:42:03.457Z",
  );
});
it("receipt posting uses its transaction recording time and rejects duplicate IDs without a second journal", () => {
  const first = applyReviewAction(fixture(), invoice(), recording),
    receipt: ReviewAction = {
      kind: "receipt",
      id: "SYN-R1",
      documentId: "SYN-1",
      date,
      amount: "5.00",
      account: "bank",
    },
    stamp: ReviewRecordingContext = {
      mode: "production",
      recordedAt: "2026-11-11T19:42:04.000Z",
    };
  const next = applyReviewAction(first, receipt, stamp),
    before = structuredClone(next);
  expect(next.accounting.journals[1].recordedAt).toBe(stamp.recordedAt);
  expect(() =>
    applyReviewAction(next, receipt, {
      mode: "production",
      recordedAt: "2026-11-11T19:42:05.000Z",
    }),
  ).toThrow();
  expect(next).toEqual(before);
});
