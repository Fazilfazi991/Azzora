import type { Database } from "../domain/model";
import {
  finishFromStart, inclusiveWorkingDuration, isWorkingDate, onOrAfter,
  onOrBefore, startFromFinish, validateCalendar, workOffset, workingDistance,
} from "./calendar";
import { getProjectPlanning } from "./compatibility";
import { nodeKey, reachableSuccessors, validateLinks } from "./graph";
import type {
  DependencyLink, LocalDate, NodeDates, NodeRef, PlanningView,
  ProjectCalendar, ProjectPlanning, ScheduleIssue, TaskPlanning,
} from "./model";

export interface ScheduleEdit {
  start?: LocalDate;
  finish?: LocalDate;
  durationWorkingDays?: number;
  links?: DependencyLink[];
  calendar?: ProjectCalendar;
  taskPlanning?: TaskPlanning[];
  milestonePlanning?: ProjectPlanning["milestonePlanning"];
  milestoneDate?: LocalDate;
}
export interface ScheduleCalculation {
  dates: Map<string, NodeDates>;
  links: DependencyLink[];
  calendar: ProjectCalendar;
  taskPlanning: TaskPlanning[];
  milestonePlanning: ProjectPlanning["milestonePlanning"];
  affected: Set<string>;
  warnings: ScheduleIssue[];
  conflicts: ScheduleIssue[];
  finish?: LocalDate;
}
const maxDate = (a: string, b: string) => a > b ? a : b;
const minDate = (a: string, b: string) => a < b ? a : b;
const issue = (code: string, detail: string, node?: NodeRef): ScheduleIssue => ({ code, detail, node });

