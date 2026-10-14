import { useState } from "react";
import type { Client } from "../domain/model";
import { emirates } from "../domain/model";
import { useStore } from "../store";
import { Header, Field, Modal, Badge, Empty, Confirm } from "../components/ui";
import {
  blankCustomer,
  duplicateCustomers,
  saveCustomer,
} from "./customer-domain";
import { uid } from "../domain/logic";
import { aed, financials, effectiveProject, dubaiDate } from "./calculations";
import { emptyFilter } from "./model";
import { InvoiceTable, PaymentTable } from "./Registers";
import { Statement } from "./Reports";

// Reuses the native dialog and existing field tokens in all three entry points.
export function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Client;
  onClose: () => void;
  onSaved: (id: string, customer: Client) => void;
}) {
  const { db, mutate } = useStore();
  const [c, setC] = useState<Client>(() =>
    structuredClone(customer || blankCustomer()),
  );
  const [ack, setAck] = useState(false),
    [reason, setReason] = useState("");
  const possible = duplicateCustomers(db, c);
  return (
    <Modal
      title={customer ? "Edit Customer" : "Add Customer"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          let saved = c;
          if (
            mutate((d) => {
              saved = saveCustomer(d, c, ack, reason);
            }, "Customer saved")
          )
            onSaved(c.id, saved);
        }}
      >
        <div className="form-grid">
          <Field label="Customer/company name">
            <input
              autoFocus
              required
              minLength={2}
              value={c.name}
              onChange={(e) => {
                setC({ ...c, name: e.target.value });
                setAck(false);
              }}
            />
          </Field>
          <Field label="Customer type">
            <select
              value={c.type}
              onChange={(e) =>
                setC({ ...c, type: e.target.value as Client["type"] })
              }
            >
              <option>Company</option>
              <option>Individual</option>
            </select>
          </Field>
          {(
            [
              ["contact", "Contact person"],
              ["phone", "Primary mobile number"],
              ["whatsapp", "WhatsApp number"],
              ["email", "Email"],
              ["address", "Billing address"],
              ["siteAddress", "Project/site address"],
              ["city", "City"],
              ["country", "Country"],
              ["trn", "TRN/VAT number"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type={
                  key === "email"
                    ? "email"
                    : key === "phone" || key === "whatsapp"
                      ? "tel"
                      : "text"
                }
                value={c[key] || ""}
                onChange={(e) => {
                  setC({ ...c, [key]: e.target.value });
                  setAck(false);
                }}
              />
            </Field>
          ))}
          <Field label="Emirate">
            <select
              value={c.emirate || "Dubai"}
              onChange={(e) => setC({ ...c, emirate: e.target.value })}
            >
              {emirates.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Customer status">
            <select
              value={c.status}
              onChange={(e) =>
                setC({ ...c, status: e.target.value as Client["status"] })
              }
            >
              <option>Active</option>
              <option>Archived</option>
            </select>
          </Field>
        </div>
        <Field label="Customer notes">
          <textarea
            value={c.notes || ""}
            onChange={(e) => setC({ ...c, notes: e.target.value })}
          />
        </Field>
        <details>
          <summary>
            Additional company contacts ({c.contacts?.length || 0})
          </summary>
          {(c.contacts || []).map((p, index) => (
            <div className="panel" key={p.id}>
              <div className="form-grid">
                {(["name", "role", "phone", "email"] as const).map((key) => (
                  <Field key={key} label={`Contact ${index + 1} ${key}`}>
                    <input
                      required={key === "name"}
                      type={key === "email" ? "email" : "text"}
                      value={p[key]}
                      onChange={(e) =>
                        setC({
                          ...c,
                          contacts: c.contacts!.map((x) =>
                            x.id === p.id ? { ...x, [key]: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setC({
                    ...c,
                    contacts: c.contacts!.filter((x) => x.id !== p.id),
                  })
                }
              >
                Remove contact
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setC({
                ...c,
                contacts: [
                  ...(c.contacts || []),
                  { id: uid(), name: "", role: "", phone: "", email: "" },
                ],
              })
            }
          >
            Add contact
          </button>
        </details>
        {possible.length > 0 && (
          <div className="notice" role="alert">
            <strong>Possible duplicate customer</strong>
            <p>
              {possible.map((x) => `${x.code} · ${x.name}`).join("; ")}. Close
              this form to select an existing record.
            </p>
            <label className="choice">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              Create or retain a separate customer
            </label>
            {ack && (
              <Field label="Reason for separate customer">
                <input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
          </div>
        )}
        <div className="sticky-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={possible.length > 0 && (!ack || !reason.trim())}
          >
            Save Customer
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Customers({
  id,
  tab = "overview",
}: {
  id?: string;
  tab?: string;
}) {
  const { db, mutate } = useStore();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Client | "new" | null>(null),
    [archive, setArchive] = useState<Client | null>(null);
  const customer = db.clients.find((c) => c.id === id);
  const f = { ...emptyFilter, customerId: id || "" },
    totals = financials(db, f);
  const list = db.clients.filter(
    (c) =>
      (!status || (c.status || "Active") === status) &&
      [c.code, c.name, c.contact, c.email, c.phone, c.trn]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (id && !customer)
    return (
      <Empty>
        Customer not found. <a href="#/customers">Open Customers</a>
      </Empty>
    );
  return (
    <>
      <Header
        eyebrow="Customer master"
        title={customer?.name || "Customers"}
        description={
          customer
            ? `${customer.code} · ${customer.type} · ${customer.contact || "No primary contact"}`
            : "One customer record, from first proposal to final collection."
        }
        action={
          customer ? (
            <>
              <a className="button" href="#/customers">
                Customer directory
              </a>
              <button onClick={() => setEditing(customer)}>
                Edit Customer
              </button>
              <button onClick={() => setArchive(customer)}>
                {customer.status === "Archived"
                  ? "Restore Customer"
                  : "Archive Customer"}
              </button>
            </>
          ) : (
            <button className="primary" onClick={() => setEditing("new")}>
              Add New Customer
            </button>
          )
        }
      />
      {customer ? (
        <>
          <nav className="tabs">
            {[
              "overview",
              "projects",
              "quotations",
              "invoices",
              "payments",
              "statement",
            ].map((t) => (
              <a
                key={t}
                className={tab === t ? "active" : ""}
                href={`#/customers/${id}/${t}`}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </a>
            ))}
          </nav>
          {tab === "overview" ? (
            <>
              <div className="kpis commercial-kpis">
                <div className="panel kpi">
                  <small>Invoiced incl. VAT</small>
                  <strong>{aed(totals.invoiced)}</strong>
                </div>
                <div className="panel kpi">
                  <small>Collected</small>
                  <strong>{aed(totals.collected)}</strong>
                </div>
                <div className="panel kpi">
                  <small>Outstanding</small>
                  <strong>{aed(totals.outstanding)}</strong>
                </div>
                <div className="panel kpi">
                  <small>Overdue</small>
                  <strong>{aed(totals.overdue)}</strong>
                </div>
              </div>
              <section className="panel">
                <Badge>{customer.status}</Badge>
                <dl className="quote-list-details">
                  {[
                    ["Phone", customer.phone],
                    ["WhatsApp", customer.whatsapp],
                    ["Email", customer.email],
                    ["Billing address", customer.address],
                    ["Site address", customer.siteAddress],
                    [
                      "Location",
                      [customer.city, customer.emirate, customer.country]
                        .filter(Boolean)
                        .join(", "),
                    ],
                    ["TRN", customer.trn],
                    [
                      "Created",
                      (customer.createdAt
                        ? dubaiDate(customer.createdAt)
                        : "") || "Not recorded in legacy data",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <p className="preserve-lines">{customer.notes}</p>
                {customer.contacts?.map((c) => (
                  <p key={c.id}>
                    {c.name} · {c.role}
                    <small>
                      {c.phone} · {c.email}
                    </small>
                  </p>
                ))}
              </section>
            </>
          ) : tab === "projects" ? (
            <div className="panel">
              {db.projects
                .filter((p) => p.clientId === id)
                .map((p) => (
                  <a
                    className="list-row"
                    key={p.id}
                    href={`#/projects/${p.id}/overview`}
                  >
                    <span>
                      {p.code} · {p.name}
                    </span>
                    <Badge>{p.status}</Badge>
                  </a>
                ))}
              {!db.projects.some((p) => p.clientId === id) && (
                <Empty>No linked projects yet.</Empty>
              )}
            </div>
          ) : tab === "quotations" ? (
            <div className="panel">
              {db.quotations
                .filter((q) => q.customerId === id)
                .map((q) => (
                  <a
                    className="list-row"
                    key={q.id}
                    href={`#/quotations/${q.id}/edit`}
                  >
                    <span>
                      {q.number} Rev {q.revision}
                      <small>
                        {db.projects.find(
                          (p) => p.id === effectiveProject(db, q.id),
                        )?.name || q.project.name}
                      </small>
                    </span>
                    <Badge>{q.status}</Badge>
                  </a>
                ))}
              {!db.quotations.some((q) => q.customerId === id) && (
                <Empty>No linked quotations yet.</Empty>
              )}
            </div>
          ) : tab === "invoices" ? (
            <InvoiceTable
              invoices={db.invoices.filter((i) => i.customerId === id)}
            />
          ) : tab === "payments" ? (
            <PaymentTable
              payments={db.payments.filter((p) => p.customerId === id)}
            />
          ) : tab === "statement" ? (
            <Statement customerId={id!} />
          ) : (
            <Empty>Customer tab not found.</Empty>
          )}
        </>
      ) : (
        <>
          <div className="filters">
            <input
              aria-label="Search customers"
              placeholder="Name, phone, email or TRN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Customer status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option>Active</option>
              <option>Archived</option>
            </select>
          </div>
          <div className="table-scroll panel">
            <table className="commercial-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Projects</th>
                  <th className="numeric">Outstanding</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <a href={`#/customers/${c.id}/overview`}>{c.name}</a>
                      <small>
                        {c.code} · {c.type}
                      </small>
                    </td>
                    <td>
                      {c.contact || "—"}
                      <small>
                        {c.phone || c.email || "No contact recorded"}
                      </small>
                    </td>
                    <td>
                      {db.projects.filter((p) => p.clientId === c.id).length}
                    </td>
                    <td className="numeric">
                      {aed(
                        financials(db, { ...emptyFilter, customerId: c.id })
                          .outstanding,
                      )}
                    </td>
                    <td>
                      <Badge>{c.status || "Active"}</Badge>
                    </td>
                    <td>
                      <div className="actions">
                        <a
                          className="button"
                          href={`#/customers/${c.id}/overview`}
                        >
                          View
                        </a>
                        <button onClick={() => setEditing(c)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && (
              <Empty>No customers match. Add a customer to get started.</Empty>
            )}
          </div>
        </>
      )}
      {editing && (
        <CustomerForm
          customer={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(newId) => {
            setEditing(null);
            location.hash = `/customers/${newId}/overview`;
          }}
        />
      )}
      {archive && (
        <Confirm
          title={
            archive.status === "Archived"
              ? "Restore customer?"
              : "Archive customer?"
          }
          onClose={() => setArchive(null)}
          onConfirm={() => {
            if (
              mutate((d) => {
                saveCustomer(
                  d,
                  {
                    ...archive,
                    status:
                      archive.status === "Archived" ? "Active" : "Archived",
                  },
                  true,
                  "Status change to existing record",
                );
              })
            )
              setArchive(null);
          }}
        >
          Linked records and financial history remain accessible.
        </Confirm>
      )}
    </>
  );
}
