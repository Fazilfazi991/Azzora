import { useState } from "react";
import { useStore } from "../store";
import { Header, Field, Modal, Badge, Empty } from "../components/ui";
import { Attachments } from "../components/uploads";
import { DataTable } from "../commercial/Registers";
import { aed, amountString, cents } from "../commercial/calculations";
import { tabularPdf } from "../commercial/document";
import { uid, today, addDays } from "../domain/logic";
import type {
  Material,
  PurchaseRequest,
  SupplierQuote,
  Delivery,
  SupplierBill,
  SupplierPayment,
} from "./model";
import { getOperations } from "./migration";
import {
  saveMaterial,
  saveRequest,
  createRfq,
  saveSupplierQuote,
  createOrder,
  receiveDelivery,
  recordBill,
  paySupplier,
  submitApproval,
  cancelOrder,
  reverseDelivery,
  cancelBill,
  reverseSupplierPayment,
  audit,
} from "./repository";
import {
  orderTotals,
  deliveredQuantity,
  billedQuantity,
  quantityUnits,
  quantityString,
  supplierBalance,
  supplierPaid,
  orderReceived,
} from "./calculations";
import {
  useActors,
  ActorFields,
  Decision,
  History,
  ItemEditor,
  PriceSummary,
} from "./Controls";
export function Procurement({
  projectId = "",
  supplierId = "",
  section = "materials",
  embedded = false,
  initialAction = "",
}: {
  projectId?: string;
  supplierId?: string;
  section?: string;
  embedded?: boolean;
  initialAction?: string;
}) {
  const { db, mutate } = useStore(),
    op = getOperations(db),
    actors = useActors();
  const [filter, setFilter] = useState(projectId),
    [search, setSearch] = useState(""),
    [form, setForm] = useState(
      initialAction
        ? { type: initialAction, id: "" }
        : (null as { type: string; id: string } | null),
    ),
    [pdfError, setPdfError] = useState("");
  const select = (type: string, id = "") => setForm({ type, id });
  const scope = (p: string, s?: string) =>
    (!filter || p === filter) && (!supplierId || s === supplierId);
  const name = (id: string) =>
    op.suppliers.find((s) => s.id === id)?.name || "—";
  const find = (value: string) =>
    value.toLowerCase().includes(search.toLowerCase());
  async function poPdf(id: string) {
    const po = op.orders.find((o) => o.id === id)!;
    try {
      const t = orderTotals(po),
        s =
          po.supplierSnapshot ||
          op.suppliers.find((s) => s.id === po.supplierId)!,
        c = po.companySnapshot || op.settings.company;
      await tabularPdf(
        `PURCHASE ORDER ${po.number}`,
        `${c.name} · ${c.location} · TRN ${c.trn || "Not supplied"}\nSupplier: ${s.name} · ${s.address} · ${s.trn}\nPO date ${po.date} · Delivery ${po.deliveryDate} · ${po.deliveryLocation}\nPayment terms: ${po.terms}\nApproval: ${op.approvals.find((a) => a.entityId === po.id && a.status === "Approved")?.comments || "Draft"}`,
        {
          headers: ["Item / Unit", "Quantity", "Rate AED", "Tax"],
          rows: [
            ...po.items.map((i) => [
              i.description + " · " + i.unit,
              i.quantity,
              i.rate,
              i.tax,
            ]),
            ["Delivery", "", po.deliveryCharge, "Exclusive"],
            ["Net", "", amountString(t.net), ""],
            ["VAT", "", amountString(t.vat), ""],
            ["Grand Total", "", amountString(t.grand), ""],
          ],
        },
        po.number + ".pdf",
        c,
      );
    } catch (e) {
      setPdfError(String(e));
    }
  }
  return (
    <>
      {!embedded && (
        <Header
          eyebrow="Project purchasing"
          title="Procurement"
          description="Requirements, supplier comparison, authorized orders, receipts, bills and payables."
          action={
            <>
              <button className="primary" onClick={() => select("material")}>
                New Material Requirement
              </button>
              <button onClick={() => select("request")}>
                New Purchase Request
              </button>
              <button onClick={() => select("order")}>
                New Purchase Order
              </button>
            </>
          }
        />
      )}
      <ActorFields actors={actors} />
      {!embedded && (
        <nav className="tabs">
          {[
            ["materials", "Requirements"],
            ["requests", "Purchase Requests"],
            ["rfqs", "Supplier RFQs"],
            ["comparison", "Comparison"],
            ["orders", "Purchase Orders"],
            ["deliveries", "Deliveries"],
            ["bills", "Supplier Bills"],
            ["payments", "Supplier Payments"],
          ].map(([key, label]) => (
            <a
              className={section === key ? "active" : ""}
              key={key}
              href={
                projectId
                  ? `#/projects/${projectId}/procurement/${key}`
                  : `#/procurement/${key}`
              }
            >
              {label}
            </a>
          ))}
        </nav>
      )}
      <div className="filters">
        <input
          aria-label="Search procurement"
          placeholder="Search references or descriptions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Procurement project filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All projects</option>
          {db.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </div>
      {pdfError && (
        <p className="error" role="alert">
          {pdfError}
        </p>
      )}
      {section === "materials" ? (
        <DataTable
          headers={[
            "Requirement",
            "Project",
            "Specification",
            "Quantity / Unit",
            "Required",
            "Requester",
            "Action",
          ]}
          rows={op.materials
            .filter((m) => scope(m.projectId) && find(m.number + m.name))
            .map((m) => [
              <>
                {m.number}
                <strong>{m.name}</strong>
                {m.attachments.map((a) => (
                  <a key={a.id} href={a.dataUrl} download={a.name}>
                    {a.name}
                  </a>
                ))}
              </>,
              db.projects.find((p) => p.id === m.projectId)?.code,
              <>
                {m.specification}
                <small>{m.notes}</small>
              </>,
              m.quantity + " " + m.unit,
              <>
                {m.requiredDate}
                <Badge>{m.priority}</Badge>
              </>,
              db.people.find((p) => p.id === m.requesterId)?.name,
              <button onClick={() => select("request", m.id)}>
                Create Purchase Request
              </button>,
            ])}
        />
      ) : section === "requests" ? (
        <>
          {op.requests
            .filter((r) => scope(r.projectId) && find(r.number))
            .map((r) => (
              <section className="panel" key={r.id}>
                <h3>
                  {r.number} <Badge>{r.status}</Badge>
                </h3>
                <p>
                  {r.materialIds
                    .map((id) => op.materials.find((m) => m.id === id)?.name)
                    .join(", ")}{" "}
                  · {r.notes}
                </p>
                <small>
                  Requested by{" "}
                  {db.people.find((p) => p.id === r.requesterId)?.name} ·{" "}
                  {r.date}
                </small>
                <div className="actions">
                  {["Draft", "Rejected"].includes(r.status) && (
                    <button
                      onClick={() =>
                        mutate((d) => {
                          submitApproval(
                            d,
                            "Purchase Request",
                            r.id,
                            "Purchase Request",
                            actors.actor,
                            actors.approver,
                          );
                        })
                      }
                    >
                      Submit Purchase Request
                    </button>
                  )}
                  {r.status === "Approved" && (
                    <button onClick={() => select("rfq", r.id)}>
                      Request Supplier Prices
                    </button>
                  )}
                </div>
                <Decision entityId={r.id} actor={actors.actor} />
                <History id={r.id} />
              </section>
            ))}
          {!op.requests.length && (
            <Empty>
              Create a purchase request from project material requirements.
            </Empty>
          )}
        </>
      ) : section === "rfqs" ? (
        <DataTable
          headers={[
            "RFQ",
            "Supplier",
            "Items",
            "Delivery / Deadline",
            "State",
            "Action",
          ]}
          rows={op.rfqs
            .filter(
              (r) =>
                scope(r.projectId, r.supplierId) &&
                find(r.number + name(r.supplierId)),
            )
            .map((r) => [
              r.number,
              <a href={`#/suppliers/${r.supplierId}/quotations`}>
                {name(r.supplierId)}
              </a>,
              r.items
                .map((i) => i.description + " · " + i.quantity + " " + i.unit)
                .join(", "),
              <>
                {r.deliveryDate}
                <small>Quote by {r.deadline}</small>
              </>,
              <Badge>{r.status}</Badge>,
              <div className="actions">
                {r.status === "Requested" && (
                  <button onClick={() => select("quote", r.id)}>
                    Record Supplier Quotation
                  </button>
                )}
                {r.status !== "Closed" && (
                  <button
                    onClick={() =>
                      mutate((d) => {
                        const f = d.operations!.rfqs.find(
                          (x) => x.id === r.id,
                        )!;
                        f.status = "Closed";
                        audit(
                          d,
                          r.projectId,
                          "RFQ",
                          r.id,
                          "RFQ closed",
                          r.number,
                          actors.actor,
                        );
                      })
                    }
                  >
                    Close RFQ
                  </button>
                )}
              </div>,
            ])}
        />
      ) : section === "comparison" ? (
        <>
          <p className="notice">
            Select on specification, lead time, delivery and terms. Price
            comparison does not automatically choose the lowest bidder.
          </p>
          <DataTable
            headers={[
              "Quotation / Supplier",
              "Material Net AED",
              "VAT AED",
              "Delivery AED",
              "Landed Total AED",
              "Lead / Terms",
              "Remarks",
              "State",
            ]}
            rows={op.quotes
              .filter(
                (q) =>
                  scope(q.projectId, q.supplierId) &&
                  find(q.number + name(q.supplierId)),
              )
              .map((q) => {
                const t = orderTotals(q);
                return [
                  <>
                    {q.number}
                    <small>{name(q.supplierId)}</small>
                  </>,
                  aed(t.net - cents(q.deliveryCharge)),
                  aed(t.vat),
                  aed(cents(q.deliveryCharge)),
                  aed(t.grand),
                  <>
                    {q.leadDays} days<small>{q.terms}</small>
                  </>,
                  q.remarks,
                  <Badge>{q.status}</Badge>,
                ];
              })}
          />
          {op.quotes
            .filter((q) => scope(q.projectId, q.supplierId))
            .map((q) => (
              <section className="panel" key={q.id}>
                <h3>
                  {q.number} · {name(q.supplierId)}
                </h3>
                {["Received", "Rejected"].includes(q.status) && (
                  <button
                    onClick={() =>
                      mutate((d) => {
                        submitApproval(
                          d,
                          "Supplier Quotation",
                          q.id,
                          "Preferred supplier selection",
                          actors.actor,
                          actors.approver,
                        );
                      })
                    }
                  >
                    Select Preferred Supplier
                  </button>
                )}
                {q.status === "Approved" && (
                  <button onClick={() => select("order", q.id)}>
                    Create Purchase Order
                  </button>
                )}
                <Decision entityId={q.id} actor={actors.actor} />
                <History id={q.id} />
              </section>
            ))}
        </>
      ) : section === "orders" ? (
        <>
          {op.orders
            .filter(
              (o) =>
                scope(o.projectId, o.supplierId) &&
                find(o.number + name(o.supplierId)),
            )
            .map((o) => (
              <section className="panel" key={o.id}>
                <h3>
                  {o.number} · {name(o.supplierId)} <Badge>{o.status}</Badge>
                </h3>
                <p>
                  {aed(orderTotals(o).grand)} incl. VAT · Delivery{" "}
                  {o.deliveryDate} · {o.deliveryLocation} ·{" "}
                  {o.status === "Approved"
                    ? orderReceived(db, o)
                      ? "Fully Received"
                      : "Pending / Partial Delivery"
                    : "Awaiting authorization"}
                </p>
                <div className="actions">
                  {["Draft", "Rejected"].includes(o.status) && (
                    <button
                      onClick={() =>
                        mutate((d) => {
                          submitApproval(
                            d,
                            "Purchase Order",
                            o.id,
                            "PO authorization",
                            actors.actor,
                            actors.approver,
                          );
                        })
                      }
                    >
                      Submit Purchase Order
                    </button>
                  )}
                  {o.status === "Approved" && (
                    <>
                      <button onClick={() => select("delivery", o.id)}>
                        Receive Materials
                      </button>
                      <button onClick={() => select("bill", o.id)}>
                        Record Supplier Bill
                      </button>
                    </>
                  )}
                  <button onClick={() => void poPdf(o.id)}>
                    Download PO PDF
                  </button>
                  {o.status !== "Cancelled" && (
                    <button onClick={() => select("cancel-order", o.id)}>
                      Cancel PO
                    </button>
                  )}
                </div>
                <Decision entityId={o.id} actor={actors.actor} />
                <DataTable
                  headers={[
                    "Item",
                    "Ordered",
                    "Delivered",
                    "Pending",
                    "Billed",
                  ]}
                  rows={o.items.map((i) => [
                    i.description,
                    i.quantity + " " + i.unit,
                    quantityString(deliveredQuantity(db, o.id, i.id)),
                    quantityString(
                      quantityUnits(i.quantity) -
                        deliveredQuantity(db, o.id, i.id),
                    ),
                    quantityString(billedQuantity(db, o.id, i.id)),
                  ])}
                />
                <History id={o.id} />
              </section>
            ))}
          {!op.orders.length && (
            <Empty>
              Approve a preferred supplier quotation to create a purchase order.
            </Empty>
          )}
        </>
      ) : section === "deliveries" ? (
        <DataTable
          headers={[
            "Receipt",
            "PO",
            "Date",
            "Reference / Receiver",
            "Quantities",
            "State",
            "Action",
          ]}
          rows={op.deliveries
            .filter(
              (d) =>
                scope(
                  d.projectId,
                  op.orders.find((o) => o.id === d.poId)?.supplierId,
                ) && find(d.number + d.reference),
            )
            .map((d) => [
              d.number,
              op.orders.find((o) => o.id === d.poId)?.number,
              d.date,
              <>
                {d.reference}
                <small>
                  {db.people.find((p) => p.id === d.receiverId)?.name}
                </small>
              </>,
              d.quantities
                .map(
                  (q) =>
                    (op.orders
                      .find((o) => o.id === d.poId)
                      ?.items.find((i) => i.id === q.itemId)?.description ||
                      "Item") +
                    ": " +
                    q.quantity,
                )
                .join(", "),
              d.reversedAt ? "Reversed" : "Received",
              !d.reversedAt && (
                <button onClick={() => select("reverse-delivery", d.id)}>
                  Reverse Delivery
                </button>
              ),
            ])}
        />
      ) : section === "bills" ? (
        <>
          <DataTable
            headers={[
              "Bill / Supplier Invoice",
              "Supplier / PO",
              "Date / Due",
              "Net AED",
              "VAT AED",
              "Total AED",
              "Paid AED",
              "Outstanding AED",
              "Action",
            ]}
            rows={op.bills
              .filter(
                (b) =>
                  scope(b.projectId, b.supplierId) &&
                  find(b.number + b.reference + name(b.supplierId)),
              )
              .map((b) => [
                <>
                  {b.number}
                  <small>
                    {b.reference} · {b.status}
                  </small>
                </>,
                <>
                  {name(b.supplierId)}
                  <small>
                    {op.orders.find((o) => o.id === b.poId)?.number}
                  </small>
                </>,
                <>
                  {b.date}
                  <small>{b.due}</small>
                </>,
                aed(BigInt(b.net)),
                aed(BigInt(b.vat)),
                aed(BigInt(b.gross)),
                aed(supplierPaid(db, b.id)),
                aed(supplierBalance(db, b.id)),
                <div className="actions">
                  {b.status === "Issued" && (
                    <>
                      <button
                        disabled={supplierBalance(db, b.id) === 0n}
                        onClick={() => select("supplier-payment", b.id)}
                      >
                        Pay Supplier
                      </button>
                      <button onClick={() => select("cancel-bill", b.id)}>
                        Cancel Bill
                      </button>
                    </>
                  )}
                </div>,
              ])}
          />
          {op.bills
            .filter((b) => scope(b.projectId, b.supplierId))
            .map((b) => (
              <History key={b.id} id={b.id} />
            ))}
        </>
      ) : section === "payments" ? (
        <DataTable
          headers={[
            "Payment",
            "Supplier / Bill",
            "Date",
            "Amount AED",
            "Method / Reference",
            "State",
            "Action",
          ]}
          rows={op.supplierPayments
            .filter(
              (p) =>
                scope(p.projectId, p.supplierId) &&
                find(p.number + p.reference),
            )
            .map((p) => [
              p.number,
              <>
                {name(p.supplierId)}
                <small>{op.bills.find((b) => b.id === p.billId)?.number}</small>
              </>,
              p.date,
              aed(cents(p.amount)),
              <>
                {p.method}
                <small>
                  {p.reference} · {p.bank}
                </small>
              </>,
              p.reversedAt ? "Reversed: " + p.reason : "Posted",
              !p.reversedAt && (
                <button onClick={() => select("reverse-supplier", p.id)}>
                  Reverse Supplier Payment
                </button>
              ),
            ])}
        />
      ) : (
        <Empty>Procurement section not found.</Empty>
      )}
      {form && (
        <ProcurementForm
          key={form.type + form.id}
          type={form.type}
          id={form.id}
          projectId={filter}
          actor={actors.actor}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}
export function ProcurementForm({
  type,
  id,
  projectId,
  actor,
  onClose,
}: {
  type: string;
  id: string;
  projectId: string;
  actor: string;
  onClose: () => void;
}) {
  const { db, mutate } = useStore(),
    op = getOperations(db);
  const [values, setValues] = useState<Record<string, string>>({
    projectId: projectId || db.projects[0]?.id || "",
    name: "",
    specification: "",
    unit: "Nos",
    quantity: "1",
    requiredDate: addDays(today(), 14),
    requesterId: actor,
    priority: "Normal",
    notes: "",
    requestId: type === "rfq" ? id : "",
    supplierId: "",
    deliveryDate: addDays(today(), 14),
    deadline: addDays(today(), 7),
    quoteId: type === "order" ? id : "",
    location: "",
    reference: "",
    date: today(),
    due: addDays(today(), op.settings.paymentDays),
    deliveryCharge: "0",
    method: "Bank Transfer",
    bank: "",
    amount:
      type === "supplier-payment" ? amountString(supplierBalance(db, id)) : "0",
    reason: "",
  });
  const [attachments, setAttachments] = useState<Material["attachments"]>([]),
    [selected, setSelected] = useState<string[]>(
      type === "request" && id ? [id] : [],
    );
  const rfq = op.rfqs.find((r) => r.id === id),
    po = op.orders.find((o) => o.id === id);
  const [items, setItems] = useState(() => structuredClone(rfq?.items || []));
  const [quantities, setQuantities] = useState(
    () =>
      po?.items.map((i) => ({
        itemId: i.id,
        quantity: quantityString(
          type === "bill"
            ? deliveredQuantity(db, po.id, i.id) -
                billedQuantity(db, po.id, i.id)
            : quantityUnits(i.quantity) - deliveredQuantity(db, po.id, i.id),
        ),
      })) || [],
  );
  const set = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const input = (
    key: string,
    label: string,
    inputType = "text",
    required = true,
  ) => (
    <Field label={label} key={key}>
      <input
        required={required}
        type={inputType}
        value={values[key] || ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );
  const projects = (
    <Field label="Procurement project">
      <select
        required
        value={values.projectId}
        onChange={(e) => {
          set("projectId", e.target.value);
          setSelected([]);
        }}
      >
        {db.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} · {p.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const title =
    (
      {
        material: "Material Requirement",
        request: "Purchase Request",
        rfq: "Supplier RFQ",
        quote: "Supplier Quotation",
        order: "Purchase Order",
        delivery: "Material Delivery",
        bill: "Supplier Bill",
        "supplier-payment": "Supplier Payment",
      } as Record<string, string>
    )[type] || "Record Correction";
  function submit() {
    if (
      mutate((d) => {
        if (type === "material")
          saveMaterial(
            d,
            {
              id: uid(),
              number: "",
              projectId: values.projectId,
              name: values.name,
              specification: values.specification,
              unit: values.unit,
              quantity: values.quantity,
              requiredDate: values.requiredDate,
              requesterId: actor,
              priority: values.priority,
              notes: values.notes,
              attachments,
            },
            actor,
          );
        else if (type === "request")
          saveRequest(
            d,
            {
              id: uid(),
              number: "",
              projectId: id
                ? op.materials.find((m) => m.id === id)!.projectId
                : values.projectId,
              materialIds: selected,
              requesterId: actor,
              date: today(),
              notes: values.notes,
              status: "Draft",
            } satisfies PurchaseRequest,
            actor,
          );
        else if (type === "rfq") {
          if (!selected.length) throw Error("Select at least one supplier.");
          selected.forEach((supplierId) =>
            createRfq(
              d,
              id,
              supplierId,
              values.deliveryDate,
              values.deadline,
              actor,
            ),
          );
        } else if (type === "quote")
          saveSupplierQuote(
            d,
            {
              id: uid(),
              number: "",
              rfqId: id,
              projectId: rfq!.projectId,
              supplierId: rfq!.supplierId,
              items,
              deliveryCharge: values.deliveryCharge,
              vatPercentage: op.settings.vatPercentage,
              leadDays: Number(values.quantity),
              terms: values.notes,
              remarks: values.specification,
              status: "Received",
            } satisfies SupplierQuote,
            actor,
          );
        else if (type === "order")
          createOrder(
            d,
            values.quoteId,
            values.location,
            values.deliveryDate,
            actor,
          );
        else if (type === "delivery")
          receiveDelivery(
            d,
            {
              id: uid(),
              number: "",
              poId: id,
              projectId: po!.projectId,
              date: values.date,
              quantities: quantities.filter((q) => Number(q.quantity) !== 0),
              receiverId: actor,
              reference: values.reference,
              remarks: values.notes,
            } satisfies Delivery,
            actor,
          );
        else if (type === "bill")
          recordBill(
            d,
            {
              id: uid(),
              reference: values.reference,
              poId: id,
              projectId: po!.projectId,
              supplierId: po!.supplierId,
              date: values.date,
              due: values.due,
              quantities: quantities.filter((q) => Number(q.quantity) !== 0),
              deliveryCharge: values.deliveryCharge,
              status: "Issued",
            } satisfies Omit<
              SupplierBill,
              | "number"
              | "net"
              | "vat"
              | "gross"
              | "snapshot"
              | "companySnapshot"
              | "supplierSnapshot"
            >,
            actor,
          );
        else if (type === "supplier-payment") {
          const b = op.bills.find((b) => b.id === id)!;
          paySupplier(
            d,
            {
              id: uid(),
              number: "",
              billId: id,
              supplierId: b.supplierId,
              projectId: b.projectId,
              date: values.date,
              amount: values.amount,
              method: values.method,
              reference: values.reference,
              bank: values.bank,
              notes: values.notes,
            } satisfies SupplierPayment,
            actor,
          );
        } else if (type === "cancel-order")
          cancelOrder(d, id, values.reason, actor);
        else if (type === "reverse-delivery")
          reverseDelivery(d, id, values.reason, actor);
        else if (type === "cancel-bill")
          cancelBill(d, id, values.reason, actor);
        else if (type === "reverse-supplier")
          reverseSupplierPayment(d, id, values.reason, actor);
      })
    )
      onClose();
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="form-grid">
          {type === "material" ? (
            <>
              {projects}
              {input("name", "Material/service name")}
              {input("specification", "Material specification")}
              {input("unit", "Material unit")}
              {input("quantity", "Quantity required")}
              {input("requiredDate", "Material required date", "date")}
              <Field label="Material priority">
                <select
                  value={values.priority}
                  onChange={(e) => set("priority", e.target.value)}
                >
                  {["Low", "Normal", "High", "Critical"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </>
          ) : type === "request" ? (
            <>
              {!id && projects}
              <Field label="Material requirements">
                <select
                  required
                  multiple
                  value={selected}
                  onChange={(e) =>
                    setSelected(
                      Array.from(e.target.selectedOptions, (o) => o.value),
                    )
                  }
                >
                  {op.materials
                    .filter(
                      (m) =>
                        m.projectId ===
                        (id
                          ? op.materials.find((m) => m.id === id)?.projectId
                          : values.projectId),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.number} · {m.name}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          ) : type === "rfq" ? (
            <>
              <Field label="RFQ suppliers">
                <select
                  required
                  multiple
                  value={selected}
                  onChange={(e) =>
                    setSelected(
                      Array.from(e.target.selectedOptions, (o) => o.value),
                    )
                  }
                >
                  {op.suppliers
                    .filter((s) => s.status === "Active")
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
              {input("deliveryDate", "RFQ delivery date", "date")}
              {input("deadline", "Quotation deadline", "date")}
            </>
          ) : type === "quote" ? (
            <>
              {input("deliveryCharge", "Supplier delivery charge AED")}
              {input("quantity", "Lead time days", "number")}
              {input("specification", "Supplier remarks", "text", false)}
            </>
          ) : type === "order" ? (
            <>
              <Field label="Approved supplier quotation">
                <select
                  required
                  value={values.quoteId}
                  onChange={(e) => set("quoteId", e.target.value)}
                >
                  <option value="">Select approved quotation…</option>
                  {op.quotes
                    .filter(
                      (q) =>
                        q.status === "Approved" &&
                        !op.orders.some(
                          (o) => o.quoteId === q.id && o.status !== "Cancelled",
                        ),
                    )
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.number} ·{" "}
                        {op.suppliers.find((s) => s.id === q.supplierId)?.name}
                      </option>
                    ))}
                </select>
              </Field>
              {input("location", "PO delivery location")}
              {input("deliveryDate", "PO delivery date", "date")}
            </>
          ) : type === "delivery" || type === "bill" ? (
            <>
              {input(
                "reference",
                type === "bill"
                  ? "Supplier invoice reference"
                  : "Delivery note reference",
              )}
              {input(
                "date",
                type === "bill" ? "Supplier invoice date" : "Delivery date",
                "date",
              )}
              {type === "bill" && (
                <>
                  {input("due", "Supplier bill due date", "date")}
                  {input("deliveryCharge", "Billed delivery charge AED")}
                </>
              )}
              {quantities.map((q, index) => (
                <Field
                  key={q.itemId}
                  label={`Received/billed quantity ${index + 1} · ${po?.items.find((i) => i.id === q.itemId)?.description}`}
                >
                  <input
                    required
                    inputMode="decimal"
                    value={q.quantity}
                    onChange={(e) =>
                      setQuantities(
                        quantities.map((x) =>
                          x.itemId === q.itemId
                            ? { ...x, quantity: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
            </>
          ) : type === "supplier-payment" ? (
            <>
              {input("date", "Supplier payment date", "date")}
              {input("amount", "Supplier payment amount AED")}
              {input("reference", "Supplier payment reference")}
              {input("bank", "Supplier bank/account reference", "text", false)}
              <Field label="Supplier payment method">
                <select
                  value={values.method}
                  onChange={(e) => set("method", e.target.value)}
                >
                  {["Bank Transfer", "Cash", "Cheque", "Other"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            input("reason", "Correction/cancellation reason")
          )}
        </div>
        {type === "quote" && (
          <>
            <ItemEditor items={items} onChange={setItems} lockedScope />
            <PriceSummary
              items={[
                ...items,
                {
                  id: "charge",
                  description: "Delivery",
                  unit: "LS",
                  quantity: "1",
                  rate: values.deliveryCharge,
                  tax: "Exclusive",
                },
              ]}
              vat={op.settings.vatPercentage}
            />
          </>
        )}
        <Field
          label={
            type === "quote"
              ? "Supplier quotation payment terms"
              : "Procurement notes"
          }
        >
          <textarea
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
        {type === "material" && (
          <Attachments files={attachments} onChange={setAttachments} />
        )}
        <div className="sticky-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary">
            {type === "supplier-payment"
              ? "Post Supplier Payment"
              : "Save " + title}
          </button>
        </div>
      </form>
    </Modal>
  );
}
