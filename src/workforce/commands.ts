import type {
  Assignment,
  Database,
  DocumentRecord,
  Person,
  SiteUpdate,
  Snag,
  SnagStatus,
  WorkflowEvent,
} from "../domain/model";
import { uid } from "../domain/logic";

export function activePerson(db: Database, id: string) {
  const person = db.people.find((p) => p.id === id);
  if (!person || person.status === "Inactive")
    throw Error("Choose an active employee.");
  return person;
}
export function event(
  db: Database,
  actorId: string,
  action: string,
  reason: string,
  previous?: unknown,
): WorkflowEvent {
  const actor = activePerson(db, actorId);
  if (!reason.trim()) throw Error("A reason or review note is required.");
  return {
    id: uid(),
    actorId,
    actorName: actor.name,
    action,
    reason: reason.trim(),
    timestamp: new Date().toISOString(),
    previous:
      previous === undefined
        ? undefined
        : JSON.stringify(previous, (key, value) =>
            key === "history" || key === "dataUrl" ? undefined : value,
          ),
  };
}
function audit(
  db: Database,
  projectId: string,
  entityType: string,
  entityId: string,
  entry: WorkflowEvent,
) {
  db.activities.unshift({
    ...entry,
    projectId,
    entityType,
    entityId,
    summary: entry.reason,
  });
}
function projectExists(db: Database, id: string) {
  if (!db.projects.some((p) => p.id === id))
    throw Error("Choose an existing project.");
}
export function saveEmployee(db: Database, input: Person, actorId: string) {
  const old = db.people.find((p) => p.id === input.id);
  if (old?.status === "Inactive")
    throw Error("Reactivate the employee before editing.");
  const next = {
    ...input,
    name: input.name.trim(),
    email: input.email.trim(),
    role: input.role.trim(),
    department: input.department?.trim(),
    employeeCode: input.employeeCode?.trim(),
  };
  if (next.name.length < 2 || !next.role || !next.department)
    throw Error("Name, department and role are required.");
  if (next.status === "Inactive")
    throw Error("Use the deactivation action to retain its reason.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))
    throw Error("Enter a valid employee email.");
  if (
    !Number.isFinite(next.capacity) ||
    next.capacity < 1 ||
    next.capacity > 100
  )
    throw Error("Capacity must be between 1 and 100%.");
  if (
    db.people.some(
      (p) =>
        p.id !== next.id &&
        (p.email.toLowerCase() === next.email.toLowerCase() ||
          (next.employeeCode &&
            p.employeeCode?.toLowerCase() === next.employeeCode.toLowerCase())),
    )
  )
    throw Error("Employee email and code must be unique.");
  const entry = event(
    db,
    actorId,
    old ? "Employee edited" : "Employee added",
    next.name,
    old,
  );
  next.history = [...(old?.history || []), entry];
  if (old) Object.assign(old, next);
  else db.people.push(next);
  audit(db, "", "Person", next.id, entry);
}
export function setEmployeeActive(
  db: Database,
  id: string,
  active: boolean,
  actorId: string,
  reason: string,
) {
  const person = db.people.find((p) => p.id === id);
  if (!person) throw Error("Employee not found.");
  if ((person.status !== "Inactive") === active)
    throw Error("Employee already has this status.");
  const entry = event(
    db,
    actorId,
    active ? "Employee reactivated" : "Employee deactivated",
    reason,
    person,
  );
  person.status = active ? "Active" : "Inactive";
  person.deactivatedAt = active ? undefined : entry.timestamp;
  person.history = [...(person.history || []), entry];
  audit(db, "", "Person", id, entry);
}
export function saveAssignment(
  db: Database,
  input: Assignment,
  personId: string,
  reassign: boolean,
  actorId: string,
) {
  projectExists(db, input.projectId);
  activePerson(db, personId);
  if (
    !input.role.trim() ||
    !input.start ||
    !input.end ||
    input.end < input.start
  )
    throw Error("Enter a role and valid assignment dates.");
  const old = db.assignments.find((a) => a.id === input.id);
  if (old && old.projectId !== input.projectId)
    throw Error("Create a separate assignment to change project.");
  if (old && old.status !== "Active")
    throw Error("Historical assignments cannot be edited.");
  if (
    db.assignments.some(
      (a) =>
        a.id !== input.id &&
        a.projectId === input.projectId &&
        a.personId === personId &&
        a.role === input.role &&
        a.status === "Active",
    )
  )
    throw Error("This employee already holds that project role.");
  const entry = event(
    db,
    actorId,
    "Project assignment saved",
    `${personId} · ${input.role}`,
    old,
  );
  if (old?.role === "Project Manager" && input.role !== "Project Manager") {
    const project = db.projects.find((p) => p.id === input.projectId)!;
    if (project.managerId === old.personId) project.managerId = "";
  }
  if (old && old.personId !== personId) {
    old.status = "Replaced";
    db.assignments.push({ ...input, id: uid(), personId, status: "Active" });
    if (reassign)
      db.tasks
        .filter(
          (t) =>
            t.projectId === input.projectId &&
            t.assigneeId === old.personId &&
            t.status !== "Completed",
        )
        .forEach((t) => {
          const taskEntry = event(
            db,
            actorId,
            "Task reassigned",
            `Assigned to ${personId}`,
            t,
          );
          t.assigneeId = personId;
          t.updatedAt = taskEntry.timestamp;
          audit(db, t.projectId, "Task", t.id, taskEntry);
        });
  } else if (old) Object.assign(old, input, { personId });
  else db.assignments.push({ ...input, personId, status: "Active" });
  if (input.role === "Project Manager") {
    db.assignments
      .filter(
        (a) =>
          a.projectId === input.projectId &&
          a.role === input.role &&
          a.personId !== personId &&
          a.status === "Active",
      )
      .forEach((a) => {
        a.status = "Replaced";
      });
    db.projects.find((p) => p.id === input.projectId)!.managerId = personId;
  }
  audit(db, input.projectId, "Assignment", input.id, entry);
}
export function saveDocumentDraft(
  db: Database,
  input: DocumentRecord,
  actorId: string,
) {
  projectExists(db, input.projectId);
  const old = db.documents.find((d) => d.id === input.id);
  if (old && old.status !== "Draft")
    throw Error("Submitted revisions are locked. Create a new revision.");
  if (!input.name.trim() || !input.category)
    throw Error("Document name and category are required.");
  if (input.attachment && !input.attachment.dataUrl)
    throw Error("Attach a readable file or save metadata only.");
  if (
    old &&
    (old.projectId !== input.projectId ||
      old.familyId !== input.familyId ||
      old.version !== input.version)
  )
    throw Error("Revision identity cannot be changed.");
  if (
    !old &&
    (input.previousRevisionId ||
      input.version !== 1 ||
      (input.familyId && input.familyId !== input.id))
  )
    throw Error("Use Create Revision for existing documents.");
  const entry = event(
    db,
    actorId,
    "Draft saved",
    input.revisionNote || "Initial submission",
    old,
  );
  const next = {
    ...input,
    familyId: old?.familyId || input.id,
    status: "Draft" as const,
    uploadedBy: actorId,
    uploadedAt: entry.timestamp.slice(0, 10),
    history: [...(old?.history || []), entry],
  };
  if (old) Object.assign(old, next);
  else db.documents.push(next);
  audit(db, next.projectId, "Document", next.id, entry);
}
export function reviseDocument(
  db: Database,
  id: string,
  actorId: string,
  reason: string,
) {
  const old = db.documents.find((d) => d.id === id);
  if (!old || !["Approved", "Rejected"].includes(old.status))
    throw Error("Review the current revision before creating another.");
  const familyId = old.familyId || old.id;
  const siblings = db.documents.filter(
    (d) => (d.familyId || d.id) === familyId,
  );
  if (siblings.some((d) => d.version > old.version))
    throw Error("Revise the latest version only.");
  const entry = event(db, actorId, "Revision created", reason);
  const next: DocumentRecord = {
    ...old,
    id: uid(),
    familyId,
    previousRevisionId: old.id,
    version: Math.max(...siblings.map((d) => d.version)) + 1,
    status: "Draft",
    attachment: undefined,
    uploadedBy: actorId,
    uploadedAt: entry.timestamp.slice(0, 10),
    revisionNote: reason.trim(),
    history: [entry],
  };
  db.documents.push(next);
  audit(db, next.projectId, "Document", next.id, entry);
  return next;
}
export function reviewDocument(
  db: Database,
  id: string,
  status: "Pending" | "Rejected" | "Approved",
  actorId: string,
  reason: string,
) {
  const document = db.documents.find((d) => d.id === id);
  if (!document) throw Error("Document not found.");
  if (
    !(document.status === "Draft" && status === "Pending") &&
    !(
      document.status === "Pending" &&
      (status === "Approved" || status === "Rejected")
    )
  )
    throw Error(
      "Submit a draft, then approve or reject the submitted revision.",
    );
  if (status !== "Pending" && document.uploadedBy === actorId)
    throw Error("Choose a reviewer different from the submitter.");
  const entry = event(
    db,
    actorId,
    status === "Pending"
      ? "Revision submitted"
      : `Revision ${status.toLowerCase()}`,
    reason,
    { status: document.status, version: document.version },
  );
  document.status = status;
  document.history = [...(document.history || []), entry];
  audit(db, document.projectId, "Document", id, entry);
}
export function saveSiteUpdate(
  db: Database,
  input: SiteUpdate,
  actorId: string,
) {
  projectExists(db, input.projectId);
  const old = db.updates.find((u) => u.id === input.id);
  if (old && old.reviewStatus !== "Changes Requested")
    throw Error("Only returned site updates can be corrected.");
  if (old && old.projectId !== input.projectId)
    throw Error("A correction must stay in the same project.");
  if (
    !input.completed.trim() ||
    !input.date ||
    !Number.isInteger(input.manpower) ||
    input.manpower < 0
  )
    throw Error(
      "Enter completed work, date and a non-negative whole manpower count.",
    );
  const entry = event(
    db,
    actorId,
    old ? "Site update resubmitted" : "Site update submitted",
    input.completed,
    old,
  );
  const next: SiteUpdate = {
    ...input,
    authorId: actorId,
    reviewStatus: "Pending",
    history: [...(old?.history || []), entry],
  };
  if (old) Object.assign(old, next);
  else db.updates.push(next);
  audit(db, input.projectId, "SiteUpdate", input.id, entry);
}
export function reviewSiteUpdate(
  db: Database,
  id: string,
  status: "Approved" | "Changes Requested",
  actorId: string,
  reason: string,
) {
  const update = db.updates.find((u) => u.id === id);
  if (!update || (update.reviewStatus && update.reviewStatus !== "Pending"))
    throw Error("Only pending site updates can be reviewed.");
  if (update.authorId === actorId)
    throw Error("Choose a supervisor different from the author.");
  const entry = event(db, actorId, `Site review: ${status}`, reason, {
    status: update.reviewStatus || "Pending",
  });
  update.reviewStatus = status;
  update.history = [...(update.history || []), entry];
  audit(db, update.projectId, "SiteUpdate", id, entry);
}
export function saveSnag(
  db: Database,
  input: Snag,
  status: SnagStatus,
  actorId: string,
  reason: string,
) {
  projectExists(db, input.projectId);
  const old = db.snags.find((s) => s.id === input.id);
  if (old && old.projectId !== input.projectId)
    throw Error("A snag must stay in its original project.");
  const steps: SnagStatus[] = [
    "Open",
    "Assigned",
    "Rectification",
    "Ready for Inspection",
    "Closed",
  ];
  const from = old?.status || "Open";
  const delta = steps.indexOf(status) - steps.indexOf(from);
  if (
    delta !== 0 &&
    delta !== 1 &&
    !(from === "Ready for Inspection" && status === "Rectification") &&
    !(from === "Closed" && status === "Rectification")
  )
    throw Error(
      "Advance one step at a time; failed inspections return to Rectification.",
    );
  if (old?.status === "Closed" && status === "Closed")
    throw Error(
      "Closed snags are immutable. Reopen for rectification with a reason.",
    );
  if (!input.area.trim() || !input.description.trim() || !input.due)
    throw Error("Area, description and target date are required.");
  if (input.assigneeId && (!old || old.assigneeId !== input.assigneeId))
    activePerson(db, input.assigneeId);
  if (status !== "Open" && !input.assigneeId)
    throw Error("Assign a responsible employee before advancing.");
  if (
    status === "Closed" &&
    (!input.inspection.trim() || actorId === input.assigneeId)
  )
    throw Error(
      "Closure requires inspection notes and an independent demo inspector.",
    );
  const entry = event(
    db,
    actorId,
    old ? `Snag ${from} → ${status}` : "Snag created",
    reason,
    old,
  );
  const next: Snag = {
    ...input,
    status,
    inspection:
      status === "Rectification" &&
      (from === "Closed" || from === "Ready for Inspection")
        ? ""
        : input.inspection,
    createdBy: old?.createdBy || actorId,
    createdAt: old?.createdAt || entry.timestamp,
    closedBy: status === "Closed" ? actorId : undefined,
    closedAt: status === "Closed" ? entry.timestamp : undefined,
    history: [...(old?.history || []), entry],
  };
  if (old) Object.assign(old, next);
  else db.snags.push(next);
  audit(db, input.projectId, "Snag", input.id, entry);
}
