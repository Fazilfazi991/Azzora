import { reviewSnapshot, type ReviewState } from "./domain.js";

export interface ReviewReportSelection {
  asOf: string;
  from: string;
  to: string;
}
const isoDate = (value: string): string => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw Error("Enter a valid reporting date.");
  return value;
};
export function reportSelection(
  url: URL,
  now = new Date(),
): ReviewReportSelection {
  const asOf = isoDate(
    url.searchParams.get("asOf") ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dubai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now),
  );
  const from = isoDate(
    url.searchParams.get("from") || `${asOf.slice(0, 4)}-01-01`,
  );
  const to = isoDate(url.searchParams.get("to") || asOf);
  if (from > to)
    throw Error("Reporting start date must not follow its end date.");
  return { asOf, from, to };
}
export const selectedSnapshot = (
  state: ReviewState,
  selection: ReviewReportSelection,
) =>
  reviewSnapshot(state, selection.asOf, {
    from: selection.from,
    to: selection.to,
  });
