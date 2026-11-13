import { useState, type FormEvent } from "react";
import type { Account } from "../accounting/model";

/** Account metadata only. Opening balances and journals are separate commands. */
export function LedgerSetup({
  accounts,
  act,
}: {
  accounts: readonly Account[];
  act: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const saved = await act({
        kind: "create-ledger-account",
        code: String(values.get("code") || ""),
        name: String(values.get("name") || ""),
        type: String(values.get("type") || ""),
        postable: values.get("postable") === "true",
      });
      setFailed(!saved);
      setMessage(
        saved
          ? "Account saved. No opening balance or financial posting was created."
          : "Account not saved. Review the displayed error; your entered details are retained.",
      );
      if (saved) form.reset();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Account could not be saved. Your details are retained.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel review-card" aria-label="Chart of Accounts setup">
      <h2>Chart of Accounts</h2>
      <p>
        Prepare the company account codes and classifications. This does not
        enter or approve any opening balance.
      </p>
      <details>
        <summary>+ Add account</summary>
        <form className="review-form" onSubmit={save} aria-busy={busy}>
          <div className="field-grid">
            <label>
              Account code
              <input
                name="code"
                required
                maxLength={40}
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <label>
              Account name
              <input
                name="name"
                required
                maxLength={100}
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <label>
              Account type
              <select
                name="type"
                aria-label="Account type"
                required
                defaultValue=""
                disabled={busy}
              >
                <option value="" disabled>
                  Select classification
                </option>
                {[
                  "Asset",
                  "Liability",
                  "Equity",
                  "Income",
                  "Cost of Sales",
                  "Expense",
                ].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              Account use
              <select
                name="postable"
                aria-label="Account use"
                defaultValue="true"
                disabled={busy}
              >
                <option value="true">Individual account</option>
                <option value="false">Grouping account</option>
              </select>
            </label>
          </div>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving account…" : "Save account"}
          </button>
          {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        </form>
      </details>
      {accounts.length > 0 && (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Configured chart accounts scrolling area"
        >
          <table aria-label="Configured chart accounts">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th>Use</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.code}</td>
                  <td>{account.name}</td>
                  <td>{account.type}</td>
                  <td>{account.postable ? "Individual account" : "Group"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
