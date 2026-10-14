import { useState } from "react";
import { useStore } from "../store";
import { Header, Field, Badge, Confirm, Modal, Empty } from "../components/ui";
import type { Quotation, QuotationLineItem } from "./model";
import { pricingTypes, quotationStatuses } from "./model";
import {
  blankLine,
  newQuotation,
  saveQuotation,
  copyQuotation,
  changeQuotationStatus,
  deleteDraft,
  reorder,
  validationErrors,
} from "./repository";
import { defaultTerms } from "./seed";
import {
  amountInWords,
  displayAmount,
  formatMoney,
  totals,
  sectionAmount,
  paymentAmount,
  paymentPercentage,
} from "./calculations";
import {
  layoutQuotation,
  pageSvg,
  downloadPdf,
  printQuotation,
} from "./document";
import { uid } from "../domain/logic";
import { CustomerForm } from "../commercial/Customers";
import { Wizard } from "../components/Wizard";
import { convertQuotation, newProjectDetails } from "../commercial/repository";
import type { Project, Client } from "../domain/model";
import { discountAmount } from "./calculations";
import { QuotationGuide } from "./QuotationGuide";
const open = (id: string, mode = "edit") => {
  location.hash = "/quotations/" + id + "/" + mode;
};
const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
function Order({
  index,
  length,
  move,
  label,
}: {
  index: number;
  length: number;
  move: (d: number) => void;
  label: string;
}) {
  return (
    <>
      <button
        aria-label={"Move " + label + " up"}
        disabled={index === 0}
        onClick={() => move(-1)}
      >
        ↑
      </button>
      <button
        aria-label={"Move " + label + " down"}
        disabled={index === length - 1}
        onClick={() => move(1)}
      >
        ↓
      </button>
    </>
  );
}
export function Quotations({
  id,
  mode,
  projectId,
}: {
  id?: string;
  mode?: string;
  projectId?: string;
}) {
  const { db, mutate } = useStore();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [client, setClient] = useState(""),
    [project, setProject] = useState(projectId || "");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    action: () => void;
  } | null>(null);
  const [revision, setRevision] = useState(false),
    [returnDraft, setReturnDraft] = useState(false),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const q = db.quotations.find((q) => q.id === id);
  const [advancedChoice, setAdvancedChoice] = useState<boolean | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [scopeSearch, setScopeSearch] = useState("");
  const [addCustomer, setAddCustomer] = useState(false),
    [addProject, setAddProject] = useState(false),
    [convert, setConvert] = useState(false);
  const [conversionProject, setConversionProject] = useState(""),
    [conversionNew, setConversionNew] = useState<Project | null>(null);
  function selectCustomer(c: Client) {
    update((n) => {
      n.customerId = c.id;
      n.customer = {
        name: c.name,
        contact: c.contact,
        address: c.address || "",
        email: c.email || "",
        phone: c.phone || "",
      };
      n.introduction.attention = "Dear: " + c.name;
      if (
        n.projectId &&
        db.projects.find((p) => p.id === n.projectId)?.clientId !== c.id
      ) {
        n.projectId = "";
        n.project = { name: "", location: "" };
      }
    });
  }
  function create() {
    let created = "";
    if (
      mutate((d) => {
        const n = newQuotation(d);
        if (projectId) {
          const p = d.projects.find((p) => p.id === projectId)!;
          const c = d.clients.find((c) => c.id === p.clientId)!;
          Object.assign(n, {
            projectId: p.id,
            customerId: c.id,
            project: { name: p.name, location: p.location },
            customer: { ...n.customer, name: c.name, contact: c.contact },
            introduction: { ...n.introduction, attention: "Dear: " + c.name },
          });
        }
        created = n.id;
      }, "Quotation draft created")
    )
      open(created);
  }
  function update(fn: (copy: Quotation) => void) {
    if (!q) return false;
    const next = structuredClone(q);
    fn(next);
    return mutate((d) => saveQuotation(d, next), "");
  }
  function addCategory(parentIndex?: number) {
    if (!q) return;
    const parent =
      parentIndex === undefined ? undefined : q.sections[parentIndex];
    const category = {
      id: uid(),
      number: parent ? parent.number + ".1" : String(q.sections.length + 1),
      title: parent ? "New subcategory" : "New work category",
      parentId: parent?.id,
      rows: [],
    };
    if (
      update((n) => {
        n.sections.splice(
          parentIndex === undefined ? n.sections.length : parentIndex + 1,
          0,
          category,
        );
      })
    ) {
      setScopeSearch("");
      setSelectedCategory(category.id);
      setSelectedItem(null);
    }
  }
  function addItem(
    sectionIndex: number,
    heading = false,
    parentIndex?: number,
  ) {
    if (!q) return;
    const section = q.sections[sectionIndex];
    const parent =
      parentIndex === undefined ? undefined : section.rows[parentIndex];
    const row = blankLine(
      parent
        ? parent.number + ".1"
        : section.number.replace(/\.00$/, "") + "." + (section.rows.length + 1),
      parent?.id,
    );
    if (heading)
      Object.assign(row, { pricingType: "Heading", quantity: "", rate: "" });
    if (
      update((n) => {
        n.sections[sectionIndex].rows.splice(
          parentIndex === undefined ? section.rows.length : parentIndex + 1,
          0,
          row,
        );
      })
    ) {
      setSelectedItem(row.id);
    }
  }
  function duplicate(id: string, rev = false) {
    let next = "";
    if (
      mutate(
        (d) => {
          next = copyQuotation(d, id, rev, notes).id;
        },
        rev ? "New draft revision created" : "Quotation duplicated",
      )
    ) {
      setRevision(false);
      setNotes("");
      open(next);
    }
  }
  async function download(value: Quotation) {
    setBusy(true);
    setError("");
    try {
      await downloadPdf(value);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const print = (value: Quotation) => {
    setError("");
    try {
      printQuotation(value);
    } catch (e) {
      setError(String(e));
    }
  };
  const confirm = (title: string, action: () => void) =>
    setConfirmation({ title, action });
  const confirmations = (
    <>
      {confirmation && (
        <Confirm
          title={confirmation.title}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            confirmation.action();
            setConfirmation(null);
          }}
        >
          This action is recorded in this browser.
        </Confirm>
      )}
      {revision && q && (
        <Modal title="Create revision" onClose={() => setRevision(false)}>
          <p>
            The previous revision is preserved. The new revision starts as a
            draft.
          </p>
          <Field label="Revision notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <button className="primary" onClick={() => duplicate(q.id, true)}>
            Create draft revision
          </button>
        </Modal>
      )}
      {returnDraft && q && (
        <Modal title="Return to draft" onClose={() => setReturnDraft(false)}>
          <p>
            Record why this issued quotation needs to be reopened. The issued
            snapshot remains in quotation history.
          </p>
          <Field label="Reason for returning to draft">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <button
            disabled={!notes.trim()}
            onClick={() => {
              if (
                mutate((d) => changeQuotationStatus(d, q.id, "Draft", notes))
              ) {
                setReturnDraft(false);
                setNotes("");
              }
            }}
          >
            Return to draft
          </button>
        </Modal>
      )}
      {addCustomer && q && (
        <CustomerForm
          onClose={() => setAddCustomer(false)}
          onSaved={(_id, c) => {
            selectCustomer(c);
            setAddCustomer(false);
          }}
        />
      )}
      {addProject && q && (
        <Wizard
          initialCustomerId={q.customerId}
          initialName={q.project.name}
          initialLocation={q.project.location}
          onClose={() => setAddProject(false)}
          onCreated={(projectId) => {
            mutate((d) => {
              const next = structuredClone(
                d.quotations.find((x) => x.id === q.id)!,
              );
              const p = d.projects.find((p) => p.id === projectId)!;
              const c = d.clients.find((c) => c.id === p.clientId)!;
              next.projectId = p.id;
              next.project = { name: p.name, location: p.location };
              next.customerId = c.id;
              next.customer = {
                name: c.name,
                contact: c.contact,
                address: c.address || "",
                email: c.email || "",
                phone: c.phone || "",
              };
              saveQuotation(d, next);
            }, "Project linked to quotation");
            setAddProject(false);
          }}
        />
      )}
      {convert && q && (
        <Modal title="Convert to Project" onClose={() => setConvert(false)}>
          <p>
            The accepted BOQ, payment terms and contract values are preserved.
            Invoice creation is a separate action.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              let projectId = "";
              if (
                mutate((d) => {
                  projectId = convertQuotation(
                    d,
                    q.id,
                    conversionNew?.id || conversionProject,
                    conversionNew || undefined,
                  ).projectId;
                }, "Accepted quotation linked as project contract")
              ) {
                setConvert(false);
                location.hash = `/projects/${projectId}/financials`;
              }
            }}
          >
            <Field label="Conversion project">
              <select
                required={!conversionNew}
                disabled={!!conversionNew}
                value={conversionProject}
                onChange={(e) => setConversionProject(e.target.value)}
              >
                <option value="">Select existing project…</option>
                {db.projects
                  .filter(
                    (p) =>
                      p.clientId === q.customerId &&
                      (!q.projectId || p.id === q.projectId),
                  )
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            {!q.projectId && (
              <button
                type="button"
                onClick={() =>
                  setConversionNew(
                    conversionNew
                      ? null
                      : newProjectDetails(
                          db,
                          q.customerId,
                          q.project.name,
                          q.project.location,
                        ),
                  )
                }
              >
                {conversionNew
                  ? "Use existing project"
                  : "Create new project from accepted quotation"}
              </button>
            )}
            {conversionNew && (
              <div className="form-grid">
                {(
                  [
                    ["name", "Contract project name"],
                    ["location", "Contract project location"],
                    ["start", "Contract project start"],
                    ["due", "Contract project due"],
                  ] as const
                ).map(([key, label]) => (
                  <Field label={label} key={key}>
                    <input
                      required
                      type={key === "start" || key === "due" ? "date" : "text"}
                      value={conversionNew[key]}
                      onChange={(e) =>
                        setConversionNew({
                          ...conversionNew,
                          [key]: e.target.value,
                        })
                      }
                    />
                  </Field>
                ))}
                <Field label="Contract project manager">
                  <select
                    required
                    value={conversionNew.managerId}
                    onChange={(e) =>
                      setConversionNew({
                        ...conversionNew,
                        managerId: e.target.value,
                      })
                    }
                  >
                    {db.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <div className="sticky-actions">
              <button type="button" onClick={() => setConvert(false)}>
                Cancel
              </button>
              <button className="primary">Confirm Conversion</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
  if (!id) {
    const list = db.quotations
      .filter(
        (q) =>
          (
            q.number +
            " " +
            q.customer.name +
            " " +
            q.project.name +
            " " +
            q.project.location
          )
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (!status || q.status === status) &&
          (!client || q.customerId === client) &&
          (!project || q.projectId === project),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return (
      <div className="quotation-module">
        <Header
          eyebrow="Commercial management"
          title="Quotations"
          description="Scope, commercial terms and revision history."
          action={
            <button className="primary" onClick={create}>
              New quotation
            </button>
          }
        />
        <div className="filters">
          <input
            aria-label="Search quotations"
            placeholder="Search quotations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Quotation status filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {quotationStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Quotation customer filter"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          >
            <option value="">All customers</option>
            {db.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!projectId && (
            <select
              aria-label="Quotation project filter"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">All projects</option>
              {db.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="stack">
          {list.map((q) => {
            const t = safe(() => totals(q), null);
            return (
              <article className="panel quote-card" key={q.id}>
                <div className="between">
                  <a href={"#/quotations/" + q.id + "/edit"}>
                    <h2>
                      {q.number}
                      {q.revision ? " Rev " + q.revision : ""}
                    </h2>
                  </a>
                  <Badge>{q.status}</Badge>
                </div>
                <dl className="quote-list-details">
                  {[
                    ["Date", q.date],
                    ["Customer", q.customer.name || "Not selected"],
                    ["Project / Job", q.project.name || "Not entered"],
                    ["Location", q.project.location || "Not entered"],
                    [
                      "Subtotal",
                      t ? formatMoney(t.subtotal, true) : "Check values",
                    ],
                    ["VAT", t ? formatMoney(t.vat, true) : "Check values"],
                    [
                      "Grand Total",
                      t ? formatMoney(t.grand, true) : "Check values",
                    ],
                    ["Revision", String(q.revision)],
                    [
                      "Last Updated",
                      new Date(q.updatedAt).toLocaleString("en-GB", {
                        timeZone: "Asia/Dubai",
                      }),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="actions">
                  <button onClick={() => open(q.id)}>
                    Open{q.status === "Draft" ? " / Edit" : ""}
                  </button>
                  <button onClick={() => duplicate(q.id)}>Duplicate</button>
                  <button
                    onClick={() => {
                      open(q.id);
                      setRevision(true);
                    }}
                  >
                    Create Revision
                  </button>
                  <button onClick={() => open(q.id, "preview")}>Preview</button>
                  <button disabled={busy} onClick={() => void download(q)}>
                    Download PDF
                  </button>
                  {q.status === "Draft" &&
                    !q.finalizedAt &&
                    !db.quotations.some(
                      (x) => x.revisionDetails.sourceId === q.id,
                    ) && (
                      <button
                        onClick={() =>
                          confirm("Delete draft " + q.number + "?", () =>
                            mutate((d) => deleteDraft(d, q.id)),
                          )
                        }
                      >
                        Delete Draft
                      </button>
                    )}
                </div>
              </article>
            );
          })}
        </div>
        {!list.length && <Empty>No quotations match.</Empty>}
        {error && <p role="alert">{error}</p>}
        {confirmations}
      </div>
    );
  }
  if (!q)
    return (
      <Empty>
        Quotation not found. <a href="#/quotations">Open quotations</a>
      </Empty>
    );
  const locked = q.status !== "Draft",
    preview = mode === "preview";
  const step = ["edit", "scope", "pricing", "payments", "preview"].indexOf(
    mode || "edit",
  );
  const activeStep = step < 0 ? 0 : step;
  const complexScope = q.sections.some(
    (s) =>
      s.parentId ||
      s.rows.some(
        (r) =>
          r.parentId ||
          r.pricingType === "Heading" ||
          r.amountOverride !== undefined,
      ),
  );
  const advanced = advancedChoice ?? complexScope;
  const scopeNeedle = scopeSearch.trim().toLowerCase();
  const matchesScope = (section: Quotation["sections"][number]) =>
    !scopeNeedle ||
    [
      section.number,
      section.title,
      ...section.rows.map(
        (r) => r.number + " " + r.description + " " + r.location,
      ),
    ]
      .join(" ")
      .toLowerCase()
      .includes(scopeNeedle);
  const visibleCategories = q.sections.filter(matchesScope);
  const currentCategory =
    selectedCategory === "closed"
      ? undefined
      : visibleCategories.find((s) => s.id === selectedCategory)?.id ||
        visibleCategories[0]?.id;
  const goToStep = (next: number) =>
    open(
      q.id,
      ["edit", "scope", "pricing", "payments", "preview"][next] || "edit",
    );
  const t = safe(() => totals(q), null),
    errors = [
      ...validationErrors(q),
      ...(!locked &&
      !db.clients.some((c) => c.id === q.customerId && c.status !== "Archived")
        ? ["Select an active linked customer before issuing."]
        : []),
    ];
  const pages = preview ? safe(() => layoutQuotation(q), null) : null;
  return (
    <div className="quotation-module">
      <Header
        eyebrow="Quotation management"
        title={q.number + (q.revision ? " Rev " + q.revision : "")}
        description={q.customer.name + " · " + q.project.name}
        action={
          <>
            <a className="button" href="#/quotations">
              Quotation list
            </a>
            {preview && (
              <>
                <button onClick={() => open(q.id, "edit")}>Open / Edit</button>
                <button disabled={busy || !t} onClick={() => void download(q)}>
                  {busy ? "Generating…" : "Download PDF"}
                </button>
                <button disabled={!t} onClick={() => print(q)}>
                  Print
                </button>
              </>
            )}
          </>
        }
      />
      <div className="panel quote-toolbar">
        <Badge>{q.status}</Badge>
        <span role="status">
          {locked
            ? "Issued content is locked"
            : "Draft autosave · " +
              new Date(q.updatedAt).toLocaleTimeString("en-GB", {
                timeZone: "Asia/Dubai",
              })}
        </span>
        <div className="actions">
          {!locked && (
            <>
              <button
                onClick={() =>
                  mutate((d) => {
                    saveQuotation(d, q);
                    d.quotations
                      .find((x) => x.id === q.id)!
                      .history.push({
                        date: new Date().toISOString(),
                        action: "Draft saved",
                        notes: "",
                      });
                  }, "Draft saved")
                }
              >
                Save Draft
              </button>
              {preview && (
                <button
                  className="primary"
                  onClick={() =>
                    errors.length
                      ? setError(
                          "Resolve the validation issues below before finalizing. Your draft remains editable.",
                        )
                      : confirm("Finalize quotation?", () =>
                          mutate((d) =>
                            changeQuotationStatus(d, q.id, "Finalized"),
                          ),
                        )
                  }
                >
                  Finalize
                </button>
              )}
            </>
          )}
          {locked && preview && (
            <>
              <select
                aria-label="Issued quotation status"
                value={q.status}
                disabled={q.status === "Accepted"}
                onChange={(e) =>
                  mutate((d) =>
                    changeQuotationStatus(
                      d,
                      q.id,
                      e.target.value as Quotation["status"],
                    ),
                  )
                }
              >
                {quotationStatuses
                  .filter((s) => s !== "Draft")
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
              <button
                disabled={q.status === "Accepted"}
                onClick={() => setReturnDraft(true)}
              >
                Return to draft
              </button>
            </>
          )}
          <details className="quotation-version-actions">
            <summary>Version actions</summary>
            <div className="actions">
              <button onClick={() => duplicate(q.id)}>
                Duplicate Quotation
              </button>
              <button onClick={() => setRevision(true)}>Create Revision</button>
            </div>
          </details>
          {preview &&
            q.status === "Accepted" &&
            (db.contracts.some((c) => c.quotationId === q.id) ? (
              <a
                className="button"
                href={`#/projects/${db.contracts.find((c) => c.quotationId === q.id)!.projectId}/financials`}
              >
                Open Contract Project
              </a>
            ) : (
              <button
                className="primary"
                onClick={() => {
                  setConversionProject(q.projectId);
                  setConversionNew(null);
                  setConvert(true);
                }}
              >
                Convert to Project
              </button>
            ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <QuotationGuide step={activeStep} onStepChange={goToStep}>
        {preview ? (
          <>
            <section className="panel quotation-guide-help quotation-context-help">
              <h2>{locked ? "Issued quotation" : "Review before issuing"}</h2>
              <p>
                Check the actual AZZORA document below, then download or print
                it using the document actions above. Draft changes are saved as
                you work.
              </p>
              <p>
                {locked
                  ? "Issued content is locked. Use the existing status control to record Sent and the client's decision, or create a revision when scope changes."
                  : "Finalize locks this version and records its issued snapshot. Then record Sent when you share it with the client. You can return an eligible version to draft with a reason."}
              </p>
              {!locked && (
                <button onClick={() => goToStep(0)}>Return to edit</button>
              )}
            </section>
            <p className="muted">
              A4 document · {pages?.length || 0} pages · Generated from this
              quotation’s structured data.
            </p>
            {pages ? (
              <div className="quotation-preview">
                {pages.map((p, i) => (
                  <div
                    key={i}
                    className="quote-sheet"
                    dangerouslySetInnerHTML={{ __html: pageSvg(p) }}
                  />
                ))}
              </div>
            ) : (
              <p role="alert">Correct invalid amounts before previewing.</p>
            )}
          </>
        ) : (
          <>
            {activeStep === 1 && (
              <>
                {" "}
                <section className="panel quotation-guide-help">
                  <div className="between">
                    <div>
                      <h2>Build your scope of work</h2>
                      <p>
                        Add a work category, then priced items with quantity and
                        rate.
                      </p>
                    </div>
                    <button onClick={() => setShowExample(true)}>
                      View worked example
                    </button>
                  </div>
                  <label className="quotation-advanced-toggle">
                    <input
                      type="checkbox"
                      checked={advanced}
                      onChange={(e) => setAdvancedChoice(e.target.checked)}
                    />{" "}
                    Advanced scope controls
                  </label>
                  {complexScope && (
                    <p className="muted">
                      Advanced scope data present. Both modes preserve all rows.
                    </p>
                  )}
                  <details className="quotation-advanced">
                    <summary>Advanced scope explained</summary>
                    <p className="muted">
                      Simple mode follows work category → priced item. Advanced
                      controls add subcategories, headings without prices and
                      item breakdowns for a detailed BOQ (bill of quantities).
                      Switching modes keeps every category, item and amount.
                    </p>
                  </details>
                  <Field label="Find a category or item">
                    <input
                      type="search"
                      value={scopeSearch}
                      placeholder="Search work names, item numbers or areas…"
                      onChange={(e) => {
                        setScopeSearch(e.target.value);
                        setSelectedCategory(null);
                        setSelectedItem(null);
                      }}
                    />
                  </Field>
                  <p className="muted">
                    {visibleCategories.length} of {q.sections.length}{" "}
                    categories.
                  </p>
                </section>
              </>
            )}
            <fieldset disabled={locked} className="quote-editor">
              {activeStep === 0 && (
                <>
                  <section className="panel">
                    <h2>Customer & Project Details</h2>
                    <p className="muted">
                      Choose a customer and project, or enter their details
                      below for this quotation. The details here are the
                      snapshot that appears on the document. Link an active
                      customer before issuing; an unlinked snapshot can be saved
                      as a draft.
                    </p>
                    <div className="form-grid">
                      <Field label="Quotation Number">
                        <input
                          value={q.number}
                          onChange={(e) =>
                            update((n) => {
                              n.number = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Quotation Date">
                        <input
                          type="date"
                          value={q.date}
                          onChange={(e) =>
                            update((n) => {
                              n.date = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Linked Customer">
                        <select
                          value={q.customerId}
                          onChange={(e) => {
                            const c = db.clients.find(
                              (c) => c.id === e.target.value,
                            );
                            if (c) selectCustomer(c);
                            else
                              update((n) => {
                                n.customerId = "";
                                n.projectId = "";
                              });
                          }}
                        >
                          <option value="">Unlinked customer snapshot</option>
                          {db.clients
                            .filter(
                              (c) =>
                                c.status !== "Archived" ||
                                c.id === q.customerId,
                            )
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Linked Project">
                        <select
                          value={q.projectId}
                          onChange={(e) =>
                            update((n) => {
                              n.projectId = e.target.value;
                              const p = db.projects.find(
                                (p) => p.id === e.target.value,
                              );
                              if (p) {
                                n.project = {
                                  name: p.name,
                                  location: p.location,
                                };
                                n.customerId = p.clientId;
                                const c = db.clients.find(
                                  (c) => c.id === p.clientId,
                                );
                                if (c) {
                                  n.customer = {
                                    name: c.name,
                                    contact: c.contact,
                                    address: c.address || "",
                                    email: c.email || "",
                                    phone: c.phone || "",
                                  };
                                  n.introduction.attention = "Dear: " + c.name;
                                }
                              }
                            })
                          }
                        >
                          <option value="">Unlinked project snapshot</option>
                          {db.projects
                            .filter(
                              (p) =>
                                !q.customerId || p.clientId === q.customerId,
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => setAddCustomer(true)}
                        >
                          + Add Customer
                        </button>
                        <button
                          type="button"
                          disabled={!q.customerId}
                          onClick={() => setAddProject(true)}
                        >
                          + Create Project
                        </button>
                      </div>
                      {Object.entries(q.customer)
                        .filter(([key]) => key === "name")
                        .map(([key, value]) => (
                          <Field
                            key={key}
                            label={
                              {
                                name: "Customer",
                                contact: "Contact Person",
                                address: "Customer Address",
                                email: "Customer Email",
                                phone: "Customer Phone",
                              }[key] || key
                            }
                          >
                            <input
                              value={value}
                              onChange={(e) =>
                                update((n) => {
                                  n.customer[
                                    key as keyof Quotation["customer"]
                                  ] = e.target.value;
                                })
                              }
                            />
                          </Field>
                        ))}
                      <Field label="Job / Project Name">
                        <input
                          value={q.project.name}
                          onChange={(e) =>
                            update((n) => {
                              n.project.name = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Project Location">
                        <input
                          value={q.project.location}
                          onChange={(e) =>
                            update((n) => {
                              n.project.location = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Salesperson / Prepared By">
                        <input
                          value={q.preparedBy}
                          onChange={(e) =>
                            update((n) => {
                              n.preparedBy = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Validity">
                        <input
                          value={q.validity}
                          onChange={(e) =>
                            update((n) => {
                              n.validity = e.target.value;
                            })
                          }
                        />
                      </Field>
                    </div>
                  </section>
                  <details className="panel quotation-advanced">
                    <summary>Customer contact & address</summary>
                    <div className="form-grid">
                      {" "}
                      {Object.entries(q.customer)
                        .filter(([key]) => key !== "name")
                        .map(([key, value]) => (
                          <Field
                            key={key}
                            label={
                              {
                                name: "Customer",
                                contact: "Contact Person",
                                address: "Customer Address",
                                email: "Customer Email",
                                phone: "Customer Phone",
                              }[key] || key
                            }
                          >
                            <input
                              value={value}
                              onChange={(e) =>
                                update((n) => {
                                  n.customer[
                                    key as keyof Quotation["customer"]
                                  ] = e.target.value;
                                })
                              }
                            />
                          </Field>
                        ))}
                    </div>
                  </details>
                  <details className="panel quotation-advanced">
                    <summary>Reference & revision details</summary>
                    <div className="form-grid">
                      {" "}
                      <Field label="Reference">
                        <input
                          value={q.reference}
                          onChange={(e) =>
                            update((n) => {
                              n.reference = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Revision Number">
                        <input type="number" value={q.revision} readOnly />
                      </Field>
                      <Field label="Revision Date">
                        <input
                          type="date"
                          value={q.revisionDetails.date}
                          onChange={(e) =>
                            update((n) => {
                              n.revisionDetails.date = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Revision Notes">
                        <textarea
                          value={q.revisionDetails.notes}
                          onChange={(e) =>
                            update((n) => {
                              n.revisionDetails.notes = e.target.value;
                            })
                          }
                        />
                      </Field>
                    </div>
                  </details>
                  <details className="panel">
                    <summary>
                      Introduction / Cover Content & Company Details
                    </summary>
                    <div className="form-grid">
                      {Object.entries(q.introduction).map(([key, value]) => (
                        <Field
                          key={key}
                          label={
                            {
                              attention: "Dear / Attention line",
                              opening: "Opening paragraph",
                              proposal: "Project costing proposal paragraph",
                              quality:
                                "Quality / safety / professionalism paragraph",
                              clarification: "Clarification paragraph",
                              closing: "Closing / thank-you text",
                              signature: "Company signature block",
                            }[key] || key
                          }
                        >
                          <textarea
                            rows={4}
                            value={value}
                            onChange={(e) =>
                              update((n) => {
                                n.introduction[
                                  key as keyof Quotation["introduction"]
                                ] = e.target.value;
                              })
                            }
                          />
                        </Field>
                      ))}
                      {Object.entries(q.company).map(([key, value]) => (
                        <Field key={key} label={"Company " + key}>
                          <input
                            value={value}
                            onChange={(e) =>
                              update((n) => {
                                n.company[key as keyof Quotation["company"]] =
                                  e.target.value;
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                  </details>
                </>
              )}
              {activeStep === 1 && (
                <>
                  <section className="panel boq-builder">
                    <div className="between">
                      <h2>Work categories & priced items</h2>
                      <button className="primary" onClick={() => addCategory()}>
                        Add Work Category
                      </button>
                    </div>
                    <p className="muted">
                      A work category groups related work. Each priced item
                      calculates quantity × rate. A heading only groups items
                      and creates no charge.
                    </p>
                    {!q.sections.length && (
                      <Empty>
                        <strong>Your scope is ready to begin.</strong>
                        <p>
                          Add a work category (for example Painting), then add
                          the first priced item. Need a starting point? View the
                          worked example above.
                        </p>
                      </Empty>
                    )}
                    {scopeNeedle && !visibleCategories.length && (
                      <Empty>
                        No scope matches this search. Try a work name, item
                        number or area.
                      </Empty>
                    )}
                    {q.sections.map((s, si) =>
                      !matchesScope(s) ? null : (
                        <details
                          open={s.id === currentCategory}
                          key={s.id}
                          className={
                            "quote-section" +
                            (s.parentId ? " boq-subsection" : "")
                          }
                          data-testid="quote-section"
                        >
                          <summary
                            className="quotation-category-summary"
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedCategory(
                                s.id === currentCategory ? "closed" : s.id,
                              );
                              setSelectedItem(null);
                            }}
                          >
                            <span>
                              {s.number} · {s.title || "Untitled work category"}
                            </span>
                            <span>
                              {" · "}
                              {s.rows.length} item(s) ·{" "}
                              {safe(
                                () => formatMoney(sectionAmount(s), true),
                                "Check values",
                              )}
                            </span>
                          </summary>
                          {s.id === currentCategory && (
                            <>
                              <div className="boq-section-heading">
                                <span>
                                  {s.parentId ? "Subcategory" : "Work category"}{" "}
                                  {s.number}
                                </span>
                                <strong className="boq-subtotal">
                                  Category subtotal:{" "}
                                  {safe(
                                    () => formatMoney(sectionAmount(s), true),
                                    "Check line values",
                                  )}
                                </strong>
                              </div>
                              <div className="boq-section-header">
                                <div className="boq-section-fields">
                                  <Field label="Category No.">
                                    <input
                                      value={s.number}
                                      onChange={(e) =>
                                        update((n) => {
                                          n.sections[si].number =
                                            e.target.value;
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field label="Work category name">
                                    <input
                                      value={s.title}
                                      onChange={(e) =>
                                        update((n) => {
                                          n.sections[si].title = e.target.value;
                                        })
                                      }
                                    />
                                  </Field>
                                  {advanced && (
                                    <Field label="Parent category">
                                      <select
                                        value={s.parentId || ""}
                                        onChange={(e) =>
                                          update((n) => {
                                            n.sections[si].parentId =
                                              e.target.value || undefined;
                                          })
                                        }
                                      >
                                        <option value="">Top level</option>
                                        {q.sections
                                          .slice(0, si)
                                          .map((parent) => (
                                            <option
                                              key={parent.id}
                                              value={parent.id}
                                            >
                                              {parent.number} {parent.title}
                                            </option>
                                          ))}
                                      </select>
                                    </Field>
                                  )}
                                </div>
                                <div className="boq-section-controls">
                                  <Order
                                    label={"section " + s.number}
                                    index={si}
                                    length={q.sections.length}
                                    move={(d) =>
                                      update((n) => {
                                        n.sections = reorder(n.sections, si, d);
                                      })
                                    }
                                  />
                                  <details
                                    className="boq-more"
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        e.currentTarget.open = false;
                                        e.currentTarget
                                          .querySelector("summary")
                                          ?.focus();
                                      }
                                    }}
                                  >
                                    <summary
                                      aria-label={
                                        "More actions for section " + s.number
                                      }
                                    >
                                      •••
                                    </summary>
                                    <div
                                      className="boq-more-options"
                                      onClick={(e) => {
                                        if (
                                          (e.target as HTMLElement).closest(
                                            "button",
                                          )
                                        ) {
                                          const details =
                                            e.currentTarget.closest("details");
                                          if (details) details.open = false;
                                        }
                                      }}
                                    >
                                      <button
                                        onClick={() =>
                                          update((n) => {
                                            const copy = structuredClone(s);
                                            copy.id = uid();
                                            const ids = new Map(
                                              copy.rows.map((r) => [
                                                r.id,
                                                uid(),
                                              ]),
                                            );
                                            copy.rows = copy.rows.map((r) => ({
                                              ...r,
                                              id: ids.get(r.id)!,
                                              parentId: r.parentId
                                                ? ids.get(r.parentId)
                                                : undefined,
                                            }));
                                            n.sections.splice(si + 1, 0, copy);
                                          })
                                        }
                                      >
                                        Duplicate section
                                      </button>
                                      <button
                                        onClick={() =>
                                          update((n) => {
                                            n.sections.splice(si, 1);
                                            n.sections.forEach((x) => {
                                              if (x.parentId === s.id)
                                                delete x.parentId;
                                            });
                                          })
                                        }
                                      >
                                        Delete section
                                      </button>
                                    </div>
                                  </details>
                                </div>
                              </div>
                              <div className="boq-section-toolbar">
                                {advanced && (
                                  <>
                                    <button onClick={() => addCategory(si)}>
                                      <span aria-hidden="true">+ </span>Add
                                      Subcategory
                                    </button>
                                    <button
                                      className="primary boq-add-main"
                                      onClick={() => addItem(si, true)}
                                    >
                                      <span aria-hidden="true">+ </span>Add
                                      Heading (No Price)
                                    </button>
                                  </>
                                )}
                                <button
                                  className="primary"
                                  onClick={() => addItem(si)}
                                >
                                  <span aria-hidden="true">+ </span>Add Priced
                                  Item
                                </button>
                              </div>
                              {advanced && (
                                <p className="quotation-context-help">
                                  Item breakdowns are separately priced. A
                                  priced parent and its priced children all
                                  contribute to the total. Use a Heading (No
                                  Price) to group children without adding a
                                  parent charge.
                                </p>
                              )}
                              {!s.rows.length && (
                                <p className="quotation-guide-help">
                                  No items yet. Add a priced item to describe
                                  the work in this category, then enter its
                                  quantity and rate.
                                </p>
                              )}
                              {s.rows.map((r, ri) => {
                                const edit = <
                                  K extends keyof QuotationLineItem,
                                >(
                                  key: K,
                                  value: QuotationLineItem[K],
                                ) =>
                                  update((n) => {
                                    const row = n.sections[si].rows[ri];
                                    row[key] = value;
                                    if (key === "quantity" || key === "rate") {
                                      delete row.amountOverride;
                                      delete row.overrideReason;
                                    }
                                  });
                                return (
                                  <details
                                    open={
                                      selectedItem !== "closed" &&
                                      r.id ===
                                        (s.rows.find(
                                          (item) => item.id === selectedItem,
                                        )?.id ||
                                          s.rows.find(
                                            (item) =>
                                              scopeNeedle &&
                                              (
                                                item.number +
                                                " " +
                                                item.description +
                                                " " +
                                                item.location
                                              )
                                                .toLowerCase()
                                                .includes(scopeNeedle),
                                          )?.id ||
                                          s.rows[0]?.id)
                                    }
                                    className={
                                      "quote-line " +
                                      (r.pricingType === "Heading"
                                        ? "heading-line"
                                        : "") +
                                      (r.parentId
                                        ? " quotation-item-breakdown"
                                        : "")
                                    }
                                    key={r.id}
                                    data-testid="quote-line"
                                  >
                                    <summary
                                      className="quotation-item-summary"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setSelectedItem(
                                          e.currentTarget.parentElement?.hasAttribute(
                                            "open",
                                          )
                                            ? "closed"
                                            : r.id,
                                        );
                                      }}
                                    >
                                      <span>
                                        {r.number} ·{" "}
                                        {r.description ||
                                          (r.pricingType === "Heading"
                                            ? "New heading · No price"
                                            : "New priced item")}
                                      </span>
                                      <span>
                                        {" · "}
                                        {r.pricingType === "Heading"
                                          ? "No price"
                                          : safe(
                                              () => displayAmount(r),
                                              "Check values",
                                            )}
                                      </span>
                                    </summary>
                                    {r.parentId && (
                                      <p className="muted">
                                        Item breakdown of{" "}
                                        {s.rows.find(
                                          (parent) => parent.id === r.parentId,
                                        )?.number || "parent item"}
                                      </p>
                                    )}
                                    <div className="quote-line-fields">
                                      <Field label="Item No.">
                                        <input
                                          value={r.number}
                                          onChange={(e) =>
                                            edit("number", e.target.value)
                                          }
                                        />
                                      </Field>
                                      <Field label="Description">
                                        <textarea
                                          rows={Math.min(
                                            6,
                                            Math.max(
                                              2,
                                              r.description.split("\n").length,
                                            ),
                                          )}
                                          value={r.description}
                                          onChange={(e) =>
                                            edit("description", e.target.value)
                                          }
                                        />
                                      </Field>
                                      <Field label="Quantity">
                                        <input
                                          inputMode="decimal"
                                          value={r.quantity}
                                          onChange={(e) =>
                                            edit("quantity", e.target.value)
                                          }
                                          disabled={[
                                            "Heading",
                                            "Included",
                                          ].includes(r.pricingType)}
                                        />
                                      </Field>
                                      <Field label="Unit">
                                        <input
                                          list="quotation-units"
                                          value={r.unit}
                                          onChange={(e) =>
                                            edit("unit", e.target.value)
                                          }
                                          disabled={[
                                            "Heading",
                                            "Included",
                                          ].includes(r.pricingType)}
                                        />
                                      </Field>
                                      <Field label="Rate / Unit">
                                        <input
                                          inputMode="decimal"
                                          value={r.rate}
                                          onChange={(e) =>
                                            edit("rate", e.target.value)
                                          }
                                          disabled={
                                            r.pricingType !== "Normal Rate"
                                          }
                                        />
                                      </Field>
                                      <Field label="Pricing Type">
                                        <select
                                          value={r.pricingType}
                                          onChange={(e) =>
                                            edit(
                                              "pricingType",
                                              e.target
                                                .value as QuotationLineItem["pricingType"],
                                            )
                                          }
                                        >
                                          {pricingTypes.map((p) => (
                                            <option key={p}>{p}</option>
                                          ))}
                                        </select>
                                      </Field>
                                    </div>
                                    <div className="between">
                                      <output
                                        aria-label="Line amount"
                                        className="quotation-calculated"
                                      >
                                        <span className="muted">
                                          {r.pricingType === "Heading"
                                            ? "Heading · No price"
                                            : r.pricingType === "Normal Rate"
                                              ? r.amountOverride
                                                ? "Line amount · Manual override: "
                                                : "Line amount · Quantity × rate: "
                                              : "Pricing: "}
                                        </span>
                                        {safe(
                                          () => displayAmount(r),
                                          "Check quantity / rate",
                                        )}
                                      </output>
                                      <div className="actions">
                                        <Order
                                          label={"row " + r.number}
                                          index={ri}
                                          length={s.rows.length}
                                          move={(d) =>
                                            update((n) => {
                                              n.sections[si].rows = reorder(
                                                n.sections[si].rows,
                                                ri,
                                                d,
                                              );
                                            })
                                          }
                                        />
                                        {advanced && (
                                          <button
                                            onClick={() =>
                                              addItem(si, false, ri)
                                            }
                                          >
                                            Add Item Breakdown
                                          </button>
                                        )}
                                        <button
                                          onClick={() =>
                                            update((n) => {
                                              n.sections[si].rows.splice(
                                                ri + 1,
                                                0,
                                                {
                                                  ...structuredClone(r),
                                                  id: uid(),
                                                },
                                              );
                                            })
                                          }
                                        >
                                          Duplicate row
                                        </button>
                                        <button
                                          onClick={() =>
                                            update((n) => {
                                              n.sections[si].rows.splice(ri, 1);
                                              n.sections[si].rows.forEach(
                                                (x) => {
                                                  if (x.parentId === r.id)
                                                    delete x.parentId;
                                                },
                                              );
                                            })
                                          }
                                        >
                                          Delete row
                                        </button>
                                      </div>
                                    </div>
                                    <details>
                                      <summary>
                                        Area, notes & document layout
                                      </summary>
                                      <div className="form-grid">
                                        <Field label="Location / Area">
                                          <input
                                            value={r.location}
                                            onChange={(e) =>
                                              edit("location", e.target.value)
                                            }
                                          />
                                        </Field>
                                        <Field label="Notes">
                                          <textarea
                                            value={r.notes}
                                            onChange={(e) =>
                                              edit("notes", e.target.value)
                                            }
                                          />
                                        </Field>
                                        <Field label="Parent item">
                                          <select
                                            value={r.parentId || ""}
                                            onChange={(e) =>
                                              edit(
                                                "parentId",
                                                e.target.value || undefined,
                                              )
                                            }
                                          >
                                            <option value="">No parent</option>
                                            {s.rows
                                              .slice(0, ri)
                                              .map((parent) => (
                                                <option
                                                  key={parent.id}
                                                  value={parent.id}
                                                >
                                                  {parent.number}{" "}
                                                  {parent.description.slice(
                                                    0,
                                                    40,
                                                  )}
                                                </option>
                                              ))}
                                          </select>
                                        </Field>
                                        <Field label="Start on a new document page">
                                          <input
                                            type="checkbox"
                                            checked={!!r.pageBreakBefore}
                                            onChange={(e) =>
                                              edit(
                                                "pageBreakBefore",
                                                e.target.checked,
                                              )
                                            }
                                          />
                                        </Field>
                                        {r.pricingType === "Normal Rate" && (
                                          <>
                                            <Field label="Source amount override (optional)">
                                              <input
                                                inputMode="decimal"
                                                value={r.amountOverride || ""}
                                                onChange={(e) =>
                                                  edit(
                                                    "amountOverride",
                                                    e.target.value || undefined,
                                                  )
                                                }
                                              />
                                            </Field>
                                            <Field label="Override reason">
                                              <textarea
                                                value={r.overrideReason || ""}
                                                onChange={(e) =>
                                                  edit(
                                                    "overrideReason",
                                                    e.target.value,
                                                  )
                                                }
                                              />
                                            </Field>
                                          </>
                                        )}
                                      </div>
                                    </details>
                                    {r.amountOverride && (
                                      <p className="muted">
                                        Source amount override: AED{" "}
                                        {r.amountOverride}. {r.overrideReason}{" "}
                                        Changing quantity or rate clears it.
                                      </p>
                                    )}
                                  </details>
                                );
                              })}
                            </>
                          )}
                        </details>
                      ),
                    )}
                    <datalist id="quotation-units">
                      {["LS", "M2", "RM", "Nos"].map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </section>
                </>
              )}
              {activeStep === 2 && (
                <section className="panel">
                  <h2>Pricing Summary</h2>
                  <p className="muted">
                    Line amounts and category subtotals are calculated from your
                    scope. Edit quantity and rate in Scope of Work. Adjust
                    discount and VAT below; the grand total updates
                    automatically.
                  </p>
                  <div className="form-grid">
                    <Field label="Quotation discount AED">
                      <input
                        inputMode="decimal"
                        value={q.discount || "0"}
                        onChange={(e) =>
                          update((n) => {
                            n.discount = e.target.value;
                          })
                        }
                      />
                    </Field>
                    <Field label="VAT enabled">
                      <input
                        type="checkbox"
                        checked={q.vatEnabled}
                        onChange={(e) =>
                          update((n) => {
                            n.vatEnabled = e.target.checked;
                          })
                        }
                      />
                    </Field>
                    <Field label="VAT percentage">
                      <input
                        inputMode="decimal"
                        value={q.vatPercentage}
                        onChange={(e) =>
                          update((n) => {
                            n.vatPercentage = e.target.value;
                          })
                        }
                      />
                    </Field>
                  </div>
                  <p>
                    Calculated amount in words:{" "}
                    {t ? amountInWords(t.grand) : "Check financial values"}
                  </p>
                  <details className="quotation-advanced">
                    <summary>
                      Amount in words override
                      {q.amountWordsOverride ? " · Active" : ""}
                    </summary>
                    <p className="muted">
                      Optional wording for the document. This preserves an
                      existing wording override without changing any calculated
                      amount. Leave blank to use the calculated words.
                    </p>
                    <Field label="Amount in Words — manual override">
                      <textarea
                        value={q.amountWordsOverride}
                        placeholder={t ? amountInWords(t.grand) : ""}
                        onChange={(e) =>
                          update((n) => {
                            n.amountWordsOverride = e.target.value;
                          })
                        }
                      />
                    </Field>
                  </details>
                  <h3>Summary of Cost</h3>
                  {q.sections.map((s) => (
                    <details
                      className="quotation-advanced quotation-pricing-category"
                      key={s.id}
                    >
                      <summary>
                        <span>
                          {s.number.replace(/\.00$/, "")} · {s.title}
                        </span>
                        {" · "}
                        <strong>
                          {safe(
                            () => formatMoney(sectionAmount(s), true),
                            "Check values",
                          )}
                        </strong>
                      </summary>
                      <div className="quotation-advanced__body">
                        <a href={"#/quotations/" + q.id + "/scope"}>
                          {locked
                            ? "View scope details"
                            : "Edit scope quantities and rates"}
                        </a>
                        {s.rows.map((r) => (
                          <div
                            className="quotation-summary-line quotation-pricing-item"
                            key={r.id}
                          >
                            <div>
                              <strong>
                                {r.number} · {r.description || "Untitled item"}
                              </strong>
                              <p className="muted">
                                {r.pricingType === "Normal Rate"
                                  ? "Quantity × unit rate: " +
                                    r.quantity +
                                    " " +
                                    r.unit +
                                    " × AED " +
                                    r.rate
                                  : r.pricingType === "Heading"
                                    ? "Heading · No price"
                                    : r.pricingType +
                                      (r.quantity
                                        ? " · " + r.quantity + " " + r.unit
                                        : "")}
                              </p>
                              {r.amountOverride && (
                                <p className="muted">
                                  Manual line amount override: AED{" "}
                                  {r.amountOverride}. {r.overrideReason}
                                </p>
                              )}
                            </div>
                            <output
                              aria-label={"Line amount for item " + r.number}
                            >
                              {r.pricingType === "Heading"
                                ? "No price"
                                : safe(
                                    () => displayAmount(r),
                                    "Check quantity / rate",
                                  )}
                            </output>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                  <div className="quote-totals quotation-calculated-grid">
                    {t &&
                      [
                        ["Subtotal", t.subtotal],
                        ["Discount", safe(() => discountAmount(q), 0n)],
                        ["VAT", t.vat],
                        ["Grand Total", t.grand],
                      ].map(([label, value]) => (
                        <div
                          className={
                            label === "Grand Total"
                              ? "quotation-calculated-value quotation-calculated-value--total"
                              : "quotation-calculated-value"
                          }
                          key={String(label)}
                        >
                          <span>{String(label)}</span>
                          <strong
                            className="quotation-calculated-value__amount"
                            data-testid={
                              label === "Grand Total"
                                ? "grand-total"
                                : undefined
                            }
                          >
                            {formatMoney(value as bigint, true)}
                          </strong>
                        </div>
                      ))}
                  </div>
                  {!t && (
                    <p role="alert" className="error">
                      Check the scope amounts, discount and VAT to calculate a
                      valid total.
                    </p>
                  )}
                </section>
              )}
              {activeStep === 3 && (
                <>
                  <section className="panel">
                    <h2>Payment Schedule</h2>
                    <p className="quotation-guide-help">
                      Payment milestones divide the quotation grand total
                      {t ? " of " + formatMoney(t.grand, true) : ""}; they do
                      not add to the price. Describe when each portion is due
                      and make the percentages total 100%.
                    </p>
                    <p className="muted">
                      Changing a percentage recalculates that milestone and
                      clears its manual amount override. An override changes the
                      payment allocation only.
                    </p>
                    {t &&
                      safe(
                        () =>
                          q.payments.reduce(
                            (sum, p) => sum + paymentAmount(p, t.grand),
                            0n,
                          ) !== t.grand,
                        false,
                      ) && (
                        <p className="muted">
                          Payment amounts differ from the Grand Total because of
                          rounding or manual overrides. The reference schedule
                          is preserved as supplied.
                        </p>
                      )}

                    {safe(
                      () => paymentPercentage(q) === 100000000n,
                      false,
                    ) ? null : (
                      <p role="alert" className="error">
                        Payment percentages must total 100%.
                      </p>
                    )}
                    {q.payments.map((p, i) => (
                      <div className="quote-line" key={p.id}>
                        <div className="form-grid">
                          <Field label="Term number">
                            <input
                              value={p.number}
                              onChange={(e) =>
                                update((n) => {
                                  n.payments[i].number = e.target.value;
                                })
                              }
                            />
                          </Field>
                          <Field label="Payment description">
                            <textarea
                              value={p.description}
                              onChange={(e) =>
                                update((n) => {
                                  n.payments[i].description = e.target.value;
                                })
                              }
                            />
                          </Field>
                          <Field label="Payment percentage">
                            <input
                              inputMode="decimal"
                              value={p.percentage}
                              onChange={(e) =>
                                update((n) => {
                                  n.payments[i].percentage = e.target.value;
                                  delete n.payments[i].amountOverride;
                                })
                              }
                            />
                          </Field>
                          <Field label="Payment amount override">
                            <input
                              inputMode="decimal"
                              value={p.amountOverride || ""}
                              onChange={(e) =>
                                update((n) => {
                                  n.payments[i].amountOverride =
                                    e.target.value || undefined;
                                })
                              }
                            />
                          </Field>
                          <Field label="Due condition / Notes">
                            <textarea
                              value={p.notes}
                              onChange={(e) =>
                                update((n) => {
                                  n.payments[i].notes = e.target.value;
                                })
                              }
                            />
                          </Field>
                        </div>
                        <div className="between">
                          <strong>
                            {t
                              ? safe(
                                  () =>
                                    formatMoney(
                                      paymentAmount(p, t.grand),
                                      true,
                                    ),
                                  "Check percentage",
                                )
                              : "Check values"}
                          </strong>
                          <div className="actions">
                            <Order
                              label={"payment " + p.number}
                              index={i}
                              length={q.payments.length}
                              move={(d) =>
                                update((n) => {
                                  n.payments = reorder(n.payments, i, d);
                                })
                              }
                            />
                            <button
                              onClick={() =>
                                update((n) => {
                                  n.payments.splice(i, 1);
                                })
                              }
                            >
                              Delete payment term
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        update((n) => {
                          n.payments.push({
                            id: uid(),
                            number: String(n.payments.length + 1),
                            description: "",
                            percentage: "0",
                            notes: "",
                          });
                        })
                      }
                    >
                      Add payment milestone
                    </button>
                  </section>
                  <section className="panel">
                    <div className="between">
                      <h2>Terms & Conditions</h2>
                      <button
                        onClick={() =>
                          confirm(
                            "Replace terms with the default template?",
                            () =>
                              update((n) => {
                                n.terms = defaultTerms();
                              }),
                          )
                        }
                      >
                        Default template
                      </button>
                    </div>
                    {q.terms.map((term, i) => (
                      <details
                        key={term.id}
                        className="quote-line quotation-advanced"
                      >
                        <summary>
                          Term {term.number} ·{" "}
                          {term.text.slice(0, 100) || "New term"}
                          {term.text.length > 100 ? "…" : ""}
                        </summary>
                        <div className="form-grid">
                          <Field label="Term No.">
                            <input
                              value={term.number}
                              onChange={(e) =>
                                update((n) => {
                                  n.terms[i].number = e.target.value;
                                })
                              }
                            />
                          </Field>
                          <Field label="Term text">
                            <textarea
                              rows={Math.min(
                                8,
                                Math.max(2, Math.ceil(term.text.length / 90)),
                              )}
                              value={term.text}
                              onChange={(e) =>
                                update((n) => {
                                  n.terms[i].text = e.target.value;
                                })
                              }
                            />
                          </Field>
                          <Field label="Start term on new page">
                            <input
                              type="checkbox"
                              checked={!!term.pageBreakBefore}
                              onChange={(e) =>
                                update((n) => {
                                  n.terms[i].pageBreakBefore = e.target.checked;
                                })
                              }
                            />
                          </Field>
                        </div>
                        <div className="actions">
                          <Order
                            label={"term " + term.number}
                            index={i}
                            length={q.terms.length}
                            move={(d) =>
                              update((n) => {
                                n.terms = reorder(n.terms, i, d);
                              })
                            }
                          />
                          <button
                            onClick={() =>
                              update((n) => {
                                n.terms.splice(i, 1);
                              })
                            }
                          >
                            Delete term
                          </button>
                        </div>
                      </details>
                    ))}
                    <button
                      onClick={() =>
                        update((n) => {
                          n.terms.push({
                            id: uid(),
                            number: String(n.terms.length + 1),
                            text: "",
                          });
                        })
                      }
                    >
                      Add term
                    </button>
                  </section>
                </>
              )}
            </fieldset>
          </>
        )}
        {errors.length > 0 && (
          <details className="panel" open={activeStep === 4}>
            <summary>
              Before finalizing: {errors.length} validation issue(s)
            </summary>
            <p className="muted">
              Drafts can be saved and edited with incomplete details. Resolve
              these issues before issuing.
            </p>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="quotation-step-actions">
          {activeStep > 0 && (
            <button onClick={() => goToStep(activeStep - 1)}>Back</button>
          )}
          {activeStep < 4 && (
            <button
              className="primary"
              onClick={() => goToStep(activeStep + 1)}
            >
              Continue
            </button>
          )}
        </div>
      </QuotationGuide>
      {showExample && (
        <Modal
          title="Worked example · Fictional painting scope"
          onClose={() => setShowExample(false)}
        >
          <p>
            This example is fictional. Viewing it does not change your
            quotation.
          </p>
          <dl className="quote-list-details">
            <div>
              <dt>Work category</dt>
              <dd>Painting</dd>
            </div>
            <div>
              <dt>Priced item</dt>
              <dd>Prepare and paint living-room walls</dd>
            </div>
            <div>
              <dt>Quantity × rate</dt>
              <dd>40 M2 × AED 35.00 = AED 1,400.00</dd>
            </div>
            <div>
              <dt>Discount / VAT / grand total</dt>
              <dd>AED 0.00 / AED 70.00 (5%) / AED 1,470.00</dd>
            </div>
            <div>
              <dt>Payment allocation</dt>
              <dd>
                50% advance = AED 735.00; 45% progress = AED 661.50; 5% handover
                = AED 73.50. Together they divide AED 1,470.00.
              </dd>
            </div>
          </dl>
          <p>
            For a longer scope, add a subcategory (for example Internal
            finishes), a heading without a price, or an item breakdown using
            advanced controls. Each normally priced breakdown is charged
            separately.
          </p>
          <button
            disabled={locked}
            className="primary"
            onClick={() => {
              const categoryId = uid();
              const item = {
                ...blankLine(),
                description:
                  "Prepare and paint living-room walls · Fictional example",
                quantity: "40",
                unit: "M2",
                rate: "35",
              };
              if (
                update((n) => {
                  const number = String(n.sections.length + 1);
                  n.sections.push({
                    id: categoryId,
                    number,
                    title: "Painting · Fictional example",
                    rows: [{ ...item, number: number + ".1" }],
                  });
                })
              ) {
                setScopeSearch("");
                setSelectedCategory(categoryId);
                setSelectedItem(item.id);
                setShowExample(false);
              }
            }}
          >
            Add example as a new work category
          </button>
          <button onClick={() => setShowExample(false)}>Close example</button>
          <p className="muted">
            Adding the example appends one category. Existing customers, scope,
            pricing settings and terms are preserved.
          </p>
        </Modal>
      )}
      <details className="panel">
        <summary>Quotation History & Revisions</summary>
        <div className="stack">
          {db.quotations
            .filter((x) => x.familyId === q.familyId)
            .sort((a, b) => a.revision - b.revision)
            .map((x) => (
              <a key={x.id} href={"#/quotations/" + x.id + "/edit"}>
                {x.number} Rev {x.revision} · {x.status} ·{" "}
                {x.revisionDetails.date} · {x.revisionDetails.notes}
              </a>
            ))}
          {q.history.map((h, i) => (
            <p key={i}>
              {h.action} ·{" "}
              {new Date(h.date).toLocaleString("en-GB", {
                timeZone: "Asia/Dubai",
              })}
              <br />
              {h.notes}
              {h.snapshot && (
                <button
                  onClick={() =>
                    void download(JSON.parse(h.snapshot!) as Quotation)
                  }
                >
                  Download issued snapshot PDF
                </button>
              )}
            </p>
          ))}
        </div>
      </details>
      {confirmations}
    </div>
  );
}