export function approvedNodeDates(db: Database, planning: ProjectPlanning): Map<string, NodeDates> {
  const dates = new Map<string, NodeDates>();
  for (const task of db.tasks.filter((row) => row.projectId === planning.projectId)) {
    const metadata = planning.taskPlanning.find((row) => row.taskId === task.id);
    const inferred = inclusiveWorkingDuration(planning.calendar, task.start, task.due);
    dates.set(`task:${task.id}`, {
      start: task.start, finish: task.due,
      durationWorkingDays: metadata?.durationWorkingDays ?? inferred ?? 1,
    });
  }
  for (const milestone of db.milestones.filter((row) => row.projectId === planning.projectId))
    dates.set(`milestone:${milestone.id}`, { start: milestone.due, finish: milestone.due, durationWorkingDays: 0 });
  return dates;
}
function bound(calendar: ProjectCalendar, link: DependencyLink, predecessor: NodeDates, successorDuration: number): LocalDate {
  const offset = link.type === "FS" ? 1 + link.lagWorkingDays : link.lagWorkingDays;
  const anchor = link.type === "FS" || link.type === "FF" ? predecessor.finish : predecessor.start;
  const required = workOffset(calendar, anchor, offset);
  return link.type === "FF" || link.type === "SF"
    ? startFromFinish(calendar, required, successorDuration)
    : required;
}
export function linkFirstPermittedDate(calendar: ProjectCalendar, link: DependencyLink, predecessor: NodeDates, successorDuration: number): LocalDate {
  return bound(calendar, link, predecessor, successorDuration);
}
function checkedNode(db: Database, projectId: string, node: NodeRef): void {
  const collection = node.kind === "task" ? db.tasks : db.milestones;
  if (!collection.some((row) => row.id === node.id && row.projectId === projectId))
    throw Error("Planning node does not belong to this project.");
}
function finishFor(calendar: ProjectCalendar, start: string, duration: number): string {
  return finishFromStart(calendar, start, duration);
}
function actualAndConstraintConflicts(
  db: Database, planning: ProjectPlanning, dates: Map<string, NodeDates>,
  calendar: ProjectCalendar, affected: Set<string>, conflicts: ScheduleIssue[],
) {
  for (const task of db.tasks.filter((row) => row.projectId === planning.projectId)) {
    const node: NodeRef = { kind: "task", id: task.id };
    const key = nodeKey(node), entry = dates.get(key)!;
    const metadata = planning.taskPlanning.find((row) => row.taskId === task.id);
    if (!metadata) continue;
    if (affected.has(key) && (!isWorkingDate(calendar, entry.start) || !isWorkingDate(calendar, entry.finish)))
      conflicts.push(issue("NonworkingDate", `${task.name} has a proposed date outside the project working calendar.`, node));
    if (metadata.startNoEarlierThan && entry.start < metadata.startNoEarlierThan)
      conflicts.push(issue("StartConstraint", `${task.name} starts before its Start No Earlier Than constraint.`, node));
    if (metadata.finishNoLaterThan && entry.finish > metadata.finishNoLaterThan)
      conflicts.push(issue("FinishConstraint", `${task.name} finishes after its Finish No Later Than constraint.`, node));
    if (metadata.lockedStart && entry.start !== metadata.lockedStart)
      conflicts.push(issue("LockedStart", `${task.name} conflicts with its locked start.`, node));
    if (metadata.lockedFinish && entry.finish !== metadata.lockedFinish)
      conflicts.push(issue("LockedFinish", `${task.name} conflicts with its locked finish.`, node));
    if (metadata.actualStart && entry.start !== task.start)
      conflicts.push(issue("ActualStart", `${task.name} has actual start evidence and cannot move its approved start.`, node));
    if (metadata.actualFinish && entry.finish !== task.due)
      conflicts.push(issue("ActualFinish", `${task.name} has actual finish evidence and cannot move its approved finish.`, node));
    if (task.status === "Completed" && (entry.start !== task.start || entry.finish !== task.due))
      conflicts.push(issue("CompletedTask", `${task.name} is completed; its approved dates are fixed.`, node));
  }
  for (const milestone of db.milestones.filter((row) => row.projectId === planning.projectId)) {
    const node: NodeRef = { kind: "milestone", id: milestone.id };
    const entry = dates.get(nodeKey(node))!;
    const metadata = planning.milestonePlanning.find((row) => row.milestoneId === milestone.id);
    if (metadata?.requiredDate && entry.start !== metadata.requiredDate)
      conflicts.push(issue("RequiredMilestoneDate", `${milestone.name} conflicts with its required event date.`, node));
    if (metadata?.actualDate && entry.start !== milestone.due)
      conflicts.push(issue("ActualMilestoneDate", `${milestone.name} has an actual event date and cannot move.`, node));
    if (affected.has(nodeKey(node)) && !isWorkingDate(calendar, entry.start))
      conflicts.push(issue("NonworkingMilestone", `${milestone.name} event is on a nonworking date.`, node));
  }
}
export function calculateSchedule(
  db: Database, planning: ProjectPlanning, initiatingNode: NodeRef,
  edit: ScheduleEdit = {}, considerEarlierDates = false,
): ScheduleCalculation {
  checkedNode(db, planning.projectId, initiatingNode);
  const calendar = edit.calendar ?? planning.calendar;
  validateCalendar(calendar);
  const links = edit.links ?? planning.links;
  const order = validateLinks(db, planning.projectId, links);
  const taskPlanning = edit.taskPlanning ?? planning.taskPlanning;
  const milestonePlanning = edit.milestonePlanning ?? planning.milestonePlanning;
  const effectivePlanning = { ...planning, calendar, taskPlanning, milestonePlanning };
  const original = approvedNodeDates(db, planning);
  const dates = new Map([...original].map(([key, value]) => [key, { ...value }]));
  const initiatingKey = nodeKey(initiatingNode);
  const affected = reachableSuccessors(links, initiatingNode);
  affected.add(initiatingKey);
  if (edit.calendar) for (const node of order) affected.add(nodeKey(node));
  if (edit.links) {
    const oldById = new Map(planning.links.map((link) => [link.id, link]));
    const newIds = new Set(edit.links.map((link) => link.id));
    for (const link of edit.links) {
      if (JSON.stringify(oldById.get(link.id)) !== JSON.stringify(link)) {
        affected.add(nodeKey(link.successor));
        for (const key of reachableSuccessors(links, link.successor)) affected.add(key);
      }
    }
    for (const link of planning.links.filter((old) => !newIds.has(old.id))) {
      affected.add(nodeKey(link.successor));
      for (const key of reachableSuccessors(links, link.successor)) affected.add(key);
    }
  }
  if (edit.taskPlanning)
    for (const metadata of edit.taskPlanning) {
      const old = planning.taskPlanning.find((row) => row.taskId === metadata.taskId);
      if (JSON.stringify(old) !== JSON.stringify(metadata)) {
        const node: NodeRef = { kind: "task", id: metadata.taskId };
        affected.add(nodeKey(node));
        for (const key of reachableSuccessors(links, node)) affected.add(key);
      }
    }
  if (edit.milestonePlanning)
    for (const metadata of edit.milestonePlanning) {
      const old = planning.milestonePlanning.find((row) => row.milestoneId === metadata.milestoneId);
      if (JSON.stringify(old) !== JSON.stringify(metadata)) {
        const node: NodeRef = { kind: "milestone", id: metadata.milestoneId };
        affected.add(nodeKey(node));
        for (const key of reachableSuccessors(links, node)) affected.add(key);
      }
    }
  const warnings: ScheduleIssue[] = [], conflicts: ScheduleIssue[] = [];
  if (edit.taskPlanning)
    for (const metadata of edit.taskPlanning) {
      const entry = dates.get(`task:${metadata.taskId}`);
      if (entry && affected.has(`task:${metadata.taskId}`)) {
        entry.durationWorkingDays = metadata.durationWorkingDays;
        if (isWorkingDate(calendar, entry.start)) entry.finish = finishFor(calendar, entry.start, entry.durationWorkingDays);
      }
    }
  const direct = dates.get(initiatingKey)!;
  if (initiatingNode.kind === "milestone") {
    if (edit.durationWorkingDays !== undefined && edit.durationWorkingDays !== 0)
      throw Error("Milestones have zero working-day duration.");
    const eventDate = edit.milestoneDate ?? edit.start ?? edit.finish ?? direct.start;
    direct.start = eventDate; direct.finish = eventDate;
  } else {
    const revisedMetadata = taskPlanning.find((row) => row.taskId === initiatingNode.id);
    if (edit.taskPlanning && revisedMetadata) direct.durationWorkingDays = revisedMetadata.durationWorkingDays;
    if (edit.durationWorkingDays !== undefined) {
      if (!Number.isInteger(edit.durationWorkingDays) || edit.durationWorkingDays < 1)
        throw Error("Task duration must be at least one whole working day.");
      direct.durationWorkingDays = edit.durationWorkingDays;
    }
    if (edit.start) direct.start = edit.start;
    if (edit.finish && !edit.start && edit.durationWorkingDays === undefined) {
      const inferred = inclusiveWorkingDuration(calendar, direct.start, edit.finish);
      if (inferred === null) conflicts.push(issue("InvalidDirectDates", "Edited task dates do not form a working-day span.", initiatingNode));
      else direct.durationWorkingDays = inferred;
    }
    if (isWorkingDate(calendar, direct.start)) direct.finish = finishFor(calendar, direct.start, direct.durationWorkingDays);
    if (edit.finish && direct.finish !== edit.finish)
      conflicts.push(issue("DurationFinishMismatch", "Edited finish conflicts with start and working-day duration.", initiatingNode));
  }
  const incoming = new Map(order.map((node) => [nodeKey(node), links.filter((link) => nodeKey(link.successor) === nodeKey(node))]));
  for (const node of order) {
    const key = nodeKey(node);
    if (!affected.has(key)) continue;
    const current = dates.get(key)!;
    const originalNode = original.get(key)!;
    if (!isWorkingDate(calendar, current.start)) {
      conflicts.push(issue("NonworkingStart", `Proposed ${key} starts on a nonworking date.`, node));
      continue;
    }
    let earliest = current.start;
    if (key !== initiatingKey) earliest = considerEarlierDates
      ? onOrAfter(calendar, db.projects.find((p) => p.id === planning.projectId)!.start)
      : originalNode.start;
    const metadata = node.kind === "task" ? taskPlanning.find((row) => row.taskId === node.id) : undefined;
    if (metadata?.startNoEarlierThan) earliest = maxDate(earliest, onOrAfter(calendar, metadata.startNoEarlierThan));
    for (const link of incoming.get(key)!) {
      const predecessor = dates.get(nodeKey(link.predecessor))!;
      try {
        const required = bound(calendar, link, predecessor, current.durationWorkingDays);
        earliest = maxDate(earliest, required);
        if (link.lagWorkingDays < 0)
          warnings.push(issue("LeadOverlap", `${link.type} ${link.lagWorkingDays} permits overlap and needs explicit confirmation.`, node));
      } catch {
        conflicts.push(issue("InvalidLinkAnchor", `A dependency into ${key} uses a nonworking legacy anchor.`, node));
      }
    }
    if (earliest > current.start || (considerEarlierDates && key !== initiatingKey && earliest < current.start)) {
      current.start = earliest;
      current.finish = finishFor(calendar, earliest, current.durationWorkingDays);
    }
    if (key === initiatingKey && edit.finish && current.finish !== edit.finish)
      conflicts.push(issue("DependencyVsEdit", "Dependency bounds conflict with the requested finish.", node));
  }
  // Existing linked milestones are part of the same proposed change set; no independent saveTask side effect.
  for (const milestone of db.milestones.filter((row) => row.projectId === planning.projectId && row.taskId)) {
    const taskKey = `task:${milestone.taskId}`, key = `milestone:${milestone.id}`;
    if (!affected.has(taskKey) || affected.has(key)) continue;
    const oldTask = original.get(taskKey), newTask = dates.get(taskKey), event = dates.get(key);
    if (oldTask && newTask && event && oldTask.finish !== newTask.finish && event.start === oldTask.finish) {
      event.start = newTask.finish; event.finish = newTask.finish;
      affected.add(key);
    }
  }
  actualAndConstraintConflicts(db, effectivePlanning, dates, calendar, affected, conflicts);
  for (const link of links) {
    const predecessor = dates.get(nodeKey(link.predecessor))!;
    const successor = dates.get(nodeKey(link.successor))!;
    try {
      if (successor.start < bound(calendar, link, predecessor, successor.durationWorkingDays))
        conflicts.push(issue("ProposedDependencyConflict", `Proposed dates violate ${link.type} dependency ${link.id}.`, link.successor));
    } catch {
      conflicts.push(issue("InvalidProposedLink", `Dependency ${link.id} cannot be evaluated on the project calendar.`, link.successor));
    }
  }
  const finishes = [...dates.values()].map((row) => row.finish);
  return { dates, links, calendar, taskPlanning, milestonePlanning, affected,
    warnings, conflicts, finish: finishes.length ? finishes.sort().at(-1) : undefined };
}

