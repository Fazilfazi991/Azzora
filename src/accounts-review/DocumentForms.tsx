import { useState, type FormEvent, type ReactNode } from "react";
import type { ReviewDocument } from "./domain";
import { LineItemsEditor } from "./LineItemsEditor";
import {
  blankReviewLine,
  calculateItemLines,
  reviewFilsToDecimal,
  type ReviewLineInput,
} from "./item-lines";
import { purchasePriceWarnings } from "./review-purchase-prices";
import {
  productionFinanceNotice,
  type CompletionSnapshot,
} from "./completion-ui";
import { accountsUrl } from "./http";
import { productionEnabled } from "../staging/client";

type Snapshot = CompletionSnapshot;
type Props = {
  data: Snapshot;
  act: (action: Record<string, unknown>) => Promise<boolean>;
  editingId?: string;
};
const money = (value: string) => "AED " + reviewFilsToDecimal(value);
const apiFile = (kind: string, id: string) =>
  accountsUrl("/" + kind + "/" + encodeURIComponent(id));
const documentItems = (
  document: ReviewDocument | undefined,
  invoice: boolean,
): ReviewLineInput[] =>
  document?.items
    ? structuredClone(document.items)
    : document
      ? [
          {
            description: document.description,
            quantity: "1",
            unit: "Nos",
            rate: reviewFilsToDecimal(document.amountFils),
          },
        ]
      : [
          {
            ...blankReviewLine(),
            description: productionEnabled
              ? ""
              : invoice
                ? "Additional design service"
                : "Additional project materials",
            rate: productionEnabled ? "" : invoice ? "1000.00" : "250.00",
          },
        ];

