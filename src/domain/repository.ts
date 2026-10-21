import { initializeQuotations } from "../quotation/repository";
import { initializeCommercial } from "../commercial/migration";
import { closureSummary } from "../operations/closure-domain";
import { activePerson, saveSnag } from "../workforce/commands";
import { z } from "zod";
import { validateSavedShape, validateRelationships } from "./validation";
import { initializeDocumentCompatibility } from "../workforce/document-approvals";
import type { Database, Task, Project, SnagStatus, Activity } from "./model";
import { seed, generatePlan } from "./seed";
import { validatePlanningData } from "../planning/compatibility";
import {
  dispatchSyntheticFinance,
  serializeSyntheticFinanceFixture,
  type SyntheticFinanceEnvelope,
} from "../accounting/persistence";
import { uid, validDependency, handoverState, taskProgress } from "./logic";
const KEY = "azzora-demo-v1";
export interface Repository {
  load(): Database;
  save(db: Database): void;
}
export function decodeSavedData(raw: string | null): Database {
  if (raw === null) {
    const db = seed();
    initializeCommercial(db);
    return db;
  }
  const value: unknown = JSON.parse(raw);
  validateSavedShape(value);
  if (
    value.version !== 1 ||
    !Array.isArray(value.projects) ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.clients) ||
    (value.commercialVersion !== undefined && value.commercialVersion !== 1) ||
    [value.invoices, value.payments, value.expenses, value.contracts].some(
      (collection) => collection !== undefined && !Array.isArray(collection),
    )
  )
    throw Error(
      "Saved demo data is incompatible. Export it or reset from Settings.",
    );
  initializeQuotations(value);
  initializeCommercial(value);
  initializeDocumentCompatibility(value);
  validateRelationships(value);
  validatePlanningData(value);
  return value;
}
export const localRepository: Repository = {
  load() {
    return decodeSavedData(localStorage.getItem(KEY));
  },
  save(db) {
    const previous = localStorage.getItem(KEY);
    if (previous && /"finance(?:Fixture)?"\s*:/.test(previous)) {
      const prior = JSON.parse(previous) as Record<string, unknown>;
      if (prior.finance !== undefined && db.finance === undefined)
        throw Error("Existing synthetic finance history cannot be removed.");
      if (prior.financeFixture !== undefined &&
          JSON.stringify(prior.financeFixture) !== JSON.stringify(db.financeFixture))
        throw Error("Synthetic finance fixture identity cannot be changed.");
    }
    if (db.finance) {
      validateSavedShape(db);
      if (!previous)
        throw Error("Synthetic finance fixture requires existing marked browser data.");
      // Validate the previous snapshot and append-only finance history before one write.
      serializeSyntheticFinanceFixture(previous, db.finance);
    }
    localStorage.setItem(KEY, JSON.stringify(db));
  },
};

/** The only CRM command boundary for fixture journals; store.mutate saves its clone atomically. */
export function applySyntheticFinanceCommand(
  db: Database,
  envelope: SyntheticFinanceEnvelope,
) {
  if (!db.finance || db.financeFixture?.mode !== "synthetic-demo" ||
      db.financeFixture.id !== db.finance.fixtureId)
    throw Error("Explicitly marked synthetic finance fixture is required.");
  db.finance = dispatchSyntheticFinance(db.finance, envelope);
}
export const taskSchema = z
  .object({
    name: z.string().trim().min(2, "Task name needs at least 2 characters"),
    progress: z.number().min(0).max(100),
    start: z.string().min(1),
    due: z.string().min(1),
    allocation: z.number().min(0).max(100),
  })
  .refine((t) => t.due >= t.start, {
    message: "Due date must be on or after start date",
  });
export const projectSchema = z
  .object({
    name: z.string().trim().min(2),
    code: z.string().min(1),
    start: z.string().min(1),
    due: z.string().min(1),
    value: z.number().min(0),
    area: z.number().min(0),
    location: z.string().min(2),
    managerId: z.string().min(1),
  })
  .refine((p) => p.due >= p.start, {
    message: "Target completion must be on or after start date",
  });
