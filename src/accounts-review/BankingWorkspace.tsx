import { useRef, useState, type FormEvent } from "react";
import {
  cashAccountsFor,
  displayMoney,
  type CompletionSnapshot,
} from "./completion-ui";

/** One posting route, through the portal's existing authenticated action API. */
export function BankingWorkspace({
  data,
  act,
}: {
  data: CompletionSnapshot;
  act: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  const accounts = cashAccountsFor(data);
  const [selected, setSelected] = useState("bank");
  const [form, setForm] = useState<"transfer" | "account" | null>(null);
  const [accountType, setAccountType] = useState("bank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ fingerprint: string; id: string } | null>(null);
  const account = accounts.find((item) => item.id === selected) ?? accounts[0];
  const accountName = (id: string) =>
    accounts.find((item) => item.id === id)?.name ?? id;
  async function submit(
    event: FormEvent<HTMLFormElement>,
    kind: "transfer" | "create-cash-account",
  ) {
    event.preventDefault();
    if (busy) return;
    const target = event.currentTarget;
    const values = Object.fromEntries(new FormData(target));
    const fingerprint = JSON.stringify({ kind, ...values });
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = {
        fingerprint,
        id: `${kind === "transfer" ? "TRF" : "CASH"}-${crypto.randomUUID()}`,
      };
    setBusy(true);
    setError("");
    try {
      if (await act({ kind, id: pending.current.id, ...values })) {
        pending.current = null;
        target.reset();
        setForm(null);
      }
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The transaction could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">CASH POSITION</span>
          <h1>Bank & cash</h1>
          <p>
            Account balances as of {data.asOf}. Transfers stay separate from
            expenses.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="button"
            onClick={() => setForm(form === "account" ? null : "account")}
            aria-expanded={form === "account"}
            aria-controls="cash-account-form"
            disabled={busy}
          >
            + New account
          </button>
          <button
            className="button button-primary"
            onClick={() => setForm(form === "transfer" ? null : "transfer")}
            aria-expanded={form === "transfer"}
            aria-controls="cash-transfer-form"
            disabled={busy}
          >
            Transfer between accounts
          </button>
        </div>
      </div>
      <div className="prototype-note" role="note">
        <strong>CLIENT REVIEW · FICTIONAL DATA</strong>
        <span>
          Bank, cash and staff-held funds share the demo journal. No real money
          moves.
        </span>
      </div>
      {form === "account" && (
        <form
          id="cash-account-form"
          className="panel review-form"
          onSubmit={(event) => void submit(event, "create-cash-account")}
          aria-busy={busy}
        >
          <h2>New bank, cash or staff account</h2>
          <div className="field-grid">
            <label>
              Account name
              <input
                name="name"
                placeholder="e.g. Thomas Cash"
                required
                maxLength={100}
                disabled={busy}
              />
            </label>
            <label>
              Account type
              <select
                name="type"
                value={accountType}
                onChange={(event) => setAccountType(event.target.value)}
                disabled={busy}
              >
                <option value="bank">Bank account</option>
                <option value="cash">Cash account</option>
                <option value="staff">Staff cash holder</option>
              </select>
            </label>
            {accountType === "staff" && (
              <label>
                Cash holder
                <input
                  name="holder"
                  placeholder="e.g. Thomas"
                  required
                  maxLength={100}
                  disabled={busy}
                />
              </label>
            )}
          </div>
          <p>
            New accounts start at zero. Use an internal transfer to fund a staff
            or cash account.
          </p>
          <div className="review-actions">
            <button
              className="button"
              type="button"
              onClick={() => setForm(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Saving…" : "Create account"}
            </button>
          </div>
        </form>
      )}
      {form === "transfer" && (
        <form
          id="cash-transfer-form"
          className="panel review-form"
          onSubmit={(event) => void submit(event, "transfer")}
          aria-busy={busy}
        >
          <h2>Transfer between accounts</h2>
          <div className="field-grid">
            <label>
              From account
              <select
                name="fromAccount"
                defaultValue="bank"
                required
                disabled={busy}
              >
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To account
              <select
                name="toAccount"
                defaultValue="cash"
                required
                disabled={busy}
              >
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Transfer amount · AED
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                disabled={busy}
              />
            </label>
            <label>
              Transfer date
              <input
                name="date"
                type="date"
                defaultValue={data.asOf}
                required
                disabled={busy}
              />
            </label>
            <label>
              Transfer reference
              <input
                name="reference"
                required
                maxLength={140}
                disabled={busy}
              />
            </label>
          </div>
          <p>
            This records movement between two assets. It does not increase
            revenue or expenses.
          </p>
          <div className="review-actions">
            <button
              className="button"
              type="button"
              onClick={() => setForm(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Saving…" : "Record transfer"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="review-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-tiles">
        {accounts.map((item) => (
          <div className="panel account-tile" key={item.id}>
            <span className="eyebrow">{item.name}</span>
            <strong>{displayMoney(item.balanceFils)}</strong>
            <small>
              {item.type === "staff"
                ? `Held by ${item.holder || item.name}`
                : item.type === "bank"
                  ? "Bank account"
                  : "Cash account"}{" "}
              · as-of balance
            </small>
          </div>
        ))}
      </div>
      <section aria-labelledby="cash-history-heading">
        <h2 id="cash-history-heading" className="review-section-title">
          Account transaction history
        </h2>
        <p className="aside-note">
          Transactions for {data.period.from} – {data.period.to}.
        </p>
        <label className="review-account-picker">
          Account
          <select
            value={account?.id || ""}
            onChange={(event) => setSelected(event.target.value)}
          >
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Date",
                    "Journal",
                    "Description",
                    "Money in",
                    "Money out",
                    "Running balance",
                  ].map((name) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {account?.transactions.map((item, index) => (
                  <tr key={`${item.journalId}-${index}`}>
                    <td>{item.date}</td>
                    <td>{item.journalId}</td>
                    <td>{item.memo}</td>
                    <td className="money">
                      {BigInt(item.debitFils)
                        ? displayMoney(item.debitFils)
                        : "—"}
                    </td>
                    <td className="money">
                      {BigInt(item.creditFils)
                        ? displayMoney(item.creditFils)
                        : "—"}
                    </td>
                    <td className="money">
                      {displayMoney(item.runningBalanceFils)}
                    </td>
                  </tr>
                ))}
                {!account?.transactions.length && (
                  <tr>
                    <td colSpan={6}>
                      No posted transactions for this account in the reporting
                      period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {account && (
          <p className="review-reconcile">
            Period opening: {displayMoney(account.openingBalanceFils ?? "0")} ·
            Period closing:{" "}
            {displayMoney(account.closingBalanceFils ?? account.balanceFils)} ·
            As-of balance: {displayMoney(account.balanceFils)}
          </p>
        )}
      </section>
      <section aria-labelledby="cash-transfers-heading">
        <h2 id="cash-transfers-heading" className="review-section-title">
          Internal transfers
        </h2>
        <div className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {["Reference", "Date", "From", "To", "Amount"].map((name) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.transfers?.map((item) => (
                  <tr key={item.id}>
                    <td>{item.reference}</td>
                    <td>{item.date}</td>
                    <td>{accountName(item.fromAccount)}</td>
                    <td>{accountName(item.toAccount)}</td>
                    <td className="money">{displayMoney(item.amountFils)}</td>
                  </tr>
                ))}
                {!data.transfers?.length && (
                  <tr>
                    <td colSpan={5}>No internal transfers recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
