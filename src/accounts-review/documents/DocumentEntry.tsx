import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { reviewSnapshot } from "../domain";
import {
  blankFields,
  type DocumentReview,
  type EntryFields as ExistingEntryFields,
  type Upload,
} from "./model";
import { fieldsSchema } from "./model";
import { inspectFields, scopeFor } from "./review";
import "./entry.css";
import { cashAccountsFor, type CompletionSnapshot } from "../completion-ui";
import { accountsUrl } from "../http";

const PdfPreview = lazy(() => import("./PdfPreview"));
type Snapshot = ReturnType<typeof reviewSnapshot> & CompletionSnapshot;
export type FictionalProcessingConsent = {
  dataClass: "fictional";
  consent: true;
  policyVersion: "ai-fictional-v1";
};
type EntryFields = Omit<ExistingEntryFields, "items"> & {
  department?: "" | "MEP" | "CIVIL" | "JOINERY";
  ledgerId?: string;
  discount?: string;
  items: (ExistingEntryFields["items"][number] & { discount?: string })[];
};
const readFile = async (file: File): Promise<Upload> => {
  if (
    file.size > 2000000 ||
    !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
  )
    throw Error("Choose a PDF, PNG or JPEG under 2 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(Error("File could not be read."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mime: file.type, data };
};
export function DocumentEntry({
  data,
  extract,
  act,
  onPendingChange,
}: {
  data: Snapshot;
  extract: (
    file: Upload,
    mode?: "auto" | "manual",
    processing?: FictionalProcessingConsent,
  ) => Promise<string>;
  act: (action: Record<string, unknown>) => Promise<boolean>;
  onPendingChange: (pending: boolean) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const [fields, setFields] = useState<EntryFields>(blankFields);
  const [confirmed, setConfirmed] = useState(false),
    [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [processingConsent, setProcessingConsent] = useState(false);
  const requiresConsent = Boolean(
    data.documentAi?.generalDocuments || data.documentAi?.enabled,
  );
  const [uploadStatus, setUploadStatus] = useState("");
  const [url, setUrl] = useState("");
  const [fileMime, setFileMime] = useState("");
  const [saved, setSaved] = useState(false);
  const [paymentAccount, setPaymentAccount] = useState("bank");
  const doc = data.documentEntries.reviews.find((d) => d.id === selected);
  const converted = Boolean(doc?.convertedBillId || doc?.convertedExpenseId);
  const pending = Boolean(
    doc && JSON.stringify(doc.fields) !== JSON.stringify(fields),
  );
  useEffect(() => {
    onPendingChange(pending);
    return () => onPendingChange(false);
  }, [pending, onPendingChange]);
  useEffect(() => {
    setUrl("");
    setFileMime("");
    if (!doc?.attachmentId) {
      setUrl("");
      return;
    }
    const controller = new AbortController();
    let objectUrl = "";
    fetch(accountsUrl(`/attachment/${encodeURIComponent(doc.attachmentId)}`), {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then((r) => {
        if (!r.ok) throw Error("Document preview unavailable.");
        return r.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setFileMime(blob.type);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc?.attachmentId]);
  function open(d: DocumentReview) {
    if (pending && !window.confirm("Discard unsaved document edits?")) return;
    setSelected(d.id);
    setFields(structuredClone(d.fields));
    setConfirmed(false);
    setRemember(false);
    setSaved(false);
    setError("");
  }
  function change<K extends keyof EntryFields>(key: K, value: EntryFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    setConfirmed(false);
    setSaved(false);
  }
  async function upload(file: File, mode: "auto" | "manual" = "auto") {
    if (pending && !window.confirm("Discard unsaved document edits?")) return;
    if (mode === "auto" && requiresConsent && !processingConsent) {
      setError(
        "Confirm fictional test data and DeepSeek processing before using Auto-Fill, or choose Enter Manually.",
      );
      return;
    }
    setBusy(true);
    setUploadStatus("Preparing document for upload…");
    setError("");
    setSaved(false);
    try {
      const original = await readFile(file);
      setUploadStatus(
        mode === "manual"
          ? "Uploading original document for manual entry…"
          : "Reading document and extracting item details…",
      );
      const id = await extract(
        original,
        mode,
        mode === "auto" && requiresConsent
          ? {
              dataClass: "fictional",
              consent: true,
              policyVersion: "ai-fictional-v1",
            }
          : undefined,
      );
      setSelected(id);
      setLoaded("");
      setConfirmed(false);
      setRemember(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Document could not be read.");
    } finally {
      setBusy(false);
      setUploadStatus("");
      if (mode === "auto") setProcessingConsent(false);
    }
  }
  // Initialize only when a newly uploaded review arrives; never overwrite ongoing edits.
  const [loaded, setLoaded] = useState("");
  useEffect(() => {
    if (doc && loaded !== doc.id) {
      setFields(structuredClone(doc.fields));
      setLoaded(doc.id);
    }
  }, [doc, loaded]);
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  const parsed = fieldsSchema.safeParse(fields);
  const warnings = parsed.success
    ? inspectFields(
        parsed.data,
        {
          documentEntries: data.documentEntries,
          documentCatalog: data.documentCatalog,
          bills: data.bills,
          invoices: data.invoices,
        },
        doc?.id,
        doc?.sha256,
      )
    : [];
  const billBlockingWarnings = warnings.filter(
    (warning) =>
      !warning.code.startsWith("product-") &&
      !warning.code.startsWith("price-") &&
      warning.code !== "customer",
  );
  const matchesField = (path: string, key: string) => {
    const normalized = path.replace(/\[(\d+)\]/g, ".$1");
    return normalized === key || key.startsWith(`${normalized}.`);
  };
  const fieldIssue = (key: string) =>
    doc?.extraction.fieldIssues?.find((issue) => matchesField(issue.field, key))
      ?.reason;
  const uncertain = (key: string) =>
    Boolean(
      doc?.extraction.uncertain.some((path) => matchesField(path, key)) ||
      fieldIssue(key) ||
      warnings.some((warning) => matchesField(warning.field, key)),
    );
  const hasExtractedDetails = Boolean(
    doc &&
    (doc.extraction.fields.supplier ||
      doc.extraction.fields.reference ||
      doc.extraction.fields.date ||
      doc.extraction.fields.total ||
      doc.extraction.fields.subtotal ||
      doc.extraction.fields.tax ||
      doc.extraction.fields.items.some(
        (item) =>
          item.description || item.quantity || item.unitRate || item.total,
      )),
  );
  const partialExtraction = Boolean(
    doc &&
    (doc.extraction.completeness === "partial" ||
      doc.extraction.uncertain.length > 0 ||
      !hasExtractedDetails),
  );
  const extractionStatus =
    doc &&
    (doc.extraction.failureReason
      ? `Auto-Fill unavailable · ${doc.extraction.failureReason}`
      : doc.extraction.mode === "manual"
        ? doc.extraction.requestedMode === "manual"
          ? "Manual entry selected · no AI request was made."
          : "Automatic extraction did not complete · manual review required."
        : doc.extraction.mode === "synthetic-replay"
          ? "Prepared synthetic demo suggestions · not an extraction or AI result."
          : !hasExtractedDetails
            ? "No readable details extracted · enter the details manually or try a clearer document."
            : partialExtraction
              ? "Partially extracted — review highlighted fields."
              : "Extraction completed — review required.");
  function field(
    label: string,
    key: Exclude<keyof EntryFields, "items">,
    type = "text",
  ) {
    return (
      <label className={uncertain(key) ? "entry-uncertain" : ""}>
        {label}
        <input
          aria-label={label}
          type={type}
          value={fields[key] || ""}
          list={key === "supplier" ? "entry-suppliers" : undefined}
          onChange={(e) =>
            change(key, e.target.value as EntryFields[typeof key])
          }
          aria-describedby={uncertain(key) ? "entry-review-note" : undefined}
        />
        {uncertain(key) && (
          <small>{fieldIssue(key) || "Check against document"}</small>
        )}
      </label>
    );
  }
  function choice(
    label: string,
    key:
      | "kind"
      | "documentType"
      | "currency"
      | "categoryId"
      | "projectId"
      | "customerId"
      | "department"
      | "ledgerId",
    children: ReactNode,
  ) {
    return (
      <label className={uncertain(key) ? "entry-uncertain" : ""}>
        {label}
        <select
          aria-label={label}
          value={fields[key] || ""}
          onChange={(e) => {
            change(key, e.target.value as EntryFields[typeof key]);
            if (key === "kind" || key === "categoryId") change("ledgerId", "");
            if (key === "kind") {
              change("categoryId", "");
              if (e.target.value === "company-expense") change("projectId", "");
            }
            if (
              key === "categoryId" &&
              data.documentCategories
                .find((c) => c.id === e.target.value)
                ?.allowedScopes.includes("company")
            )
              change("projectId", "");
          }}
        >
          {children}
        </select>
        {uncertain(key) && (
          <small>{fieldIssue(key) || "Check against document"}</small>
        )}
      </label>
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!doc || !confirmed || busy || converted) return;
    setBusy(true);
    try {
      if (
        await act({
          kind: "document-draft",
          reviewId: doc.id,
          revision: doc.revision,
          fields,
          confirmed: true,
          rememberSupplier: remember,
        })
      ) {
        setSaved(true);
        setConfirmed(false);
      }
    } finally {
      setBusy(false);
    }
  }
  async function createBill() {
    if (
      !doc ||
      doc.status !== "Draft" ||
      !confirmed ||
      busy ||
      pending ||
      converted
    )
      return;
    if (
      !window.confirm(
        "Create this purchase bill and post it to the fictional demo journal?",
      )
    )
      return;
    setBusy(true);
    try {
      await act({
        kind: "create-bill-from-review",
        reviewId: doc.id,
        revision: doc.revision,
        confirmed: true,
      });
    } finally {
      setBusy(false);
    }
  }
  async function createExpense() {
    if (
      !doc ||
      doc.status !== "Draft" ||
      !confirmed ||
      busy ||
      pending ||
      converted
    )
      return;
    if (
      !window.confirm("Record this paid expense in the fictional demo journal?")
    )
      return;
    setBusy(true);
    try {
      await act({
        kind: "create-expense-from-review",
        reviewId: doc.id,
        revision: doc.revision,
        confirmed: true,
        account: paymentAccount,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">PURCHASES & EXPENSES</span>
          <h1>Read a bill</h1>
          <p>Upload → auto-fill → review → save a draft.</p>
        </div>
        <a className="button" href="#/bills">
          ← Purchase bills
        </a>
      </div>
      <div className="prototype-note">
        <strong>CLIENT REVIEW · FICTIONAL DATA</strong>
        <span>
          {data.documentAi?.message ||
            "Paid AI is disabled. Text PDFs use local PDF.js extraction; photos and scanned PDFs need manual entry. Prepared sample suggestions are labeled separately."}
        </span>
      </div>
      <section className="panel entry-upload" aria-label="Upload a document">
        {requiresConsent && (
          <label className="entry-check entry-processing-consent">
            <input
              type="checkbox"
              checked={processingConsent}
              disabled={busy}
              onChange={(event) => setProcessingConsent(event.target.checked)}
              aria-describedby="entry-processing-note"
            />
            This is fictional test data and I authorize DeepSeek processing for
            this upload
          </label>
        )}
        <label
          className={`button${(requiresConsent && !processingConsent) || busy ? " entry-upload-disabled" : ""}`}
        >
          Upload & Auto-Fill
          <input
            aria-label="Upload document"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            capture="environment"
            disabled={busy || (requiresConsent && !processingConsent)}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
        <label className="button">
          Enter Manually
          <input
            aria-label="Upload document for manual entry"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            capture="environment"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file, "manual");
              event.target.value = "";
            }}
          />
        </label>
        <span id="entry-processing-note">
          PDF, PNG or JPEG · up to 2 MB.{" "}
          {data.documentAi?.enabled
            ? "Auto-Fill can process new fictional documents after consent, subject to server authorization and spending limits. Review every suggestion."
            : "Live AI is unavailable. Selectable PDF text may be read locally; photos/scans need manual entry."}{" "}
          Real company documents are not authorized. Manual entry needs no AI
          consent and keeps the original alongside a blank form.
        </span>
        <a href="/document-samples/07.png" download>
          Download sample bill
        </a>
        <a href="/document-samples/12.pdf" download>
          Scanned PDF sample
        </a>
        <a href="/document-samples/03.png" download>
          Arabic / English sample
        </a>
      </section>
      {busy && uploadStatus && (
        <p role="status" aria-live="polite">
          {uploadStatus}
        </p>
      )}
      {error && (
        <p className="review-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="review-success" role="status">
          Draft saved. No bill, payment or journal was posted. You can reopen
          and edit this draft below.
        </p>
      )}
      {doc ? (
        <div className="entry-layout" aria-busy={Boolean(uploadStatus)}>
          <section className="panel entry-preview">
            <div className="entry-preview-head">
              <span className="eyebrow">ORIGINAL DOCUMENT</span>
              <span>
                {doc.status} · revision {doc.revision}
              </span>
            </div>
            {url ? (
              <>
                <Preview url={url} mime={fileMime} />
                <a
                  className="button"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original document
                </a>
              </>
            ) : (
              <p>Loading original…</p>
            )}
            <p role={doc.extraction.failureReason ? "alert" : "status"}>
              {extractionStatus}
            </p>
            <p>
              {doc.extraction.mode === "local-pdf-text"
                ? "Actual local PDF text extraction · not AI. "
                : doc.extraction.mode === "live"
                  ? "Actual AI result · verify every value against the original. "
                  : ""}
              {doc.extraction.provider}. Original suggestions are preserved with
              each correction.
            </p>
            {doc.extraction.mode === "live" && (
              <p aria-label="AI extraction evidence">
                Provider usage · {doc.extraction.inputTokens ?? "Unreported"}{" "}
                input tokens · {doc.extraction.outputTokens ?? "Unreported"}{" "}
                output tokens. Provider-billed cost:{" "}
                {doc.extraction.costUsd === null
                  ? "unverified; usage is not a billing receipt"
                  : `USD ${doc.extraction.costUsd.toFixed(6)}`}
                .
                {doc.extraction.requestId && (
                  <> Request ID: {doc.extraction.requestId}.</>
                )}
              </p>
            )}
          </section>
          <form className="panel review-form entry-form" onSubmit={save}>
            <span className="eyebrow">REVIEW BEFORE SAVING</span>
            <h2>Document details</h2>
            {doc.extraction.reviewOnly && (
              <div className="entry-warnings" role="status">
                {doc.extraction.reviewPolicy === "draft-only"
                  ? "Fictional AI review · save drafts only."
                  : "Owner-authorized quotation · review drafts only."}{" "}
                This document cannot create a purchase bill, expense, payment or
                journal posting.
              </div>
            )}
            <p>
              Confirm the document type. A quotation marked “Not Official Bill”
              must remain a review draft until an official invoice is obtained.
            </p>
            <p id="entry-review-note">
              {converted
                ? "This reviewed document is read only because it is linked to a posted demo transaction. Original extraction and correction history are preserved."
                : "Shaded fields need a closer look. Every field is editable. Taxes are captured as evidence only; tax posting remains unavailable."}
            </p>
            <fieldset
              className="entry-edit-fields"
              aria-label="Reviewed document fields"
              disabled={converted}
            >
              <datalist id="entry-suppliers">
                {data.documentCatalog.suppliers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <div className="field-grid">
                {choice(
                  "Document type",
                  "documentType",
                  <>
                    <option value="">Not yet confirmed</option>
                    <option value="unknown">Unknown</option>
                    <option value="invoice">Invoice</option>
                    <option value="receipt">Receipt</option>
                    <option value="quotation">
                      Quotation / not an official bill
                    </option>
                  </>,
                )}
                {field("Supplier name", "supplier")}
                {field("Document date", "date", "date")}
                {field("Due date", "dueDate", "date")}
                {field("Invoice / receipt reference", "reference")}
                {field("Purchase order reference", "purchaseOrderReference")}
                {choice(
                  "Currency",
                  "currency",
                  <>
                    <option value="unknown">Check currency</option>
                    <option value="AED">AED</option>
                    <option value="other">Other / unsupported</option>
                  </>,
                )}
                {choice(
                  "Suggested classification",
                  "kind",
                  <>
                    <option value="unknown">Choose classification</option>
                    <option value="supplier-bill">
                      Supplier purchase bill
                    </option>
                    <option value="project-expense">Project expense</option>
                    <option value="company-expense">Company expense</option>
                  </>,
                )}
                {choice(
                  "Expense category",
                  "categoryId",
                  <>
                    <option value="">Choose category</option>
                    {data.documentCategories
                      .filter(
                        (c) =>
                          fields.kind === "supplier-bill" ||
                          c.allowedScopes.includes(
                            fields.kind === "company-expense"
                              ? "company"
                              : "project",
                          ),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </>,
                )}
                {choice(
                  "Department",
                  "department",
                  <>
                    <option value="">Unassigned</option>
                    {(data.departments ?? []).map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </>,
                )}
                {choice(
                  "Expense Ledger",
                  "ledgerId",
                  <>
                    <option value="">
                      Choose ledger if this is an expense
                    </option>
                    {data.expenseLedgers.map((ledger) => (
                      <option key={ledger.id} value={ledger.id}>
                        {ledger.name} · {ledger.group}
                      </option>
                    ))}
                  </>,
                )}
                {scopeFor(fields) === "project" &&
                  choice(
                    "Project",
                    "projectId",
                    <>
                      <option value="">Choose project</option>
                      {data.documentCatalog.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </>,
                  )}
                {field("Project name on document", "projectName")}
                {field("Customer name on document", "customerName")}
                {choice(
                  "Related customer (optional)",
                  "customerId",
                  <>
                    <option value="">No customer selected</option>
                    {data.documentCatalog.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </>,
                )}
              </div>
              <p className="entry-mapping">
                Category mapping:{" "}
                {data.accounts.find(
                  (a) =>
                    a.id ===
                    data.documentCategories.find(
                      (c) => c.id === fields.categoryId,
                    )?.expenseAccountId,
                )?.code || "—"}{" "}
                ·{" "}
                {data.accounts.find(
                  (a) =>
                    a.id ===
                    data.documentCategories.find(
                      (c) => c.id === fields.categoryId,
                    )?.expenseAccountId,
                )?.name || "Select an existing category"}
                . Mapping is a draft suggestion.
              </p>
              <h3>Items</h3>
              <div className="entry-items">
                {fields.items.map((item, n) => (
                  <fieldset key={n}>
                    <legend>Item {n + 1}</legend>
                    <div className="field-grid">
                      {(
                        [
                          "description",
                          "quantity",
                          "unit",
                          "unitRate",
                          "discount",
                          "tax",
                          "total",
                        ] as const
                      ).map((key) => (
                        <label
                          key={key}
                          className={
                            uncertain(`items.${n}.${key}`)
                              ? "entry-uncertain"
                              : ""
                          }
                        >
                          {
                            {
                              description: "Description",
                              quantity: "Quantity",
                              unit: "Unit",
                              unitRate: "Unit rate · AED",
                              discount: "Item discount · AED",
                              tax: "Item tax · AED",
                              total: "Item total · AED",
                            }[key]
                          }
                          <input
                            aria-label={`Item ${n + 1} ${key}`}
                            aria-describedby={
                              uncertain(`items.${n}.${key}`)
                                ? "entry-review-note"
                                : undefined
                            }
                            value={item[key] || ""}
                            inputMode={
                              [
                                "quantity",
                                "unitRate",
                                "discount",
                                "tax",
                                "total",
                              ].includes(key)
                                ? "decimal"
                                : "text"
                            }
                            onChange={(e) =>
                              change(
                                "items",
                                fields.items.map((v, i) =>
                                  i === n ? { ...v, [key]: e.target.value } : v,
                                ),
                              )
                            }
                          />
                          {uncertain(`items.${n}.${key}`) && (
                            <small>
                              {fieldIssue(`items.${n}.${key}`) ||
                                "Check against document"}
                            </small>
                          )}
                        </label>
                      ))}
                      <label>
                        Matched product
                        <select
                          value={item.productId}
                          onChange={(e) =>
                            change(
                              "items",
                              fields.items.map((v, i) =>
                                i === n
                                  ? { ...v, productId: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        >
                          <option value="">No product match</option>
                          {data.documentCatalog.products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.unit}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      className="button"
                      type="button"
                      onClick={() =>
                        change(
                          "items",
                          fields.items.filter((_, i) => i !== n),
                        )
                      }
                    >
                      Remove item {n + 1}
                    </button>
                  </fieldset>
                ))}
              </div>
              <button
                className="button"
                type="button"
                disabled={fields.items.length >= 80}
                onClick={() =>
                  change("items", [
                    ...fields.items,
                    {
                      description: "",
                      quantity: "",
                      unit: "",
                      unitRate: "",
                      tax: "",
                      total: "",
                      productId: "",
                    },
                  ])
                }
              >
                + Add item
              </button>
              <div className="field-grid entry-totals">
                {field("Subtotal · AED", "subtotal")}
                {field("Document discount · AED", "discount")}
                {field("Tax · AED", "tax")}
                {field("Document total · AED", "total")}
              </div>
              {!parsed.success && (
                <p className="review-error" role="alert">
                  Check amounts and dates. Amounts need a decimal point and up
                  to two decimals; quantities allow four decimals.
                </p>
              )}
              {warnings.length > 0 && (
                <div className="entry-warnings" aria-label="Review warnings">
                  <strong>Check before confirming</strong>
                  <ul>
                    {warnings.map((w) => (
                      <li key={w.code}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="entry-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    setConfirmed(false);
                  }}
                />
                Remember this supplier’s classification and category in this
                demo session
              </label>
              <label className="entry-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I checked all fields and any warnings against the original
                document
              </label>
              <div className="review-actions">
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={!confirmed || !parsed.success || busy}
                >
                  Save reviewed draft
                </button>
                {doc.status === "Draft" &&
                  !doc.extraction.reviewOnly &&
                  fields.kind === "supplier-bill" &&
                  !doc.convertedBillId && (
                    <button
                      className="button"
                      type="button"
                      disabled={
                        !confirmed ||
                        busy ||
                        pending ||
                        billBlockingWarnings.length > 0
                      }
                      onClick={() => void createBill()}
                    >
                      Create purchase bill
                    </button>
                  )}
                {doc.convertedBillId && (
                  <p className="review-success" role="status">
                    Created purchase bill {doc.convertedBillId}. This document
                    is linked to that bill and cannot be posted twice.
                  </p>
                )}
              </div>
              {doc.status === "Draft" &&
                !doc.extraction.reviewOnly &&
                ["project-expense", "company-expense"].includes(fields.kind) &&
                !(doc as DocumentReview & { convertedExpenseId?: string })
                  .convertedExpenseId && (
                  <div className="entry-expense-conversion">
                    <label>
                      Expense payment account
                      <select
                        value={paymentAccount}
                        onChange={(event) =>
                          setPaymentAccount(event.target.value)
                        }
                        disabled={busy}
                      >
                        {cashAccountsFor(data).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button"
                      type="button"
                      disabled={
                        !confirmed ||
                        busy ||
                        pending ||
                        billBlockingWarnings.length > 0
                      }
                      onClick={() => void createExpense()}
                    >
                      Record reviewed expense
                    </button>
                    <p>
                      This separate action records a paid expense. Choose the
                      actual demo payment account and review the saved draft
                      first.
                    </p>
                  </div>
                )}
              {(doc as DocumentReview & { convertedExpenseId?: string })
                .convertedExpenseId && (
                <p className="review-success" role="status">
                  Recorded expense{" "}
                  {
                    (doc as DocumentReview & { convertedExpenseId?: string })
                      .convertedExpenseId
                  }
                  . This review cannot be posted twice.
                </p>
              )}
              <p>
                Saving a draft never posts. Creating a purchase bill or
                recording an expense is a separate explicit action through the
                existing demo journal workflow and currently requires a VAT-free
                total. Save any edits before this action.
              </p>
            </fieldset>
          </form>
        </div>
      ) : (
        <div className="panel review-card">
          <h2>Start with a bill or receipt</h2>
          <p>
            Keep the original beside the suggested details. Confirm the
            supplier, project and category before saving.
          </p>
        </div>
      )}
      {doc && <CorrectionHistory doc={doc} />}
      <section className="panel review-card entry-drafts">
        <h2>Document reviews & drafts</h2>
        {!data.documentEntries.reviews.length ? (
          <p>No documents uploaded yet.</p>
        ) : (
          data.documentEntries.reviews.map((d) => (
            <div className="review-row" key={d.id}>
              <div>
                <strong>{d.fields.supplier || "Supplier to check"}</strong>
                <p>
                  {d.fields.reference || "No reference"} · {d.status} ·{" "}
                  {d.fields.total ? `AED ${d.fields.total}` : "Amount to check"}{" "}
                  · {d.corrections.length} saved review(s)
                </p>
              </div>
              <button className="button" type="button" onClick={() => open(d)}>
                Review {d.fields.reference || "document"}
              </button>
            </div>
          ))
        )}
      </section>
    </>
  );
}
const historyLabels: Record<string, string> = {
  supplier: "Supplier",
  date: "Date",
  reference: "Reference",
  dueDate: "Due date",
  purchaseOrderReference: "Purchase order reference",
  currency: "Currency",
  subtotal: "Subtotal",
  tax: "Tax",
  total: "Total",
  discount: "Discount",
  department: "Department",
  ledgerId: "Expense ledger",
  kind: "Classification",
  categoryId: "Category",
  projectName: "Project name",
  customerName: "Customer name",
  projectId: "Project",
  customerId: "Customer",
  description: "Description",
  quantity: "Quantity",
  unit: "Unit",
  unitRate: "Unit rate",
  productId: "Product",
};
function historyValues(fields: EntryFields) {
  const { items, ...values } = fields;
  return Object.fromEntries([
    ...Object.entries(values).map(([key, value]) => [
      historyLabels[key],
      value,
    ]),
    ...items.flatMap((item, index) =>
      Object.entries(item).map(([key, value]) => [
        `Item ${index + 1} · ${historyLabels[key]}`,
        value,
      ]),
    ),
  ]);
}
function CorrectionHistory({ doc }: { doc: DocumentReview }) {
  return (
    <section
      className="panel review-card entry-history"
      aria-label="Correction history"
    >
      <details key={doc.id}>
        <summary>
          Correction history · {doc.corrections.length} saved review(s)
        </summary>
        <p>
          Original suggestions are unchanged. These are the accountant’s saved
          reviews in this demo session.
        </p>
        {!doc.corrections.length && <p>No reviews saved yet.</p>}
        {doc.corrections.map((correction, index) => {
          const before = historyValues(correction.before),
            after = historyValues(correction.after);
          const changed = [
            ...new Set([...Object.keys(before), ...Object.keys(after)]),
          ].filter((key) => before[key] !== after[key]);
          return (
            <article key={index}>
              <h3>Review {index + 1} · Demo Accountant</h3>
              <p>
                <time dateTime={correction.at}>
                  {new Date(correction.at).toLocaleString()}
                </time>
              </p>
              {changed.length ? (
                <dl>
                  {changed.map((key) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>
                        <span>Before: {before[key] || "Empty"}</span>
                        <span>After: {after[key] || "Empty"}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>Fields confirmed without changes.</p>
              )}
            </article>
          );
        })}
      </details>
    </section>
  );
}
function Preview({ url, mime }: { url: string; mime: string }) {
  return mime === "application/pdf" ? (
    <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
      <PdfPreview url={url} />
    </Suspense>
  ) : (
    <img className="entry-original" src={url} alt="Original uploaded bill" />
  );
}
