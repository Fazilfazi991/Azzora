import { activeApprovals, approvalView } from "../workforce/document-approvals";
import { useState } from "react";
import { useStore } from "../store";
import { Field, Empty, Badge, Header } from "../components/ui";
import { DataTable } from "../commercial/Registers";
import { decideApproval, reassignApproval } from "./repository";
import type { PricedItem } from "./model";
import { uid } from "../domain/logic";
import { price } from "./calculations";
import { aed } from "../commercial/calculations";
export function useActors() {
  const { db } = useStore();
  const initial = db.people.find((p) => p.status !== "Inactive")?.id || "";
  const [actor, setActor] = useState(initial),
    [approver, setApprover] = useState(initial);
  return { actor, setActor, approver, setApprover };
}
export function ActorFields({
  actors,
}: {
  actors: ReturnType<typeof useActors>;
}) {
  const { db } = useStore();
  return (
    <div className="panel">
      <p className="muted">
        Demo approval actors — recorded identities only; no authentication or
        secure role enforcement.
      </p>
      <div className="form-grid">
        <Field label="Demo actor">
          <select
            value={actors.actor}
            onChange={(e) => actors.setActor(e.target.value)}
          >
            {db.people
              .filter((p) => p.status !== "Inactive")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.demoRole || p.role}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Assigned demo approver">
          <select
            value={actors.approver}
            onChange={(e) => actors.setApprover(e.target.value)}
          >
            {db.people
              .filter((p) => p.status !== "Inactive")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.demoRole || p.role}
                </option>
              ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
export function Decision({
  entityId,
  actor,
}: {
  entityId: string;
  actor: string;
}) {
  const { db, mutate } = useStore();
  const [comments, setComments] = useState("");
  const a = activeApprovals(db).find(
    (a) => a.entityId === entityId && a.status === "Pending Approval",
  );
  if (!a) return null;
  return (
    <div className="approval-decision">
      <small>
        {a.stage} · Assigned:{" "}
        {db.people.find((p) => p.id === a.approverId)?.name} · {a.submittedAt}
      </small>
      <Field label="Decision comments">
        <input value={comments} onChange={(e) => setComments(e.target.value)} />
      </Field>
      <div className="actions">
        <button
          disabled={!comments.trim()}
          onClick={() =>
            mutate((d) => {
              decideApproval(d, a.id, true, comments, actor);
            }, "Approval recorded")
          }
        >
          Approve
        </button>
        <button
          disabled={!comments.trim()}
          onClick={() =>
            mutate((d) => {
              decideApproval(d, a.id, false, comments, actor);
            }, "Rejection recorded")
          }
        >
          Reject / Revise
        </button>
        {a.approverId !== actor && (
          <button
            disabled={!comments.trim()}
            onClick={() =>
              mutate(
                (d) => reassignApproval(d, a.id, actor, comments, actor),
                "Demo approver reassigned",
              )
            }
          >
            Assign this demo actor
          </button>
        )}
      </div>
    </div>
  );
}
export function History({ id }: { id: string }) {
  const { db } = useStore();
  return (
    <details className="panel">
      <summary>History</summary>
      {db.activities
        .filter((a) => a.entityId === id)
        .map((a) => (
          <div key={a.id} className="history-entry">
            <strong>{a.action}</strong>
            <p>{a.summary}</p>
            <small>
              {a.timestamp} ·{" "}
              {db.people.find((p) => p.id === a.actorId)?.name || a.actorId}
            </small>
            {a.previous && (
              <details>
                <summary>Preserved snapshot</summary>
                <pre className="audit-json">{a.previous}</pre>
              </details>
            )}
          </div>
        ))}
    </details>
  );
}
export const newItem = (tax: PricedItem["tax"] = "Exclusive"): PricedItem => ({
  id: uid(),
  description: "",
  quantity: "1",
  unit: "LS",
  rate: "0",
  tax,
});
export function ItemEditor({
  items,
  onChange,
  lockedScope = false,
}: {
  items: PricedItem[];
  onChange: (items: PricedItem[]) => void;
  lockedScope?: boolean;
}) {
  return (
    <>
      <h3>Priced items</h3>
      {items.map((i, index) => (
        <div className="panel invoice-line" key={i.id}>
          <div className="form-grid">
            {(["description", "quantity", "unit", "rate"] as const).map((k) => (
              <Field key={k} label={`Line ${index + 1} ${k}`}>
                <input
                  required
                  inputMode={
                    k === "quantity" || k === "rate" ? "decimal" : undefined
                  }
                  readOnly={lockedScope && k !== "rate"}
                  value={i[k]}
                  onChange={(e) =>
                    onChange(
                      items.map((x) =>
                        x.id === i.id ? { ...x, [k]: e.target.value } : x,
                      ),
                    )
                  }
                />
              </Field>
            ))}
            <Field label={`Line ${index + 1} tax treatment`}>
              <select
                value={i.tax}
                onChange={(e) =>
                  onChange(
                    items.map((x) =>
                      x.id === i.id
                        ? { ...x, tax: e.target.value as PricedItem["tax"] }
                        : x,
                    ),
                  )
                }
              >
                {["Exclusive", "Inclusive", "Zero Rated", "Exempt"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          {!lockedScope && (
            <button
              type="button"
              disabled={items.length === 1}
              onClick={() => onChange(items.filter((x) => x.id !== i.id))}
            >
              Remove line
            </button>
          )}
        </div>
      ))}
      {!lockedScope && (
        <button type="button" onClick={() => onChange([...items, newItem()])}>
          Add priced line
        </button>
      )}
    </>
  );
}
export function PriceSummary({
  items,
  vat,
  discount = "0",
}: {
  items: PricedItem[];
  vat: string;
  discount?: string;
}) {
  try {
    const t = price(items, vat, discount);
    return (
      <p className="notice">
        Net {aed(t.net)} · VAT {aed(t.vat)} · Total {aed(t.grand)}
      </p>
    );
  } catch {
    return <p className="error">Enter valid non-negative decimal values.</p>;
  }
}
export function Approvals({ projectId }: { projectId?: string }) {
  const { db } = useStore(),
    actors = useActors();
  const [state, setState] = useState("Pending Approval");
  const list = approvalView(db).filter(
    (a) =>
      (!projectId || a.projectId === projectId) &&
      (!state || (!a.supersededBy && a.status === state)),
  );
  return (
    <>
      <Header
        eyebrow="Demo governance"
        title="Approvals"
        description="Submitted snapshots, assigned reviewers and recorded decisions."
      />
      <ActorFields actors={actors} />
      <Field label="Approval state">
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All decisions</option>
          <option>Pending Approval</option>
          <option>Approved</option>
          <option>Rejected</option>
        </select>
      </Field>
      <DataTable
        headers={[
          "Record",
          "Stage",
          "Requester",
          "Approver",
          "Submitted",
          "Decision",
        ]}
        rows={list.map((a) => [
          <a
            href={
              a.kind === "Variation"
                ? `#/variations/${a.entityId}`
                : a.kind === "Credit Note"
                  ? `#/accounts/credit-notes/${a.entityId}`
                  : a.kind === "Document"
                    ? `#/projects/${a.projectId}/documents`
                    : "#/procurement"
            }
          >
            {a.kind}
            <small>{a.entityId.slice(0, 8)}</small>
          </a>,
          a.stage,
          db.people.find((p) => p.id === a.requesterId)?.name,
          db.people.find((p) => p.id === a.approverId)?.name,
          a.submittedAt,
          <Badge>{a.supersededBy ? "Superseded review" : a.status}</Badge>,
        ])}
      />
      {list
        .filter((a) => !a.supersededBy && a.status === "Pending Approval")
        .map((a) => (
          <section className="panel" key={a.id}>
            <h3>
              {a.kind} · {a.stage}
            </h3>
            <Decision entityId={a.entityId} actor={actors.actor} />
          </section>
        ))}
      {!list.length && <Empty>No approvals match.</Empty>}
    </>
  );
}