function cpm(db: Database, planning: ProjectPlanning, dates: Map<string, NodeDates>): {
  float: Map<string, number>; conflicts: ScheduleIssue[]; feasible: boolean;
} {
  const conflicts: ScheduleIssue[] = [];
  const order = validateLinks(db, planning.projectId, planning.links);
  const calendar = planning.calendar;
  for (const node of order) {
    const date = dates.get(nodeKey(node))!;
    if (!isWorkingDate(calendar, date.start) || !isWorkingDate(calendar, date.finish))
      conflicts.push(issue("NonworkingApprovedDate", `${nodeKey(node)} has an approved nonworking date.`, node));
    for (const link of planning.links.filter((row) => nodeKey(row.successor) === nodeKey(node))) {
      try {
        if (date.start < bound(calendar, link, dates.get(nodeKey(link.predecessor))!, date.durationWorkingDays))
          conflicts.push(issue("ApprovedDependencyConflict", `${nodeKey(node)} violates ${link.type} dependency ${link.id}.`, node));
      } catch { conflicts.push(issue("InvalidApprovedLink", `Link ${link.id} cannot be evaluated on the project calendar.`, node)); }
    }
  }
  actualAndConstraintConflicts(db, planning, dates, calendar, new Set(), conflicts);
  if (conflicts.length) return { float: new Map(), conflicts, feasible: false };
  // Event-point CPM: each link supplies a start-to-start offset in working days.
  const earliest = new Map<string, string>();
  for (const node of order) {
    const key = nodeKey(node), approved = dates.get(key)!;
    let start = approved.start;
    for (const link of planning.links.filter((row) => nodeKey(row.successor) === key))
      start = maxDate(start, bound(calendar, link, {
        ...dates.get(nodeKey(link.predecessor))!,
        start: earliest.get(nodeKey(link.predecessor))!,
        finish: finishFor(calendar, earliest.get(nodeKey(link.predecessor))!, dates.get(nodeKey(link.predecessor))!.durationWorkingDays),
      }, approved.durationWorkingDays));
    earliest.set(key, start);
  }
  const finish = [...order].map((node) => finishFor(calendar, earliest.get(nodeKey(node))!, dates.get(nodeKey(node))!.durationWorkingDays)).sort().at(-1);
  const latest = new Map<string, string>();
  if (!finish) return { float: new Map(), conflicts, feasible: true };
  for (const node of [...order].reverse()) {
    const key = nodeKey(node), duration = dates.get(key)!.durationWorkingDays;
    let upper = startFromFinish(calendar, finish, duration);
    for (const link of planning.links.filter((row) => nodeKey(row.predecessor) === key)) {
      const successorLatest = latest.get(nodeKey(link.successor))!;
      const successorDuration = dates.get(nodeKey(link.successor))!.durationWorkingDays;
      const predAnchorOffset = link.type === "FS" || link.type === "FF" ? duration - 1 : 0;
      const succAnchorOffset = link.type === "FF" || link.type === "SF" ? successorDuration - 1 : 0;
      const linkOffset = (link.type === "FS" ? 1 : 0) + link.lagWorkingDays;
      const maxPredStart = workOffset(calendar, successorLatest, succAnchorOffset - predAnchorOffset - linkOffset);
      upper = minDate(upper, maxPredStart);
    }
    latest.set(key, upper);
  }
  const float = new Map<string, number>();
  for (const node of order) {
    const key = nodeKey(node), amount = workingDistance(calendar, earliest.get(key)!, latest.get(key)!);
    if (amount < 0) conflicts.push(issue("NegativeFloat", `${key} has negative total float.`, node));
    float.set(key, amount);
  }
  return { float: conflicts.length ? new Map() : float, conflicts, feasible: conflicts.length === 0 };
}

