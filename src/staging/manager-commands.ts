/** Finite server-side nonfinancial commands. Never accepts a replacement Database. */
import { AccessDenied, type BackendAction } from "../backend/permissions";
import type {
  Database,
  DocumentRecord,
  Milestone,
  Person,
  Project,
  SiteUpdate,
  Snag,
  Task,
} from "../domain/model";
import {
  completeProject,
  projectSchema,
  record,
  saveTask,
  taskSchema,
} from "../domain/repository";
import { uid, taskProgress } from "../domain/logic";
import * as workforce from "../workforce/commands";
import * as planning from "../planning/commands";
import {
  instantiateFitOutTemplate,
  type FitOutTemplatePreview,
} from "../planning/template";
import { getProjectPlanning } from "../planning/compatibility";
import { inclusiveWorkingDuration, validDate } from "../planning/calendar";
import type { DependencyLink, NodeRef, TaskPlanning } from "../planning/model";
import type { ScheduleEdit } from "../planning/engine";
import type {
  SharedActor,
  SharedCommand,
  SharedCompanyState,
  SharedCommandScope,
} from "./domain";

export const managerCommandNames = [
  "task.save",
  "task.progress",
  "planning.propose",
  "planning.template",
  "planning.milestone",
  "planning.submit",
  "planning.approve",
  "planning.reject",
  "planning.baseline",
  "planning.milestone-complete",
  "employee.save",
  "employee.status",
  "assignment.remove",
  "document.save",
  "document.revise",
  "document.review",
  "site.save",
  "site.review",
  "snag.save",
  "handover.check",
  "project.complete",
  "project.update",
  "project.weights",
] as const;
export const isManagerCommand = (kind: string) =>
  (managerCommandNames as readonly string[]).includes(kind);
const obj = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Command fields are required.");
  return value as Record<string, unknown>;
};
const str = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim() || value.length > 500)
    throw Error(`${label} is required.`);
  return value;
};
const forbidden = (message: string): never => {
  throw new AccessDenied(message);
};
const privileged = (actor: SharedActor) =>
  actor.grant.roles.some((role) =>
    ["owner", "admin", "project_manager"].includes(role),
  );
const isOwner = (actor: SharedActor) =>
  actor.grant.roles.some((role) => ["owner", "admin"].includes(role));
const staffCapabilities: Record<string, string> = {
  "task.save": "task.update",
  "task.progress": "task.update",
  "site.save": "site.submit",
  "document.save": "document.submit",
  "document.revise": "document.submit",
  "document.review": "document.submit",
  "snag.save": "qa.update",
};

/** Existing entity IDs always resolve their authoritative project before authorization. */
export function managerCommandScope(
  state: SharedCompanyState,
  command: SharedCommand,
): SharedCommandScope | undefined {
  if (!isManagerCommand(command.kind)) return undefined;
  const p = obj(command.payload),
    db = state.manager;
  const nested =
    p.task || p.project || p.document || p.update || p.snag || p.milestone;
  const candidate = nested ? obj(nested) : {};
  const id = typeof p.id === "string" ? p.id : candidate.id;
  let projectId: string | undefined;
  if (command.kind.startsWith("task."))
    projectId = db.tasks.find((value) => value.id === id)?.projectId;
  else if (command.kind.startsWith("document."))
    projectId = db.documents.find((value) => value.id === id)?.projectId;
  else if (command.kind.startsWith("site."))
    projectId = db.updates.find((value) => value.id === id)?.projectId;
  else if (command.kind === "snag.save")
    projectId = db.snags.find((value) => value.id === id)?.projectId;
  else if (command.kind === "assignment.remove")
    projectId = db.assignments.find((value) => value.id === id)?.projectId;
  else if (command.kind === "handover.check")
    projectId = db.handover.find((value) => value.id === id)?.projectId;
  else if (command.kind.startsWith("project."))
    projectId = db.projects.find((value) => value.id === id)?.id;
  else if (
    ["planning.submit", "planning.approve", "planning.reject"].includes(
      command.kind,
    )
  )
    projectId = db.planning?.find((value) =>
      value.proposals.some((proposal) => proposal.id === id),
    )?.projectId;
  else if (command.kind === "planning.milestone-complete")
    projectId = db.milestones.find((value) => value.id === id)?.projectId;
  if (projectId && candidate.projectId && projectId !== candidate.projectId)
    throw Error("A record cannot move to another project.");
  projectId ||=
    typeof candidate.projectId === "string"
      ? candidate.projectId
      : typeof p.projectId === "string"
        ? p.projectId
        : undefined;
  if (!command.kind.startsWith("employee.") && !projectId)
    throw Error("Choose an existing project record.");
  return {
    workspace: "manager",
    projectId,
    financial: false,
    capability: (command.kind.startsWith("employee.")
      ? "access.manage"
      : staffCapabilities[command.kind] || "project.write") as BackendAction,
  };
}

