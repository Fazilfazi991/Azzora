import type { Database, Milestone, Task } from "../domain/model";
import { uid } from "../domain/logic";
import { activePerson } from "../workforce/commands";
import { inclusiveWorkingDuration, isWorkingDate, validateCalendar } from "./calendar";
import { activateProjectPlanning, getProjectPlanning } from "./compatibility";
import { approvedNodeDates, calculateSchedule, sourceFingerprint, type ScheduleEdit } from "./engine";
import { nodeKey, validateLinks } from "./graph";
import type { NodeRef, ProjectPlanning, ScheduleChange, ScheduleProposal, ScheduleSnapshot } from "./model";

export interface DraftScheduleInput {
  projectId: string;
  initiatingNode: NodeRef;
  reason: string;
  actorId: string;
  edit: ScheduleEdit;
  considerEarlierDates?: boolean;
}
function actor(db: Database, actorId: string): void { activePerson(db, actorId); }
function manager(db: Database, projectId: string, actorId: string): void {
  actor(db, actorId);
  if (db.projects.find((project) => project.id === projectId)?.managerId !== actorId)
    throw Error("Only the project's designated demo Project Manager may decide this schedule.");
}
function reasonRequired(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 3) throw Error("Record a schedule reason of at least three characters.");
  return normalized;
}
function proposal(db: Database, id: string): [ProjectPlanning, ScheduleProposal] {
  const planning = db.planning?.find((row) => row.proposals.some((item) => item.id === id));
  const found = planning?.proposals.find((item) => item.id === id);
  if (!planning || !found) throw Error("Schedule proposal not found.");
  return [planning, found];
}
function event(action: string, actorId: string, reason: string) {
  return { action, actorId, at: new Date().toISOString(), reason };
}
function nextRevision(planning: ProjectPlanning): number {
  return Math.max(0, ...planning.proposals.map((item) => item.revision)) + 1;
}
function changed(a: { start: string; finish: string; durationWorkingDays: number }, b: typeof a): boolean {
  return a.start !== b.start || a.finish !== b.finish || a.durationWorkingDays !== b.durationWorkingDays;
}
export function draftScheduleProposal(db: Database, input: DraftScheduleInput): ScheduleProposal {
  actor(db, input.actorId);
  const reason = reasonRequired(input.reason);
  const beforePlanning = getProjectPlanning(db, input.projectId);
  const fingerprint = sourceFingerprint(db, input.projectId);
  const result = calculateSchedule(db, beforePlanning, input.initiatingNode, input.edit, input.considerEarlierDates);
  const originals = approvedNodeDates(db, beforePlanning);
  const changes: ScheduleChange[] = [...result.affected].sort()
    .flatMap((key) => {
      const before = originals.get(key)!, after = result.dates.get(key)!;
      if (!changed(before, after)) return [];
      const [kind, id] = key.split(":") as [NodeRef["kind"], string];
      return [{ node: { kind, id }, before, after,
        cause: key === nodeKey(input.initiatingNode) ? "direct" as const : "indirect" as const }];
    });
  const unchangedSuccessors = [...result.affected].sort()
    .filter((key) => key !== nodeKey(input.initiatingNode) &&
      !changes.some((item) => nodeKey(item.node) === key))
    .map((key) => { const [kind, id] = key.split(":") as [NodeRef["kind"], string]; return { kind, id }; });
  const planning = activateProjectPlanning(db, input.projectId);
  const row: ScheduleProposal = {
    id: uid(), projectId: input.projectId, revision: nextRevision(planning), status: "Draft",
    sourceApprovedRevision: planning.approvedRevision, sourceFingerprint: fingerprint,
    initiatingNode: input.initiatingNode, reason, initiatedBy: input.actorId,
    changes, unchangedSuccessors, proposedLinks: input.edit.links,
    proposedCalendar: input.edit.calendar, proposedTaskPlanning: input.edit.taskPlanning,
    proposedMilestonePlanning: input.edit.milestonePlanning,
    requestedEdit: structuredClone(input.edit), considerEarlierDates: !!input.considerEarlierDates,
    warnings: result.warnings, conflicts: result.conflicts,
    history: [event("Drafted", input.actorId, reason)],
  };
  planning.proposals.push(row);
  return row;
}
export function draftTaskCreation(db: Database, task: Task, reason: string, actorId: string): ScheduleProposal {
  actor(db, actorId);
  reason = reasonRequired(reason);
  if (db.tasks.some((row) => row.id === task.id) ||
      !db.projects.some((row) => row.id === task.projectId) ||
      !db.phases.some((row) => row.id === task.phaseId && row.projectId === task.projectId) ||
      task.dependencies.length || task.due < task.start || task.name.trim().length < 2)
    throw Error("New scheduled task is invalid; add predecessors through a reviewed link proposal.");
  const planning = getProjectPlanning(db, task.projectId);
  if (!isWorkingDate(planning.calendar, task.start) || !isWorkingDate(planning.calendar, task.due))
    throw Error("New task dates must use project working dates.");
  const fingerprint = sourceFingerprint(db, task.projectId);
  const enabled = activateProjectPlanning(db, task.projectId);
  const row: ScheduleProposal = {
    id: uid(), projectId: task.projectId, revision: nextRevision(enabled), status: "Draft",
    sourceApprovedRevision: enabled.approvedRevision, sourceFingerprint: fingerprint,
    initiatingNode: { kind: "task", id: task.id }, reason, initiatedBy: actorId,
    changes: [], unchangedSuccessors: [], proposedTask: structuredClone(task),
    warnings: [], conflicts: [], history: [event("Drafted", actorId, reason)],
  };
  enabled.proposals.push(row);
  return row;
}
export function draftMilestoneCreation(db: Database, milestone: Milestone, reason: string, actorId: string): ScheduleProposal {
  actor(db, actorId); reason = reasonRequired(reason);
  if (db.milestones.some((row) => row.id === milestone.id) || !db.projects.some((row) => row.id === milestone.projectId))
    throw Error("New milestone is invalid.");
  const current = getProjectPlanning(db, milestone.projectId);
  if (!isWorkingDate(current.calendar, milestone.due)) throw Error("New milestone requires a working event date.");
  const fingerprint = sourceFingerprint(db, milestone.projectId);
  const planning = activateProjectPlanning(db, milestone.projectId);
  const row: ScheduleProposal = {
    id: uid(), projectId: milestone.projectId, revision: nextRevision(planning), status: "Draft",
    sourceApprovedRevision: planning.approvedRevision, sourceFingerprint: fingerprint,
    initiatingNode: { kind: "milestone", id: milestone.id }, reason, initiatedBy: actorId,
    changes: [], unchangedSuccessors: [], proposedMilestone: structuredClone(milestone),
    warnings: [], conflicts: [], history: [event("Drafted", actorId, reason)],
  };
  planning.proposals.push(row); return row;
}
export function submitScheduleProposal(db: Database, proposalId: string, actorId: string, confirmLeadOverlap = false): void {
  actor(db, actorId);
  const [planning, row] = proposal(db, proposalId);
  if (row.status !== "Draft") throw Error("Only a draft schedule proposal can be submitted.");
  if (row.conflicts.length) throw Error("Resolve all schedule conflicts before submission.");
  if (row.warnings.some((warning) => warning.code === "LeadOverlap") && !confirmLeadOverlap)
    throw Error("Confirm the negative-lag overlap before submitting this proposal.");
  if (row.sourceFingerprint !== sourceFingerprint(db, planning.projectId) || row.sourceApprovedRevision !== planning.approvedRevision)
    throw Error("Schedule proposal is stale; recalculate before submission.");
  row.status = "Submitted"; row.submittedAt = new Date().toISOString(); row.submittedBy = actorId;
  row.history.push(event("Submitted", actorId, row.reason));
  if (confirmLeadOverlap) row.history.push(event("LeadOverlapConfirmed", actorId, "Explicit negative-lag overlap acknowledgment."));
}
export function approveScheduleProposal(db: Database, proposalId: string, actorId: string): void {
  const [planning, row] = proposal(db, proposalId);
  manager(db, planning.projectId, actorId);
  if (row.status !== "Submitted") throw Error("Only a submitted schedule proposal can be approved.");
  if (row.conflicts.length) throw Error("Conflicted schedule proposal cannot be approved.");
  if (row.sourceFingerprint !== sourceFingerprint(db, planning.projectId) || row.sourceApprovedRevision !== planning.approvedRevision)
    throw Error("Schedule proposal is stale; recalculate and resubmit.");
  const next = structuredClone(db);
  const [nextPlanning, nextRow] = proposal(next, proposalId);
  if (nextRow.proposedTask) {
    if (next.tasks.some((task) => task.id === nextRow.proposedTask!.id)) throw Error("New task ID already exists.");
    next.tasks.push(structuredClone(nextRow.proposedTask));
    nextPlanning.taskPlanning.push({ taskId: nextRow.proposedTask.id, scheduleRole: "work",
      durationWorkingDays: inclusiveWorkingDuration(nextPlanning.calendar,
        nextRow.proposedTask.start, nextRow.proposedTask.due) ?? 1 });
  }
  if (nextRow.proposedMilestone) {
    if (next.milestones.some((milestone) => milestone.id === nextRow.proposedMilestone!.id)) throw Error("New milestone ID already exists.");
    next.milestones.push(structuredClone(nextRow.proposedMilestone));
    nextPlanning.milestonePlanning.push({ milestoneId: nextRow.proposedMilestone.id, completionCondition: { kind: "Manual" } });
  }
  if (nextRow.requestedEdit) {
    const recalculated = calculateSchedule(next, nextPlanning, nextRow.initiatingNode,
      nextRow.requestedEdit, nextRow.considerEarlierDates);
    if (recalculated.conflicts.length || JSON.stringify(nextRow.changes) !== JSON.stringify([...recalculated.affected].sort()
      .flatMap((key) => {
        const before = approvedNodeDates(next, nextPlanning).get(key)!, after = recalculated.dates.get(key)!;
        if (!changed(before, after)) return [];
        const [kind, id] = key.split(":") as [NodeRef["kind"], string];
        return [{ node: { kind, id }, before, after, cause: key === nodeKey(nextRow.initiatingNode) ? "direct" : "indirect" }];
      })))
      throw Error("Submitted schedule impact no longer matches the approved source.");
  }
  if (nextRow.proposedCalendar) {
    validateCalendar(nextRow.proposedCalendar);
    nextPlanning.calendar = nextRow.proposedCalendar;
  }
  if (nextRow.proposedTaskPlanning) nextPlanning.taskPlanning = nextRow.proposedTaskPlanning;
  if (nextRow.proposedMilestonePlanning) nextPlanning.milestonePlanning = nextRow.proposedMilestonePlanning;
  if (nextRow.proposedLinks) {
    validateLinks(next, nextPlanning.projectId, nextRow.proposedLinks);
    nextPlanning.links = nextRow.proposedLinks;
  }
  for (const change of nextRow.changes) {
    if (change.node.kind === "task") {
      const task = next.tasks.find((item) => item.id === change.node.id && item.projectId === nextPlanning.projectId);
      if (!task || task.start !== change.before.start || task.due !== change.before.finish)
        throw Error("A task changed while applying the schedule proposal.");
      task.start = change.after.start; task.due = change.after.finish; task.updatedAt = new Date().toISOString();
      const metadata = nextPlanning.taskPlanning.find((item) => item.taskId === task.id);
      if (metadata) metadata.durationWorkingDays = change.after.durationWorkingDays;
    } else {
      const milestone = next.milestones.find((item) => item.id === change.node.id && item.projectId === nextPlanning.projectId);
      if (!milestone || milestone.due !== change.before.start)
        throw Error("A milestone changed while applying the schedule proposal.");
      milestone.due = change.after.start;
    }
  }
  nextPlanning.approvedRevision++;
  nextRow.status = "Approved"; nextRow.decidedAt = new Date().toISOString(); nextRow.decidedBy = actorId;
  nextRow.history.push(event("Approved", actorId, nextRow.reason));
  next.activities.unshift({ id: uid(), actorId, action: "Schedule approved", entityType: "ScheduleProposal",
    entityId: nextRow.id, projectId: nextPlanning.projectId, timestamp: nextRow.decidedAt,
    summary: `${nextRow.changes.length} date changes approved; baseline unchanged.` });
  Object.assign(db, next);
}
export function rejectScheduleProposal(db: Database, proposalId: string, actorId: string, reason: string): void {
  const [planning, row] = proposal(db, proposalId);
  manager(db, planning.projectId, actorId);
  reason = reasonRequired(reason);
  if (row.status !== "Submitted") throw Error("Only a submitted schedule proposal can be rejected.");
  row.status = "Rejected"; row.decidedAt = new Date().toISOString(); row.decidedBy = actorId;
  row.decisionReason = reason; row.history.push(event("Rejected", actorId, reason));
}
export function captureScheduleBaseline(db: Database, projectId: string, actorId: string, reason: string): ScheduleSnapshot {
  manager(db, projectId, actorId);
  reason = reasonRequired(reason);
  const planning = activateProjectPlanning(db, projectId);
  const nodes = [...approvedNodeDates(db, planning)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dates]) => { const [kind, id] = key.split(":") as [NodeRef["kind"], string]; return { node: { kind, id }, ...dates }; });
  const snapshot: ScheduleSnapshot = {
    id: uid(), revision: planning.baselineHistory.length + 1,
    capturedAt: new Date().toISOString(), actorId, reason,
    calendar: structuredClone(planning.calendar), nodes,
    links: structuredClone(planning.links), finish: nodes.map((row) => row.finish).sort().at(-1) ?? db.projects.find((row) => row.id === projectId)!.start,
  };
  planning.baselineHistory.push(snapshot); planning.baselineStatus = "Captured";
  return snapshot;
}
export function reportTaskProgress(db: Database, taskId: string, percent: number, date: string, actorId: string, notes: string, evidenceRefs: string[] = []): void {
  actor(db, actorId);
  const task = db.tasks.find((row) => row.id === taskId);
  if (!task || !Number.isFinite(percent) || percent < 0 || percent > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw Error("Progress report is invalid.");
  const planning = activateProjectPlanning(db, task.projectId);
  const metadata = planning.taskPlanning.find((row) => row.taskId === taskId)!;
  metadata.progressHistory ??= [];
  metadata.progressHistory.push({ id: uid(), taskId, date, actorId, percent, notes, evidenceRefs, createdAt: new Date().toISOString() });
  task.progress = percent;
  task.status = percent === 100 ? "Completed" : percent > 0 && task.status === "Not Started" ? "In Progress" : task.status;
  if (percent === 100) task.completedAt ??= new Date().toISOString();
  task.updatedAt = new Date().toISOString();
}
export function completeManualMilestone(db: Database, milestoneId: string, actorId: string, reason: string): void {
  const milestone = db.milestones.find((row) => row.id === milestoneId);
  if (!milestone) throw Error("Milestone not found.");
  manager(db, milestone.projectId, actorId);
  reason = reasonRequired(reason);
  const planning = activateProjectPlanning(db, milestone.projectId);
  const metadata = planning.milestonePlanning.find((row) => row.milestoneId === milestoneId);
  if (!metadata || metadata.completionCondition.kind !== "Manual" || metadata.completedAt)
    throw Error("Only an incomplete manual milestone can be confirmed here.");
  metadata.completedAt = new Date().toISOString();
  metadata.completedBy = actorId;
  db.activities.unshift({ id: uid(), actorId, action: "Milestone condition confirmed",
    entityType: "Milestone", entityId: milestoneId, projectId: milestone.projectId,
    timestamp: metadata.completedAt, summary: reason });
}
