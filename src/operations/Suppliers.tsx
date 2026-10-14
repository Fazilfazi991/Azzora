import { useState } from "react";
import { useStore } from "../store";
import { Header, Field, Modal, Badge, Empty } from "../components/ui";
import { DataTable } from "../commercial/Registers";
import { aed } from "../commercial/calculations";
import { uid } from "../domain/logic";
import { getOperations } from "./migration";
import { saveSupplier } from "./repository";
import { supplierBalance } from "./calculations";
import type { Supplier } from "./model";
import { Procurement } from "./Procurement";
export const blankSupplier = (): Supplier => ({
  id: uid(),
  code: "",
  name: "",
  contact: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  emirate: "Dubai",
  country: "United Arab Emirates",
  trn: "",
  bank: "",
  category: "",
  terms: "",
  notes: "",
  status: "Active",
  createdAt: new Date().toISOString(),
});
export function SupplierForm({
  supplier,
  onClose,
}: {
  supplier?: Supplier;
  onClose: () => void;
}) {
  const { mutate } = useStore();
  const [s, setS] = useState(() =>
    structuredClone(supplier || blankSupplier()),
  );
  return (
    <Modal
      title={supplier ? "Edit Supplier" : "New Supplier"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            mutate((d) => {
              saveSupplier(d, s);
            })
          )
            onClose();
        }}
      >
        <div className="form-grid">
          {(
            [
              ["name", "Supplier company name"],
              ["contact", "Supplier contact person"],
              ["phone", "Supplier phone"],
              ["whatsapp", "Supplier WhatsApp"],
              ["email", "Supplier email"],
              ["address", "Supplier address"],
              ["emirate", "Supplier emirate"],
              ["country", "Supplier country"],
              ["trn", "Supplier TRN"],
              ["category", "Material/service category"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                required={key === "name"}
                type={key === "email" ? "email" : "text"}
                value={s[key]}
                onChange={(e) => setS({ ...s, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <Field label="Supplier bank details (demo only)">
          <textarea
            value={s.bank}
            onChange={(e) => setS({ ...s, bank: e.target.value })}
          />
        </Field>
        <Field label="Supplier payment terms">
          <textarea
            value={s.terms}
            onChange={(e) => setS({ ...s, terms: e.target.value })}
          />
        </Field>
        <Field label="Supplier notes">
          <textarea
            value={s.notes}
            onChange={(e) => setS({ ...s, notes: e.target.value })}
          />
        </Field>
        <button className="primary">Save Supplier</button>
      </form>
    </Modal>
  );
}
export function Suppliers({
  id,
  tab = "overview",
}: {
  id?: string;
  tab?: string;
}) {
  const { db, mutate } = useStore(),
    op = getOperations(db);
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const s = op.suppliers.find((s) => s.id === id);
  if (id && !s)
    return (
      <Empty>
        Supplier not found. <a href="#/suppliers">Supplier directory</a>
      </Empty>
    );
  return (
    <>
      <Header
        eyebrow="Supplier master"
        title={s?.name || "Suppliers"}
        description={
          s
            ? `${s.code} · ${s.category} · ${s.status}`
            : "Vendor identity, purchase history and payables."
        }
        action={
          s ? (
            <>
              <a className="button" href="#/suppliers">
                Supplier directory
              </a>
              <button onClick={() => setEditing(s)}>Edit Supplier</button>
              <button
                onClick={() =>
                  mutate((d) => {
                    saveSupplier(d, {
                      ...s,
                      status: s.status === "Active" ? "Archived" : "Active",
                    });
                  })
                }
              >
                {s.status === "Active"
                  ? "Archive Supplier"
                  : "Restore Supplier"}
              </button>
            </>
          ) : (
            <button className="primary" onClick={() => setEditing("new")}>
              Add Supplier
            </button>
          )
        }
      />
      {s ? (
        <>
          <nav className="tabs">
            {[
              "overview",
              "quotations",
              "orders",
              "bills",
              "payments",
              "projects",
            ].map((t) => (
              <a
                className={tab === t ? "active" : ""}
                href={`#/suppliers/${s.id}/${t}`}
                key={t}
              >
                {t === "orders"
                  ? "Purchase Orders"
                  : t[0].toUpperCase() + t.slice(1)}
              </a>
            ))}
          </nav>
          {tab === "overview" ? (
            <section className="panel">
              <Badge>{s.status}</Badge>
              <p>
                {s.contact} · {s.phone} · {s.whatsapp}
              </p>
              <p>
                {s.email}
                <br />
                {s.address}, {s.emirate}, {s.country}
              </p>
              <p>TRN: {s.trn || "Not supplied"}</p>
              <p className="preserve-lines">
                Payment terms: {s.terms}
                <br />
                Bank (demo only): {s.bank}
                <br />
                {s.notes}
              </p>
              <strong>
                Outstanding payable{" "}
                {aed(
                  op.bills
                    .filter((b) => b.supplierId === s.id)
                    .reduce((sum, b) => sum + supplierBalance(db, b.id), 0n),
                )}
              </strong>
            </section>
          ) : tab === "projects" ? (
            <div className="panel">
              {db.projects
                .filter((p) =>
                  op.orders.some(
                    (o) => o.projectId === p.id && o.supplierId === s.id,
                  ),
                )
                .map((p) => (
                  <a
                    key={p.id}
                    className="list-row"
                    href={`#/projects/${p.id}/procurement`}
                  >
                    {p.code} · {p.name}
                  </a>
                ))}
            </div>
          ) : (
            <Procurement
              supplierId={s.id}
              section={tab === "quotations" ? "comparison" : tab}
              embedded
            />
          )}
        </>
      ) : (
        <>
          <div className="filters">
            <input
              aria-label="Search suppliers"
              placeholder="Name, phone, email, category or TRN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DataTable
            headers={[
              "Supplier",
              "Contact",
              "Category",
              "Status",
              "Outstanding AED",
            ]}
            rows={op.suppliers
              .filter((s) =>
                [s.code, s.name, s.phone, s.email, s.trn, s.category]
                  .join(" ")
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((s) => [
                <a href={`#/suppliers/${s.id}/overview`}>
                  {s.name}
                  <small>{s.code}</small>
                </a>,
                <>
                  {s.contact}
                  <small>
                    {s.phone} · {s.email}
                  </small>
                </>,
                s.category,
                <Badge>{s.status}</Badge>,
                aed(
                  op.bills
                    .filter((b) => b.supplierId === s.id)
                    .reduce((sum, b) => sum + supplierBalance(db, b.id), 0n),
                ),
              ])}
          />
        </>
      )}
      {editing && (
        <SupplierForm
          supplier={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
