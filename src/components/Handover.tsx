import { useState } from "react";
import { canStoreAction, useStoreCommand } from "../store";
import { handoverState } from "../domain/logic";
import { record, completeProject } from "../domain/repository";
import { Header, Progress, Badge, Confirm, Field, Empty } from "./ui";
import { ActorField, WorkflowError } from "../workforce/ui";
import { operationalReadiness } from "../workforce/readiness";
import "../workforce/workforce.css";
import { CommercialClosure } from "../operations/Closure";
import { closureSummary } from "../operations/closure-domain";
export function Handover({ projectId }: { projectId?: string }) {
  const { store, run, pending } = useStoreCommand(),
    { db } = store;
  const [selected, setSelected] = useState(
    projectId || db.projects[0]?.id || "",
  );
  const [confirm, setConfirm] = useState(false);
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const p = db.projects.find((p) => p.id === selected);
  if (!p)
    return (
      <>
        <Header title="Project Handover" />
        <Empty>Select an existing project to review handover.</Empty>
      </>
    );
  const state = handoverState(db, selected);
  const financialBlock =
    !!db.operations?.settings.blockOperationalForFinance &&
    !closureSummary(db, selected).commercialClear;
  const operational = operationalReadiness(db, selected);
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
            : state.ready && !financialBlock
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
        {["Site Completion", "Quality", "Documents", "Client"].map((group) => (
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
                      pending ||
                      !canStoreAction(store, "project.write") ||
                      !!h.automatic ||
                      h.id.startsWith("operational-") ||
                      p.status === "Completed"
                    }
                    onChange={(e) => {
                      const complete = e.target.checked;
                      void run(
                        "handover.check",
                        { id: h.id, complete },
                        (d) => {
                          d.handover.find((x) => x.id === h.id)!.complete =
                            complete;
                          record(
                            d,
                            selected,
                            "HandoverItem",
                            h.id,
                            "Handover item updated",
                            h.name +
                              " · " +
                              (complete ? "Complete" : "Incomplete"),
                          );
                        },
                      );
                    }}
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
        disabled={
          !canStoreAction(store, "project.write") ||
          !state.ready ||
          financialBlock ||
          p.status === "Completed"
        }
        onClick={() => {
          setActor("");
          setNote("");
          setConfirm(true);
        }}
      >
        Complete Project
      </button>
      {financialBlock && (
        <p className="notice">
          The configured financial blocking policy requires commercial
          obligations to be cleared before operational handover.
        </p>
      )}
      <CommercialClosure projectId={selected} />
      {confirm && (
        <Confirm
          title="Complete this project?"
          onClose={() => {
            if (!pending) setConfirm(false);
          }}
          onConfirm={async () => {
            if (
              await run(
                "project.complete",
                { id: selected, reason: note },
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
            <textarea
              disabled={pending}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </Confirm>
      )}
    </>
  );
}
