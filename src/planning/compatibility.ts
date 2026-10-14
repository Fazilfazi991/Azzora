import type { Database } from "../domain/model";
import { defaultCalendar, inclusiveWorkingDuration, validDate, validateCalendar } from "./calendar";
import { nodeKey, validateLinks } from "./graph";
import type { DependencyLink, ProjectPlanning, TaskPlanning } from "./model";

function legacyLinkId(projectId: string, predecessorId: string, successorId: string): string {
  return `legacy:${projectId}:${predecessorId}:${successorId}`;
}
export function getProjectPlanning(db: Database, projectId: string): ProjectPlanning {
  if (!db.projects.some((p) => p.id === projectId)) throw Error("Planning project not found.");
  const existing = db.planning?.find((p) => p.projectId === projectId);
  if (existing) return existing;
  const calendar = defaultCalendar();
  const links: DependencyLink[] = db.tasks
    .filter((task) => task.projectId === projectId)
    .flatMap((task) => task.dependencies.map((predecessorId) => ({
      id: legacyLinkId(projectId, predecessorId, task.id), projectId,
      predecessor: { kind: "task" as const, id: predecessorId },
      successor: { kind: "task" as const, id: task.id },
      type: "FS" as const, lagWorkingDays: 0, createdAt: task.createdAt,
    })));
  validateLinks(db, projectId, links);
  const taskPlanning: TaskPlanning[] = db.tasks
    .filter((task) => task.projectId === projectId)
    .map((task) => {
      const duration = inclusiveWorkingDuration(calendar, task.start, task.due);
      return {
        taskId: task.id,
        durationWorkingDays: duration ?? 1,
        durationNeedsReview: duration === null,
        scheduleRole: db.tasks.some((child) => child.parentId === task.id) ? "summary" : "work",
      };
    });
  return {
    projectId, enabled: false, calendar, approvedRevision: 0,
    baselineStatus: "Unset", baselineHistory: [], taskPlanning,
    milestonePlanning: db.milestones.filter((m) => m.projectId === projectId)
      .map((m) => ({ milestoneId: m.id, completionCondition: m.taskId
        ? { kind: "TaskComplete" as const, taskId: m.taskId }
        : { kind: "Manual" as const } })),
    links, proposals: [],
  };
}
export function activateProjectPlanning(db: Database, projectId: string): ProjectPlanning {
  const existing = db.planning?.find((p) => p.projectId === projectId);
  if (existing) { existing.enabled = true; return existing; }
  const planning = structuredClone(getProjectPlanning(db, projectId));
  planning.enabled = true;
  db.planningVersion = 1;
  db.planning ??= [];
  db.planning.push(planning);
  return planning;
}
export function validatePlanningData(db: Database): void {
  if (db.planningVersion !== undefined && db.planningVersion !== 1)
    throw Error("Saved planning version is incompatible; export original data for recovery.");
  if ((db.planningVersion === undefined) !== (db.planning === undefined))
    throw Error("Saved planning version and project records are inconsistent.");
  if (db.planning === undefined) {
    for (const project of db.projects) getProjectPlanning(db, project.id);
    return;
  }
  if (!Array.isArray(db.planning)) throw Error("Saved planning data is incompatible.");
  const seen = new Set<string>();
  for (const planning of db.planning) {
    if (!planning || typeof planning !== "object" || !db.projects.some((p) => p.id === planning.projectId) || seen.has(planning.projectId))
      throw Error("Saved planning project records are invalid or duplicated.");
    seen.add(planning.projectId);
    validateCalendar(planning.calendar);
    if (!Number.isInteger(planning.approvedRevision) || planning.approvedRevision < 0 ||
        !["Unset", "Captured"].includes(planning.baselineStatus) ||
        !Array.isArray(planning.baselineHistory) || !Array.isArray(planning.taskPlanning) ||
        !Array.isArray(planning.milestonePlanning) || !Array.isArray(planning.links) || !Array.isArray(planning.proposals))
      throw Error("Saved planning state is incompatible.");
    validateLinks(db, planning.projectId, planning.links);
    const taskIds = new Set<string>();
    for (const row of planning.taskPlanning) {
      if (!db.tasks.some((t) => t.id === row.taskId && t.projectId === planning.projectId) ||
          taskIds.has(row.taskId) || !Number.isInteger(row.durationWorkingDays) || row.durationWorkingDays < 1 ||
          !["work", "summary"].includes(row.scheduleRole))
        throw Error("Saved planning task metadata is invalid.");
      taskIds.add(row.taskId);
      const owner = db.tasks.find((task) => task.id === row.taskId)!;
      if ([row.startNoEarlierThan, row.finishNoLaterThan, row.lockedStart, row.lockedFinish,
        row.actualStart, row.actualFinish].some((date) => date !== undefined && !validDate(date)))
        throw Error("Saved task planning constraint date is invalid.");
      if (row.assigneeIds?.some((personId) => !db.people.some((person) => person.id === personId)) ||
          row.requiredInspectionIds?.some((id) => !db.snags.some((snag) => snag.id === id && snag.projectId === planning.projectId)))
        throw Error("Saved task planning people or inspection reference is invalid.");
      if (row.progressHistory?.some((event) => event.taskId !== row.taskId ||
          !db.people.some((person) => person.id === event.actorId)))
        throw Error("Saved progress history reference is invalid.");
      if (row.scheduleRole === "summary" && !db.tasks.some((task) => task.parentId === owner.id))
        throw Error("Saved summary planning role has no child tasks.");
    }
    const milestoneIds = new Set<string>();
    for (const row of planning.milestonePlanning) {
      if (!db.milestones.some((m) => m.id === row.milestoneId && m.projectId === planning.projectId) ||
          milestoneIds.has(row.milestoneId) || !row.completionCondition ||
          !["Manual", "TaskComplete", "DocumentApproved", "QAApproved"].includes(row.completionCondition.kind))
        throw Error("Saved planning milestone metadata is invalid.");
      milestoneIds.add(row.milestoneId);
      if ([row.requiredDate, row.actualDate].some((date) => date !== undefined && !validDate(date)))
        throw Error("Saved milestone planning date is invalid.");
      const condition = row.completionCondition;
      if (condition.kind === "TaskComplete" && !db.tasks.some((task) => task.id === condition.taskId && task.projectId === planning.projectId) ||
          condition.kind === "DocumentApproved" && !db.documents.some((doc) => doc.id === condition.documentId && doc.projectId === planning.projectId) ||
          condition.kind === "QAApproved" && !db.snags.some((snag) => snag.id === condition.referenceId && snag.projectId === planning.projectId))
        throw Error("Saved milestone condition points outside its project.");
    }
    if ((planning.baselineStatus === "Unset" && planning.baselineHistory.length) ||
        (planning.baselineStatus === "Captured" && !planning.baselineHistory.length))
      throw Error("Saved planning baseline state is incompatible.");
    const snapshotIds = new Set<string>();
    for (const [index, snapshot] of planning.baselineHistory.entries()) {
      if (snapshotIds.has(snapshot.id) || snapshot.revision !== index + 1 || !db.people.some((person) => person.id === snapshot.actorId))
        throw Error("Saved baseline snapshot revision or actor is invalid.");
      snapshotIds.add(snapshot.id);
      validateCalendar(snapshot.calendar);
      const nodes = new Set<string>();
      for (const item of snapshot.nodes) {
        const key = nodeKey(item.node);
        if (nodes.has(key) || !validDate(item.start) || !validDate(item.finish) || item.finish < item.start ||
            !Number.isInteger(item.durationWorkingDays) || item.durationWorkingDays < 0 ||
            (item.node.kind === "milestone" && (item.start !== item.finish || item.durationWorkingDays !== 0)))
          throw Error("Saved baseline node snapshot is incompatible.");
        nodes.add(key);
      }
      if (!validDate(snapshot.finish) || (snapshot.nodes.length > 0 &&
          snapshot.finish !== snapshot.nodes.map((item) => item.finish).sort().at(-1)))
        throw Error("Saved baseline finish does not match its immutable node snapshot.");
      const snapshotLinks = new Set<string>();
      for (const link of snapshot.links) {
        const pair = `${nodeKey(link.predecessor)}>${nodeKey(link.successor)}`;
        if (link.projectId !== planning.projectId || !nodes.has(nodeKey(link.predecessor)) ||
            !nodes.has(nodeKey(link.successor)) || snapshotLinks.has(pair) || !Number.isInteger(link.lagWorkingDays))
          throw Error("Saved baseline link snapshot is incompatible.");
        snapshotLinks.add(pair);
      }
      const visit = (key: string, visiting: Set<string>, done: Set<string>): void => {
        if (visiting.has(key)) throw Error("Saved baseline link snapshot has a cycle.");
        if (done.has(key)) return;
        visiting.add(key);
        for (const link of snapshot.links.filter((row) => nodeKey(row.predecessor) === key))
          visit(nodeKey(link.successor), visiting, done);
        visiting.delete(key); done.add(key);
      };
      const done = new Set<string>();
      for (const key of nodes) visit(key, new Set(), done);
    }
    const proposalIds = new Set<string>();
    const revisions = new Set<number>();
    for (const proposal of planning.proposals) {
      if (proposalIds.has(proposal.id) || proposal.projectId !== planning.projectId ||
          revisions.has(proposal.revision) || !Number.isInteger(proposal.revision) || proposal.revision < 1 ||
          !["Draft", "Submitted", "Approved", "Rejected"].includes(proposal.status) ||
          !Array.isArray(proposal.changes) || !Array.isArray(proposal.history))
        throw Error("Saved planning proposal is incompatible.");
      proposalIds.add(proposal.id);
      revisions.add(proposal.revision);
      if (proposal.sourceApprovedRevision > planning.approvedRevision ||
          !db.people.some((person) => person.id === proposal.initiatedBy) ||
          !proposal.history.length || proposal.history[0].action !== "Drafted")
        throw Error("Saved planning proposal origin is incompatible.");
      const initiatorExists = proposal.initiatingNode.kind === "task"
        ? db.tasks.some((task) => task.id === proposal.initiatingNode.id && task.projectId === planning.projectId) || proposal.proposedTask?.id === proposal.initiatingNode.id
        : db.milestones.some((milestone) => milestone.id === proposal.initiatingNode.id && milestone.projectId === planning.projectId) || proposal.proposedMilestone?.id === proposal.initiatingNode.id;
      if (!initiatorExists) throw Error("Saved planning proposal initiator is missing.");
      if (proposal.status === "Submitted" && (!proposal.submittedAt || !proposal.submittedBy) ||
          ["Approved", "Rejected"].includes(proposal.status) && (!proposal.decidedAt || !proposal.decidedBy))
        throw Error("Saved planning proposal decision state is incomplete.");
      if (proposal.proposedCalendar) validateCalendar(proposal.proposedCalendar);
      if (proposal.proposedLinks) validateLinks(db, planning.projectId, proposal.proposedLinks);
      if (proposal.requestedEdit?.links) validateLinks(db, planning.projectId, proposal.requestedEdit.links);
      for (const change of proposal.changes) {
        const exists = change.node.kind === "task"
          ? db.tasks.some((task) => task.id === change.node.id && task.projectId === planning.projectId)
          : db.milestones.some((milestone) => milestone.id === change.node.id && milestone.projectId === planning.projectId);
        if (!exists || !validDate(change.before.start) || !validDate(change.before.finish) ||
            !validDate(change.after.start) || !validDate(change.after.finish) ||
            change.before.finish < change.before.start || change.after.finish < change.after.start)
          throw Error("Saved planning proposal date change is incompatible.");
      }
      if (proposal.proposedTask && (proposal.proposedTask.projectId !== planning.projectId ||
          !db.phases.some((phase) => phase.id === proposal.proposedTask!.phaseId && phase.projectId === planning.projectId)))
        throw Error("Saved proposed task points outside its project.");
      if (proposal.proposedMilestone && proposal.proposedMilestone.projectId !== planning.projectId)
        throw Error("Saved proposed milestone points outside its project.");
    }
  }
  for (const project of db.projects) getProjectPlanning(db, project.id);
}
