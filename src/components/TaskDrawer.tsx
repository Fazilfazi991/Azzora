import { useState } from "react";
import type { Task } from "../domain/model";
import { priorities, taskStatuses, trades } from "../domain/model";
import { useStore } from "../store";
import { saveTask } from "../domain/repository";
import { uid } from "../domain/logic";
import { Modal, Field, Empty, personName } from "./ui";
import { Attachments } from "./uploads";
import { WorkflowError } from "../workforce/ui";
import {
  draftScheduleProposal,
  draftTaskCreation,
  getPlanningView,
  getProjectPlanning,
  linkFirstPermittedDate,
  type DependencyLink,
  type LinkType,
  type TaskPlanning,
} from "../planning";
export function TaskDrawer({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const { db, mutate } = useStore();
  const [draft, setDraft] = useState(structuredClone(task));
  const [comment, setComment] = useState("");
  const [scheduleReason, setScheduleReason] = useState("");
  const [allowEarlier, setAllowEarlier] = useState(false);
  const [links, setLinks] = useState<DependencyLink[]>(() => structuredClone(getProjectPlanning(db, task.projectId).links));
  const initialPlanning = getProjectPlanning(db, task.projectId);
  const initialTaskPlanning = initialPlanning.taskPlanning.find((item) => item.taskId === task.id);
  const [constraint, setConstraintDraft] = useState<TaskPlanning | undefined>(initialTaskPlanning ? structuredClone(initialTaskPlanning) : undefined);
  const children = db.tasks.filter((t) => t.parentId === task.id);
  const existing = db.tasks.some((item) => item.id === task.id);
  const project = db.projects.find((item) => item.id === task.projectId);
  const planningView = getPlanningView(db, task.projectId);
  const incoming = links.filter((link) => link.successor.kind === "task" && link.successor.id === task.id);
  const predecessorOptions = db.tasks.filter((item) => item.projectId === task.projectId && item.id !== task.id);
  const dateChanged = draft.start !== task.start || draft.due !== task.due;
  const linksChanged = JSON.stringify(links) !== JSON.stringify(initialPlanning.links);
  const constraintsChanged = JSON.stringify(constraint) !== JSON.stringify(initialTaskPlanning);
  const needsProposal = existing && (dateChanged || linksChanged || constraintsChanged);
  const setConstraint = <K extends keyof TaskPlanning>(key: K, value: TaskPlanning[K]) => {
    if (constraint) setConstraintDraft({ ...constraint, [key]: value });
  };
  const set = <K extends keyof Task>(key: K, value: Task[K]) =>
    setDraft({ ...draft, [key]: value });
  function save(complete = false) {
    const updated = {
      ...draft,
      status: complete ? ("Completed" as const) : draft.status,
      progress: complete ? 100 : draft.progress,
    };
    if (comment.trim())
      updated.comments = [
        ...updated.comments,
        {
          id: uid(),
          authorId: "person-0",
          text: comment,
          createdAt: new Date().toISOString(),
        },
      ];
    if ((needsProposal || !existing) && scheduleReason.trim().length < 3) return;
    const saved = mutate((next) => {
      if (!existing) {
        draftTaskCreation(next, { ...updated, dependencies: [] }, scheduleReason, project?.managerId || "");
        return;
      }
      if (children.length && complete) {
        next.tasks.filter((item) => item.parentId === task.id).forEach((item) =>
          saveTask(next, { ...item, status: "Completed", progress: 100 }));
      }
      saveTask(next, { ...updated, start: task.start, due: task.due, dependencies: task.dependencies });
      if (needsProposal) {
        const projectPlanning = getProjectPlanning(next, task.projectId);
        const nextTaskPlanning = constraint
          ? projectPlanning.taskPlanning.map((item) => item.taskId === task.id ? constraint : item)
          : undefined;
        draftScheduleProposal(next, {
          projectId: task.projectId,
          initiatingNode: { kind: "task", id: task.id },
          reason: scheduleReason,
          actorId: project?.managerId || "",
          edit: {
            ...(dateChanged ? { start: draft.start, finish: draft.due } : {}),
            ...(linksChanged ? { links } : {}),
            ...(constraintsChanged && nextTaskPlanning ? { taskPlanning: nextTaskPlanning } : {}),
          },
          considerEarlierDates: allowEarlier,
        });
      }
    }, needsProposal || !existing ? "Schedule proposal drafted for review" : "Task saved");
    if (saved) onClose();
  }
  return (
    <Modal
      drawer
      title={
        db.tasks.some((t) => t.id === task.id)
          ? "Task specification"
          : "Create task"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Task name">
          <input
            required
            minLength={2}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <p className="muted">
          {db.projects.find((p) => p.id === task.projectId)?.name}
        </p>
        <Field label="Phase">
          <select
            value={draft.phaseId}
            onChange={(e) => {
              setDraft({
                ...draft,
                phaseId: e.target.value,
                parentId: undefined,
              });
            }}
          >
            {db.phases
              .filter((p) => p.projectId === task.projectId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Parent task (optional)">
          <select
            value={draft.parentId || ""}
            onChange={(e) => set("parentId", e.target.value || undefined)}
          >
            <option value="">Top-level task</option>
            {db.tasks
              .filter(
                (t) =>
                  t.phaseId === draft.phaseId &&
                  !t.parentId &&
                  t.id !== task.id &&
                  !children.length,
              )
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <Field label="Assigned to">
          <select
            value={draft.assigneeId}
            onChange={(e) => set("assigneeId", e.target.value)}
          >
            <option value="">Unassigned</option>
            {db.people
              .filter(
                (p) => p.status !== "Inactive" || p.id === draft.assigneeId,
              )
              .map((p) => (
                <option
                  disabled={p.status === "Inactive"}
                  key={p.id}
                  value={p.id}
                >
                  {p.name} · {p.role}
                  {p.status === "Inactive" ? " · Inactive" : ""}
                </option>
              ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Start">
            <input
              type="date"
              required
              value={draft.start}
              onChange={(e) => set("start", e.target.value)}
            />
          </Field>
          <Field label="Due">
            <input
              type="date"
              required
              min={draft.start}
              value={draft.due}
              onChange={(e) => set("due", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value as Task["status"])}
            >
              {taskStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={draft.priority}
              onChange={(e) =>
                set("priority", e.target.value as Task["priority"])
              }
            >
              {priorities.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Progress %">
            <input
              type="number"
              min={0}
              max={100}
              disabled={children.length > 0}
              value={draft.progress}
              onChange={(e) => set("progress", Number(e.target.value))}
            />
          </Field>
          <Field label="Allocation %">
            <input
              type="number"
              min={0}
              max={100}
              value={draft.allocation}
              onChange={(e) => set("allocation", Number(e.target.value))}
            />
          </Field>
        </div>
        {children.length > 0 && (
          <p>
            Parent progress derives from subtasks. Mark complete completes its
            subtasks.
          </p>
        )}
        <Field label="Trade">
          <select
            value={draft.trade}
            onChange={(e) => set("trade", e.target.value)}
          >
            {trades.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <section className="task-schedule-controls" aria-label="Schedule planning controls">
          <h3>Schedule relationships</h3>
          <p className="muted">FS and SS cover everyday handoffs. FF and SF remain available for advanced planning. Every edit becomes a proposal; approved dates stay unchanged until review.</p>
          {incoming.map((link) => {
            const predecessor = planningView.nodes.find((item) => item.node.kind === link.predecessor.kind && item.node.id === link.predecessor.id);
            const successor = planningView.nodes.find((item) => item.node.kind === "task" && item.node.id === task.id);
            let permitted = "";
            try {
              if (predecessor && successor) permitted = linkFirstPermittedDate(initialPlanning.calendar, link, predecessor.approved, successor.approved.durationWorkingDays);
            } catch { permitted = ""; }
            return <div className="task-dependency-row" key={link.id}>
              <label>Predecessor<select aria-label="Predecessor task" value={link.predecessor.id} onChange={(event) => setLinks(links.map((item) => item.id === link.id ? { ...item, predecessor: { kind: "task", id: event.target.value } } : item))}>
                {predecessorOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
              <label>Relationship<select aria-label="Dependency relationship" value={link.type} onChange={(event) => setLinks(links.map((item) => item.id === link.id ? { ...item, type: event.target.value as LinkType } : item))}>
                <option value="FS">Finish to Start (FS)</option><option value="SS">Start to Start (SS)</option><option value="FF">Finish to Finish (FF)</option><option value="SF">Start to Finish (SF)</option>
              </select></label>
              <label>Working-day lag / lead<input aria-label="Working-day lag or lead" type="number" step={1} value={link.lagWorkingDays} onChange={(event) => setLinks(links.map((item) => item.id === link.id ? { ...item, lagWorkingDays: Number(event.target.value) } : item))} /></label>
              <button type="button" aria-label={`Remove predecessor ${predecessor?.name || link.predecessor.id}`} onClick={() => setLinks(links.filter((item) => item.id !== link.id))}>Remove</button>
              <small>{permitted ? `First permitted successor start: ${permitted}` : "Date will be calculated on proposal."}</small>
            </div>;
          })}
          {incoming.length === 0 && <p className="muted">No predecessors. Phase grouping does not create a dependency.</p>}
          <button type="button" disabled={!existing || !predecessorOptions.length} onClick={() => {
            const candidate = predecessorOptions.find((item) => !incoming.some((link) => link.predecessor.id === item.id));
            if (!candidate) return;
            setLinks([...links, { id: uid(), projectId: task.projectId, predecessor: { kind: "task", id: candidate.id }, successor: { kind: "task", id: task.id }, type: "FS", lagWorkingDays: 0, createdAt: new Date().toISOString() }]);
          }}>+ Add predecessor</button>
          {!existing && <p className="muted">Create and approve this task first, then add its predecessors in a new schedule proposal.</p>}
          {incoming.some((link) => link.lagWorkingDays < 0) && <p className="planning-lead-note">Negative lag overlaps predecessor and successor work. Explicit confirmation is required before submission.</p>}
          {constraint && existing && <details className="task-constraints"><summary>Advanced schedule constraints</summary>
            <div className="form-grid">
              <Field label="Start no earlier than"><input type="date" value={constraint.startNoEarlierThan || ""} onChange={(event) => setConstraint("startNoEarlierThan", event.target.value || undefined)} /></Field>
              <Field label="Finish no later than"><input type="date" value={constraint.finishNoLaterThan || ""} onChange={(event) => setConstraint("finishNoLaterThan", event.target.value || undefined)} /></Field>
              <Field label="Locked start"><input type="date" value={constraint.lockedStart || ""} onChange={(event) => setConstraint("lockedStart", event.target.value || undefined)} /></Field>
              <Field label="Locked finish"><input type="date" value={constraint.lockedFinish || ""} onChange={(event) => setConstraint("lockedFinish", event.target.value || undefined)} /></Field>
            </div>
          </details>}
          <label className="task-earlier-option"><input type="checkbox" checked={allowEarlier} onChange={(event) => setAllowEarlier(event.target.checked)} /> Consider earlier successor dates in this proposal (Project Manager review required)</label>
          {(needsProposal || !existing) && <Field label="Schedule proposal reason"><textarea required minLength={3} value={scheduleReason} onChange={(event) => setScheduleReason(event.target.value)} placeholder="Describe the site change, handoff or new task" /></Field>}
          {needsProposal && <p role="status" className="planning-lead-note">Your edits will draft a proposal. Approved task dates and links will remain unchanged until Project Manager approval.</p>}
        </section>
        <Field label="Notes">
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
        <Attachments
          files={draft.attachments}
          onChange={(files) => set("attachments", files)}
        />
        <h3>Comments</h3>
        {draft.comments.map((c) => (
          <p key={c.id}>
            <b>{personName(db, c.authorId)}</b> · {c.text}
          </p>
        ))}
        <Field label="Add comment">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        <h3>Activity</h3>
        {db.activities
          .filter((a) => a.entityId === task.id)
          .map((a) => (
            <p key={a.id}>
              {a.summary}
              <small>
                {new Date(a.timestamp).toLocaleString("en-GB", {
                  timeZone: "Asia/Dubai",
                })}
              </small>
            </p>
          ))}
        {!db.activities.some((a) => a.entityId === task.id) && (
          <Empty>No activity recorded yet.</Empty>
        )}
        <WorkflowError />
        <div className="sticky-actions">
          <button type="button" onClick={() => save(true)}>
            Mark Complete
          </button>
          <button className="primary">Save Changes</button>
        </div>
      </form>
    </Modal>
  );
}