function assignedPerson(db: Database, id: string, projectId: string) {
  workforce.activePerson(db, id);
  if (
    !db.assignments.some(
      (value) =>
        value.projectId === projectId &&
        value.personId === id &&
        value.status === "Active",
    ) &&
    db.projects.find((value) => value.id === projectId)?.managerId !== id
  )
    forbidden("Choose an active employee assigned to this project.");
}
function manager(db: Database, projectId: string, actor: SharedActor) {
  if (
    !privileged(actor) ||
    db.projects.find((value) => value.id === projectId)?.managerId !==
      actor.userId
  )
    forbidden("Only the designated Project Manager may decide this schedule.");
}
function ownDocument(db: Database, id: string, actor: SharedActor) {
  const old = db.documents.find((value) => value.id === id);
  if (!privileged(actor) && old && old.uploadedBy !== actor.userId)
    forbidden("Only your own document submissions may be changed.");
}
function note(p: Record<string, unknown>) {
  return str(p.reason ?? p.note, "Review reason");
}
function validatePlanningMetadata(
  db: Database,
  projectId: string,
  edit: ScheduleEdit,
) {
  const current = getProjectPlanning(db, projectId);
  if (edit.taskPlanning) {
    if (
      edit.taskPlanning.length !== current.taskPlanning.length ||
      new Set(edit.taskPlanning.map((value) => value.taskId)).size !==
        current.taskPlanning.length
    )
      throw Error("Retain each existing task planning record exactly once.");
    for (const value of edit.taskPlanning) {
      const original = current.taskPlanning.find(
        (item) => item.taskId === value.taskId,
      );
      if (
        !original ||
        JSON.stringify(value.progressHistory) !==
          JSON.stringify(original.progressHistory)
      )
        throw Error("Schedule proposals cannot rewrite progress history.");
      if (
        !Number.isSafeInteger(value.durationWorkingDays) ||
        value.durationWorkingDays < 1 ||
        !["work", "summary"].includes(value.scheduleRole)
      )
        throw Error("Task duration and planning role are invalid.");
      for (const field of [
        "startNoEarlierThan",
        "finishNoLaterThan",
        "lockedStart",
        "lockedFinish",
        "actualStart",
        "actualFinish",
      ] as const)
        if (value[field] && !validDate(value[field]!))
          throw Error("Task planning contains an invalid constraint date.");
      for (const id of value.assigneeIds || [])
        assignedPerson(db, id, projectId);
    }
  }
  if (edit.milestonePlanning) {
    if (
      edit.milestonePlanning.length !== current.milestonePlanning.length ||
      new Set(edit.milestonePlanning.map((value) => value.milestoneId)).size !==
        current.milestonePlanning.length
    )
      throw Error(
        "Retain each existing milestone planning record exactly once.",
      );
    for (const value of edit.milestonePlanning) {
      const original = current.milestonePlanning.find(
        (item) => item.milestoneId === value.milestoneId,
      );
      if (
        !original ||
        value.completedAt !== original.completedAt ||
        value.completedBy !== original.completedBy
      )
        throw Error(
          "Schedule proposals cannot rewrite milestone completion history.",
        );
      for (const date of [value.requiredDate, value.actualDate])
        if (date && !validDate(date))
          throw Error("Milestone planning contains an invalid date.");
      const condition = value.completionCondition;
      if (
        !condition ||
        !["Manual", "TaskComplete", "DocumentApproved", "QAApproved"].includes(
          condition.kind,
        )
      )
        throw Error("Choose a supported milestone completion condition.");
      if (
        (condition.kind === "TaskComplete" &&
          !db.tasks.some(
            (item) =>
              item.id === condition.taskId && item.projectId === projectId,
          )) ||
        (condition.kind === "DocumentApproved" &&
          !db.documents.some(
            (item) =>
              item.id === condition.documentId && item.projectId === projectId,
          )) ||
        (condition.kind === "QAApproved" &&
          !db.snags.some(
            (item) =>
              item.id === condition.referenceId && item.projectId === projectId,
          ))
      )
        throw Error("Milestone evidence must belong to the same project.");
    }
  }
}

