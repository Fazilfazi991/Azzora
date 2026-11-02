import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import type { reviewSnapshot } from "./domain";
import "../../docs/finance/portal-design/portal.css";
import "./review.css";
import { DocumentEntry } from "./documents/DocumentEntry";
import { InvoiceEntry, PurchaseBills } from "./DocumentForms";
import { ExpenseEntry } from "./ExpenseEntry";
import { BankingWorkspace } from "./BankingWorkspace";
import { OperationalReports } from "./OperationalReports";
import { ReportDates } from "./ReportDates";
import { cashAccountsFor, type CompletionSnapshot } from "./completion-ui";
import type { Upload } from "./documents/model";

type Snapshot = ReturnType<typeof reviewSnapshot>;
type Session = {
  email: string;
  role: "accountant";
  csrf: string;
  mode: string;
};
type Route =
  | "dashboard"
  | "invoices"
  | "new-invoice"
  | "bills"
  | "document-entry"
  | "receipts"
  | "supplier-payments"
  | "expenses"
  | "banking"
  | "ledger"
  | "pnl"
  | "balance"
  | "trial"
  | "project-reports"
  | "aging";
const routes: Route[] = [
  "dashboard",
  "invoices",
  "new-invoice",
  "bills",
  "document-entry",
  "receipts",
  "supplier-payments",
  "expenses",
  "banking",
  "ledger",
  "pnl",
  "balance",
  "trial",
  "project-reports",
  "aging",
];
const route = (): Route => {
  const value = location.hash.replace(/^#\/?/, "").split("?")[0] as Route;
  return routes.includes(value) ? value : "dashboard";
};
const link = (name: Route) => `#/${name}`;
const logo = "/assets/azzora-logo.png";
const money = (value: string | bigint | number) => {
  const fils = BigInt(value);
  const sign = fils < 0n ? "−" : "";
  const absolute = fils < 0n ? -fils : fils;
  return `${sign}AED ${(absolute / 100n).toLocaleString("en-AE")}.${(absolute % 100n).toString().padStart(2, "0")}`;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api/accounts-review${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Request failed.");
  return result;
}
const nav: {
  heading: string;
  links: { key: Route; label: string; icon: string }[];
}[] = [
  {
    heading: "Overview",
    links: [{ key: "dashboard", label: "Financial dashboard", icon: "◫" }],
  },
  {
    heading: "Transactions",
    links: [
      { key: "invoices", label: "Sales invoices", icon: "▤" },
      { key: "bills", label: "Purchase bills & upload", icon: "▥" },
      { key: "receipts", label: "Customer receipts", icon: "↙" },
      { key: "supplier-payments", label: "Supplier payments", icon: "↗" },
      { key: "expenses", label: "Expenses", icon: "▧" },
      { key: "banking", label: "Bank & cash", icon: "▦" },
    ],
  },
  {
    heading: "Accounting",
    links: [
      { key: "ledger", label: "General ledger", icon: "≡" },
      { key: "pnl", label: "Profit & loss", icon: "▤" },
      { key: "balance", label: "Balance sheet", icon: "▤" },
      { key: "trial", label: "Trial balance", icon: "≡" },
      { key: "aging", label: "AR / AP aging", icon: "◷" },
      {
        key: "project-reports",
        label: "Project & department reports",
        icon: "▥",
      },
    ],
  },
];

function Head({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
function Note() {
  return (
    <div className="prototype-note" role="note">
      <strong>CLIENT REVIEW · FICTIONAL DATA</strong>
      <span>
        Actions update only this isolated demo ledger. No Manager CRM records or
        real money are changed.
      </span>
    </div>
  );
}
function Table({
  heads,
  children,
  toolbar,
  variant,
  label,
}: {
  heads: string[];
  children: ReactNode;
  toolbar?: ReactNode;
  variant?: string;
  label: string;
}) {
  return (
    <div className={`panel table-panel ${variant ?? ""}`}>
      {toolbar && <div className="table-toolbar">{toolbar}</div>}
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        <table>
          <thead>
            <tr>
              {heads.map((head) => (
                <th key={head}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required = true,
  children,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  children?: ReactNode;
  accept?: string;
  capture?: "environment";
}) {
  return (
    <label>
      {label}
      {children ? (
        <select name={name} required={required} defaultValue={defaultValue}>
          {children}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          step={type === "number" ? "0.01" : undefined}
          min={type === "number" ? "0.01" : undefined}
          defaultValue={defaultValue}
          required={required}
          {...rest}
        />
      )}
    </label>
  );
}
function metric(label: string, value: string, context: string) {
  return (
    <div className="metric" key={label}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{money(value)}</strong>
      <small>{context}</small>
    </div>
  );
}
function Dashboard({ data }: { data: Snapshot }) {
  const m = data.metrics;
  return (
    <>
      <Head
        eyebrow="FINANCIAL OVERVIEW"
        title="Financial dashboard"
        sub="An accountant’s view of the fictional journal, open documents and cash positions."
      />
      <Note />
      <div className="basis-strip">
        <div>
          <span className="eyebrow">Activity period</span>
          <strong>
            {date(data.period.from)} – {date(data.period.to)}
          </strong>
          <small>Revenue, costs and profit</small>
        </div>
        <div>
          <span className="eyebrow">Position as of</span>
          <strong>{date(data.asOf)}</strong>
          <small>Receivables, payables, bank and cash</small>
        </div>
      </div>
      <div className="metrics-grid metrics-eight">
        {metric("Revenue", m.revenueFils, "Posted invoices")}
        {metric("Cost of sales", m.costOfSalesFils, "Project supplier bills")}
        {metric(
          "Operating expenses",
          m.operatingExpensesFils,
          "Bills and paid costs",
        )}
        {metric(
          "Gross profit",
          m.grossProfitFils,
          "Revenue less cost of sales",
        )}
        {metric("Net profit", m.netProfitFils, "After operating expenses")}
        {metric("Receivables", m.receivablesFils, "Open issued invoices")}
        {metric("Payables", m.payablesFils, "Open purchase bills")}
        {metric(
          "Bank + cash",
          (BigInt(m.bankFils) + BigInt(m.cashFils)).toString(),
          "Journal balances",
        )}
      </div>
      <div className="review-two">
        <section className="panel review-card">
          <span className="eyebrow">TODAY’S WORK</span>
          <h2>Open customer balances</h2>
          {data.invoices
            .filter((item) => BigInt(item.outstandingFils) > 0n)
            .map((item) => (
              <div className="review-row" key={item.id}>
                <span>
                  <strong>{item.id}</strong>
                  <small>
                    {item.party} · due {date(item.due)}
                  </small>
                </span>
                <strong>{money(item.outstandingFils)}</strong>
              </div>
            ))}
          <a className="text-link" href={link("receipts")}>
            Record a receipt →
          </a>
        </section>
        <section className="panel review-card">
          <span className="eyebrow">PAYABLES</span>
          <h2>Supplier bills to settle</h2>
          {data.bills
            .filter((item) => BigInt(item.outstandingFils) > 0n)
            .map((item) => (
              <div className="review-row" key={item.id}>
                <span>
                  <strong>{item.id}</strong>
                  <small>
                    {item.party} · due {date(item.due)}
                  </small>
                </span>
                <strong>{money(item.outstandingFils)}</strong>
              </div>
            ))}
          <a className="text-link" href={link("supplier-payments")}>
            Record a payment →
          </a>
        </section>
      </div>
    </>
  );
}
function Invoices({
  data,
  act,
}: {
  data: Snapshot;
  act: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All document types");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const issued = data.invoices.filter((item) => item.status === "Issued");
  const outstanding = issued.reduce(
    (total, item) => total + BigInt(item.outstandingFils),
    0n,
  );
  const rows = data.invoices.filter((item) => {
    const matchesQuery = `${item.id} ${item.party} ${item.description}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
    const matchesType =
      typeFilter === "All document types" ||
      (item.invoiceType ?? "Tax Invoice") === typeFilter;
    const matchesStatus =
      statusFilter === "All statuses" || item.status === statusFilter;
    return matchesQuery && matchesType && matchesStatus;
  });
  return (
    <>
      <Head
        eyebrow="SALES & RECEIVABLES"
        title="Sales invoices"
        sub="Find documents, review balances and start a new invoice."
      >
        <a className="button button-primary" href={link("new-invoice")}>
          + New invoice
        </a>
      </Head>
      <Note />
      <div className="invoice-summary" aria-label="Invoice summary">
        <span>
          <strong>{issued.length}</strong> issued invoices
        </span>
        <span>
          <strong>{money(outstanding)}</strong> outstanding
        </span>
        <span>
          <strong>
            {data.invoices.filter((item) => item.status === "Draft").length}
          </strong>{" "}
          draft documents
        </span>
      </div>
      <Table
        label="Sales invoices"
        heads={[
          "Invoice",
          "Customer",
          "Document",
          "Issued",
          "Due",
          "Total",
          "Outstanding",
          "Status",
        ]}
        toolbar={
          <div className="invoice-filter-row">
            <label>
              <span className="sr-only">Search reference or customer</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reference or customer"
              />
            </label>
            <label>
              <span className="sr-only">Filter document type</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option>All document types</option>
                <option>Tax Invoice</option>
                <option>Normal Invoice</option>
                <option>Proforma</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>All statuses</option>
                <option>Issued</option>
                <option>Draft</option>
              </select>
            </label>
          </div>
        }
        variant="invoice-table"
      >
        {rows.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.id}</strong>
              <small>{item.description}</small>
            </td>
            <td>{item.party}</td>
            <td>{item.invoiceType ?? "Tax Invoice"}</td>
            <td>{date(item.date)}</td>
            <td>{item.status === "Draft" ? "—" : date(item.due)}</td>
            <td className="money">{money(item.amountFils)}</td>
            <td className="money">{money(item.outstandingFils)}</td>
            <td>
              {item.status === "Draft" ? (
                <>
                  <a
                    className="button"
                    href={"#/new-invoice?edit=" + encodeURIComponent(item.id)}
                  >
                    Edit draft
                  </a>
                  <button
                    className="button button-secondary"
                    onClick={() => act({ kind: "issue-invoice", id: item.id })}
                  >
                    Issue{" "}
                    {item.invoiceType === "Proforma" ? "proforma" : "draft"}
                  </button>
                </>
              ) : (
                <span
                  className={`badge ${item.invoiceType === "Proforma" ? "badge-neutral" : "badge-success"}`}
                >
                  {item.invoiceType === "Proforma"
                    ? "Proforma · no posting"
                    : "Issued"}
                </span>
              )}
              <small>
                <a
                  href={`/api/accounts-review/pdf/${encodeURIComponent(item.id)}`}
                >
                  Download demo PDF
                </a>
              </small>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="invoice-empty">
              No documents match these filters.
            </td>
          </tr>
        )}
        <tr className="invoice-table-note">
          <td colSpan={8}>
            Showing {rows.length} of {data.invoices.length} demo records · Draft
            normal and proforma documents are excluded from posted revenue.
          </td>
        </tr>
      </Table>
    </>
  );
}
function Settlement({
  data,
  act,
  supplier,
}: {
  data: Snapshot;
  act: (action: Record<string, unknown>) => Promise<boolean>;
  supplier: boolean;
}) {
  const source = supplier ? data.bills : data.invoices;
  const [party, setParty] = useState("");
  const accounts = cashAccountsFor(data);
  const open = source.filter(
    (item) =>
      BigInt(item.outstandingFils) > 0n && (!party || item.party === party),
  );
  const posts = supplier ? data.supplierPayments : data.receipts;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (
      await act({
        kind: supplier ? "supplier-payment" : "receipt",
        ...Object.fromEntries(new FormData(form)),
      })
    )
      form.reset();
  }
  return (
    <>
      <Head
        eyebrow={supplier ? "PURCHASES & PAYABLES" : "SALES & RECEIVABLES"}
        title={supplier ? "Supplier payments" : "Customer receipts"}
        sub="Choose the exact document and amount. Its original due date remains unchanged after partial settlement."
      />
      <Note />
      <form className="panel review-form" onSubmit={submit}>
        <h2>
          {supplier ? "Record supplier payment" : "Record customer receipt"}
        </h2>
        <div className="field-grid">
          <label>
            {supplier ? "Supplier" : "Customer"}
            <select
              value={party}
              onChange={(event) => setParty(event.target.value)}
            >
              <option value="">
                {supplier ? "All suppliers" : "All customers"}
              </option>
              {[...new Set(source.map((item) => item.party))].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <Field
            key={party}
            label={supplier ? "Open bill" : "Open invoice"}
            name="documentId"
          >
            <option value="">Select a document</option>
            {open.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} · {item.party} · {money(item.outstandingFils)} open
              </option>
            ))}
          </Field>
          <Field
            label="Amount · AED"
            name="amount"
            type="number"
            defaultValue="100.00"
          />
          <Field
            label="Date"
            name="date"
            type="date"
            defaultValue={data.asOf}
          />
          <Field label="Payment account" name="account" defaultValue="bank">
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Field>
          <Field
            label="Payment reference · optional"
            name="reference"
            required={false}
          />
        </div>
        <button className="button button-primary" type="submit">
          {supplier ? "Record payment" : "Record receipt"}
        </button>
      </form>
      <Table
        label={supplier ? "Supplier payments" : "Customer receipts"}
        heads={["Reference", "Date", "Applied to", "Account", "Amount"]}
      >
        {(
          posts as ((typeof posts)[number] & {
            account?: string;
            reference?: string;
          })[]
        ).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.id}</strong>
              {item.reference && <small>{item.reference}</small>}
            </td>
            <td>{date(item.date)}</td>
            <td>{item.documentId}</td>
            <td>
              {accounts.find((account) => account.id === item.account)?.name ||
                item.account ||
                "Historical account"}
            </td>
            <td className="money">{money(item.amountFils)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
function Ledger({
  data,
  account,
  compact = false,
  filters,
}: {
  data: Snapshot;
  account?: string;
  compact?: boolean;
  filters?: ReactNode;
}) {
  const [selected, setSelected] = useState(account || "bank");
  const ledger =
    data.ledger.find((item) => item.account.id === selected) || data.ledger[0];
  return (
    <>
      {!compact && (
        <>
          <Head
            eyebrow="ACCOUNTING"
            title="General ledger"
            sub={`Posted entries from ${date(data.period.from)} to ${date(data.period.to)} with running balances.`}
          />
          <Note />
          {filters}
          <label className="review-account-picker">
            Account{" "}
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {data.accounts.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <Table
        label={`General ledger: ${ledger.account.name}`}
        heads={["Date", "Journal", "Description", "Debit", "Credit", "Running"]}
      >
        {ledger.lines.map((item, index) => (
          <tr key={`${item.journalId}-${index}`}>
            <td>{date(item.date)}</td>
            <td>{item.journalId}</td>
            <td>{item.memo}</td>
            <td className="money">
              {BigInt(item.debitFils) > 0n ? money(item.debitFils) : "—"}
            </td>
            <td className="money">
              {BigInt(item.creditFils) > 0n ? money(item.creditFils) : "—"}
            </td>
            <td className="money">{money(item.runningBalanceFils)}</td>
          </tr>
        ))}
      </Table>
      <p className="review-reconcile">
        Opening: {money(ledger.openingBalanceFils)} · Closing:{" "}
        {money(ledger.closingBalanceFils)}
      </p>
    </>
  );
}
function Statement({
  data,
  balance,
  filters,
}: {
  data: Snapshot;
  balance: boolean;
  filters?: ReactNode;
}) {
  return (
    <>
      <Head
        eyebrow="FINANCIAL REPORTING"
        title={balance ? "Balance sheet" : "Profit & loss"}
        sub={
          balance
            ? `Position as of ${date(data.asOf)}. Assets reconcile to liabilities and equity.`
            : `Activity for ${date(data.period.from)} – ${date(data.period.to)}. Gross and net profit are shown separately.`
        }
      >
        <a
          className="button button-secondary"
          href={`/api/accounts-review/pdf/${balance ? "balance" : "pnl"}?${new URLSearchParams({ from: data.period.from, to: data.period.to, asOf: data.asOf }).toString()}`}
        >
          Download demo PDF
        </a>
      </Head>
      <Note />
      {filters}
      <div className="report-layout">
        <section className="panel statement">
          <div className="statement-head">
            <div>
              <span className="eyebrow">AZZORA · FICTIONAL REVIEW</span>
              <h2>{balance ? "Balance sheet" : "Profit & loss"}</h2>
            </div>
            <span className="badge badge-neutral">
              {balance ? "AS OF" : "PERIOD"} {date(data.asOf)}
            </span>
          </div>
          {balance ? (
            <>
              <StatementSection name="Assets" section={data.balance.assets} />
              <StatementSection
                name="Liabilities"
                section={data.balance.liabilities}
              />
              <StatementSection name="Equity" section={data.balance.equity} />
              <div className="statement-row">
                <span>Current earnings</span>
                <strong>{money(data.balance.currentEarningsFils)}</strong>
              </div>
              <div className="statement-row grand">
                <span>Liabilities + equity</span>
                <strong>{money(data.balance.liabilitiesAndEquityFils)}</strong>
              </div>
              <p className="review-reconcile">
                Difference: {money(data.balance.differenceFils)} ·{" "}
                {data.balance.balanced ? "Balanced" : "Review required"}
              </p>
            </>
          ) : (
            <>
              <StatementSection name="Revenue" section={data.pnl.income} />
              <StatementSection
                name="Cost of sales"
                section={data.pnl.costOfSales}
              />
              <div className="statement-row major">
                <span>Gross profit</span>
                <strong>{money(data.pnl.grossProfitFils)}</strong>
              </div>
              <StatementSection
                name="Operating expenses"
                section={data.pnl.expenses}
              />
              <div className="statement-row grand">
                <span>Net profit</span>
                <strong>{money(data.pnl.netProfitFils)}</strong>
              </div>
            </>
          )}
        </section>
        <aside className="report-aside">
          <span className="eyebrow">RECONCILIATION</span>
          <h3>From posted journals</h3>
          <p>
            Every fictional invoice, bill, receipt, supplier payment and paid
            expense updates the same journal used by this report.
          </p>
          <p>
            VAT, cutover balances, period locks and real accounting policy
            remain outside this client review.
          </p>
          <a href={link("ledger")}>Inspect general ledger →</a>
        </aside>
      </div>
    </>
  );
}
function StatementSection({
  name,
  section,
}: {
  name: string;
  section: Snapshot["pnl"]["income"];
}) {
  return (
    <div className="review-statement-section">
      <h3>{name}</h3>
      {section.rows.map((item) => (
        <div className="statement-row" key={item.accountId}>
          <span>
            {item.code} · {item.name}
          </span>
          <strong>{money(item.normalBalanceFils)}</strong>
        </div>
      ))}
      <div className="statement-row subtotal">
        <span>Total {name.toLowerCase()}</span>
        <strong>{money(section.totalFils)}</strong>
      </div>
    </div>
  );
}
function Aging({ data, filters }: { data: Snapshot; filters?: ReactNode }) {
  return (
    <>
      <Head
        eyebrow="AR / AP CONTROL"
        title="Receivable & payable aging"
        sub={`As of ${date(data.asOf)}. Partial settlements retain each document’s original due date.`}
      />
      <Note />
      {filters}
      <h2 className="review-section-title">Customer receivables</h2>
      <Table
        label="Customer receivable aging"
        heads={["Invoice", "Customer", "Due", "Open", "Days overdue", "Bucket"]}
      >
        {data.invoices
          .filter((item) => item.ageing)
          .map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.party}</td>
              <td>{date(item.due)}</td>
              <td className="money">{money(item.outstandingFils)}</td>
              <td>{item.ageing?.daysOverdue}</td>
              <td>{item.ageing?.bucket}</td>
            </tr>
          ))}
      </Table>
      <h2 className="review-section-title">Supplier payables</h2>
      <Table
        label="Supplier payable aging"
        heads={["Bill", "Supplier", "Due", "Open", "Days overdue", "Bucket"]}
      >
        {data.bills
          .filter((item) => item.status === "Issued")
          .map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.party}</td>
              <td>{date(item.due)}</td>
              <td className="money">{money(item.outstandingFils)}</td>
              <td>{item.ageing?.daysOverdue}</td>
              <td>{item.ageing?.bucket}</td>
            </tr>
          ))}
      </Table>
    </>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<CompletionSnapshot | null>(null);
  const [current, setCurrent] = useState<Route>(route);
  const [editingId, setEditingId] = useState(
    () =>
      new URLSearchParams(location.hash.split("?")[1] || "").get("edit") || "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const inFlight = useRef(false);
  const retryAction = useRef<{ fingerprint: string; key: string } | null>(null);
  const documentPending = useRef(false);
  const onDocumentPending = useCallback((value: boolean) => {
    documentPending.current = value;
  }, []);
  useEffect(() => {
    api("/session")
      .then(async (result) => {
        setSession(result);
        setSnapshot(await api("/snapshot"));
      })
      .catch(() => {});
    let previous = location.hash;
    const update = () => {
      if (
        documentPending.current &&
        !window.confirm("Discard unsaved document edits?")
      ) {
        history.replaceState(
          null,
          "",
          location.pathname + location.search + previous,
        );
        return;
      }
      documentPending.current = false;
      previous = location.hash;
      setCurrent(route());
      setEditingId(
        new URLSearchParams(location.hash.split("?")[1] || "").get("edit") ||
          "",
      );
      setNavOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      setSession(result);
      setSnapshot(await api("/snapshot"));
      location.hash = link("dashboard");
    } catch (problem) {
      setError(String(problem instanceof Error ? problem.message : problem));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!session) return;
    if (
      documentPending.current &&
      !window.confirm("Discard unsaved document edits and log out?")
    )
      return;
    try {
      await api("/logout", {
        method: "POST",
        headers: { "X-Azzora-CSRF": session.csrf },
      });
      setSession(null);
      setSnapshot(null);
      setMessage("");
      setError("");
      location.hash = "";
    } catch (problem) {
      setError(
        `Could not revoke this session: ${String(problem instanceof Error ? problem.message : problem)}`,
      );
    }
  }
  async function act(action: Record<string, unknown>): Promise<boolean> {
    if (!session || !snapshot || inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const fingerprint = JSON.stringify(action);
      if (retryAction.current?.fingerprint !== fingerprint)
        retryAction.current = { fingerprint, key: crypto.randomUUID() };
      const reportQuery = new URLSearchParams({
        from: snapshot.period.from,
        to: snapshot.period.to,
        asOf: snapshot.asOf,
      }).toString();
      const result = await api(`/action?${reportQuery}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Azzora-CSRF": session.csrf,
          "X-Azzora-Idempotency-Key": retryAction.current.key,
        },
        body: JSON.stringify(action),
      });
      setSnapshot(result.snapshot);
      retryAction.current = null;
      setMessage(
        action.kind === "create-cash-account"
          ? "Account created at zero balance. No financial posting."
          : action.kind === "transfer"
            ? "Internal transfer recorded once. No expense or revenue created."
            : action.kind === "create-expense-ledger"
              ? "Expense ledger created. No financial posting."
              : action.kind === "document-draft"
                ? "Document draft saved. No financial posting."
                : action.kind === "create-bill-from-review"
                  ? "Purchase bill created once through the demo ledger."
                  : `${action.kind === "issue-invoice" ? "Issued" : "Recorded"} ${result.id} in the fictional review ledger.`,
      );
      return true;
    } catch (problem) {
      setError(String(problem instanceof Error ? problem.message : problem));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  if (!session || !snapshot)
    return (
      <main className="login-layout">
        <section
          className="login-story"
          aria-label="AZZORA Accounts introduction"
        >
          <div className="login-brand">
            <img src={logo} alt="AZZORA" />
            <span>ACCOUNTS</span>
          </div>
          <div className="login-statement">
            <span className="eyebrow">FINANCIAL MANAGEMENT PORTAL</span>
            <h1>Clarity in every account.</h1>
            <p>
              A dedicated place for invoices, payments, ledgers and financial
              statements.
            </p>
          </div>
          <div className="login-story-foot">
            AZZORA · DESIGN & BUILD <span>CLIENT REVIEW</span>
          </div>
        </section>
        <section className="login-side">
          <div className="login-card">
            <div className="login-mobile-brand">
              <img src={logo} alt="AZZORA" />
              <strong>ACCOUNTS</strong>
            </div>
            <span className="eyebrow">ACCOUNTANT WORKSPACE</span>
            <h2>Sign in to Accounts</h2>
            <p className="login-intro">
              Separate access to a fictional accounting workspace.
            </p>
            <div className="prototype-inline">
              Client review only. Use the demo password supplied by the review
              operator. No company financial records are opened.
            </div>
            <form onSubmit={login}>
              <label htmlFor="email">Demo Accountant email</label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue="accountant@review.azzora.test"
                autoComplete="username"
                required
              />
              <label htmlFor="password">Demo password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <button
                className="button button-primary button-wide"
                type="submit"
                disabled={busy}
              >
                Sign in to review →
              </button>
            </form>
            {error && (
              <p className="review-error" role="alert">
                {error}
              </p>
            )}
            <p className="login-disclaimer">
              Protected demonstration access only. Individual production
              identities, MFA and verified accounting policies require separate
              approval.
            </p>
          </div>
          <div className="login-side-foot">
            © 2026 AZZORA <span>Fictional review data</span>
          </div>
        </section>
      </main>
    );
  const titles: Record<Route, string> = {
    dashboard: "Financial dashboard",
    invoices: "Sales invoices",
    "new-invoice": "New invoice",
    bills: "Purchase bills",
    "document-entry": "Read a bill",
    receipts: "Customer receipts",
    "supplier-payments": "Supplier payments",
    expenses: "Expenses",
    banking: "Bank & cash",
    ledger: "General ledger",
    pnl: "Profit & loss",
    balance: "Balance sheet",
    trial: "Trial balance",
    "project-reports": "Project & department reports",
    aging: "AR / AP aging",
  };
  const reportDates = (
    <ReportDates
      data={snapshot}
      apply={async (values) => {
        setSnapshot(
          await api(`/snapshot?${new URLSearchParams(values).toString()}`),
        );
      }}
    />
  );
  const content: Record<Route, ReactNode> = {
    dashboard: <Dashboard data={snapshot} />,
    invoices: <Invoices data={snapshot} act={act} />,
    "new-invoice": (
      <InvoiceEntry
        key={"invoice-" + editingId}
        data={snapshot}
        act={act}
        editingId={editingId}
      />
    ),
    bills: (
      <PurchaseBills
        key={"bill-" + editingId}
        data={snapshot}
        act={act}
        editingId={editingId}
      />
    ),
    "document-entry": (
      <DocumentEntry
        data={snapshot}
        onPendingChange={onDocumentPending}
        act={act}
        extract={async (file: Upload, mode?: "auto" | "manual") => {
          const reportQuery = new URLSearchParams({
            from: snapshot.period.from,
            to: snapshot.period.to,
            asOf: snapshot.asOf,
          }).toString();
          const result = await api(`/documents/extract?${reportQuery}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Azzora-CSRF": session.csrf,
            },
            body: JSON.stringify({ file, ...(mode ? { mode } : {}) }),
          });
          setMessage(
            result.reused
              ? "This exact file was already uploaded. Opened its existing review without creating a duplicate."
              : "",
          );
          setSnapshot(result.snapshot);
          return result.id;
        }}
      />
    ),
    receipts: <Settlement data={snapshot} act={act} supplier={false} />,
    "supplier-payments": <Settlement data={snapshot} act={act} supplier />,
    expenses: (
      <>
        <ExpenseEntry data={snapshot} act={act} />
        <section className="panel review-card">
          <h2>Project costs from posted journals</h2>
          <p>
            Current reporting period. Direct expenses and project overhead
            retain their selected project.
          </p>
          {snapshot.projectCosts.map((project) => (
            <div className="review-row" key={project.id}>
              <span>{project.name}</span>
              <strong>{money(project.costFils)}</strong>
            </div>
          ))}
        </section>
      </>
    ),
    banking: <BankingWorkspace data={snapshot} act={act} />,
    ledger: <Ledger data={snapshot} filters={reportDates} />,
    pnl: <Statement data={snapshot} balance={false} filters={reportDates} />,
    balance: <Statement data={snapshot} balance filters={reportDates} />,
    trial: <OperationalReports data={snapshot} trial filters={reportDates} />,
    "project-reports": (
      <OperationalReports data={snapshot} filters={reportDates} />
    ),
    aging: <Aging data={snapshot} filters={reportDates} />,
  };
  return (
    <div className={`shell ${navOpen ? "nav-open" : ""}`}>
      <div className="mobile-shade" onClick={() => setNavOpen(false)}></div>
      <aside className="sidebar" aria-label="Accountant navigation">
        <div className="brand-lockup">
          <img src={logo} alt="AZZORA" />
          <div className="brand-divider" />
          <div>
            <strong>ACCOUNTS</strong>
            <small>Financial management</small>
          </div>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Close accountant navigation"
            onClick={() => setNavOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="workspace-id">
          <span className="workspace-mark">A</span>
          <div>
            <strong>Accountant portal</strong>
            <small>Client review</small>
          </div>
        </div>
        <nav aria-label="Finance modules">
          {nav.map((group) => (
            <div className="nav-group" key={group.heading}>
              <span className="nav-heading">{group.heading}</span>
              {group.links.map((item) => (
                <a
                  key={item.key}
                  href={link(item.key)}
                  className={`nav-link ${current === item.key || (current === "document-entry" && item.key === "bills") ? "is-active" : ""}`}
                  aria-current={current === item.key ? "page" : undefined}
                  onClick={() => setNavOpen(false)}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">FA</div>
          <div>
            <strong>Demo Accountant</strong>
            <small>Fictional ledger</small>
          </div>
          <button className="signout" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button
            className="menu-button icon-button"
            type="button"
            aria-label="Open accountant navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(!navOpen)}
          >
            ☰
          </button>
          <div className="crumb">
            <span>AZZORA Accounts</span>
            <span aria-hidden="true">/</span>
            <strong>{titles[current]}</strong>
          </div>
          <div className="topbar-right">
            <span className="period-chip">CLIENT REVIEW</span>
            <span className="top-avatar" aria-hidden="true">
              FA
            </span>
          </div>
        </header>
        <main className="page-content" aria-busy={busy}>
          {error && (
            <div className="review-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="review-success" role="status">
              {message}
            </div>
          )}
          {content[current]}
        </main>
        <footer className="site-footer">
          AZZORA Accounts · Fictional demo data · No production posting or CRM
          record changes
        </footer>
      </div>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
