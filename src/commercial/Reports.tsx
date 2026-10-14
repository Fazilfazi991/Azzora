import { useState } from "react";
import { useStore } from "../store";
import { Header, Field, Empty } from "../components/ui";
import { emptyFilter } from "./model";
import { DataTable, FinancialFilters } from "./Registers";
import {
  reportData,
  reportNames,
  statementData,
  downloadCsv,
} from "./reports-data";
import type { ReportName } from "./reports-data";
import { tabularPdf } from "./document";

export function Statement({ customerId }: { customerId: string }) {
  const { db } = useStore();
  const [f, setF] = useState({ ...emptyFilter, customerId });
  const data = statementData(db, f);
  return (
    <>
      <h2>Customer Statement</h2>
      <FinancialFilters
        value={f}
        onChange={(next) => setF({ ...next, customerId })}
      />
      <p className="muted">
        Opening balance includes prior entries. Issued invoices debit the
        account; receipts and cancellations credit it; receipt reversals debit
        it. Values include VAT.
      </p>
      <button
        onClick={() => downloadCsv(data, "azzora-customer-statement.csv")}
      >
        Export Statement CSV
      </button>
      <DataTable headers={data.headers} rows={data.rows} />
    </>
  );
}
export function Reports() {
  const { db } = useStore();
  const [name, setName] = useState<ReportName>("Invoice Register"),
    [f, setF] = useState({ ...emptyFilter });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let data;
  try {
    data = reportData(db, name, f);
  } catch (e) {
    return <Empty>Report data needs correction: {String(e)}</Empty>;
  }
  return (
    <>
      <Header
        title="Portfolio Reports"
        eyebrow="Delivery & commercial intelligence"
        description="Customer statements, commercial registers and project performance from shared records."
        action={
          <>
            <button
              onClick={() =>
                downloadCsv(
                  data,
                  "azzora-" + name.toLowerCase().replaceAll(" ", "-") + ".csv",
                )
              }
            >
              Export CSV
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await tabularPdf(
                    name,
                    `AZZORA · ${f.from || "All dates"} to ${f.to || "Today"} · Browser demo`,
                    data,
                    "azzora-report.pdf",
                  );
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Export PDF
            </button>
          </>
        }
      />
      <Field label="Report">
        <select
          value={name}
          onChange={(e) => setName(e.target.value as ReportName)}
        >
          {reportNames.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </Field>
      <FinancialFilters value={f} onChange={setF} />
      {name === "Accounts Receivable Ageing" && (
        <p className="notice">
          Ageing is a balance at the To date (or today); From date is ignored so
          older unpaid invoices remain included.
        </p>
      )}
      {name === "Customer Statement" && (
        <p className="muted">
          Select a customer for an individual statement. Without a customer
          filter this is a consolidated ledger.
        </p>
      )}
      <DataTable headers={data.headers} rows={data.rows} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <details className="panel">
        <summary>Activity Record</summary>
        {db.activities.slice(0, 100).map((a) => (
          <div className="history-entry" key={a.id}>
            {a.action}: {a.summary}
            <small>{a.timestamp} · Demo actor: Sarah Mansoor</small>
            {a.previous && (
              <details>
                <summary>Previous values</summary>
                <pre className="audit-json">{a.previous}</pre>
              </details>
            )}
          </div>
        ))}
        {!db.activities.length && <Empty>No actions recorded yet.</Empty>}
      </details>
    </>
  );
}