/** Mutates only a server-owned clone; caller commits all resulting records atomically. */
export function applyManagerCommand(
  state: SharedCompanyState,
  command: SharedCommand,
  actor: SharedActor,
): boolean {
  const scope = managerCommandScope(state, command);
  if (!scope) return false;
  const p = obj(command.payload),
    db = state.manager,
    projectId = scope.projectId || "";
  const previousActivities = new Set(db.activities.map((value) => value.id));
  workforce.activePerson(db, actor.userId);
  if (command.kind.startsWith("employee.")) {
    if (!isOwner(actor) || !actor.grant.capabilities.includes("access.manage"))
      forbidden("Only an authorized Owner may manage employee profiles.");
  } else if (privileged(actor)) {
    if (!actor.grant.capabilities.includes("project.write"))
      forbidden("Manager write capability is required.");
  } else if (
    !actor.grant.roles.includes("site_staff") ||
    !Object.hasOwn(staffCapabilities, command.kind) ||
    !scope.capability ||
    !actor.grant.capabilities.some((value) => value === scope.capability)
  )
    forbidden("This Manager command is not permitted for your role.");
  if (
    projectId &&
    (!db.projects.some((value) => value.id === projectId) ||
      !actor.grant.projectIds.includes(projectId))
  )
    forbidden("Assigned project access is required.");
  switch (command.kind) {
    case "project.weights": {
      if (!privileged(actor) || !Array.isArray(p.weights))
        forbidden("Project phase weights require a Project Manager.");
      const weights = p.weights as { id: string; weight: number }[];
      const phases = db.phases.filter((value) => value.projectId === projectId);
      if (
        weights.length !== phases.length ||
        new Set(weights.map((value) => value.id)).size !== phases.length ||
        weights.some(
          (value) =>
            !phases.some((phase) => phase.id === value.id) ||
            !Number.isFinite(value.weight) ||
            value.weight < 0,
        ) ||
        Math.abs(weights.reduce((sum, value) => sum + value.weight, 0) - 100) >
          0.001
      )
        throw Error(
          "Use every project phase once with nonnegative weights totaling 100.",
        );
      phases.forEach((phase) => {
        phase.weight = weights.find((value) => value.id === phase.id)!.weight;
      });
      record(
        db,
        projectId,
        "Project",
        projectId,
        "Phase weights updated",
        "Project phase weights confirmed",
        undefined,
        actor.userId,
      );
      break;
    }
    case "employee.save": {
      const input = structuredClone(obj(p.employee)) as unknown as Person;
      const old = db.people.find((value) => value.id === input.id);
      // Operational profile edits cannot forge authenticated identity or legacy approval roles.
      if (old) {
        input.demoRole = old.demoRole;
        input.email = old.email;
      } else {
        delete input.demoRole;
        if (!/^[0-9a-f-]{36}$/i.test(input.id))
          throw Error("New employee requires a UUID profile identifier.");
      }
      workforce.saveEmployee(db, input, actor.userId);
      break;
    }
    case "employee.status":
      if (typeof p.active !== "boolean")
        throw Error("Choose an employee activation decision.");
      if (p.id === actor.userId && p.active === false)
        forbidden("You cannot deactivate your own authenticated account.");
      workforce.setEmployeeActive(
        db,
        str(p.id, "Employee"),
        p.active === true,
        actor.userId,
        note(p),
      );
      break;
    case "assignment.remove": {
      const assignment = db.assignments.find((value) => value.id === p.id)!;
      if (assignment.status !== "Active")
        throw Error("Only active assignments can be removed.");
      assignment.status = "Removed";
      const project = db.projects.find((value) => value.id === projectId)!;
      if (
        assignment.role === "Project Manager" &&
        project.managerId === assignment.personId
      )
        project.managerId = "";
      record(
        db,
        projectId,
        "Assignment",
        assignment.id,
        "Assignment removed",
        typeof p.reason === "string" ? p.reason : "Project assignment removed",
        undefined,
        actor.userId,
      );
      break;
    }
    case "project.update": {
      const input = obj(p.project) as unknown as Project,
        old = db.projects.find((value) => value.id === input.id)!;
      if (old.status === "Completed")
        throw Error("Completed project history is immutable.");
      if (input.start !== old.start || input.due !== old.due)
        throw Error(
          "Approved project dates cannot change here. Use the reviewed planning workflow.",
        );
      if (
        input.clientId !== old.clientId ||
        input.managerId !== old.managerId ||
        input.value !== old.value ||
        input.status === "Completed"
      )
        throw Error(
          "Change assignments, commercial values or completion through their approved workflows.",
        );
      const next = { ...old };
      for (const key of [
        "name",
        "location",
        "emirate",
        "building",
        "unit",
        "area",
        "scope",
        "disciplines",
        "type",
        "priority",
        "status",
      ] as const)
        (next as unknown as Record<string, unknown>)[key] = input[key];
      projectSchema.parse(next);
      Object.assign(old, next);
      record(
        db,
        projectId,
        "Project",
        old.id,
        "Project updated",
        next.name,
        undefined,
        actor.userId,
      );
      break;
    }
    case "task.progress": {
      const task = db.tasks.find((value) => value.id === p.id)!;
      if (!privileged(actor) && task.assigneeId !== actor.userId)
        forbidden("Only your assigned task may be updated.");
      planning.reportTaskProgress(
        db,
        task.id,
        p.percent as number,
        str(p.date, "Progress date"),
        actor.userId,
        note({ reason: p.notes }),
        p.evidenceRefs as string[] | undefined,
      );
      break;
    }
    case "task.save": {
      const input = structuredClone(obj(p.task)) as unknown as Task,
        old = db.tasks.find((value) => value.id === input.id);
      if (!old && !privileged(actor))
        forbidden("Task creation requires a Project Manager.");
      if (old && !privileged(actor)) {
        if (old.assigneeId !== actor.userId)
          forbidden("Only your assigned task may be updated.");
        for (const key of [
          "name",
          "phaseId",
          "parentId",
          "assigneeId",
          "start",
          "due",
          "dependencies",
          "allocation",
          "trade",
          "priority",
        ] as const)
          if (JSON.stringify(input[key]) !== JSON.stringify(old[key]))
            forbidden(
              "Staff may report progress, notes and evidence; task planning requires a Project Manager.",
            );
      }
      if (input.assigneeId) assignedPerson(db, input.assigneeId, projectId);
      if (
        old &&
        db.tasks.some((value) => value.parentId === old.id) &&
        (input.phaseId !== old.phaseId || input.parentId)
      )
        throw Error(
          "A task with child tasks must remain a top-level parent in its current phase.",
        );
      if (input.parentId) {
        const parent = db.tasks.find((value) => value.id === input.parentId);
        if (
          !parent ||
          parent.projectId !== projectId ||
          parent.phaseId !== input.phaseId ||
          parent.parentId ||
          parent.id === input.id
        )
          throw Error("Choose a top-level parent in this project phase.");
      }
      input.comments = structuredClone(old?.comments || []);
      if (typeof p.comment === "string" && p.comment.trim())
        input.comments.push({
          id: uid(),
          authorId: actor.userId,
          text: p.comment.trim(),
          createdAt: new Date().toISOString(),
        });
      input.createdAt = old?.createdAt || new Date().toISOString();
      input.updatedAt = new Date().toISOString();
      input.completedAt = old?.completedAt;
      if (p.complete === true || input.status === "Completed") {
        input.progress = 100;
        input.status = "Completed";
      }
      taskSchema.parse(input);
      if (!old) {
        if (!Array.isArray(input.dependencies) || input.dependencies.length)
          throw Error(
            "Add new task dependencies through an approved planning proposal.",
          );
        planning.draftTaskCreation(
          db,
          { ...input, dependencies: [] },
          str(p.scheduleReason, "Schedule reason"),
          actor.userId,
        );
        break;
      }
      const progressChanged =
        input.progress !== old.progress || input.status !== old.status;
      if (
        progressChanged &&
        (typeof p.progressNote !== "string" || p.progressNote.trim().length < 3)
      )
        throw Error(
          "A progress note of at least three characters is required.",
        );
      if (p.complete === true)
        for (const child of db.tasks.filter(
          (value) => value.parentId === old.id && value.progress < 100,
        )) {
          if (!privileged(actor) && child.assigneeId !== actor.userId)
            forbidden(
              "Completing other employees' child tasks requires a Project Manager.",
            );
          saveTask(db, { ...child, status: "Completed", progress: 100 });
          planning.reportTaskProgress(
            db,
            child.id,
            100,
            str(p.progressDate, "Progress date"),
            actor.userId,
            str(p.progressNote, "Progress note"),
          );
        }
      const current = getProjectPlanning(db, projectId);
      const links = p.links as DependencyLink[] | undefined,
        constraint = p.constraint as TaskPlanning | undefined;
      const linksChanged =
        links && JSON.stringify(links) !== JSON.stringify(current.links);
      const currentConstraint = current.taskPlanning.find(
        (value) => value.taskId === old.id,
      );
      const constraintChanged =
        constraint &&
        JSON.stringify(constraint) !== JSON.stringify(currentConstraint);
      const dateChanged = input.start !== old.start || input.due !== old.due;
      if (constraint && constraint.taskId !== old.id)
        throw Error("Task constraint must belong to the edited task.");
      if (
        constraint?.progressHistory &&
        JSON.stringify(constraint.progressHistory) !==
          JSON.stringify(currentConstraint?.progressHistory)
      )
        throw Error(
          "Historical progress cannot be replaced through schedule constraints.",
        );
      saveTask(db, {
        ...input,
        projectId: old.projectId,
        start: old.start,
        due: old.due,
        dependencies: old.dependencies,
      });
      if (progressChanged)
        planning.reportTaskProgress(
          db,
          old.id,
          input.progress,
          str(p.progressDate, "Progress date"),
          actor.userId,
          str(p.progressNote, "Progress note"),
        );
      if (dateChanged || linksChanged || constraintChanged) {
        if (!privileged(actor))
          forbidden("Schedule changes require a Project Manager.");
        if (p.allowEarlier === true) manager(db, projectId, actor);
        const duration = inclusiveWorkingDuration(
          current.calendar,
          input.start,
          input.due,
        );
        const latest = getProjectPlanning(db, projectId);
        const proposedTaskPlanning = constraintChanged
          ? latest.taskPlanning.map((value) =>
              value.taskId === old.id
                ? { ...constraint!, progressHistory: value.progressHistory }
                : value,
            )
          : undefined;
        validatePlanningMetadata(db, projectId, {
          taskPlanning: proposedTaskPlanning,
        });
        planning.draftScheduleProposal(db, {
          projectId,
          initiatingNode: { kind: "task", id: old.id },
          reason: str(p.scheduleReason, "Schedule reason"),
          actorId: actor.userId,
          edit: {
            ...(input.start !== old.start ? { start: input.start } : {}),
            ...(input.due !== old.due ? { finish: input.due } : {}),
            ...(input.start !== old.start && input.due !== old.due && duration
              ? { durationWorkingDays: duration }
              : {}),
            ...(linksChanged ? { links } : {}),
            ...(proposedTaskPlanning
              ? { taskPlanning: proposedTaskPlanning }
              : {}),
          },
          considerEarlierDates: p.allowEarlier === true,
        });
      }
      break;
    }
    case "planning.template":
      manager(db, projectId, actor);
      instantiateFitOutTemplate(
        db,
        projectId,
        p.preview as FitOutTemplatePreview,
        actor.userId,
      );
      break;
    case "planning.propose": {
      if (!privileged(actor))
        forbidden("Schedule proposals require a Project Manager.");
      if (p.considerEarlierDates === true) manager(db, projectId, actor);
      const edit = structuredClone(obj(p.edit)) as ScheduleEdit;
      validatePlanningMetadata(db, projectId, edit);
      planning.draftScheduleProposal(db, {
        projectId,
        initiatingNode: p.initiatingNode as NodeRef,
        reason: note(p),
        edit,
        actorId: actor.userId,
        considerEarlierDates: p.considerEarlierDates === true,
      });
      break;
    }
    case "planning.milestone": {
      const milestone = obj(p.milestone) as unknown as Milestone;
      str(milestone.name, "Milestone name");
      if (
        milestone.taskId &&
        !db.tasks.some(
          (value) =>
            value.id === milestone.taskId && value.projectId === projectId,
        )
      )
        throw Error("Milestone task must belong to its project.");
      planning.draftMilestoneCreation(db, milestone, note(p), actor.userId);
      break;
    }
    case "planning.submit":
      planning.submitScheduleProposal(
        db,
        str(p.id, "Proposal"),
        actor.userId,
        p.confirmLeadOverlap === true,
      );
      break;
    case "planning.approve":
      manager(db, projectId, actor);
      planning.approveScheduleProposal(db, str(p.id, "Proposal"), actor.userId);
      break;
    case "planning.reject":
      manager(db, projectId, actor);
      planning.rejectScheduleProposal(
        db,
        str(p.id, "Proposal"),
        actor.userId,
        note(p),
      );
      break;
    case "planning.baseline":
      manager(db, projectId, actor);
      planning.captureScheduleBaseline(db, projectId, actor.userId, note(p));
      break;
    case "planning.milestone-complete":
      manager(db, projectId, actor);
      planning.completeManualMilestone(
        db,
        str(p.id, "Milestone"),
        actor.userId,
        note(p),
      );
      break;
    case "document.save": {
      const input = structuredClone(
        obj(p.document),
      ) as unknown as DocumentRecord;
      ownDocument(db, input.id, actor);
      workforce.saveDocumentDraft(db, input, actor.userId);
      break;
    }
    case "document.revise":
      ownDocument(db, str(p.id, "Document"), actor);
      workforce.reviseDocument(
        db,
        str(p.id, "Document"),
        actor.userId,
        note(p),
      );
      break;
    case "document.review": {
      const id = str(p.id, "Document"),
        status = p.status;
      if (!["Pending", "Approved", "Rejected"].includes(String(status)))
        throw Error("Choose a document review decision.");
      if (status === "Pending") {
        ownDocument(db, id, actor);
        if (p.document) {
          const document = structuredClone(
            obj(p.document),
          ) as unknown as DocumentRecord;
          if (document.id !== id) throw Error("Document identity mismatch.");
          workforce.saveDocumentDraft(db, document, actor.userId);
        }
        const document = db.documents.find((value) => value.id === id)!;
        const reviewerId =
          typeof p.reviewerId === "string" && p.reviewerId
            ? p.reviewerId
            : db.projects.find((value) => value.id === projectId)?.managerId;
        if (!reviewerId || reviewerId === actor.userId)
          throw Error("Choose an independent assigned project reviewer.");
        assignedPerson(db, reviewerId, projectId);
        document.reviewerId = reviewerId;
        workforce.reviewDocument(
          db,
          id,
          "Pending",
          actor.userId,
          note(p),
          reviewerId,
        );
      } else {
        if (!privileged(actor))
          forbidden(
            "Document decisions require an authorized Project Manager.",
          );
        const document = db.documents.find((value) => value.id === id)!;
        if (
          document.submittedBy === actor.userId ||
          document.reviewerId !== actor.userId
        )
          forbidden(
            "Only the assigned independent document reviewer may decide.",
          );
        workforce.reviewDocument(
          db,
          id,
          status as "Approved" | "Rejected",
          actor.userId,
          note(p),
        );
      }
      break;
    }
    case "site.save": {
      const update = structuredClone(obj(p.update)) as unknown as SiteUpdate;
      const old = db.updates.find((value) => value.id === update.id);
      if (old && !privileged(actor) && old.authorId !== actor.userId)
        forbidden("Only your own returned site update may be corrected.");
      workforce.saveSiteUpdate(db, update, actor.userId);
      break;
    }
    case "site.review": {
      if (!privileged(actor))
        forbidden("Site review requires an authorized supervisor.");
      if (!["Approved", "Changes Requested"].includes(String(p.status)))
        throw Error("Choose a site review decision.");
      if (
        db.updates.find((value) => value.id === p.id)?.authorId === actor.userId
      )
        forbidden("An independent supervisor must review this site record.");
      workforce.reviewSiteUpdate(
        db,
        str(p.id, "Site record"),
        p.status as "Approved" | "Changes Requested",
        actor.userId,
        note(p),
      );
      break;
    }
    case "snag.save": {
      const snag = structuredClone(obj(p.snag)) as unknown as Snag,
        old = db.snags.find((value) => value.id === snag.id);
      if (
        !privileged(actor) &&
        (old
          ? old.assigneeId !== actor.userId ||
            snag.assigneeId !== old.assigneeId ||
            !["Rectification", "Ready for Inspection"].includes(
              String(p.status),
            )
          : snag.assigneeId !== actor.userId || p.status !== "Open")
      )
        forbidden(
          "Staff may update their own assigned rectification; closure requires independent QA review.",
        );
      if (snag.assigneeId) assignedPerson(db, snag.assigneeId, projectId);
      workforce.saveSnag(
        db,
        snag,
        p.status as Snag["status"],
        actor.userId,
        note(p),
      );
      break;
    }
    case "handover.check": {
      if (!privileged(actor))
        forbidden("Handover confirmation requires a Project Manager.");
      const item = db.handover.find((value) => value.id === p.id)!;
      if (typeof p.complete !== "boolean")
        throw Error("Choose a handover confirmation decision.");
      if (
        item.automatic ||
        item.id.startsWith("operational-") ||
        db.projects.find((value) => value.id === projectId)?.status ===
          "Completed"
      )
        throw Error("Derived or completed handover history cannot be changed.");
      item.complete = p.complete === true;
      record(
        db,
        projectId,
        "HandoverItem",
        item.id,
        "Handover item updated",
        `${item.name} · ${item.complete ? "Complete" : "Incomplete"}`,
        undefined,
        actor.userId,
      );
      break;
    }
    case "project.complete":
      if (!privileged(actor))
        forbidden("Project completion requires a Project Manager.");
      if (
        !db.tasks.some((value) => value.projectId === projectId) ||
        db.tasks.some(
          (value) =>
            value.projectId === projectId && taskProgress(db, value) !== 100,
        )
      )
        throw Error("Complete the approved project task plan before handover.");
      completeProject(db, str(p.id, "Project"), actor.userId, note(p));
      break;
    default:
      return false;
  }
  for (const activity of db.activities)
    if (!previousActivities.has(activity.id)) activity.actorId = actor.userId;
  return true;
}