export function record(
  db: Database,
  projectId: string,
  entityType: string,
  entityId: string,
  action: string,
  summary: string,
  previous?: string,
  actorId = "person-0",
) {
  db.activities.unshift({
    id: uid(),
    actorId,
    action,
    entityType,
    entityId,
    projectId,
    timestamp: new Date().toISOString(),
    summary,
    previous,
  } satisfies Activity);
}
export function saveTask(db: Database, task: Task) {
  taskSchema.parse(task);
  const old = db.tasks.find((t) => t.id === task.id);
  const planningEnabled = db.planning?.some((p) =>
    p.enabled && (p.projectId === task.projectId || p.projectId === old?.projectId));
  if (planningEnabled && (!old || old.projectId !== task.projectId ||
      old.start !== task.start || old.due !== task.due ||
      JSON.stringify(old.dependencies) !== JSON.stringify(task.dependencies)))
    throw Error("Approved task dates and dependencies require a schedule proposal and Project Manager approval.");
  if (
    !validDependency(
      {
        ...db,
        tasks: db.tasks.some((t) => t.id === task.id)
          ? db.tasks
          : [...db.tasks, task],
      },
      task.id,
      task.dependencies,
    )
  )
    throw Error(
      "Dependencies must be in this project and cannot form a cycle.",
    );
  if (
    !db.projects.some((p) => p.id === task.projectId) ||
    !db.phases.some(
      (p) => p.id === task.phaseId && p.projectId === task.projectId,
    )
  )
    throw Error("Choose a phase in the task's project.");
  if (
    task.assigneeId &&
    (!old ||
      task.assigneeId !== old.assigneeId ||
      task.projectId !== old.projectId)
  )
    activePerson(db, task.assigneeId);
  if (task.parentId) {
    const parent = db.tasks.find((t) => t.id === task.parentId);
    if (
      !parent ||
      parent.projectId !== task.projectId ||
      parent.phaseId !== task.phaseId ||
      parent.parentId ||
      parent.id === task.id
    )
      throw Error("Choose a top-level parent in the same phase.");
  }
  if (task.status === "Completed") task.progress = 100;
  else if (task.progress === 100) task.status = "Completed";
  else if (task.progress > 0 && task.status === "Not Started")
    task.status = "In Progress";
  task.completedAt =
    task.status === "Completed"
      ? task.completedAt || new Date().toISOString()
      : undefined;
  task.updatedAt = new Date().toISOString();
  if (
    task.assigneeId &&
    (!old ||
      task.assigneeId !== old.assigneeId ||
      task.projectId !== old.projectId) &&
    !db.assignments.some(
      (a) =>
        a.projectId === task.projectId &&
        a.personId === task.assigneeId &&
        a.status === "Active",
    )
  ) {
    db.assignments.push({
      id: uid(),
      projectId: task.projectId,
      personId: task.assigneeId,
      role: db.people.find((p) => p.id === task.assigneeId)!.role,
      start: task.start,
      end: task.due,
      responsibility: "Task delivery",
      status: "Active",
    });
  }
  db.tasks = old
    ? db.tasks.map((t) => (t.id === task.id ? task : t))
    : [...db.tasks, task];
  if (!planningEnabled)
    db.milestones
      .filter((m) => m.taskId === task.id)
      .forEach((m) => {
        m.due = task.due;
      });
  if (task.parentId) {
    const p = db.tasks.find((t) => t.id === task.parentId)!;
    p.progress = taskProgress(db, p);
    p.status =
      p.progress === 100
        ? "Completed"
        : p.progress > 0
          ? "In Progress"
          : "Not Started";
  }
  record(
    db,
    task.projectId,
    "Task",
    task.id,
    old ? "Task updated" : "Task created",
    `${task.name}: ${task.status}, ${task.progress}%`,
    old ? JSON.stringify(old) : undefined,
  );
}
export function createProject(
  db: Database,
  p: Project,
  clientName: string,
  contact: string,
  team: Record<string, string>,
  standard: boolean,
  planMode: "legacy" | "empty" = "legacy",
) {
  projectSchema.parse(p);
  Object.values({ ...team, manager: p.managerId })
    .filter(Boolean)
    .forEach((id) => activePerson(db, id));
  if (db.projects.some((x) => x.code.toLowerCase() === p.code.toLowerCase()))
    throw Error("Project code must be unique.");
  if (!clientName.trim()) throw Error("Client name is required.");
  const client = db.clients.find((c) => c.id === p.clientId);
  if (client?.status === "Archived") throw Error("Choose an active customer.");
  if (!client) {
    const normalized = (s: string) =>
      s
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    if (db.clients.some((c) => normalized(c.name) === normalized(clientName)))
      throw Error(
        "Possible duplicate customer. Select the existing customer or add one through Customer Master.",
      );
    db.clients.push({
      id: p.clientId,
      name: clientName.trim(),
      contact,
      status: "Active",
      createdAt: new Date().toISOString(),
    });
    initializeCommercial(db);
  }
  db.projects.push(p);
  if (planMode === "legacy") generatePlan(db, p, standard);
  const selected = { ...team, "Project Manager": p.managerId };
  Object.entries(selected)
    .filter(([, personId]) => personId)
    .forEach(([role, personId]) =>
      db.assignments.push({
        id: uid(),
        projectId: p.id,
        personId,
        role,
        start: p.start,
        end: p.due,
        responsibility: role,
        status: "Active",
      }),
    );
  record(db, p.id, "Project", p.id, "Project created", p.name);
}
export function transitionSnag(
  db: Database,
  id: string,
  status: SnagStatus,
  actorId = "person-0",
  reason = "Legacy snag transition",
) {
  const snag = db.snags.find((s) => s.id === id);
  if (!snag) throw Error("Snag not found.");
  saveSnag(db, snag, status, actorId, reason);
}
export function completeProject(
  db: Database,
  id: string,
  actorId = "person-0",
  reason = "Required handover criteria confirmed.",
) {
  activePerson(db, actorId);
  if (!reason.trim()) throw Error("Record a handover confirmation note.");
  if (
    db.operations?.settings.blockOperationalForFinance &&
    !closureSummary(db, id).commercialClear
  )
    throw Error(
      "Configured policy requires commercial obligations to be clear before operational handover.",
    );
  if (!handoverState(db, id).ready)
    throw Error("Complete all required handover criteria first.");
  db.projects.find((p) => p.id === id)!.status = "Completed";
  record(
    db,
    id,
    "Project",
    id,
    "Project completed",
    reason.trim(),
    undefined,
    actorId,
  );
}