function Field({
  label,
  name,
  value,
  type = "text",
  children,
  optional = false,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  children?: ReactNode;
  optional?: boolean;
}) {
  return (
    <label>
      {label}
      {children ? (
        <select name={name} defaultValue={value} required={!optional}>
          {children}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={!optional}
        />
      )}
    </label>
  );
}
export function AccountsReviewNote({ data }: { data?: Snapshot } = {}) {
  return (
    <div className="prototype-note" role="note">
      <strong>
        {productionEnabled
          ? data?.productionFinance?.approved
            ? "COMPANY ACCOUNTS · NO VAT"
            : "COMPANY SETUP · POSTING DISABLED"
          : "CLIENT REVIEW · FICTIONAL DATA"}
      </strong>
      <span>
        {productionEnabled
          ? productionFinanceNotice(data?.productionFinance)
          : "Actions update only this isolated demo ledger. No Manager CRM records or real money are changed."}
      </span>
    </div>
  );
}
function Totals({
  items,
  data,
}: {
  items: ReviewLineInput[];
  data?: Snapshot;
}) {
  let amount = "";
  try {
    amount = calculateItemLines(items).subtotalFils;
  } catch {
    /* Incomplete form. */
  }
  return (
    <div className="document-totals">
      <p>
        <span>VAT</span>
        <span>
          {productionEnabled && data?.productionFinance?.noVat
            ? "No VAT charged"
            : "Not applied · policy pending"}
        </span>
      </p>
      <p>
        <strong>Grand total</strong>
        <output aria-label="Document grand total">
          {amount ? money(amount) : "—"}
        </output>
      </p>
      <small>
        {productionEnabled
          ? data?.productionFinance?.noVat
            ? "Normal Invoice / Proforma only. VAT registration remains unconfirmed; this is not a legal Tax Invoice."
            : "VAT policy and legal invoice issuance are not yet approved. This document remains an unissued draft."
          : "No approved VAT policy is configured for this fictional review. Tax Invoice and Proforma labels do not activate VAT."}
      </small>
    </div>
  );
}
function Project({ data, value }: { data: Snapshot; value?: string }) {
  return (
    <Field label="Project" name="projectId" value={value || ""} optional>
      <option value="">Company / no project</option>
      {data.documentCatalog.projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </Field>
  );
}
async function uploadFile(file: File | undefined) {
  if (!file) return undefined;
  if (
    file.size > 2_000_000 ||
    !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
  )
    throw Error("Choose a PDF, PNG or JPEG under 2 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () =>
      reject(Error("The bill attachment could not be read."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mime: file.type, data };
}
export function InvoiceEntry({ data, act, editingId }: Props) {
  const existing = data.invoices.find((item) => item.id === editingId);
  const [items, setItems] = useState(() => documentItems(existing, true));
  const [error, setError] = useState("");
  const locked = Boolean(existing && existing.status !== "Draft");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const form = event.currentTarget;
    try {
      calculateItemLines(items);
      const issue =
        (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
          "data-issue",
        ) === "true";
      const selectedType = new FormData(form).get("invoiceType");
      if (
        productionEnabled &&
        issue &&
        selectedType === "Normal Invoice" &&
        !String(new FormData(form).get("invoiceReference") || "").trim()
      )
        throw Error(
          "Enter the Accountant-approved invoice number before issuing this Normal Invoice. Drafts may leave it blank.",
        );
      if (
        productionEnabled &&
        issue &&
        data.productionFinance?.taxInvoiceEnabled === false &&
        selectedType !== "Normal Invoice" &&
        selectedType !== "Proforma"
      )
        throw Error(
          "No VAT is approved. Select Normal Invoice or Proforma; legal Tax Invoice issuance is unavailable.",
        );
      if (
        await act({
          kind: existing ? "update-invoice-draft" : "invoice",
          ...(existing
            ? { id: existing.id, revision: existing.revision || 0 }
            : {}),
          ...Object.fromEntries(new FormData(form)),
          items,
          issue,
          description: items
            .map((item) => item.description)
            .join(", ")
            .slice(0, 140),
        })
      ) {
        setError("");
        if (!existing) {
          form.reset();
          setItems(documentItems(undefined, true));
        }
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Check the invoice items.",
      );
    }
  }
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">SALES & RECEIVABLES</span>
          <h1>{existing ? "Edit invoice draft" : "New invoice"}</h1>
          <p>
            Enter individual items, check the calculated total, then save or
            issue.
          </p>
        </div>
        <a className="button" href="#/invoices">
          ← Invoices
        </a>
      </div>
      <AccountsReviewNote data={data} />
      {editingId && !existing ? (
        <p role="alert">Invoice was not found.</p>
      ) : (
        <form className="panel review-form" onSubmit={submit}>
          <h2>Invoice details{existing ? " · " + existing.id : ""}</h2>
          {locked && (
            <p role="note">
              This issued document is read only. Its snapshot and payment
              history are preserved.
            </p>
          )}
          <fieldset className="document-fields" disabled={locked}>
            <div className="field-grid">
              <Field
                label="Document type"
                name="invoiceType"
                value={
                  existing?.invoiceType ||
                  (productionEnabled && data.productionFinance?.noVat
                    ? "Normal Invoice"
                    : "Tax Invoice")
                }
              >
                {(!productionEnabled ||
                  !data.productionFinance?.noVat ||
                  existing?.invoiceType === "Tax Invoice") && (
                  <option
                    disabled={
                      productionEnabled &&
                      data.productionFinance?.taxInvoiceEnabled === false
                    }
                  >
                    Tax Invoice
                  </option>
                )}
                <option>Normal Invoice</option>
                <option>Proforma</option>
              </Field>
              <label>
                Invoice number (optional for drafts)
                <input
                  name="invoiceReference"
                  defaultValue={existing?.invoiceReference || ""}
                  maxLength={120}
                  aria-describedby="invoice-reference-help"
                />
                <small id="invoice-reference-help">
                  {productionEnabled
                    ? "Enter your approved business number. Required to issue a Normal Invoice; no number is generated automatically."
                    : "Optional business reference. Existing demo numbering is preserved."}
                </small>
              </label>
              <label>
                Customer
                <input
                  name="party"
                  defaultValue={
                    existing?.party ||
                    (productionEnabled ? "" : "Sample Client A")
                  }
                  list="invoice-customers"
                  required
                  maxLength={140}
                />
              </label>
              <datalist id="invoice-customers">
                {data.documentCatalog.customers.map((customer) => (
                  <option key={customer.id} value={customer.name} />
                ))}
              </datalist>
              <Field
                label="Invoice date"
                name="date"
                type="date"
                value={existing?.date || data.asOf}
              />
              <Field
                label="Due date"
                name="due"
                type="date"
                value={existing?.due || data.asOf}
              />
              <Project data={data} value={existing?.projectId} />
            </div>
            <LineItemsEditor
              items={items}
              onChange={setItems}
              readOnly={locked}
            />
            <Totals items={items} data={data} />
            {error && (
              <p className="review-error" role="alert">
                {error}
              </p>
            )}
            <div className="review-actions">
              <button className="button" type="submit" data-issue="false">
                Save draft
              </button>
              <button
                className="button button-primary"
                type="submit"
                data-issue="true"
                disabled={productionEnabled && !data.productionFinance?.canPost}
              >
                Issue document
              </button>
            </div>
          </fieldset>
          <p className="aside-note">
            {productionEnabled
              ? productionFinanceNotice(data.productionFinance)
              : "Drafts do not post. Issuing a tax or normal invoice updates the fictional journal once. Proforma documents never create revenue or receivables."}
          </p>
        </form>
      )}
    </>
  );
}

export function PurchaseBills({ data, act, editingId }: Props) {
  const existing = data.bills.find((item) => item.id === editingId);
  const [items, setItems] = useState(() => documentItems(existing, false));
  const [supplier, setSupplier] = useState(
    existing?.party || (productionEnabled ? "" : "Sample Supplier B"),
  );
  const [billDate, setBillDate] = useState(existing?.date || data.asOf);
  const priceChanges = purchasePriceWarnings(
    items,
    supplier,
    billDate,
    data.bills,
    existing?.id,
  );
  const [error, setError] = useState("");
  const locked = Boolean(existing && existing.status !== "Draft");
  if (editingId && !existing)
    return (
      <p role="alert">
        Purchase bill was not found.{" "}
        <a href="#/bills">Return to purchase bills</a>
      </p>
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const form = event.currentTarget;
    try {
      calculateItemLines(items);
      const values = Object.fromEntries(new FormData(form));
      delete values.file;
      const file = (form.elements.namedItem("file") as HTMLInputElement)
        .files?.[0];
      const issue =
        (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
          "data-issue",
        ) !== "false";
      if (
        await act({
          kind: existing ? "update-bill-draft" : "bill",
          ...(existing
            ? { id: existing.id, revision: existing.revision || 0 }
            : {}),
          ...values,
          party: supplier,
          items,
          issue,
          description: items
            .map((item) => item.description)
            .join(", ")
            .slice(0, 140),
          attachment: await uploadFile(file),
        })
      ) {
        setError("");
        if (!existing) {
          form.reset();
          setItems(documentItems(undefined, false));
        }
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Check the purchase bill.",
      );
    }
  }
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">PURCHASES</span>
          <h1>Purchase bills</h1>
          <p>Upload a bill for review or enter its individual items below.</p>
        </div>
        <a className="button button-primary" href="#/document-entry">
          Upload & auto-fill
        </a>
      </div>
      <AccountsReviewNote data={data} />
      <div className="review-two bill-entry-options">
        <a
          className="panel review-card bill-entry-option"
          href="#/document-entry"
        >
          <span className="eyebrow">OPTION 1 · UPLOAD & AUTO-FILL</span>
          <h2>Read a purchase bill</h2>
          <p>
            Review the original beside editable details, then save a draft.
            {(data as CompletionSnapshot).documentAi?.enabled
              ? " DeepSeek suggestions need your review before use."
              : productionEnabled
                ? " External AI is disabled; attach an original for manual draft review."
                : " Paid AI is unavailable; local PDF reading and prepared demo suggestions are labeled separately."}
          </p>
          <strong>Choose a document →</strong>
        </a>
        <div className="panel review-card bill-entry-option">
          <span className="eyebrow">OPTION 2 · MANUAL ENTRY</span>
          <h2>Enter bill details</h2>
          <p>
            Add item quantities, units and rates, then check totals before
            posting.
          </p>
          <button
            className="button"
            onClick={() =>
              document.getElementById("bill-manual-form")?.scrollIntoView()
            }
          >
            Go to manual form ↓
          </button>
        </div>
      </div>
      <form
        id="bill-manual-form"
        className="panel review-form"
        onSubmit={submit}
      >
        <h2>
          {existing
            ? "Edit bill draft · " + existing.id
            : "Manual purchase bill"}
        </h2>
        {locked && (
          <p role="note">
            This posted bill is read only. Its item snapshot and supplier
            payments are preserved.
          </p>
        )}
        <fieldset className="document-fields" disabled={locked}>
          <div className="field-grid">
            <label>
              Supplier
              <input
                name="party"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                list="bill-suppliers"
                required
                maxLength={140}
              />
            </label>
            <datalist id="bill-suppliers">
              {data.documentCatalog.suppliers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <Field
              label="Demo PO reference"
              name="poReference"
              value={
                existing?.poReference || (productionEnabled ? "" : "DEMO-PO-33")
              }
            />
            <Field
              label="Supplier invoice number"
              name="invoiceReference"
              value={existing?.invoiceReference || ""}
              optional
            />
            <label>
              Bill date
              <input
                name="date"
                type="date"
                value={billDate}
                onChange={(event) => setBillDate(event.target.value)}
                required
              />
            </label>
            <Field
              label="Due date"
              name="due"
              type="date"
              value={existing?.due || data.asOf}
            />
            <Field
              label="Category"
              name="category"
              value={existing?.category || "Cost of Sales"}
            >
              <option>Cost of Sales</option>
              <option>Operating Expense</option>
            </Field>
            <Project data={data} value={existing?.projectId} />
            <Field
              label="Department · optional"
              name="departmentId"
              value={
                (
                  existing as
                    (ReviewDocument & { departmentId?: string }) | undefined
                )?.departmentId || ""
              }
              optional
            >
              <option value="">Unassigned</option>
              {((data as CompletionSnapshot).departments ?? []).map(
                (department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ),
              )}
            </Field>
          </div>
          <LineItemsEditor
            items={items}
            onChange={setItems}
            supplier={supplier}
            products={data.documentCatalog.products}
            readOnly={locked}
          />
          {priceChanges.length > 0 && (
            <aside
              className="document-price-history"
              aria-label="Comparable purchase price changes"
            >
              <strong>Comparable previous purchases</strong>
              {priceChanges.map((warning) => (
                <p key={warning.lineIndex}>
                  Item {warning.lineIndex + 1}: price {warning.direction} from
                  AED {warning.priorRate} to AED {warning.currentRate} per{" "}
                  {warning.unit}. Previous bill {warning.priorBillId} ·{" "}
                  {warning.priorBillDate}. AED, VAT-free comparison.
                </p>
              ))}
            </aside>
          )}
          <Totals items={items} data={data} />
          <label className="document-upload-label">
            Bill image or PDF · up to 2 MB
            <input
              name="file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
            />
          </label>
          {existing?.attachmentId && (
            <a href={apiFile("attachment", existing.attachmentId)}>
              Current bill attachment
            </a>
          )}
          {error && (
            <p className="review-error" role="alert">
              {error}
            </p>
          )}
          <div className="review-actions">
            <button className="button" type="submit" data-issue="false">
              Save bill draft
            </button>
            <button
              className="button button-primary"
              type="submit"
              data-issue="true"
              disabled={productionEnabled && !data.productionFinance?.canPost}
            >
              {existing ? "Issue bill" : "Record bill & upload"}
            </button>
            {existing && (
              <a className="button" href="#/bills">
                New bill
              </a>
            )}
          </div>
        </fieldset>
      </form>
      <div className="panel table-panel">
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Purchase bills"
        >
          <table>
            <thead>
              <tr>
                {[
                  "Bill",
                  "Supplier",
                  "Date / due",
                  "Category / project",
                  "Total / open",
                  "Status / files",
                ].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.bills.map((bill) => (
                <tr key={bill.id}>
                  <td>
                    <strong>{bill.id}</strong>
                    <small>{bill.poReference}</small>
                    <small>{bill.invoiceReference}</small>
                  </td>
                  <td>{bill.party}</td>
                  <td>
                    {bill.date}
                    <small>Due {bill.due}</small>
                  </td>
                  <td>
                    {bill.category}
                    <small>
                      {data.documentCatalog.projects.find(
                        (project) => project.id === bill.projectId,
                      )?.name || "Company / unassigned"}
                    </small>
                  </td>
                  <td className="money">
                    {money(bill.amountFils)}
                    <small>Open {money(bill.outstandingFils)}</small>
                  </td>
                  <td>
                    {bill.status === "Draft" ? (
                      <>
                        <a
                          className="button"
                          href={"#/bills?edit=" + encodeURIComponent(bill.id)}
                        >
                          Edit draft
                        </a>
                        <button
                          className="button"
                          onClick={() =>
                            void act({ kind: "issue-bill", id: bill.id })
                          }
                        >
                          Issue bill
                        </button>
                      </>
                    ) : (
                      <span
                        className={`badge ${bill.cancellationDate ? "badge-neutral" : "badge-success"}`}
                      >
                        {bill.cancellationDate ? "Cancelled" : "Issued"}
                      </span>
                    )}
                    <small>
                      <a href={apiFile("pdf", bill.id)}>Download bill PDF</a>
                    </small>
                    {bill.attachmentId && (
                      <small>
                        <a href={apiFile("attachment", bill.attachmentId)}>
                          Download bill
                        </a>
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
