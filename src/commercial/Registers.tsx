import { useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "../store";
import { Field, Modal, Badge, Empty } from "../components/ui";
import { Attachments } from "../components/uploads";
import { today, uid, addDays } from "../domain/logic";
import type {
  CommercialFilter,
  Invoice,
  Payment,
  Expense,
  TaxTreatment,
} from "./model";
import { paymentMethods, expenseCategories } from "./model";
import {
  aed,
  amountString,
  cents,
  invoiceTotals,
  balanceDue,
  paidAmount,
  invoiceStatus,
} from "./calculations";
import {
  blankInvoice,
  saveInvoice,
  invoiceFromQuotation,
  postPayment,
  saveExpense,
} from "./repository";

export function FinancialFilters({
  value: f,
  onChange,
}: {
  value: CommercialFilter;
  onChange: (f: CommercialFilter) => void;
}) {
  const { db } = useStore();
  return (
    <div className="filters commercial-filters">
      <Field label="From date">
        <input
          type="date"
          value={f.from}
          max={f.to || undefined}
          onChange={(e) => onChange({ ...f, from: e.target.value })}
        />
      </Field>
      <Field label="To date">
        <input
          type="date"
          value={f.to}
          min={f.from || undefined}
          onChange={(e) => onChange({ ...f, to: e.target.value })}
        />
      </Field>
      <Field label="Filter customer">
        <select
          value={f.customerId}
          onChange={(e) =>
            onChange({ ...f, customerId: e.target.value, projectId: "" })
          }
        >
          <option value="">All customers</option>
          {db.clients.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Filter project">
        <select
          value={f.projectId}
          onChange={(e) => onChange({ ...f, projectId: e.target.value })}
        >
          <option value="">All projects</option>
          {db.projects
            .filter((p) => !f.customerId || p.clientId === f.customerId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Payment status">
        <select
          value={f.status}
          onChange={(e) => onChange({ ...f, status: e.target.value })}
        >
          <option value="">All statuses</option>
          {[
            "Draft",
            "Issued",
            "Partially Paid",
            "Paid",
            "Overdue",
            "Cancelled",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}
export function DataTable({
  headers,
  rows,
  empty = "No records yet.",
}: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  return (
    <div
      className="panel table-scroll"
      tabIndex={0}
      role="region"
      aria-label={headers.join(", ") + " table"}
    >
      <table className="commercial-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className={
                  /AED$|Margin %$|Progress %$|^(Quantity|Ordered|Delivered|Pending|Billed)$/.test(
                    h,
                  )
                    ? "numeric"
                    : undefined
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={
                    /AED$|Margin %$|Progress %$|^(Quantity|Ordered|Delivered|Pending|Billed)$/.test(
                      headers[j],
                    )
                      ? "numeric"
                      : undefined
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty>{empty}</Empty>}
    </div>
  );
}
export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const { db } = useStore();
  return (
    <DataTable
      headers={[
        "Invoice",
        "Customer / Project",
        "Date / Due",
        "Total AED",
        "Paid AED",
        "Balance AED",
        "Status",
      ]}
      rows={invoices.map((i) => [
        <a href={`#/accounts/invoices/${i.id}`}>{i.number}</a>,
        <>
          <a href={`#/customers/${i.customerId}/invoices`}>
            {i.snapshot?.customer.name ||
              db.clients.find((c) => c.id === i.customerId)?.name}
          </a>
          <small>
            {db.projects.find((p) => p.id === i.projectId)?.code ||
              "Manual invoice"}
          </small>
        </>,
        <>
          {i.date}
          <small>Due {i.due}</small>
        </>,
        aed(invoiceTotals(i).grand),
        aed(i.status === "Issued" ? paidAmount(db, i.id) : 0n),
        aed(balanceDue(db, i)),
        <>
          <Badge>{invoiceStatus(db, i)}</Badge>
          {invoiceStatus(db, i) === "Overdue" &&
            balanceDue(db, i) < invoiceTotals(i).grand && (
              <small>Partially paid</small>
            )}
        </>,
      ])}
    />
  );
}
export function PaymentTable({ payments }: { payments: Payment[] }) {
  const { db } = useStore();
  return (
    <DataTable
      headers={[
        "Receipt",
        "Invoice / Customer",
        "Date",
        "Amount AED",
        "Method / Reference",
        "Status",
      ]}
      rows={payments.map((p) => [
        <a href={`#/accounts/payments/${p.id}`}>{p.number}</a>,
        <>
          <a href={`#/accounts/invoices/${p.invoiceId}`}>
            {db.invoices.find((i) => i.id === p.invoiceId)?.number}
          </a>
          <small>{db.clients.find((c) => c.id === p.customerId)?.name}</small>
        </>,
        p.date,
        aed(cents(p.amount)),
        <>
          {p.method}
          <small>
            {p.reference} · {p.bank}
          </small>
        </>,
        <Badge>{p.reversedAt ? "Reversed" : "Posted"}</Badge>,
      ])}
    />
  );
}
export function ExpenseTable({ expenses }: { expenses: Expense[] }) {
  const { db } = useStore();
  return (
    <DataTable
      headers={[
        "Expense",
        "Project",
        "Date / Category",
        "Supplier / Description",
        "Cost AED",
        "VAT AED",
        "Total AED",
        "Paid AED",
        "Status",
      ]}
      rows={expenses.map((e) => [
        <a href={`#/accounts/expenses/${e.id}`}>{e.reference}</a>,
        <a href={`#/projects/${e.projectId}/financials`}>
          {db.projects.find((p) => p.id === e.projectId)?.code}
        </a>,
        <>
          {e.date}
          <small>{e.category}</small>
        </>,
        <>
          {e.supplier}
          <small>{e.description}</small>
        </>,
        aed(cents(e.amount)),
        aed(cents(e.vat)),
        aed(cents(e.amount) + cents(e.vat)),
        aed(cents(e.paidAmount)),
        <Badge>
          {cents(e.paidAmount) === 0n
            ? "Unpaid"
            : cents(e.paidAmount) < cents(e.amount) + cents(e.vat)
              ? "Partially Paid"
              : "Paid"}
        </Badge>,
      ])}
    />
  );
}

export function InvoiceForm({
  invoice,
  initialCustomerId = "",
  initialProjectId = "",
  onClose,
  onSaved,
}: {
  invoice?: Invoice;
  initialCustomerId?: string;
  initialProjectId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { db, mutate } = useStore();
  const [i, setI] = useState(() => {
    const result = structuredClone(
      invoice || blankInvoice(initialCustomerId, initialProjectId),
    );
    if (!invoice && db.operations) {
      const settings = db.operations.settings;
      result.vatPercentage = settings.vatPercentage;
      result.lines.forEach((l) => (l.tax = settings.tax));
      result.due = addDays(today(), settings.paymentDays);
      result.terms = settings.company.invoiceTerms;
    }
    return result;
  });
  const [source, setSource] = useState(invoice?.quotationId || ""),
    [milestone, setMilestone] = useState(invoice?.milestoneId || "");
  const [sourceError, setSourceError] = useState("");
  let t;
  try {
    t = invoiceTotals(i);
  } catch {
    /* Validation is shown on save. */
  }
  function useSource(quotationId: string, milestoneId: string) {
    setSource(quotationId);
    setMilestone(milestoneId);
    setSourceError("");
    if (!quotationId) {
      setI({ ...i, quotationId: "", milestoneId: "" });
      return;
    }
    try {
      const next = invoiceFromQuotation(db, quotationId, milestoneId);
      setI({ ...next, id: i.id, number: i.number, createdAt: i.createdAt });
    } catch (e) {
      setSourceError(String(e));
    }
  }
  return (
    <Modal
      title={invoice ? "Edit Draft Invoice" : "Create Invoice"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (sourceError) return;
          let id = "";
          if (
            mutate((d) => {
              id = saveInvoice(d, i).id;
            }, "Invoice draft saved")
          )
            onSaved(id);
        }}
      >
        <div className="form-grid">
          <Field label="From accepted quotation">
            <select
              value={source}
              onChange={(e) => useSource(e.target.value, "")}
            >
              <option value="">Manual / project invoice</option>
              {db.quotations
                .filter((q) => q.status === "Accepted")
                .map((q) => (
                  <option value={q.id} key={q.id}>
                    {q.number} Rev {q.revision} · {q.customer.name}
                  </option>
                ))}
            </select>
          </Field>
          {source && (
            <Field label="Quotation payment milestone">
              <select
                value={milestone}
                onChange={(e) => useSource(source, e.target.value)}
              >
                <option value="">Full accepted scope</option>
                {db.quotations
                  .find((q) => q.id === source)
                  ?.payments.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.description} · {p.percentage}%
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Invoice number">
            <input
              placeholder="Automatically assigned"
              value={i.number}
              onChange={(e) => setI({ ...i, number: e.target.value })}
            />
          </Field>
          <Field label="Invoice customer">
            <select
              required
              disabled={!!i.quotationId}
              value={i.customerId}
              onChange={(e) =>
                setI({ ...i, customerId: e.target.value, projectId: "" })
              }
            >
              <option value="">Select customer…</option>
              {db.clients
                .filter((c) => c.status !== "Archived" || c.id === i.customerId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Invoice project">
            <select
              disabled={!!i.quotationId}
              value={i.projectId}
              onChange={(e) => {
                const p = db.projects.find((p) => p.id === e.target.value);
                setI({
                  ...i,
                  projectId: e.target.value,
                  customerId: p?.clientId || i.customerId,
                });
              }}
            >
              <option value="">No project / manual invoice</option>
              {db.projects
                .filter((p) => !i.customerId || p.clientId === i.customerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Invoice date">
            <input
              required
              type="date"
              value={i.date}
              onChange={(e) => setI({ ...i, date: e.target.value })}
            />
          </Field>
          <Field label="Due date">
            <input
              required
              type="date"
              min={i.date}
              value={i.due}
              onChange={(e) => setI({ ...i, due: e.target.value })}
            />
          </Field>
        </div>
        {sourceError && (
          <p className="error" role="alert">
            {sourceError}
          </p>
        )}
        {i.quotationId && (
          <p className="notice">
            Quotation amounts include VAT. Inclusive treatment extracts VAT
            once. Milestone drafts reserve that milestone until cancelled.
          </p>
        )}
        <Field label="Invoice description">
          <input
            value={i.description}
            onChange={(e) => setI({ ...i, description: e.target.value })}
          />
        </Field>
        <h3>Invoice items</h3>
        {i.lines.map((l, index) => (
          <div className="panel invoice-line" key={l.id}>
            <Field label={`Item ${index + 1} description`}>
              <textarea
                required
                value={l.description}
                onChange={(e) =>
                  setI({
                    ...i,
                    lines: i.lines.map((x) =>
                      x.id === l.id ? { ...x, description: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
            <div className="form-grid">
              {(["quantity", "rate"] as const).map((key) => (
                <Field key={key} label={`Item ${index + 1} ${key}`}>
                  <input
                    required
                    inputMode="decimal"
                    value={l[key]}
                    onChange={(e) =>
                      setI({
                        ...i,
                        lines: i.lines.map((x) =>
                          x.id === l.id ? { ...x, [key]: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              <Field label={`Item ${index + 1} tax treatment`}>
                <select
                  value={l.tax}
                  onChange={(e) =>
                    setI({
                      ...i,
                      lines: i.lines.map((x) =>
                        x.id === l.id
                          ? { ...x, tax: e.target.value as TaxTreatment }
                          : x,
                      ),
                    })
                  }
                >
                  {["Exclusive", "Inclusive", "Zero Rated", "Exempt"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </Field>
            </div>
            <button
              type="button"
              disabled={i.lines.length === 1}
              onClick={() =>
                setI({ ...i, lines: i.lines.filter((x) => x.id !== l.id) })
              }
            >
              Remove item
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setI({
              ...i,
              lines: [
                ...i.lines,
                {
                  id: uid(),
                  description: "",
                  quantity: "1",
                  rate: "0",
                  tax: "Exclusive",
                },
              ],
            })
          }
        >
          Add invoice item
        </button>
        <div className="form-grid">
          <Field label="Invoice discount AED">
            <input
              inputMode="decimal"
              value={i.discount}
              onChange={(e) => setI({ ...i, discount: e.target.value })}
            />
          </Field>
          <Field label="Invoice VAT percentage">
            <input
              inputMode="decimal"
              value={i.vatPercentage}
              onChange={(e) => setI({ ...i, vatPercentage: e.target.value })}
            />
          </Field>
        </div>
        {t && (
          <div className="quote-totals">
            <p className="between">
              <span>Net after discount</span>
              <strong>{aed(t.net)}</strong>
            </p>
            <p className="between">
              <span>VAT</span>
              <strong>{aed(t.vat)}</strong>
            </p>
            <p className="between">
              <span>Grand total</span>
              <strong data-testid="invoice-form-total">{aed(t.grand)}</strong>
            </p>
          </div>
        )}
        <Field label="Invoice payment terms">
          <textarea
            value={i.terms}
            onChange={(e) => setI({ ...i, terms: e.target.value })}
          />
        </Field>
        <Field label="Invoice notes">
          <textarea
            value={i.notes}
            onChange={(e) => setI({ ...i, notes: e.target.value })}
          />
        </Field>
        <div className="sticky-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!!sourceError}>
            Save Draft Invoice
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PaymentForm({
  invoiceId = "",
  onClose,
}: {
  invoiceId?: string;
  onClose: () => void;
}) {
  const { db, mutate } = useStore();
  const eligible = db.invoices.filter(
    (i) => i.status === "Issued" && balanceDue(db, i) > 0n,
  );
  const selected = eligible.find((i) => i.id === invoiceId) || eligible[0];
  const [p, setP] = useState<Payment>(() => ({
    id: uid(),
    number: "",
    invoiceId: selected?.id || "",
    customerId: selected?.customerId || "",
    projectId: selected?.projectId || "",
    date: today(),
    amount: selected ? amountString(balanceDue(db, selected)) : "0",
    method: "Bank Transfer",
    reference: "",
    bank: "",
    notes: "",
    attachments: [],
    postingKey: uid(),
    createdAt: new Date().toISOString(),
  }));
  const i = db.invoices.find((i) => i.id === p.invoiceId);
  return (
    <Modal title="Record Payment" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            mutate((d) => {
              postPayment(d, p);
            }, "Payment recorded")
          )
            onClose();
        }}
      >
        <Field label="Payment invoice">
          <select
            required
            value={p.invoiceId}
            onChange={(e) => {
              const i = eligible.find((i) => i.id === e.target.value)!;
              if (i)
                setP({
                  ...p,
                  invoiceId: i.id,
                  customerId: i.customerId,
                  projectId: i.projectId,
                  amount: amountString(balanceDue(db, i)),
                });
            }}
          >
            <option value="">Select outstanding invoice…</option>
            {eligible.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} ·{" "}
                {db.clients.find((c) => c.id === i.customerId)?.name} ·{" "}
                {aed(balanceDue(db, i))}
              </option>
            ))}
          </select>
        </Field>
        {i && (
          <p className="notice">
            {db.clients.find((c) => c.id === i.customerId)?.name} ·{" "}
            {db.projects.find((x) => x.id === i.projectId)?.name ||
              "No project"}
            <br />
            Balance due: {aed(balanceDue(db, i))}
          </p>
        )}
        <div className="form-grid">
          <Field label="Receipt date">
            <input
              type="date"
              required
              min={i?.date}
              max={today()}
              value={p.date}
              onChange={(e) => setP({ ...p, date: e.target.value })}
            />
          </Field>
          <Field label="Payment amount AED">
            <input
              required
              inputMode="decimal"
              value={p.amount}
              onChange={(e) => setP({ ...p, amount: e.target.value })}
            />
          </Field>
          <Field label="Payment method">
            <select
              value={p.method}
              onChange={(e) =>
                setP({ ...p, method: e.target.value as Payment["method"] })
              }
            >
              {paymentMethods.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Payment reference">
            <input
              required
              value={p.reference}
              onChange={(e) => setP({ ...p, reference: e.target.value })}
            />
          </Field>
          <Field label="Bank/account reference">
            <input
              value={p.bank}
              onChange={(e) => setP({ ...p, bank: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Payment notes">
          <textarea
            value={p.notes}
            onChange={(e) => setP({ ...p, notes: e.target.value })}
          />
        </Field>
        <Attachments
          files={p.attachments}
          onChange={(attachments) => setP({ ...p, attachments })}
        />
        <div className="sticky-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!i}>
            Post Receipt
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ExpenseForm({
  expense,
  projectId = "",
  onClose,
}: {
  expense?: Expense;
  projectId?: string;
  onClose: () => void;
}) {
  const { db, mutate } = useStore();
  const [e, setE] = useState<Expense>(() =>
    structuredClone(
      expense || {
        id: uid(),
        reference: "",
        projectId,
        category: "Materials",
        supplier: "",
        date: today(),
        description: "",
        amount: "0",
        vat: "0",
        paidAmount: "0",
        method: "Bank Transfer",
        attachmentReference: "",
        attachments: [],
        createdAt: new Date().toISOString(),
      },
    ),
  );
  return (
    <Modal
      title={expense ? "Correct Expense" : "New Expense"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            mutate((d) => {
              saveExpense(d, e);
            }, "Expense saved")
          )
            onClose();
        }}
      >
        <div className="form-grid">
          <Field label="Expense reference">
            <input
              placeholder="Automatically assigned"
              value={e.reference}
              onChange={(event) =>
                setE({ ...e, reference: event.target.value })
              }
            />
          </Field>
          <Field label="Expense project">
            <select
              required
              value={e.projectId}
              onChange={(event) =>
                setE({ ...e, projectId: event.target.value })
              }
            >
              <option value="">Select project…</option>
              {db.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expense category">
            <select
              value={e.category}
              onChange={(event) => setE({ ...e, category: event.target.value })}
            >
              {expenseCategories.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Supplier/vendor">
            <input
              required
              value={e.supplier}
              onChange={(event) => setE({ ...e, supplier: event.target.value })}
            />
          </Field>
          <Field label="Expense date">
            <input
              required
              type="date"
              value={e.date}
              onChange={(event) => setE({ ...e, date: event.target.value })}
            />
          </Field>
          {(
            [
              ["amount", "Expense amount excl. VAT AED"],
              ["vat", "Expense VAT AED"],
              ["paidAmount", "Expense paid amount incl. VAT AED"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                inputMode="decimal"
                required
                value={e[key]}
                onChange={(event) => setE({ ...e, [key]: event.target.value })}
              />
            </Field>
          ))}
          <Field label="Expense payment method">
            <select
              value={e.method}
              onChange={(event) =>
                setE({ ...e, method: event.target.value as Expense["method"] })
              }
            >
              {paymentMethods.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Attachment/reference">
            <input
              value={e.attachmentReference}
              onChange={(event) =>
                setE({ ...e, attachmentReference: event.target.value })
              }
            />
          </Field>
        </div>
        <Field label="Expense description">
          <textarea
            required
            value={e.description}
            onChange={(event) =>
              setE({ ...e, description: event.target.value })
            }
          />
        </Field>
        <p className="muted">
          Recorded cost excludes VAT. Paid amount records cash expenditure
          separately. Corrections retain prior values in activity history.
        </p>
        <Attachments
          files={e.attachments}
          onChange={(attachments) => setE({ ...e, attachments })}
        />
        <div className="sticky-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">Save Expense</button>
        </div>
      </form>
    </Modal>
  );
}
