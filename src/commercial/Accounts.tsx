import { useRef, useState } from "react";
import { useStore } from "../store";
import { Header, Badge, Empty, Modal, Field } from "../components/ui";
import type { Invoice } from "./model";
import { emptyFilter, expenseCategories } from "./model";
import {
  aed,
  balanceDue,
  cents,
  effectiveProject,
  financials,
  invoiceStatus,
  invoiceTotals,
  matches,
} from "./calculations";
import {
  cancelInvoice,
  issueInvoice,
  reversePayment,
  invoiceFromQuotation,
  saveInvoice,
  milestoneAmounts,
} from "./repository";
import {
  DataTable,
  FinancialFilters,
  InvoiceTable,
  PaymentTable,
  ExpenseTable,
  InvoiceForm,
  PaymentForm,
  ExpenseForm,
} from "./Registers";
import { invoiceDetails, invoicePdf, printInvoice } from "./document";
import { reportData } from "./reports-data";
import { discountAmount, totals } from "../quotation/calculations";
import { today } from "../domain/logic";

export function FinancialCards({
  projectId = "",
  customerId = "",
}: {
  projectId?: string;
  customerId?: string;
}) {
  const { db } = useStore(),
    n = financials(db, { ...emptyFilter, projectId, customerId });
  return (
    <div className="kpis commercial-kpis">
      {[
        ["Accepted contract excl. VAT", aed(n.contract)],
        ["Invoiced incl. VAT", aed(n.invoiced)],
        ["Collected", aed(n.collected)],
        ["Outstanding receivables", aed(n.outstanding)],
        ["Overdue amount", aed(n.overdue)],
        ["Recorded costs excl. VAT", aed(n.costs)],
        [
          "Est. gross profit",
          n.contracts.length ? aed(n.profit) : "No contract",
        ],
        [
          "Est. gross margin",
          n.margin === null ? "—" : n.margin.toFixed(2) + "%",
        ],
      ].map(([label, value]) => (
        <div className="panel kpi" key={label}>
          <small>{label}</small>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
export function ProjectFinancials({ projectId }: { projectId: string }) {
  const { db } = useStore();
  const n = financials(db, { ...emptyFilter, projectId });
  const contract = n.contracts[0];
  const quotations = db.quotations.filter(
    (q) => effectiveProject(db, q.id) === projectId,
  );
  return (
    <>
      <Header
        eyebrow="Project commercial record"
        title="Project Financials"
        description="Accepted contract, billing, collections and recorded costs."
        action={
          <a
            className="button"
            href={`#/accounts/project-financials/${projectId}`}
          >
            Open in Accounts
          </a>
        }
      />
      <FinancialCards projectId={projectId} />
      <div className="panel">
        <h3>Contract basis</h3>
        <p>
          Original accepted contract:{" "}
          {contract
            ? aed(BigInt(contract.net))
            : "No accepted contract converted"}
        </p>
        <p>Approved variations: No variation module configured.</p>
        <p>Revised contract: {contract ? aed(BigInt(contract.net)) : "—"}</p>
        <p className="muted">
          Estimated gross profit = accepted contract excluding VAT − recorded
          costs excluding VAT. Input VAT is assumed recoverable for this
          estimate. This is a contract-value estimate, without revenue
          recognition, accruals or variation approval. Collections measure cash,
          independently of profit.
        </p>
        {contract && (
          <a href={`#/quotations/${contract.quotationId}/preview`}>
            Accepted BOQ & payment terms →
          </a>
        )}
      </div>
      <h3>Related quotations</h3>
      <div className="panel">
        {quotations.map((q) => (
          <a className="list-row" key={q.id} href={`#/quotations/${q.id}/edit`}>
            {q.number} Rev {q.revision}
            <Badge>{q.status}</Badge>
          </a>
        ))}
        {!quotations.length && <Empty>No linked quotations.</Empty>}
      </div>
      <h3>Invoices</h3>
      <InvoiceTable
        invoices={db.invoices.filter((i) => i.projectId === projectId)}
      />
      <h3>Receipts</h3>
      <PaymentTable
        payments={db.payments.filter((p) => p.projectId === projectId)}
      />
      <h3>Expenses</h3>
      <ExpenseTable expenses={n.expenses} />
    </>
  );
}
export function CommercialDashboard() {
  const { db } = useStore(),
    n = financials(db, emptyFilter);
  const month = today().slice(0, 7),
    period = financials(db, {
      ...emptyFilter,
      from: month + "-01",
      to: today(),
    });
  const families = new Map(
    db.quotations
      .filter((q) => q.status === "Accepted")
      .sort((a, b) => a.revision - b.revision)
      .map((q) => [q.familyId, q]),
  );
  const accepted = [...families.values()].reduce((s, q) => {
    const c = db.contracts.find((c) => c.familyId === q.familyId);
    return s + (c ? BigInt(c.net) : totals(q).subtotal - discountAmount(q));
  }, 0n);
  const active = db.projects
    .filter((p) => p.status === "Active")
    .reduce(
      (s, p) =>
        s +
        (db.contracts.find((c) => c.projectId === p.id)
          ? BigInt(db.contracts.find((c) => c.projectId === p.id)!.net)
          : cents(p.value.toFixed(2))),
      0n,
    );
  return (
    <section className="commercial-dashboard">
      <div className="between">
        <h2>Commercial & Financial Overview</h2>
        <a href="#/accounts/overview">Open Accounts →</a>
      </div>
      <div className="kpis commercial-kpis">
        {[
          [
            "Active Project Value",
            aed(active),
            "#/accounts/project-financials",
            "Accepted net contracts or legacy estimates",
          ],
          [
            "Accepted Quotation Value",
            aed(accepted),
            "#/quotations",
            "One accepted value per quotation family · excl. VAT",
          ],
          [
            "Invoiced This Month",
            aed(period.invoiced),
            "#/accounts/invoices",
            "Issued invoices incl. VAT",
          ],
          [
            "Collected This Month",
            aed(period.collected),
            "#/accounts/payments",
            "Posted, unreversed receipts",
          ],
          [
            "Outstanding Receivables",
            aed(n.outstanding),
            "#/accounts/receivables",
            "All issued invoices less posted receipts",
          ],
          [
            "Overdue Invoices",
            String(
              n.invoices.filter((i) => invoiceStatus(db, i) === "Overdue")
                .length,
            ),
            "#/accounts/receivables",
            aed(n.overdue) + " outstanding",
          ],
          [
            "Project Expenses",
            aed(n.costs),
            "#/accounts/expenses",
            "Recorded cost excl. VAT",
          ],
          [
            "Project Financial Performance",
            n.contracts.length ? aed(n.profit) : "No contracts yet",
            "#/accounts/project-financials",
            "Est. accepted contract less recorded costs",
          ],
        ].map(([label, value, href, note]) => (
          <a href={href} className="panel kpi" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <p>{note}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

function InvoiceDetail({ invoice: i }: { invoice: Invoice }) {
  const { db, mutate } = useStore();
  const [edit, setEdit] = useState(false),
    [payment, setPayment] = useState(false),
    [cancel, setCancel] = useState(false),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const paper = useRef<HTMLElement>(null);
  const s = invoiceDetails(db, i),
    t = invoiceTotals(i);
  return (
    <>
      <Header
        eyebrow="Invoice record"
        title={i.number}
        description={`${s.customer.name} · ${s.project || "Manual invoice"}`}
        action={
          <>
            <a className="button" href="#/accounts/invoices">
              Invoice register
            </a>
            {i.status === "Draft" && (
              <>
                <button onClick={() => setEdit(true)}>Edit Draft</button>
                <button
                  className="primary"
                  onClick={() =>
                    mutate(
                      (d) => issueInvoice(d, i.id),
                      "Invoice issued with preserved snapshot",
                    )
                  }
                >
                  Issue Invoice
                </button>
              </>
            )}
            {i.status === "Issued" && balanceDue(db, i) > 0n && (
              <button className="primary" onClick={() => setPayment(true)}>
                Record Payment
              </button>
            )}
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await invoicePdf(db, i);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Download Invoice PDF
            </button>
            <button
              onClick={() => {
                try {
                  printInvoice(paper.current);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Print Invoice
            </button>
            {i.status !== "Cancelled" && (
              <button onClick={() => setCancel(true)}>Cancel / Void</button>
            )}
          </>
        }
      />
      <div className="actions">
        <Badge>{invoiceStatus(db, i)}</Badge>
        <span>
          Amount paid:{" "}
          {aed(i.status === "Issued" ? t.grand - balanceDue(db, i) : 0n)} ·
          Balance due: <strong>{aed(balanceDue(db, i))}</strong>
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <article className="panel invoice-paper" ref={paper}>
        <div className="between">
          <div>
            <h2>
              AZZORA ·{" "}
              {i.status === "Draft"
                ? "Draft Invoice"
                : i.status === "Cancelled"
                  ? "Cancelled Invoice"
                  : "Invoice"}
            </h2>
            <p>
              {s.company.name}
              <small>
                {s.company.location} · {s.company.email} · {s.company.phone}
              </small>
            </p>
          </div>
          <img src="/assets/azzora-logo.png" alt="AZZORA" width="38" />
        </div>
        <div className="form-grid">
          <div>
            <h3>Bill to</h3>
            <strong>{s.customer.name}</strong>
            <p>
              {s.customer.contact}
              <br />
              {s.customer.address}
              <br />
              {s.customer.email} · {s.customer.phone}
              <br />
              TRN: {s.customer.trn || "Not supplied"}
            </p>
          </div>
          <div>
            <h3>{i.number}</h3>
            <p>
              Invoice date: {i.date}
              <br />
              Due date: {i.due}
              <br />
              Project: {s.project || "—"}
              <br />
              Quotation: {s.quotation || "—"}
            </p>
          </div>
        </div>
        <p>{i.description}</p>
        <DataTable
          headers={["Description", "Quantity", "Rate AED", "Tax treatment"]}
          rows={i.lines.map((l) => [l.description, l.quantity, l.rate, l.tax])}
        />
        <div className="quote-totals">
          {[
            ["Subtotal (entered line values)", t.subtotal],
            ["Discount", t.discount],
            ["Net amount", t.net],
            [`VAT ${i.vatPercentage}%`, t.vat],
            ["Grand total", t.grand],
            [
              "Amount paid",
              i.status === "Issued" ? t.grand - balanceDue(db, i) : 0n,
            ],
            ["Balance due", balanceDue(db, i)],
          ].map(([label, value]) => (
            <p className="between" key={String(label)}>
              <span>{String(label)}</span>
              <strong>{aed(value as bigint)}</strong>
            </p>
          ))}
        </div>
        <h3>Payment terms</h3>
        <p className="preserve-lines">{i.terms || "—"}</p>
        <h3>Notes</h3>
        <p className="preserve-lines">{i.notes || "—"}</p>
      </article>
      <h3>Allocated receipts</h3>
      <PaymentTable
        payments={db.payments.filter((p) => p.invoiceId === i.id)}
      />
      <details className="panel">
        <summary>View History</summary>
        {db.activities
          .filter(
            (a) =>
              a.entityId === i.id ||
              db.payments.some(
                (p) => p.id === a.entityId && p.invoiceId === i.id,
              ),
          )
          .map((a) => (
            <div className="history-entry" key={a.id}>
              {a.action} · {a.summary}
              <small>{a.timestamp}</small>
              {a.previous && (
                <details>
                  <summary>Preserved record</summary>
                  <pre className="audit-json">{a.previous}</pre>
                </details>
              )}
            </div>
          ))}
      </details>
      {edit && (
        <InvoiceForm
          invoice={i}
          onClose={() => setEdit(false)}
          onSaved={() => setEdit(false)}
        />
      )}
      {payment && (
        <PaymentForm invoiceId={i.id} onClose={() => setPayment(false)} />
      )}
      {cancel && (
        <Modal title="Cancel Invoice" onClose={() => setCancel(false)}>
          <p>
            Reverse any allocated receipts first. The invoice snapshot and
            cancellation history are retained.
          </p>
          <Field label="Cancellation reason">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button
            disabled={!reason.trim()}
            className="primary"
            onClick={() => {
              if (mutate((d) => cancelInvoice(d, i.id, reason)))
                setCancel(false);
            }}
          >
            Confirm Cancellation
          </button>
        </Modal>
      )}
    </>
  );
}

export function Accounts({
  section = "overview",
  recordId,
}: {
  section?: string;
  recordId?: string;
}) {
  const { db, mutate } = useStore();
  const [f, setF] = useState({ ...emptyFilter }),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("");
  const [newInvoice, setNewInvoice] = useState(false),
    [newPayment, setNewPayment] = useState(false),
    [newExpense, setNewExpense] = useState(false),
    [editExpense, setEditExpense] = useState<string | null>(null);
  const [reverseId, setReverseId] = useState(""),
    [reason, setReason] = useState("");
  const n = financials(db, f);
  const invoices = db.invoices.filter(
    (i) =>
      matches(i.customerId, i.projectId, i.date, f) &&
      (!f.status || invoiceStatus(db, i) === f.status) &&
      [
        i.number,
        i.description,
        db.clients.find((c) => c.id === i.customerId)?.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const payments = db.payments.filter(
    (p) =>
      (!recordId || p.id === recordId) &&
      matches(p.customerId, p.projectId, p.date, f) &&
      (!f.status ||
        db.invoices.some(
          (i) => i.id === p.invoiceId && invoiceStatus(db, i) === f.status,
        )) &&
      [p.number, p.reference, p.bank]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const expenses = n.expenses.filter(
    (e) =>
      (!recordId || e.id === recordId) &&
      (!category || e.category === category) &&
      [e.reference, e.supplier, e.description]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (section === "invoices" && recordId) {
    const i = db.invoices.find((i) => i.id === recordId);
    return i ? (
      <InvoiceDetail key={i.id} invoice={i} />
    ) : (
      <Empty>
        Invoice not found. <a href="#/accounts/invoices">Invoice register</a>
      </Empty>
    );
  }
  if (section === "project-financials" && recordId)
    return db.projects.some((p) => p.id === recordId) ? (
      <ProjectFinancials projectId={recordId} />
    ) : (
      <Empty>Project not found.</Empty>
    );
  return (
    <>
      <Header
        eyebrow="Commercial & accounts"
        title="Accounts"
        description="Contracts, invoices, collections and project costs in one connected register."
        action={
          <>
            <button className="primary" onClick={() => setNewInvoice(true)}>
              New Invoice
            </button>
            <button onClick={() => setNewPayment(true)}>Record Payment</button>
            <button onClick={() => setNewExpense(true)}>New Expense</button>
          </>
        }
      />
      <nav className="tabs">
        {[
          ["overview", "Overview"],
          ["invoices", "Invoices"],
          ["payments", "Payments"],
          ["expenses", "Expenses"],
          ["receivables", "Receivables"],
          ["project-financials", "Project Financials"],
        ].map(([key, label]) => (
          <a
            className={section === key ? "active" : ""}
            key={key}
            href={`#/accounts/${key}`}
          >
            {label}
          </a>
        ))}
      </nav>
      <FinancialFilters value={f} onChange={setF} />
      <div className="filters">
        <input
          aria-label="Search accounts"
          placeholder={
            section === "expenses"
              ? "Reference, supplier or description…"
              : "Search references…"
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {section === "expenses" && (
          <select
            aria-label="Expense category filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All expense categories</option>
            {expenseCategories.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
      </div>
      {section === "overview" ? (
        <>
          <div className="kpis commercial-kpis">
            {[
              ["Total Contract Value excl. VAT", aed(n.contract)],
              ["Total Invoiced incl. VAT", aed(n.invoiced)],
              ["Total Collected", aed(n.collected)],
              ["Outstanding Receivables", aed(n.outstanding)],
              ["Overdue Amount", aed(n.overdue)],
              ["Total Recorded Expenses excl. VAT", aed(n.costs)],
              [
                "Estimated Project Gross Profit",
                n.contracts.length ? aed(n.profit) : "No contracts yet",
              ],
              [
                "Estimated Gross Margin",
                n.margin === null ? "—" : n.margin.toFixed(2) + "%",
              ],
            ].map(([label, value]) => (
              <div className="panel kpi" key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="notice">
            Totals use selected transaction dates. Receivables are the current
            balances of invoices within that filter. For all outstanding
            balances, clear date filters. Contracts and recorded costs exclude
            VAT; receivables and collections include VAT. Estimated profit uses
            accepted contracts less recorded costs, assuming recoverable input
            VAT.
          </p>
          <div className="panel">
            <h3>Recorded costs and cash expenditure</h3>
            <p>
              Recorded costs: {aed(n.costs)} · Paid expense cash incl. VAT:{" "}
              {aed(n.paidCosts)}
            </p>
            <a href="#/accounts/expenses">Open expenses →</a>
          </div>
          <h3>Recent invoices</h3>
          <InvoiceTable invoices={invoices.slice(-8)} />
        </>
      ) : section === "invoices" ? (
        <>
          <InvoiceTable invoices={invoices} />
          <h2>Eligible accepted quotation milestones</h2>
          <div className="stack">
            {db.quotations
              .filter(
                (q) =>
                  q.status === "Accepted" &&
                  matches(q.customerId, effectiveProject(db, q.id), q.date, f),
              )
              .map((q) => {
                let schedule;
                try {
                  schedule = milestoneAmounts(db, q.id);
                } catch (e) {
                  return (
                    <p role="alert" key={q.id}>
                      {q.number}: {String(e)}
                    </p>
                  );
                }
                return (
                  <section className="panel" key={q.id}>
                    <h3>
                      <a href={`#/quotations/${q.id}/preview`}>
                        {q.number} Rev {q.revision}
                      </a>{" "}
                      · {q.customer.name}
                    </h3>
                    {schedule.difference !== 0n && (
                      <p className="muted">
                        Final milestone reconciles the schedule to its accepted
                        total by one fils.
                      </p>
                    )}
                    {q.payments.map((term, index) => {
                      const exists = db.invoices.find(
                        (i) =>
                          i.quotationId === q.id &&
                          i.status !== "Cancelled" &&
                          (i.milestoneId === term.id || !i.milestoneId),
                      );
                      return (
                        <div className="list-row" key={term.id}>
                          <span>
                            {term.description}
                            <small>
                              {term.percentage}% · {aed(schedule.values[index])}{" "}
                              incl. VAT
                            </small>
                          </span>
                          {exists ? (
                            <a href={`#/accounts/invoices/${exists.id}`}>
                              {exists.number} · {exists.status}
                            </a>
                          ) : (
                            <button
                              onClick={() => {
                                let id = "";
                                if (
                                  mutate((d) => {
                                    id = saveInvoice(
                                      d,
                                      invoiceFromQuotation(d, q.id, term.id),
                                    ).id;
                                  }, "Milestone invoice draft created")
                                )
                                  location.hash = `/accounts/invoices/${id}`;
                              }}
                            >
                              Generate Milestone Invoice
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            {!db.quotations.some((q) => q.status === "Accepted") && (
              <Empty>
                No accepted quotations yet. Accept a quotation to make its
                payment schedule eligible.
              </Empty>
            )}
          </div>
        </>
      ) : section === "payments" ? (
        <>
          <PaymentTable payments={payments} />
          {payments.map((p) => (
            <details className="panel" key={p.id} open={!!recordId}>
              <summary>{p.number} · Receipt details</summary>
              <p>
                {p.reference} · {p.bank} · {p.notes}
              </p>
              {p.reversedAt ? (
                <p>
                  Reversed {p.reversalDate}: {p.reversalReason}
                </p>
              ) : (
                <button
                  onClick={() => {
                    setReverseId(p.id);
                    setReason("");
                  }}
                >
                  Reverse Payment
                </button>
              )}
              {p.attachments.map((a) => (
                <p key={a.id}>
                  <a href={a.dataUrl} download={a.name}>
                    {a.name}
                  </a>
                </p>
              ))}
            </details>
          ))}
        </>
      ) : section === "expenses" ? (
        <>
          <p className="muted">
            Recorded costs are incurred expenses. Paid amounts track cash
            separately.
          </p>
          <ExpenseTable expenses={expenses} />
          {expenses.map((e) => (
            <div className="panel" key={e.id}>
              <button onClick={() => setEditExpense(e.id)}>
                Correct {e.reference}
              </button>
              <span> {e.attachmentReference}</span>
              {e.attachments.map((a) => (
                <p key={a.id}>
                  <a href={a.dataUrl} download={a.name}>
                    {a.name}
                  </a>
                </p>
              ))}
            </div>
          ))}
        </>
      ) : section === "receivables" ? (
        <>
          <p className="notice">
            Ageing as at {f.to || today()}. From date is ignored so older unpaid
            balances remain visible.
          </p>
          <DataTable
            headers={reportData(db, "Accounts Receivable Ageing", f).headers}
            rows={reportData(db, "Accounts Receivable Ageing", f).rows}
          />
        </>
      ) : section === "project-financials" ? (
        <DataTable
          headers={[
            "Project",
            "Contract AED",
            "Invoiced AED",
            "Collected AED",
            "Balance AED",
            "Cost AED",
            "Est. Profit AED",
            "Margin %",
          ]}
          rows={db.projects
            .filter(
              (p) =>
                (!f.projectId || p.id === f.projectId) &&
                (!f.customerId || p.clientId === f.customerId),
            )
            .map((p) => {
              const s = financials(db, { ...f, projectId: p.id });
              return [
                <a href={`#/projects/${p.id}/financials`}>
                  {p.code} · {p.name}
                </a>,
                aed(s.contract),
                aed(s.invoiced),
                aed(s.collected),
                aed(s.outstanding),
                aed(s.costs),
                s.contracts.length ? aed(s.profit) : "No contract",
                s.margin === null ? "—" : s.margin.toFixed(2) + "%",
              ];
            })}
        />
      ) : (
        <Empty>Accounts tab not found.</Empty>
      )}
      {newInvoice && (
        <InvoiceForm
          onClose={() => setNewInvoice(false)}
          onSaved={(id) => {
            setNewInvoice(false);
            location.hash = `/accounts/invoices/${id}`;
          }}
        />
      )}
      {newPayment && <PaymentForm onClose={() => setNewPayment(false)} />}
      {newExpense && <ExpenseForm onClose={() => setNewExpense(false)} />}
      {editExpense && (
        <ExpenseForm
          expense={db.expenses.find((e) => e.id === editExpense)}
          onClose={() => setEditExpense(null)}
        />
      )}
      {reverseId && (
        <Modal title="Reverse Payment" onClose={() => setReverseId("")}>
          <p>
            The receipt remains in history. Its allocation is removed; post a
            replacement receipt to correct the amount or reference.
          </p>
          <Field label="Reversal reason">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button
            className="primary"
            disabled={!reason.trim()}
            onClick={() => {
              if (mutate((d) => reversePayment(d, reverseId, reason)))
                setReverseId("");
            }}
          >
            Confirm Reversal
          </button>
        </Modal>
      )}
    </>
  );
}
