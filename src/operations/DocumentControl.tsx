import { useState } from "react";
import { useStore } from "../store";
import type { DocumentRecord, Attachment } from "../domain/model";
import { categories } from "../domain/model";
import { Header, Field, Modal, Badge, Empty } from "../components/ui";
import { Attachments } from "../components/uploads";
import { uid, today } from "../domain/logic";
import {
  saveControlledDocument,
  submitApproval,
  decideApproval,
} from "./repository";
import { ActorFields, Decision, History, useActors } from "./Controls";
export function DocumentControl({ projectId = "" }: { projectId?: string }) {
  const { db, mutate } = useStore(),
    actors = useActors();
  const [filter, setFilter] = useState(projectId),
    [category, setCategory] = useState(""),
    [draft, setDraft] = useState<DocumentRecord | null>(null),
    [files, setFiles] = useState<Attachment[]>([]);
  const list = db.documents.filter(
    (d) =>
      (!filter || d.projectId === filter) &&
      (!category || d.category === category),
  );
  function create(source?: DocumentRecord) {
    setFiles(source?.attachment ? [source.attachment] : []);
    setDraft(
      source
        ? {
            ...structuredClone(source),
            id: uid(),
            familyId: source.familyId || source.id,
            revisionOf: source.id,
            version:
              Math.max(
                ...db.documents
                  .filter(
                    (d) =>
                      (d.familyId || d.id) === (source.familyId || source.id),
                  )
                  .map((d) => d.version),
              ) + 1,
            status: "Pending",
            reviewState: "Draft",
            reviewComments: "",
            decisionAt: undefined,
            uploadedAt: today(),
            uploadedBy: actors.actor,
          }
        : {
            id: uid(),
            projectId: filter || db.projects[0]?.id || "",
            name: "",
            category: "Design Drawings",
            status: "Pending",
            version: 1,
            uploadedAt: today(),
            uploadedBy: actors.actor,
            reviewerId: actors.approver,
            reviewState: "Draft",
          },
    );
  }
  return (
    <>
      <Header
        title="Document Register"
        description="Versioned drawing submissions, review decisions and preserved approved records."
        action={
          <button className="primary" onClick={() => create()}>
            + Add Document
          </button>
        }
      />
      <p className="notice">
        Browser-local attachments under 750 KB. Approved versions remain
        preserved when a new revision is submitted.
      </p>
      <ActorFields actors={actors} />
      <div className="filters">
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
        <select
          aria-label="Document category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {list.map((d) => (
        <section className="panel" key={d.id}>
          <div className="list-row">
            <span>
              <strong>{d.name}</strong>
              <small>
                {d.category} · v{d.version} ·{" "}
                {db.projects.find((p) => p.id === d.projectId)?.code}
              </small>
            </span>
            <Badge>{d.reviewState || d.status}</Badge>
            {d.attachment?.dataUrl ? (
              <a
                className="button"
                href={d.attachment.dataUrl}
                download={d.attachment.name}
              >
                Download
              </a>
            ) : (
              <span className="muted">Metadata only</span>
            )}
            <button
              onClick={() => {
                if (d.status === "Approved" || d.reviewState === "Submitted")
                  create(d);
                else {
                  setDraft(structuredClone(d));
                  setFiles(d.attachment ? [d.attachment] : []);
                }
              }}
            >
              Edit / approve
            </button>
            <button onClick={() => create(d)}>New Document Revision</button>
          </div>
          <small>
            Submitted by {db.people.find((p) => p.id === d.uploadedBy)?.name} ·{" "}
            {d.uploadedAt} · Reviewer{" "}
            {db.people.find((p) => p.id === d.reviewerId)?.name ||
              "Not assigned"}{" "}
            · Decision {d.decisionAt || "Pending"}
          </small>
          <p>{d.reviewComments}</p>
          {d.status !== "Approved" && d.reviewState !== "Submitted" && (
            <button
              onClick={() =>
                mutate((copy) => {
                  submitApproval(
                    copy,
                    "Document",
                    d.id,
                    "Drawing review",
                    actors.actor,
                    d.reviewerId || actors.approver,
                  );
                })
              }
            >
              Submit Drawing for Review
            </button>
          )}
          <Decision entityId={d.id} actor={actors.actor} />
          <History id={d.id} />
        </section>
      ))}
      {!list.length && <Empty>No documents match.</Empty>}
      {draft && (
        <Modal title="Document Metadata" onClose={() => setDraft(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                mutate((copy) => {
                  const intendedApproval = draft.status === "Approved";
                  const next = saveControlledDocument(
                    copy,
                    { ...draft, attachment: files[0] },
                    actors.actor,
                  );
                  if (intendedApproval) {
                    if (actors.actor !== (draft.reviewerId || actors.approver))
                      throw Error(
                        "Select the assigned demo reviewer as the current demo actor before recording approval.",
                      );
                    const a = submitApproval(
                      copy,
                      "Document",
                      next.id,
                      "Document review",
                      actors.actor,
                      actors.actor,
                    );
                    decideApproval(
                      copy,
                      a.id,
                      true,
                      draft.reviewComments ||
                        "Approved via explicit document form selection",
                      draft.reviewerId || actors.approver,
                    );
                  }
                })
              )
                setDraft(null);
            }}
          >
            <div className="form-grid">
              <Field label="Project">
                <select
                  required
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
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                >
                  {categories.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Version">
                <input
                  required
                  type="number"
                  min="1"
                  value={draft.version}
                  onChange={(e) =>
                    setDraft({ ...draft, version: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Reviewer">
                <select
                  value={draft.reviewerId || actors.approver}
                  onChange={(e) =>
                    setDraft({ ...draft, reviewerId: e.target.value })
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
              <Field label="Approval status">
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      status: e.target.value as DocumentRecord["status"],
                    })
                  }
                >
                  <option>Pending</option>
                  <option>Approved</option>
                </select>
              </Field>
            </div>
            <Field label="Review comments">
              <textarea
                value={draft.reviewComments || ""}
                onChange={(e) =>
                  setDraft({ ...draft, reviewComments: e.target.value })
                }
              />
            </Field>
            <Attachments files={files} onChange={setFiles} />
            {files.length > 1 && (
              <p className="notice">
                The first attachment is stored in this version; create separate
                document records for additional files.
              </p>
            )}
            <button className="primary">Save Document</button>
          </form>
        </Modal>
      )}
    </>
  );
}
