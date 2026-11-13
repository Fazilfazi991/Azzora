import { useState } from "react";
import {
  inspectOpeningSetup,
  openingSetupSchema,
  type OpeningSetupDraft,
} from "./opening-setup";
import { displayMoney, type ProductionFinanceView } from "./completion-ui";

/** An incomplete setup draft, never an opening journal or posting approval. */
export function OpeningSetup({
  saved,
  act,
  finance,
}: {
  saved?: OpeningSetupDraft;
  act: (action: Record<string, unknown>) => Promise<boolean>;
  finance?: ProductionFinanceView;
}) {
  const [draft, setDraft] = useState<OpeningSetupDraft>(() =>
    structuredClone(saved || { date: "", rows: [], notes: "" }),
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [open, setOpen] = useState(!saved);
  const parsed = openingSetupSchema.safeParse(draft);
  const review = parsed.success ? inspectOpeningSetup(parsed.data) : undefined;
  const locked = finance?.openingStatus === "posted";
  const savedParsed = openingSetupSchema.safeParse(saved);
  const unsaved =
    !parsed.success ||
    !savedParsed.success ||
    JSON.stringify(parsed.data) !== JSON.stringify(savedParsed.data);
  async function transition(
    kind: "opening-reconcile" | "opening-approve" | "opening-post",
  ) {
    if (busy || unsaved || !finance?.openingDigest) return;
    const question =
      kind === "opening-post"
        ? "Post exactly these reconciled and Owner-approved opening balances once? This creates financial journal entries."
        : kind === "opening-approve"
          ? "Approve this exact reconciled opening trial balance and its outstanding documents?"
          : "Confirm that all starting balances and outstanding documents are included and this trial balance reconciles?";
    if (!window.confirm(question)) return;
    setBusy(true);
    setMessage("");
    try {
      if (
        await act({
          kind,
          id: "opening-setup",
          revision: finance.openingRevision,
          digest: finance.openingDigest,
          confirmed: true,
          ...(kind === "opening-reconcile" ? { complete: true } : {}),
        })
      )
        setMessage(
          kind === "opening-post"
            ? "Approved opening balances posted once. Refresh or inspect the General Ledger to verify the recorded result."
            : kind === "opening-approve"
              ? "Reconciled opening balances approved. No financial posting has been made."
              : "Opening trial balance marked reconciled. Owner approval is still required before posting.",
        );
      else
        setMessage(
          "This action was not confirmed. Your entries remain here. Refresh the saved review before another attempt.",
        );
    } catch (problem) {
      setMessage(
        problem instanceof Error
          ? problem.message
          : "Action not confirmed. Check the saved opening review before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const update = (id: string, key: string, value: string) => {
    setMessage("");
    setDraft((old) => ({
      ...old,
      rows: old.rows.map((row) =>
        row.id === id ? { ...row, [key]: value } : row,
      ),
    }));
  };
  return (
    <details
      className="panel review-card"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Opening balances — setup draft</summary>
      <p>
        Record bank/cash, ledger balances and each outstanding customer invoice
        or supplier bill for review. Blank amounts mean not supplied; they do
        not mean zero.
      </p>
      {finance?.approved && (
        <p role="status">
          Opening review: {finance.openingStatus.replaceAll("-", " ")}.{" "}
          {locked
            ? "These opening balances are posted and read only."
            : "Opening amounts remain unposted until the reviewed workflow is complete."}
        </p>
      )}
      <form
        className="review-form"
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || locked) return;
          setMessage("");
          if (!parsed.success) {
            setMessage(
              parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(" "),
            );
            return;
          }
          setBusy(true);
          try {
            if (
              await act({
                kind: "opening-setup-draft",
                id: "opening-setup",
                draft: parsed.data,
              })
            )
              setMessage(
                "Opening setup draft saved. No opening entries or financial postings were created.",
              );
            else
              setMessage(
                "Save was not confirmed. Your draft is still here; review the error before retrying.",
              );
          } catch (problem) {
            setMessage(
              problem instanceof Error
                ? problem.message
                : "Save was not confirmed. Your entries are preserved.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Proposed opening date{" "}
          <input
            type="date"
            value={draft.date}
            disabled={busy || locked}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </label>
        {draft.rows.map((row, index) => (
          <fieldset key={row.id} disabled={busy || locked}>
            <legend>Opening line {index + 1}</legend>
            <div className="field-grid">
              <label>
                Entry type{" "}
                <select
                  value={row.kind}
                  onChange={(e) => update(row.id, "kind", e.target.value)}
                >
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                  <option value="petty-cash">Petty cash</option>
                  <option value="customer-invoice">
                    Customer outstanding invoice
                  </option>
                  <option value="supplier-bill">
                    Supplier outstanding bill
                  </option>
                  <option value="ledger">Other ledger balance</option>
                </select>
              </label>
              <label>
                Account / customer / supplier{" "}
                <input
                  value={row.accountOrParty}
                  maxLength={200}
                  onChange={(e) =>
                    update(row.id, "accountOrParty", e.target.value)
                  }
                />
              </label>
              <label>
                Document / account reference{" "}
                <input
                  value={row.reference}
                  maxLength={200}
                  onChange={(e) => update(row.id, "reference", e.target.value)}
                />
              </label>
              <label>
                Document date{" "}
                <input
                  type="date"
                  value={row.documentDate}
                  onChange={(e) =>
                    update(row.id, "documentDate", e.target.value)
                  }
                />
              </label>
              <label>
                Due date{" "}
                <input
                  type="date"
                  value={row.dueDate}
                  onChange={(e) => update(row.id, "dueDate", e.target.value)}
                />
              </label>
              <label>
                Debit (AED){" "}
                <input
                  inputMode="decimal"
                  value={row.debit}
                  onChange={(e) => update(row.id, "debit", e.target.value)}
                />
              </label>
              <label>
                Credit (AED){" "}
                <input
                  inputMode="decimal"
                  value={row.credit}
                  onChange={(e) => update(row.id, "credit", e.target.value)}
                />
              </label>
              <label>
                Notes{" "}
                <input
                  value={row.notes}
                  maxLength={1000}
                  onChange={(e) => update(row.id, "notes", e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  rows: draft.rows.filter((item) => item.id !== row.id),
                })
              }
            >
              Remove line {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button"
          disabled={busy || locked || draft.rows.length >= 1000}
          onClick={() =>
            setDraft({
              ...draft,
              rows: [
                ...draft.rows,
                {
                  id: crypto.randomUUID(),
                  kind: "ledger",
                  accountOrParty: "",
                  reference: "",
                  documentDate: "",
                  dueDate: "",
                  debit: "",
                  credit: "",
                  notes: "",
                },
              ],
            })
          }
        >
          + Add opening line
        </button>
        <label>
          Reconciliation notes{" "}
          <textarea
            value={draft.notes}
            maxLength={4000}
            disabled={busy || locked}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        {review && (
          <section aria-label="Opening trial balance review">
            <p>
              Draft debit: {displayMoney(review.debitFils)} · Draft credit:{" "}
              {displayMoney(review.creditFils)} · Difference:{" "}
              {displayMoney(review.differenceFils)}
            </p>
            {review.warnings.length > 0 && (
              <ul>
                {review.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </section>
        )}
        <p>
          Owner and Accountant approval of the complete reconciled opening trial
          balance, financial policies and cutover is required before any
          financially effective opening entry. Saving this draft does not
          approve or post it.
        </p>
        {message && <p role="status">{message}</p>}
        <button
          type="submit"
          className="button button-primary"
          disabled={busy || locked}
        >
          {busy ? "Saving setup draft…" : "Save opening setup draft"}
        </button>
        {finance?.approved && !locked && (
          <div className="review-actions">
            {unsaved && (
              <p>Save your current draft before reconciliation or approval.</p>
            )}
            {finance.mayReconcile && (
              <button
                type="button"
                className="button"
                disabled={
                  busy ||
                  unsaved ||
                  !finance.openingDigest ||
                  !review ||
                  review.warnings.length > 0
                }
                onClick={() => void transition("opening-reconcile")}
              >
                Confirm reconciled openings
              </button>
            )}
            {finance.mayApproveOpenings && (
              <button
                type="button"
                className="button"
                disabled={busy || unsaved || !finance.openingDigest}
                onClick={() => void transition("opening-approve")}
              >
                Owner: approve reconciled openings
              </button>
            )}
            {finance.mayPostOpenings && (
              <button
                type="button"
                className="button button-primary"
                disabled={busy || unsaved || !finance.openingDigest}
                onClick={() => void transition("opening-post")}
              >
                Post approved opening balances
              </button>
            )}
          </div>
        )}
      </form>
    </details>
  );
}
