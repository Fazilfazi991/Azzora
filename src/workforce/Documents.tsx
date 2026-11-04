import { useState } from "react";
import type { Attachment, DocumentRecord } from "../domain/model";
import { categories } from "../domain/model";
import { today, uid } from "../domain/logic";
import { canStoreAction, useStoreCommand } from "../store";
import {
  Badge,
  Empty,
  Field,
  Header,
  Modal,
  personName,
} from "../components/ui";
import { Attachments } from "../components/uploads";
import { ActorField, History, WorkflowError } from "./ui";
import { latestDocuments } from "./readiness";
import { reviseDocument, reviewDocument, saveDocumentDraft } from "./commands";
import "./workforce.css";

export function Documents({ projectId }: { projectId?: string }) {
  const { store, run, pending } = useStoreCommand(),
    { db } = store;
  const [filter, setFilter] = useState(projectId || "");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState<DocumentRecord | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const [all, setAll] = useState(false);
  const list = (all ? db.documents : latestDocuments(db)).filter(
    (d) =>
      (!filter || d.projectId === filter) &&
      (!category || d.category === category),
  );
  const stored = db.documents.find((d) => d.id === draft?.id);
  const canSubmit =
    canStoreAction(store, "project.write") ||
    canStoreAction(store, "document.submit");
  const canReview =
    canStoreAction(store, "project.write") &&
    (store.mode !== "staging" ||
      ((stored?.submittedBy || stored?.uploadedBy) !== store.actor?.personId &&
        (!stored?.reviewerId || stored.reviewerId === store.actor?.personId)));
  const editable = !stored || stored.status === "Draft";
  const family = draft
    ? db.documents
        .filter((d) => (d.familyId || d.id) === (draft.familyId || draft.id))
        .sort((a, b) => b.version - a.version)
    : [];
  function open(document: DocumentRecord) {
    setDraft(structuredClone(document));
    setFiles(document.attachment ? [document.attachment] : []);
    setActor("");
    setNote("");
  }
  async function review(status: "Pending" | "Approved" | "Rejected") {
    if (!draft) return;
    if (
      await run(
        "document.review",
        {
          id: draft.id,
          status,
          reason: note,
          reviewerId: draft.reviewerId,
          ...(status === "Pending"
            ? { document: { ...draft, attachment: files[0] } }
            : {}),
        },
        (d) => {
          if (status === "Pending")
            saveDocumentDraft(
              d,
              {
                ...draft,
                attachment: files[0],
                reviewerId:
                  draft.reviewerId ||
                  db.people.find(
                    (p) => p.status !== "Inactive" && p.id !== actor,
                  )?.id,
              },
              actor,
            );
          reviewDocument(d, draft.id, status, actor, note);
        },
        "Review action recorded",
      )
    )
      setDraft(null);
  }
  return (
    <>
      <Header
        title="Document Register"
        description="Submit drawings, review revisions and preserve approved records."
        action={
          <button
            className="primary"
            disabled={!canSubmit || !db.projects.length}
            onClick={() =>
              open({
                id: uid(),
                projectId: filter || db.projects[0].id,
                name: "",
                category: "Design Drawings",
                status: "Draft",
                version: 1,
                uploadedAt: today(),
                uploadedBy: "",
              })
            }
          >
            + Add Document
          </button>
        }
      />
      <p className="notice">
        {store.mode === "staging"
          ? "Shared fictional documents use private storage and authenticated, independently assigned reviewers."
          : "Browser-local documents and explicit demo reviewers. Seeded records contain metadata only."}{" "}
        A submitted revision is locked; corrections create a new revision.
      </p>
      <div className="filters">
        {!projectId && (
          <select
            aria-label="Documents project"
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
          aria-label="Document category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="choice">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          Show all revisions
        </label>
      </div>
      <div className="panel">
        {list.map((d) => (
          <div className="list-row" key={d.id}>
            <span>
              <strong>{d.name}</strong>
              <small>
                {d.category} · v{d.version} ·{" "}
                {db.projects.find((p) => p.id === d.projectId)?.code} ·{" "}
                {d.uploadedAt}
              </small>
            </span>
            <Badge>{d.status}</Badge>
            {d.attachment?.dataUrl ? (
              <a
                className="button"
                href={d.attachment.dataUrl}
                download={d.attachment.name}
              >
                Download v{d.version}
              </a>
            ) : (
              <span className="muted">Metadata only</span>
            )}
            <button
              aria-label={`Review ${d.name} v${d.version}`}
              onClick={() => open(d)}
            >
              Review / revisions
            </button>
          </div>
        ))}
        {!list.length && <Empty>No documents match this view.</Empty>}
      </div>
      {draft && (
        <Modal
          drawer
          title={`${draft.name || "New document"} · Revision ${draft.version}`}
          onClose={() => {
            if (!pending) setDraft(null);
          }}
        >
          <Badge>{stored?.status || "Draft"}</Badge>
          <p>
            Submitted by{" "}
            {personName(db, stored?.submittedBy || stored?.uploadedBy || "")} ·{" "}
            {stored?.submittedAt || stored?.uploadedAt || "Not submitted"}
          </p>
          <form
            aria-busy={pending}
            inert={pending}
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  "document.save",
                  { document: { ...draft, attachment: files[0] } },
                  (d) =>
                    saveDocumentDraft(
                      d,
                      { ...draft, attachment: files[0] },
                      actor,
                    ),
                  "Draft saved",
                )
              )
                setDraft(null);
            }}
          >
            <Field label="Project">
              <select
                required
                disabled={!!stored}
                value={draft.projectId}
                onChange={(e) =>
                  setDraft({ ...draft, projectId: e.target.value })
                }
              >
                {db.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Document name">
              <input
                required
                readOnly={!editable}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <select
                disabled={!editable}
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Revision description">
              <textarea
                required
                readOnly={!editable}
                value={draft.revisionNote || ""}
                onChange={(e) =>
                  setDraft({ ...draft, revisionNote: e.target.value })
                }
              />
            </Field>
            {editable && (
              <>
                <Attachments files={files} onChange={setFiles} />
                {files.length > 1 && (
                  <p className="notice">
                    Only one file per revision. Remove extra files or create
                    separate documents.
                  </p>
                )}
              </>
            )}
            {editable && (
              <>
                <ActorField
                  label="Demo submitter"
                  value={actor}
                  onChange={setActor}
                />
                <Field label="Assigned document reviewer">
                  <select
                    value={
                      draft.reviewerId ||
                      (store.mode === "staging"
                        ? ""
                        : db.people.find(
                            (p) => p.status !== "Inactive" && p.id !== actor,
                          )?.id || "")
                    }
                    onChange={(e) =>
                      setDraft({ ...draft, reviewerId: e.target.value })
                    }
                  >
                    {store.mode === "staging" && (
                      <option value="">Choose an independent reviewer…</option>
                    )}
                    {db.people
                      .filter(
                        (p) =>
                          p.status !== "Inactive" &&
                          p.id !==
                            (store.mode === "staging"
                              ? store.actor?.personId
                              : actor),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="workflow-actions">
                  <button
                    className="primary"
                    disabled={pending || !canSubmit || files.length > 1}
                  >
                    Save Draft
                  </button>
                </div>
              </>
            )}
          </form>
          <section
            className="workflow-review"
            aria-busy={pending}
            inert={pending}
          >
            <h3>{editable ? "Submit for review" : "Review decision"}</h3>
            {!editable && (
              <ActorField
                label="Demo reviewer"
                value={actor}
                onChange={setActor}
              />
            )}
            <Field label="Review note / reason">
              <textarea
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="workflow-actions">
              {editable ? (
                <button
                  className="primary"
                  disabled={
                    pending ||
                    !canSubmit ||
                    files.length > 1 ||
                    (store.mode === "staging" && !draft.reviewerId)
                  }
                  onClick={() => review("Pending")}
                >
                  Submit Revision
                </button>
              ) : stored?.status === "Pending" ? (
                <>
                  <button
                    className="primary"
                    disabled={pending || !canReview}
                    onClick={() => review("Approved")}
                  >
                    Approve Revision
                  </button>
                  <button
                    disabled={pending || !canReview}
                    onClick={() => review("Rejected")}
                  >
                    Reject Revision
                  </button>
                </>
              ) : (
                <button
                  className="primary"
                  disabled={
                    !canSubmit || family.some((d) => d.version > draft.version)
                  }
                  onClick={async () => {
                    let next: DocumentRecord | undefined;
                    if (
                      await run(
                        "document.revise",
                        { id: draft.id, reason: note },
                        (d) => {
                          next = reviseDocument(d, draft.id, actor, note);
                        },
                      )
                    ) {
                      if (store.mode === "staging")
                        next = store
                          .latestDb?.()
                          .documents.filter(
                            (item) =>
                              (item.familyId || item.id) ===
                              (draft.familyId || draft.id),
                          )
                          .sort((a, b) => b.version - a.version)[0];
                      if (next) open(next);
                    }
                  }}
                >
                  Create Revision
                </button>
              )}
            </div>
            <p className="muted">
              Review requires{" "}
              {store.mode === "staging"
                ? "an authorized individual account"
                : "an active demo actor"}{" "}
              and a note. Reviewers must differ from the submitter. Approved
              files remain in revision history.
            </p>
          </section>
          <WorkflowError />
          <History entries={stored?.history} />
          <h3>Revision history</h3>
          {family.map((d) => (
            <div className="workflow-revision" key={d.id}>
              <strong>
                v{d.version} · {d.status}
              </strong>
              <p>{d.revisionNote || "Legacy revision"}</p>
              <button onClick={() => open(d)}>View v{d.version}</button>
              {d.attachment?.dataUrl && (
                <a
                  className="button"
                  href={d.attachment.dataUrl}
                  download={d.attachment.name}
                >
                  Download v{d.version}
                </a>
              )}
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
