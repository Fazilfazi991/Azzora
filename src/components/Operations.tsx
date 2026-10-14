import { lazy, Suspense, useState } from "react";
import { useStore } from "../store";
import type { SiteUpdate, Snag, SnagStatus } from "../domain/model";
import { priorities, snagStatuses } from "../domain/model";
import { uid, today, addDays, dateLabel } from "../domain/logic";
import {
  reviewSiteUpdate,
  saveSiteUpdate,
  saveSnag,
} from "../workforce/commands";
import { ActorField, History, WorkflowError } from "../workforce/ui";
import "../workforce/workforce.css";
import { Modal, Header, Field, Badge, Empty, personName } from "./ui";
import { Attachments } from "./uploads";
function ProjectSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { db } = useStore();
  return (
    <Field label="Project">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {db.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} · {p.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function SiteUpdates({ projectId }: { projectId?: string }) {
  const { db, mutate } = useStore();
  const [filter, setFilter] = useState(projectId || "");
  const [draft, setDraft] = useState<SiteUpdate | null>(null);
  const [actor, setActor] = useState("");
  const [review, setReview] = useState<SiteUpdate | null>(null);
  const [reason, setReason] = useState("");
  function create() {
    setActor("");
    setDraft({
      id: uid(),
      projectId: filter || db.projects[0].id,
      date: today(),
      completed: "",
      inProgress: "",
      issue: "",
      tomorrow: "",
      manpower: 0,
      notes: "",
      authorId: "person-0",
      photos: [],
    });
  }
  const list = db.updates
    .filter((u) => !filter || u.projectId === filter)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <Header
        title="Site Updates"
        description="Daily site records, progress photography and field issues."
        action={
          <button className="primary" onClick={create}>
            + Post Site Update
          </button>
        }
      />
      {!projectId && (
        <div className="filters">
          <select
            aria-label="Site updates project"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All projects</option>
            {db.projects.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="feed">
        {list.map((u) => (
          <article className="panel" key={u.id}>
            <div className="between">
              <h3>{db.projects.find((p) => p.id === u.projectId)?.name}</h3>
              <Badge>{dateLabel(u.date)}</Badge>
            </div>
            <small>
              {personName(db, u.authorId)} · {u.manpower} personnel
            </small>
            <div className="detail-grid">
              <div>
                <small>Work completed</small>
                <p>{u.completed}</p>
              </div>
              <div>
                <small>Work in progress</small>
                <p>{u.inProgress || "None recorded"}</p>
              </div>
              <div>
                <small>Tomorrow’s plan</small>
                <p>{u.tomorrow || "None recorded"}</p>
              </div>
              <div>
                <small>Issues / delays</small>
                <p className={u.issue ? "error" : ""}>
                  {u.issue || "None reported"}
                </p>
              </div>
            </div>
            <p>{u.notes}</p>
            <Badge>{u.reviewStatus || "Pending"}</Badge>
            <div className="workflow-actions">
              <button
                onClick={() => {
                  setReview(u);
                  setActor("");
                  setReason("");
                }}
              >
                Supervisory review / history
              </button>
              {u.reviewStatus === "Changes Requested" && (
                <button
                  onClick={() => {
                    setDraft(structuredClone(u));
                    setActor("");
                  }}
                >
                  Correct & resubmit
                </button>
              )}
            </div>
            <div className="photo-grid">
              {u.photos.map((f) => (
                <figure key={f.id}>
                  <img src={f.dataUrl} alt={f.name} />
                  <figcaption>
                    {f.category} · {f.name}
                  </figcaption>
                </figure>
              ))}
            </div>
            {!u.photos.length && (
              <p className="muted">No photos attached to this demo record.</p>
            )}
          </article>
        ))}
      </div>
      {!list.length && <Empty>No site updates yet.</Empty>}
      {review && (
        <Modal
          drawer
          title="Supervisory Site Review"
          onClose={() => setReview(null)}
        >
          <p>{review.completed}</p>
          <p>{review.issue || "No issues reported"}</p>
          <Badge>{review.reviewStatus || "Pending"}</Badge>
          {(!review.reviewStatus || review.reviewStatus === "Pending") && (
            <>
              <ActorField
                label="Demo supervisor"
                value={actor}
                onChange={setActor}
              />
              <Field label="Supervision note / reason">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <div className="workflow-actions">
                <button
                  className="primary"
                  onClick={() => {
                    if (
                      mutate((d) =>
                        reviewSiteUpdate(
                          d,
                          review.id,
                          "Approved",
                          actor,
                          reason,
                        ),
                      )
                    )
                      setReview(null);
                  }}
                >
                  Approve Site Record
                </button>
                <button
                  onClick={() => {
                    if (
                      mutate((d) =>
                        reviewSiteUpdate(
                          d,
                          review.id,
                          "Changes Requested",
                          actor,
                          reason,
                        ),
                      )
                    )
                      setReview(null);
                  }}
                >
                  Request Site Corrections
                </button>
              </div>
            </>
          )}
          <WorkflowError />
          <History entries={review.history} />
        </Modal>
      )}

      {draft && (
        <Modal title="Daily Site Update" onClose={() => setDraft(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                mutate((d) => {
                  saveSiteUpdate(d, draft, actor);
                }, "Site update posted")
              )
                setDraft(null);
            }}
          >
            <ProjectSelect
              value={draft.projectId}
              onChange={(id) => setDraft({ ...draft, projectId: id })}
            />
            <div className="form-grid">
              <Field label="Date">
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
              <Field label="Manpower count">
                <input
                  type="number"
                  min={0}
                  required
                  value={draft.manpower}
                  onChange={(e) =>
                    setDraft({ ...draft, manpower: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            {(
              [
                ["completed", "Work completed"],
                ["inProgress", "Work in progress"],
                ["issue", "Delay / Issue"],
                ["tomorrow", "Tomorrow’s plan"],
                ["notes", "Notes"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <textarea
                  required={key === "completed"}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
            <Attachments
              photos
              files={draft.photos}
              onChange={(photos) => setDraft({ ...draft, photos })}
            />
            <ActorField
              label="Demo site author"
              value={actor}
              onChange={setActor}
            />
            <WorkflowError />
            <button className="primary">
              {db.updates.some((u) => u.id === draft.id)
                ? "Resubmit Update"
                : "Post Update"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Snags({ projectId }: { projectId?: string }) {
  const { db, mutate } = useStore();
  const [filter, setFilter] = useState(projectId || "");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<Snag | null>(null);
  const [nextStatus, setNextStatus] = useState<SnagStatus>("Open");
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const list = db.snags.filter(
    (s) =>
      (!filter || s.projectId === filter) && (!status || s.status === status),
  );
  function open(s: Snag) {
    setActor("");
    setReason("");
    setDraft(structuredClone(s));
    setNextStatus(s.status);
  }
  function create() {
    open({
      id: uid(),
      reference:
        "SN-" +
        String(
          Math.max(
            0,
            ...db.snags.map((s) => Number(s.reference.replace(/\D/g, ""))),
          ) + 1,
        ).padStart(3, "0"),
      projectId: filter || db.projects[0].id,
      area: "",
      description: "",
      assigneeId: "",
      priority: "Normal",
      createdAt: new Date().toISOString(),
      due: addDays(today(), 7),
      status: "Open",
      before: [],
      after: [],
      inspection: "",
      createdBy: "person-0",
    });
  }
  return (
    <>
      <Header
        title="Snags & Quality Assurance"
        description="Track rectification through inspection and retain the record."
        action={
          <button className="primary" onClick={create}>
            + Create Snag
          </button>
        }
      />
      <div className="filters">
        {!projectId && (
          <select
            aria-label="Snag project"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All projects</option>
            {db.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Snag status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {snagStatuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="project-grid">
        {list.map((s) => (
          <button
            className="panel snag-card"
            key={s.id}
            onClick={() => open(s)}
          >
            <div className="between">
              <small>
                {s.reference} ·{" "}
                {db.projects.find((p) => p.id === s.projectId)?.code}
              </small>
              <Badge>{s.status}</Badge>
            </div>
            <h3>{s.area}</h3>
            <p>{s.description}</p>
            <p>
              {personName(db, s.assigneeId)} · Due {dateLabel(s.due)}
            </p>
            <Badge>{s.priority}</Badge>
          </button>
        ))}
      </div>
      {!list.length && <Empty>No snags match this view.</Empty>}
      {draft && (
        <Modal
          drawer
          title={draft.reference + " · Snag record"}
          onClose={() => setDraft(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nextStatus !== "Open" && !draft.assigneeId) {
                return mutate(() => {
                  throw Error(
                    "Assign a responsible person before advancing the snag.",
                  );
                });
              }
              if (
                mutate((d) => {
                  saveSnag(d, draft, nextStatus, actor, reason);
                })
              )
                setDraft(null);
            }}
          >
            <ProjectSelect
              value={draft.projectId}
              onChange={(id) => setDraft({ ...draft, projectId: id })}
            />
            <Field label="Area / Room">
              <input
                required
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <textarea
                required
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <Field label="Responsible person">
              <select
                value={draft.assigneeId}
                onChange={(e) =>
                  setDraft({ ...draft, assigneeId: e.target.value })
                }
              >
                <option value="">Unassigned</option>
                {db.people
                  .filter(
                    (p) => p.status !== "Inactive" || p.id === draft.assigneeId,
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Priority">
                <select
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      priority: e.target.value as Snag["priority"],
                    })
                  }
                >
                  {priorities.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Target date">
                <input
                  type="date"
                  required
                  value={draft.due}
                  onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Status">
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as SnagStatus)}
              >
                {snagStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <p className="muted">
              Advance one step at a time. Closure requires inspection notes and
              a demo inspector different from the responsible person. Return
              failed inspections to Rectification.
            </p>
            <h3>Before photos</h3>
            <Attachments
              photos
              files={draft.before}
              onChange={(before) => setDraft({ ...draft, before })}
            />
            <h3>After photos</h3>
            <Attachments
              photos
              files={draft.after}
              onChange={(after) => setDraft({ ...draft, after })}
            />
            <Field label="Inspection notes">
              <textarea
                value={draft.inspection}
                onChange={(e) =>
                  setDraft({ ...draft, inspection: e.target.value })
                }
              />
            </Field>
            <ActorField
              label="Demo QA actor"
              value={actor}
              onChange={setActor}
            />
            <Field label="Action reason">
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <History
              entries={db.snags.find((s) => s.id === draft.id)?.history}
            />
            <details>
              <summary>Legacy activity history</summary>
              {db.activities
                .filter((a) => a.entityId === draft.id)
                .map((a) => (
                  <p key={a.id}>
                    {a.action} · {a.summary}
                    <small>
                      {personName(db, a.actorId)} · {a.timestamp}
                    </small>
                  </p>
                ))}
            </details>
            <WorkflowError />
            <button className="primary">Save Snag</button>
          </form>
        </Modal>
      )}
    </>
  );
}
const DocumentRegister = lazy(() =>
  import("../workforce/Documents").then((module) => ({
    default: module.Documents,
  })),
);
export function Documents(props: { projectId?: string }) {
  return (
    <Suspense fallback={<p role="status">Loading document register…</p>}>
      <DocumentRegister {...props} />
    </Suspense>
  );
}
