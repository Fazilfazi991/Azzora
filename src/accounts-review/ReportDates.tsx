import { useState, type FormEvent } from "react";
import type { CompletionSnapshot } from "./completion-ui";

export function ReportDates({
  data,
  apply,
}: {
  data: CompletionSnapshot;
  apply: (values: { from: string; to: string; asOf: string }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const from = String(values.get("from")),
      to = String(values.get("to")),
      asOf = String(values.get("asOf"));
    if (from > to) {
      setError("The period start must be on or before its end.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apply({ from, to, asOf });
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Report dates could not be applied.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="panel review-form report-date-controls"
      onSubmit={submit}
      aria-label="Report dates"
      aria-busy={busy}
    >
      <div
        className="field-grid"
        key={`${data.period.from}/${data.period.to}/${data.asOf}`}
      >
        <label>
          Period from
          <input
            type="date"
            name="from"
            defaultValue={data.period.from}
            required
            disabled={busy}
          />
        </label>
        <label>
          Period to
          <input
            type="date"
            name="to"
            defaultValue={data.period.to}
            required
            disabled={busy}
          />
        </label>
        <label>
          Balances as of
          <input
            type="date"
            name="asOf"
            defaultValue={data.asOf}
            required
            disabled={busy}
          />
        </label>
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Loading…" : "Apply dates"}
        </button>
      </div>
      <p>
        Period dates filter activity. The as-of date controls balances and
        aging.
      </p>
      {error && (
        <p className="review-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