export function getPlanningView(db: Database, projectId: string, asOf?: LocalDate): PlanningView {
  const project = db.projects.find((row) => row.id === projectId);
  if (!project) throw Error("Planning project not found.");
  const planning = getProjectPlanning(db, projectId);
  const dates = approvedNodeDates(db, planning);
  const path = cpm(db, planning, dates);
  const activeProposal = [...planning.proposals].reverse().find((row) =>
    !row.revisedByProposalId && (row.status === "Draft" || row.status === "Submitted"));
  const baseline = planning.baselineHistory.at(-1);
  const baselineMap = new Map(baseline?.nodes.map((row) => [nodeKey(row.node), row]) ?? []);
  const proposedMap = new Map(activeProposal?.changes.map((row) => [nodeKey(row.node), row.after]) ?? []);
  let totalWeight = 0, weighted = 0;
  const nodes = [
    ...db.tasks.filter((row) => row.projectId === projectId).map((row) => ({ node: { kind: "task" as const, id: row.id }, name: row.name, progress: row.progress })),
    ...db.milestones.filter((row) => row.projectId === projectId).map((row) => ({ node: { kind: "milestone" as const, id: row.id }, name: row.name, progress: 0 })),
  ].map((item) => {
    const key = nodeKey(item.node), approved = dates.get(key)!;
    const metadata = item.node.kind === "task" ? planning.taskPlanning.find((row) => row.taskId === item.node.id) : undefined;
    const scheduleRole = item.node.kind === "milestone" ? "milestone" as const : metadata?.scheduleRole ?? "work";
    const milestoneMetadata = item.node.kind === "milestone"
      ? planning.milestonePlanning.find((row) => row.milestoneId === item.node.id) : undefined;
    const condition = milestoneMetadata?.completionCondition;
    const completionSatisfied = item.node.kind === "task" ? item.progress === 100 :
      condition?.kind === "Manual" ? !!milestoneMetadata?.completedAt :
      condition?.kind === "TaskComplete" ? db.tasks.find((task) => task.id === condition.taskId)?.progress === 100 :
      condition?.kind === "DocumentApproved" ? db.documents.find((doc) => doc.id === condition.documentId)?.status === "Approved" :
      condition?.kind === "QAApproved" ? db.snags.find((snag) => snag.id === condition.referenceId)?.status === "Closed" : false;
    if (scheduleRole === "work" && !db.tasks.some((child) => child.parentId === item.node.id)) {
      const weight = metadata?.explicitProgressWeight ?? approved.durationWorkingDays;
      if (weight > 0) { totalWeight += weight; weighted += weight * item.progress; }
    }
    let plannedProgress = 0;
    if (asOf && scheduleRole === "work" && isWorkingDate(planning.calendar, approved.start)) {
      if (asOf >= approved.finish) plannedProgress = 100;
      else if (asOf >= approved.start) {
        try { plannedProgress = Math.round((workingDistance(planning.calendar, approved.start, onOrBefore(planning.calendar, asOf)) + 1) / approved.durationWorkingDays * 100); }
        catch { plannedProgress = 0; }
      }
    }
    return { ...item, approved, baseline: baselineMap.get(key), proposed: proposedMap.get(key),
      totalFloatWorkingDays: path.float.get(key), critical: path.feasible && path.float.get(key) === 0,
      scheduleRole, plannedProgress, completionSatisfied };
  });
  const warnings: ScheduleIssue[] = [...(activeProposal?.warnings ?? [])];
  for (const row of planning.taskPlanning.filter((item) => item.durationNeedsReview))
    warnings.push(issue("DurationNeedsReview", `Task ${row.taskId} has legacy off-calendar dates; original dates were preserved.`, { kind: "task", id: row.taskId }));
  const blockers: PlanningView["blockers"] = [];
  for (const task of db.tasks.filter((row) => row.projectId === projectId)) {
    const node: NodeRef = { kind: "task", id: task.id };
    if (task.assigneeId && db.people.find((person) => person.id === task.assigneeId)?.status === "Inactive")
      blockers.push({ code: "InactiveAssignee", detail: `${task.name} has an inactive assigned person.`, node, sourceId: task.assigneeId });
    for (const id of planning.taskPlanning.find((row) => row.taskId === task.id)?.requiredInspectionIds ?? []) {
      const snag = db.snags.find((row) => row.id === id);
      if (!snag || snag.status !== "Closed") blockers.push({ code: "InspectionPending", detail: `${task.name} awaits inspection ${id}.`, node, sourceId: id });
    }
  }
  for (const row of planning.milestonePlanning) {
    const condition = row.completionCondition;
    const node: NodeRef = { kind: "milestone", id: row.milestoneId };
    if (condition.kind === "Manual" && !row.completedAt)
      blockers.push({ code: "ManualMilestonePending", detail: `Milestone ${row.milestoneId} awaits explicit Project Manager confirmation.`, node, sourceId: row.milestoneId });
    if (condition.kind === "TaskComplete" && db.tasks.find((task) => task.id === condition.taskId)?.progress !== 100)
      blockers.push({ code: "TaskIncomplete", detail: `Milestone ${row.milestoneId} awaits task completion.`, node, sourceId: condition.taskId });
    if (condition.kind === "DocumentApproved" && db.documents.find((doc) => doc.id === condition.documentId)?.status !== "Approved")
      blockers.push({ code: "DocumentPending", detail: `Milestone ${row.milestoneId} awaits document approval.`, node, sourceId: condition.documentId });
    if (condition.kind === "QAApproved" && db.snags.find((snag) => snag.id === condition.referenceId)?.status !== "Closed")
      blockers.push({ code: "QAPending", detail: `Milestone ${row.milestoneId} awaits QA closure.`, node, sourceId: condition.referenceId });
  }
  for (const doc of db.documents.filter((row) => row.projectId === projectId && row.category === "Approvals" && row.status === "Pending"))
    blockers.push({ code: "DocumentPending", detail: `${doc.name} awaits approval.`, sourceId: doc.id });
  for (const snag of db.snags.filter((row) => row.projectId === projectId && row.status !== "Closed"))
    blockers.push({ code: "QAPending", detail: `${snag.description} remains open.`, sourceId: snag.id });
  for (const update of db.updates.filter((row) => row.projectId === projectId &&
    (row.reviewStatus === "Pending" || row.reviewStatus === "Changes Requested")))
    blockers.push({ code: "SiteUpdateReview", detail: `Site report dated ${update.date} awaits review.`, sourceId: update.id });
  for (const handover of db.handover.filter((row) => row.projectId === projectId && row.required && row.applicable && !row.complete))
    blockers.push({ code: "HandoverPending", detail: `${handover.name} remains incomplete.`, sourceId: handover.id });
  return { projectId, calendar: planning.calendar, links: planning.links, nodes, proposals: planning.proposals,
    activeProposal, baselineStatus: planning.baselineStatus, approvedRevision: planning.approvedRevision,
    approvedFinish: [...dates.values()].map((row) => row.finish).sort().at(-1), baselineFinish: baseline?.finish,
    proposedFinish: activeProposal ? [...dates].map(([key, approved]) =>
      proposedMap.get(key)?.finish ?? approved.finish).sort().at(-1) : undefined,
    targetFinish: project.due, planningProgress: totalWeight ? Math.round(weighted / totalWeight) : 0,
    warnings, blockers, conflicts: [...path.conflicts, ...(activeProposal?.conflicts ?? [])], criticalPathFeasible: path.feasible };
}

export function sourceFingerprint(db: Database, projectId: string): string {
  const planning = getProjectPlanning(db, projectId);
  const data = JSON.stringify({
    calendar: planning.calendar,
    links: [...planning.links].sort((a, b) => a.id.localeCompare(b.id)),
    taskPlanning: [...planning.taskPlanning].sort((a, b) => a.taskId.localeCompare(b.taskId)),
    milestonePlanning: [...planning.milestonePlanning].sort((a, b) => a.milestoneId.localeCompare(b.milestoneId)),
    tasks: db.tasks.filter((row) => row.projectId === projectId).map((row) => ({
      id: row.id, start: row.start, due: row.due, status: row.status,
      completedAt: row.completedAt,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    milestones: db.milestones.filter((row) => row.projectId === projectId).map((row) => ({ id: row.id, due: row.due })).sort((a, b) => a.id.localeCompare(b.id)),
  });
  // Deterministic fingerprint; no secret material or security claim.
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
