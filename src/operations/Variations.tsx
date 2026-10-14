import { useState } from "react";
import { useStore } from "../store";
import { Header, Field, Modal, Badge, Empty } from "../components/ui";
import { Attachments } from "../components/uploads";
import { DataTable } from "../commercial/Registers";
import { aed } from "../commercial/calculations";
import { today, uid } from "../domain/logic";
import type { Variation } from "./model";
import { getOperations } from "./migration";
import {
  saveVariation,
  submitApproval,
  reviseVariation,
  generateVariationInvoice,
} from "./repository";
import { variationTotals, projectCosts } from "./calculations";
import {
  ActorFields,
  useActors,
  Decision,
  History,
  ItemEditor,
  newItem,
  PriceSummary,
} from "./Controls";
export function Variations({
  projectId = "",
  id,
  startNew = false,
}: {
  projectId?: string;
  id?: string;
  startNew?: boolean;
}) {
  const { db, mutate } = useStore(),
    op = getOperations(db),
    actors = useActors();
  const [filter, setFilter] = useState(projectId),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState<Variation | null>(() =>
      startNew ? blank() : null,
    ),
    [revision, setRevision] = useState("");
  function blank(): Variation {
    const c = db.contracts.find((c) => !projectId || c.projectId === projectId);
    const q = c ? JSON.parse(c.quotationSnapshot) : null;
    return {
      id: uid(),
      familyId: uid(),
      revision: 0,
      number: "",
      projectId: c?.projectId || "",
      customerId: c?.customerId || "",
      contractId: c?.id || "",
      title: "",
      description: "",
      reason: "",
      requesterId: actors.actor,
      date: today(),
      direction: "Addition",
      items: [newItem()],
      discount: "0",
      vatPercentage: q?.vatEnabled ? q.vatPercentage : "0",
      notes: "",
      attachments: [],
      status: "Draft",
    };
  }
  const list = op.variations.filter(
    (v) =>
      (!filter || v.projectId === filter) &&
      (!id || v.id === id) &&
      [v.number, v.title]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const summary = filter ? projectCosts(db, filter) : null;
  return (
    <>
      <Header
        eyebrow="Contract change control"
        title="Variations"
        description="Separate internal and client decisions preserve approved commercial scope."
        action={
          <button className="primary" onClick={() => setDraft(blank())}>
            New Variation
          </button>
        }
      />
      <ActorFields actors={actors} />
      <div className="filters">
        <input
          aria-label="Search variations"
          placeholder="Reference or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Variation project filter"
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
      {summary && (
        <div className="panel">
          <p>
            Original contract {aed(summary.originalContract)} · Approved
            additions{" "}
            {aed(
              op.variations
                .filter(
                  (v) =>
                    v.projectId === filter &&
                    v.status === "Approved" &&
                    BigInt(v.net!) > 0n,
                )
                .reduce((s, v) => s + BigInt(v.net!), 0n),
            )}{" "}
            · Approved deductions{" "}
            {aed(
              op.variations
                .filter(
                  (v) =>
                    v.projectId === filter &&
                    v.status === "Approved" &&
                    BigInt(v.net!) < 0n,
                )
                .reduce((s, v) => s + BigInt(v.net!), 0n),
            )}
          </p>
          <strong>
            Revised contract {aed(summary.revisedContract)} excl. VAT
          </strong>
        </div>
      )}
      <DataTable
        headers={[
          "Variation",
          "Project",
          "Type",
          "Net AED",
          "VAT AED",
          "Total AED",
          "Status",
        ]}
        rows={list.map((v) => {
          const t = variationTotals(v);
          return [
            <a href={`#/variations/${v.id}`}>
              {v.number} Rev {v.revision}
              <small>{v.title}</small>
            </a>,
            db.projects.find((p) => p.id === v.projectId)?.code,
            v.direction,
            aed(t.net),
            aed(t.vat),
            aed(t.grand),
            <Badge>{v.status}</Badge>,
          ];
        })}
      />
      {list.map((v) => (
        <section className="panel" key={v.id}>
          <h3>
            {v.number} · {v.title}
          </h3>
          <p>
            {v.description} · {v.reason}
          </p>
          <small>
            Requested: {db.people.find((p) => p.id === v.requesterId)?.name} ·{" "}
            {v.date} · Approved: {v.approvedAt || "Pending"}
          </small>
          <p className="preserve-lines">{v.notes}</p>
          <div className="actions">
            {v.status === "Draft" && (
              <>
                <button onClick={() => setDraft(structuredClone(v))}>
                  Edit Variation
                </button>
                <button
                  onClick={() =>
                    mutate((d) => {
                      submitApproval(
                        d,
                        "Variation",
                        v.id,
                        "Internal",
                        actors.actor,
                        actors.approver,
                      );
                    })
                  }
                >
                  Submit Variation
                </button>
              </>
            )}
            {v.status === "Internally Approved" && (
              <button
                onClick={() =>
                  mutate((d) => {
                    submitApproval(
                      d,
                      "Variation",
                      v.id,
                      "Client",
                      actors.actor,
                      actors.approver,
                    );
                  })
                }
              >
                Send to Client
              </button>
            )}
            {v.status === "Approved" &&
              (BigInt(v.gross!) > 0n ? (
                <button
                  onClick={() => {
                    let next = "";
                    if (
                      mutate((d) => {
                        next = generateVariationInvoice(d, v.id).id;
                      })
                    )
                      location.hash = `/accounts/invoices/${next}`;
                  }}
                >
                  Generate Variation Invoice
                </button>
              ) : (
                <a className="button" href="#/accounts/credit-notes">
                  Credit approved deduction →
                </a>
              ))}
            {!["Draft", "Approved", "Revised"].includes(v.status) && (
              <button onClick={() => setRevision(v.id)}>
                Request Revision
              </button>
            )}
          </div>
          <Decision entityId={v.id} actor={actors.actor} />
          {v.attachments.map((a) => (
            <p key={a.id}>
              <a href={a.dataUrl} download={a.name}>
                {a.name}
              </a>
            </p>
          ))}
          <History id={v.id} />
        </section>
      ))}
      {!list.length && (
        <Empty>
          No variations yet. A project needs an accepted contract before a
          variation can be created.
        </Empty>
      )}
      {draft && (
        <Modal title="Variation Draft" onClose={() => setDraft(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                mutate((d) => {
                  saveVariation(d, draft, actors.actor);
                })
              )
                setDraft(null);
            }}
          >
            <div className="form-grid">
              <Field label="Variation contract">
                <select
                  required
                  value={draft.contractId}
                  onChange={(e) => {
                    const c = db.contracts.find((c) => c.id === e.target.value);
                    if (c) {
                      const q = JSON.parse(c.quotationSnapshot);
                      setDraft({
                        ...draft,
                        contractId: c.id,
                        projectId: c.projectId,
                        customerId: c.customerId,
                        vatPercentage: q.vatEnabled ? q.vatPercentage : "0",
                      });
                    }
                  }}
                >
                  <option value="">Select accepted contract…</option>
                  {db.contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {db.projects.find((p) => p.id === c.projectId)?.name} ·{" "}
                      {
                        db.quotations.find((q) => q.id === c.quotationId)
                          ?.number
                      }
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Variation title">
                <input
                  required
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <Field label="Variation direction">
                <select
                  value={draft.direction}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      direction: e.target.value as Variation["direction"],
                    })
                  }
                >
                  <option>Addition</option>
                  <option>Deduction</option>
                </select>
              </Field>
              <Field label="Request date">
                <input
                  required
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
              <Field label="Requested by">
                <select
                  value={draft.requesterId}
                  onChange={(e) =>
                    setDraft({ ...draft, requesterId: e.target.value })
                  }
                >
                  {db.people
                    .filter((p) => p.status !== "Inactive")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Variation discount AED">
                <input
                  inputMode="decimal"
                  value={draft.discount}
                  onChange={(e) =>
                    setDraft({ ...draft, discount: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Variation description">
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <Field label="Reason for variation">
              <textarea
                required
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </Field>
            <ItemEditor
              items={draft.items}
              onChange={(items) => setDraft({ ...draft, items })}
            />
            <p className="muted">
              Contract VAT rate {draft.vatPercentage}% · Deductions use positive
              row amounts and the Deduction direction.
            </p>
            <PriceSummary
              items={draft.items}
              vat={draft.vatPercentage}
              discount={draft.discount}
            />
            <Field label="Variation notes">
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
            <Attachments
              files={draft.attachments}
              onChange={(attachments) => setDraft({ ...draft, attachments })}
            />
            <button className="primary">Save Variation</button>
          </form>
        </Modal>
      )}
      {revision && (
        <Modal
          title="Request Variation Revision"
          onClose={() => setRevision("")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              if (
                mutate((d) => {
                  reviseVariation(
                    d,
                    revision,
                    String(data.get("reason")),
                    actors.actor,
                  );
                })
              )
                setRevision("");
            }}
          >
            <Field label="Revision request reason">
              <input required name="reason" />
            </Field>
            <button className="primary">Create Variation Revision</button>
          </form>
        </Modal>
      )}
    </>
  );
}
