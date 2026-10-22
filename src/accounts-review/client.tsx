import {
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
  | "receipts"
  | "supplier-payments"
  | "expenses"
  | "banking"
  | "ledger"
  | "pnl"
  | "balance"
  | "aging";
const routes: Route[] = [
  "dashboard",
  "invoices",
  "new-invoice",
  "bills",
  "receipts",
  "supplier-payments",
  "expenses",
  "banking",
  "ledger",
  "pnl",
  "balance",
  "aging",
];
const route = (): Route => {
  const value = location.hash.replace(/^#\/?/, "") as Route;
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
const today = "2026-10-22";
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
async function filePayload(
  file: File | null,
): Promise<{ name: string; mime: string; data: string } | undefined> {
  if (!file) return undefined;
  if (file.size > 2_000_000)
    throw Error("Choose a PDF, PNG or JPEG under 2 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mime: file.type, data };
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
      { key: "aging", label: "AR / AP aging", icon: "◷" },
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
function Table({ heads, children }: { heads: string[]; children: ReactNode }) {
  return (
    <div className="panel table-panel">
      <div className="table-scroll">
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
  return (
    <>
      <Head
        eyebrow="SALES & RECEIVABLES"
        title="Sales invoices"
        sub="Drafts do not enter receivables. Issued demo invoices post once to the journal."
      >
        <a className="button button-primary" href={link("new-invoice")}>
          + New invoice
        </a>
      </Head>
      <Note />
      <Table
        heads={[
          "Invoice",
          "Customer",
          "Date / due",
          "Amount",
          "Open",
          "Status / action",
        ]}
      >
        {data.invoices.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.id}</strong>
              <small>{item.description}</small>
            </td>
            <td>{item.party}</td>
            <td>
              {date(item.date)}
              <small>Due {date(item.due)}</small>
            </td>
            <td className="money">{money(item.amountFils)}</td>
            <td className="money">{money(item.outstandingFils)}</td>
            <td>
              {item.status === "Draft" ? (
                <button
                  className="button button-secondary"
                  onClick={() => act({ kind: "issue-invoice", id: item.id })}
                >
                  Issue draft
                </button>
              ) : (
                <span className="badge badge-success">Issued</span>
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
      </Table>
    </>
  );
}
function InvoiceForm({
  act,
}: {
  act: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const issue =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
        "data-issue",
      ) === "true";
    if (await act({ kind: "invoice", ...values, issue })) form.reset();
  }
  return (
    <>
      <Head
        eyebrow="SALES & RECEIVABLES"
        title="New invoice"
        sub="Simple AED demo invoice. VAT, numbering and production recognition await owner policy."
      >
        <a className="button button-secondary" href={link("invoices")}>
          ← Invoices
        </a>
      </Head>
      <Note />
      <form className="panel review-form" onSubmit={submit}>
        <h2>Invoice details</h2>
        <div className="field-grid">
          <Field label="Customer" name="party" defaultValue="Sample Client A" />
          <Field
            label="Amount · AED (VAT excluded)"
            name="amount"
            type="number"
            defaultValue="1000.00"
          />
          <Field
            label="Invoice date"
            name="date"
            type="date"
            defaultValue={today}
          />
          <Field label="Due date" name="due" type="date" defaultValue={today} />
          <Field
            label="Description"
            name="description"
            defaultValue="Additional design service"
          />
        </div>
        <div className="review-actions">
          <button
            className="button button-secondary"
            type="submit"
            data-issue="false"
          >
            Save draft
          </button>
          <button
            className="button button-primary"
            type="submit"
            data-issue="true"
          >
            Issue demo invoice
          </button>
        </div>
        <p className="aside-note">
          Issued documents are immutable in this review. VAT is deliberately
          excluded until policy B05 is approved.
        </p>
      </form>
    </>
  );
}
function Bills({
  data,
  act,
}: {
  data: Snapshot;
  act: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  const [uploadError, setUploadError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const file =
      (form.elements.namedItem("file") as HTMLInputElement).files?.[0] || null;
    delete values.file;
    try {
      setUploadError("");
      if (
        await act({
          kind: "bill",
          ...values,
          attachment: await filePayload(file),
        })
      )
        form.reset();
    } catch (problem) {
      setUploadError(
        String(problem instanceof Error ? problem.message : problem),
      );
    }
  }
  return (
    <>
      <Head
        eyebrow="PURCHASES"
        title="Purchase bills"
        sub="Record a fictional PO-referenced bill, including a camera image or PDF from mobile."
      />
      <Note />
      <div className="review-two">
        <form className="panel review-form" onSubmit={submit}>
          <h2>New purchase bill</h2>
          <div className="field-grid">
            <Field
              label="Supplier"
              name="party"
              defaultValue="Sample Supplier B"
            />
            <Field
              label="Demo PO reference"
              name="poReference"
              defaultValue="DEMO-PO-33"
            />
            <Field
              label="Bill date"
              name="date"
              type="date"
              defaultValue={today}
            />
            <Field
              label="Due date"
              name="due"
              type="date"
              defaultValue={today}
            />
            <Field
              label="Amount · AED (VAT excluded)"
              name="amount"
              type="number"
              defaultValue="250.00"
            />
            <Field
              label="Category"
              name="category"
              defaultValue="Cost of Sales"
            >
              <option>Cost of Sales</option>
              <option>Operating Expense</option>
            </Field>
            <Field
              label="Description"
              name="description"
              defaultValue="Additional project materials"
            />
            <Field
              label="Bill image or PDF · up to 2 MB"
              name="file"
              type="file"
              required={false}
              accept="application/pdf,image/png,image/jpeg"
              capture="environment"
            />
          </div>
          {uploadError && (
            <p className="review-error" role="alert">
              {uploadError}
            </p>
          )}
          <button className="button button-primary" type="submit">
            Record bill & upload
          </button>
          <p className="aside-note">
            Manual upload only; no OCR, real supplier matching or CRM purchase
            order is claimed.
          </p>
        </form>
        <div className="panel review-card">
          <span className="eyebrow">MOBILE BILL CAPTURE</span>
          <h2>Three simple steps</h2>
          <ol className="review-steps">
            <li>Photograph or select the bill.</li>
            <li>Check supplier, amount and demo PO reference.</li>
            <li>Record it once; the journal and payable update together.</li>
          </ol>
          <p>
            Use fictional bills only. Uploads belong to this review session and
            are unavailable after logout.
          </p>
        </div>
      </div>
      <Table
        heads={[
          "Bill",
          "Supplier",
          "Date / due",
          "Category",
          "Amount",
          "Open / file",
        ]}
      >
        {data.bills.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.id}</strong>
              <small>{item.poReference}</small>
            </td>
            <td>{item.party}</td>
            <td>
              {date(item.date)}
              <small>Due {date(item.due)}</small>
            </td>
            <td>{item.category}</td>
            <td className="money">{money(item.amountFils)}</td>
            <td className="money">
              {money(item.outstandingFils)}
              {item.attachmentId && (
                <small>
                  <a
                    href={`/api/accounts-review/attachment/${encodeURIComponent(item.attachmentId)}`}
                  >
                    Download bill
                  </a>
                </small>
              )}
            </td>
          </tr>
        ))}
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
  const open = source.filter((item) => BigInt(item.outstandingFils) > 0n);
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
          <Field
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
          <Field label="Date" name="date" type="date" defaultValue={today} />
          <Field label="Payment account" name="account" defaultValue="bank">
            <option value="bank">Business bank</option>
            <option value="cash">Petty cash</option>
          </Field>
        </div>
        <button className="button button-primary" type="submit">
          {supplier ? "Record payment" : "Record receipt"}
        </button>
      </form>
      <Table heads={["Reference", "Date", "Applied to", "Amount"]}>
        {posts.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.id}</strong>
            </td>
            <td>{date(item.date)}</td>
            <td>{item.documentId}</td>
            <td className="money">{money(item.amountFils)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
function Expenses({
  data,
  act,
}: {
  data: Snapshot;
  act: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  const [uploadError, setUploadError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const file =
      (form.elements.namedItem("file") as HTMLInputElement).files?.[0] || null;
    delete values.file;
    try {
      setUploadError("");
      if (
        await act({
          kind: "expense",
          ...values,
          attachment: await filePayload(file),
        })
      )
        form.reset();
    } catch (problem) {
      setUploadError(
        String(problem instanceof Error ? problem.message : problem),
      );
    }
  }
  return (
    <>
      <Head
        eyebrow="OPERATING COSTS"
        title="Expenses"
        sub="Record a paid fictional operating cost against bank or cash, with optional evidence."
      />
      <Note />
      <form className="panel review-form" onSubmit={submit}>
        <h2>New paid expense</h2>
        <div className="field-grid">
          <Field
            label="Payee"
            name="payee"
            defaultValue="Sample Service Provider"
          />
          <Field
            label="Amount · AED (VAT excluded)"
            name="amount"
            type="number"
            defaultValue="75.00"
          />
          <Field label="Date" name="date" type="date" defaultValue={today} />
          <Field label="Paid from" name="account" defaultValue="bank">
            <option value="bank">Business bank</option>
            <option value="cash">Petty cash</option>
          </Field>
          <Field
            label="Description"
            name="description"
            defaultValue="Office supplies"
          />
          <Field
            label="Receipt image or PDF"
            name="file"
            type="file"
            required={false}
            accept="application/pdf,image/png,image/jpeg"
            capture="environment"
          />
        </div>
        {uploadError && (
          <p className="review-error" role="alert">
            {uploadError}
          </p>
        )}
        <button className="button button-primary" type="submit">
          Record paid expense
        </button>
        <p className="aside-note">
          The demo posts this payment immediately. Real approvals and VAT
          treatment remain blocked by owner policy.
        </p>
      </form>
      <Table
        heads={[
          "Expense",
          "Payee",
          "Date",
          "Description",
          "Paid from",
          "Amount / file",
        ]}
      >
        {data.expenses.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.id}</strong>
            </td>
            <td>{item.payee}</td>
            <td>{date(item.date)}</td>
            <td>{item.description}</td>
            <td>{item.account === "bank" ? "Business bank" : "Petty cash"}</td>
            <td className="money">
              {money(item.amountFils)}
              {item.attachmentId && (
                <small>
                  <a
                    href={`/api/accounts-review/attachment/${encodeURIComponent(item.attachmentId)}`}
                  >
                    Download receipt
                  </a>
                </small>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
function Banking({ data }: { data: Snapshot }) {
  return (
    <>
      <Head
        eyebrow="CASH POSITION"
        title="Bank & cash"
        sub={`Journal balances as of ${date(data.asOf)}. All transactions are fictional.`}
      />
      <Note />
      <div className="account-tiles">
        <div className="panel account-tile">
          <span className="eyebrow">BUSINESS BANK</span>
          <strong>{money(data.metrics.bankFils)}</strong>
          <small>Account 1000 · as-of balance</small>
        </div>
        <div className="panel account-tile">
          <span className="eyebrow">PETTY CASH</span>
          <strong>{money(data.metrics.cashFils)}</strong>
          <small>Account 1010 · as-of balance</small>
        </div>
        <div className="panel account-tile">
          <span className="eyebrow">TOTAL LIQUID BALANCE</span>
          <strong>
            {money(
              BigInt(data.metrics.bankFils) + BigInt(data.metrics.cashFils),
            )}
          </strong>
          <small>Bank plus cash</small>
        </div>
      </div>
      <Ledger data={data} account="bank" compact />
    </>
  );
}
function Ledger({
  data,
  account,
  compact = false,
}: {
  data: Snapshot;
  account?: string;
  compact?: boolean;
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
function Statement({ data, balance }: { data: Snapshot; balance: boolean }) {
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
          href={`/api/accounts-review/pdf/${balance ? "balance" : "pnl"}`}
        >
          Download demo PDF
        </a>
      </Head>
      <Note />
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
function Aging({ data }: { data: Snapshot }) {
  return (
    <>
      <Head
        eyebrow="AR / AP CONTROL"
        title="Receivable & payable aging"
        sub={`As of ${date(data.asOf)}. Partial settlements retain each document’s original due date.`}
      />
      <Note />
      <h2 className="review-section-title">Customer receivables</h2>
      <Table
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
        heads={["Bill", "Supplier", "Due", "Open", "Days overdue", "Bucket"]}
      >
        {data.bills.map((item) => (
          <tr key={item.id}>
            <td>{item.id}</td>
            <td>{item.party}</td>
            <td>{date(item.due)}</td>
            <td className="money">{money(item.outstandingFils)}</td>
            <td>{item.ageing.daysOverdue}</td>
            <td>{item.ageing.bucket}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [current, setCurrent] = useState<Route>(route);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    api("/session")
      .then(async (result) => {
        setSession(result);
        setSnapshot(await api("/snapshot"));
      })
      .catch(() => {});
    const update = () => {
      setCurrent(route());
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
    if (!session || inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Azzora-CSRF": session.csrf,
          "X-Azzora-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(action),
      });
      setSnapshot(result.snapshot);
      setMessage(
        `${action.kind === "issue-invoice" ? "Issued" : "Recorded"} ${result.id} in the fictional review ledger.`,
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
    receipts: "Customer receipts",
    "supplier-payments": "Supplier payments",
    expenses: "Expenses",
    banking: "Bank & cash",
    ledger: "General ledger",
    pnl: "Profit & loss",
    balance: "Balance sheet",
    aging: "AR / AP aging",
  };
  const content: Record<Route, ReactNode> = {
    dashboard: <Dashboard data={snapshot} />,
    invoices: <Invoices data={snapshot} act={act} />,
    "new-invoice": <InvoiceForm act={act} />,
    bills: <Bills data={snapshot} act={act} />,
    receipts: <Settlement data={snapshot} act={act} supplier={false} />,
    "supplier-payments": <Settlement data={snapshot} act={act} supplier />,
    expenses: <Expenses data={snapshot} act={act} />,
    banking: <Banking data={snapshot} />,
    ledger: <Ledger data={snapshot} />,
    pnl: <Statement data={snapshot} balance={false} />,
    balance: <Statement data={snapshot} balance />,
    aging: <Aging data={snapshot} />,
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
            <small>Local client review</small>
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
                  className={`nav-link ${current === item.key ? "is-active" : ""}`}
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
