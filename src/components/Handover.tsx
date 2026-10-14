import { useState } from "react";
import { useStore } from "../store";
import { handoverState } from "../domain/logic";
import { record, completeProject } from "../domain/repository";
import { Header, Progress, Badge, Confirm, Field } from "./ui";
import { ActorField, WorkflowError } from "../workforce/ui";
import { operationalReadiness } from "../workforce/readiness";
import "../workforce/workforce.css";
export function Handover({ projectId }: { projectId?: string }) {
  const { db, mutate } = useStore();
  const [selected, setSelected] = useState(projectId || db.projects[0].id);
  const [confirm, setConfirm] = useState(false);
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const state = handoverState(db, selected);
  const operational = operationalReadiness(db, selected);
  const p = db.projects.find((p) => p.id === selected)!;
  return (
    <>
      <Header
        title="Project Handover"
        description="Completion criteria, inspection records and client sign-off."
      />
      <div className="filters">
        {!projectId && (
          <select
            aria-label="Handover project"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {db.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        )}
        <Badge>
          {p.status === "Completed"
            ? "Completed"
            : state.ready
              ? "Ready for Handover"
              : "Not ready for handover"}
        </Badge>
      </div>
      <div className="panel">
        <h2>{p.name}</h2>
        <Progress value={state.percent} />
        <p>
          {state.items.filter((h) => h.complete).length} of {state.items.length}{" "}
          applicable items complete
        </p>
      </div>
      <div className="project-grid">
        {[
          "Site Completion",
          "Quality",
          "Documents",
          "Client",
          "Commercial",
        ].map((group) => (
          <section className="panel" key={group}>
            <h3>{group}</h3>
            {state.items
              .filter((h) => h.group === group)
              .map((h) => (
                <label className="check-row" key={h.id}>
                  <input
                    type="checkbox"
                    checked={h.complete}
                    disabled={
                      !!h.automatic ||
                      h.id.startsWith("operational-") ||
                      p.status === "Completed"
                    }
                    onChange={(e) =>
                      mutate((d) => {
                        d.handover.find((x) => x.id === h.id)!.complete =
                          e.target.checked;
                        record(
                          d,
                          selected,
                          "HandoverItem",
                          h.id,
                          "Handover item updated",
                          h.name +
                            " · " +
                            (e.target.checked ? "Complete" : "Incomplete"),
                        );
                      })
                    }
                  />
                  <span>
                    {h.name}
                    <small>
                      {h.automatic || h.id.startsWith("operational-")
                        ? "Derived from project records"
                        : h.required
                          ? "Required · manually confirmed"
                          : "Optional"}
                    </small>
                  </span>
                </label>
              ))}
            {group === "Commercial" && (
              <p className="muted">
                Manual closure indicator. Company accounting rules are not
                configured.
              </p>
            )}
          </section>
        ))}
      </div>
      <section
        className="panel workflow-gates"
        aria-label="Operational readiness"
      >
        <h2>Operational readiness</h2>
        <p>
          Latest revisions and supervisory decisions feed this checklist
          automatically.
        </p>
        <div className="list-row">
          <span>
            <strong>Drawing & document approvals</strong>
            <small>
              {operational.pendingDocuments.length} latest revisions awaiting
              approval
            </small>
          </span>
          <a className="button" href={`#/projects/${selected}/documents`}>
            Review documents
          </a>
        </div>
        <div className="list-row">
          <span>
            <strong>Site supervision</strong>
            <small>
              {operational.pendingUpdates.length} site records awaiting
              approval. At least one supervised site record is required.
            </small>
          </span>
          <a className="button" href={`#/projects/${selected}/site-updates`}>
            Review site records
          </a>
        </div>
        <div className="list-row">
          <span>
            <strong>Quality assurance</strong>
            <small>{operational.openSnags.length} unresolved snags</small>
          </span>
          <a className="button" href={`#/projects/${selected}/snags-qa`}>
            Review QA
          </a>
        </div>
      </section>
      <button
        className="primary"
        disabled={!state.ready || p.status === "Completed"}
        onClick={() => {
          setActor("");
          setNote("");
          setConfirm(true);
        }}
      >
        Complete Project
      </button>
      {confirm && (
        <Confirm
          title="Complete this project?"
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            if (
              mutate(
                (d) => completeProject(d, selected, actor, note),
                "Project completed",
              )
            )
              setConfirm(false);
          }}
        >
          All required handover items pass. Confirm completion of {p.code} —{" "}
          {p.name}.
          <WorkflowError />
          <ActorField
            label="Demo handover reviewer"
            value={actor}
            onChange={setActor}
          />
          <Field label="Handover confirmation note">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Confirm>
      )}
    </>
  );
}
