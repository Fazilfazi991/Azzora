import { describe, expect, it } from "vitest";
import { seed } from "../domain/seed";
import { decodeSavedData, saveTask } from "../domain/repository";
import type { Task } from "../domain/model";
import { defaultCalendar, finishFromStart, workOffset } from "./calendar";
import { getProjectPlanning } from "./compatibility";
import { validateLinks } from "./graph";
import { calculateSchedule, getPlanningView, linkFirstPermittedDate } from "./engine";
import { approveScheduleProposal, captureScheduleBaseline, draftScheduleProposal,
  draftTaskCreation, rejectScheduleProposal, submitScheduleProposal, completeManualMilestone,
  reportTaskProgress } from "./commands";
import type { DependencyLink, NodeRef } from "./model";
import { instantiateFitOutTemplate, previewFitOutTemplate } from "./template";

const n = (id: string): NodeRef => ({ kind: "task", id });
const link = (projectId: string, from: string, to: string, type: DependencyLink["type"] = "FS", lagWorkingDays = 0): DependencyLink => ({
  id: `${from}-${to}`, projectId, predecessor: n(from), successor: n(to), type, lagWorkingDays, createdAt: "2026-11-01T00:00:00Z",
});
function fixture(rows: Array<[string, string, string, number]>, links: Array<[string, string, DependencyLink["type"]?, number?]> = []) {
  const db = seed(), project = db.projects[0], phase = db.phases.find((row) => row.projectId === project.id)!;
  db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
  db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
  project.start = "2026-11-02"; project.due = "2026-12-31";
  const tasks = rows.map(([id, start, due, progress]) => ({
    id, projectId: project.id, phaseId: phase.id, name: `Task ${id}`,
    description: "", assigneeId: "", start, due, progress,
    status: progress === 100 ? "Completed" as const : "Not Started" as const,
    priority: "Normal" as const, dependencies: [], allocation: 10, trade: "Civil",
    notes: "", attachments: [], comments: [], createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  } satisfies Task));
  db.tasks.push(...tasks);
  const planning = structuredClone(getProjectPlanning(db, project.id));
  planning.enabled = true;
  planning.links = links.map(([from, to, type = "FS", lag = 0]) => link(project.id, from, to, type, lag));
  db.planningVersion = 1; db.planning = [planning];
  return { db, project, planning, managerId: project.managerId };
}
describe("project working-day calendar", () => {
  it("uses inclusive durations, holidays and signed FS lag without UTC drift", () => {
    const calendar = defaultCalendar();
    calendar.holidays = ["2026-11-09"];
    expect(finishFromStart(calendar, "2026-11-02", 1)).toBe("2026-11-02");
    expect(finishFromStart(calendar, "2026-11-02", 3)).toBe("2026-11-04");
    expect(workOffset(calendar, "2026-11-06", 1)).toBe("2026-11-10");
    expect(workOffset(calendar, "2026-11-03", -1)).toBe("2026-11-02");
  });
  it("converts FS SS FF SF bounds and leads into successor start dates", () => {
    const calendar = defaultCalendar();
    const predecessor = { start: "2026-11-02", finish: "2026-11-03", durationWorkingDays: 2 };
    const projectId = "p";
    const expected = { FS: "2026-11-04", SS: "2026-11-02", FF: "2026-11-02", SF: "2026-10-30" };
    for (const type of ["FS", "SS", "FF", "SF"] as const)
      expect(linkFirstPermittedDate(calendar, link(projectId, "a", "b", type), predecessor, 2)).toBe(expected[type]);
    expect(linkFirstPermittedDate(calendar, link(projectId, "a", "b", "FS", 2), predecessor, 2)).toBe("2026-11-06");
    expect(linkFirstPermittedDate(calendar, link(projectId, "a", "b", "FS", -1), predecessor, 2)).toBe("2026-11-03");
  });
});
describe("planning graph and proposals", () => {
  it("rejects self, duplicate, missing and cyclic relationships", () => {
    const { db, project } = fixture([["a", "2026-11-02", "2026-11-03", 0], ["b", "2026-11-04", "2026-11-05", 0]]);
    expect(() => validateLinks(db, project.id, [link(project.id, "a", "a")])).toThrow();
    expect(() => validateLinks(db, project.id, [link(project.id, "a", "b"), { ...link(project.id, "a", "b"), id: "second", type: "SS" }])).toThrow();
    expect(() => validateLinks(db, project.id, [link(project.id, "missing", "b")])).toThrow();
    expect(() => validateLinks(db, project.id, [link(project.id, "a", "b"), link(project.id, "b", "a")])).toThrow();
  });
  it("uses the latest of multiple predecessor bounds and does not pull successors earlier by default", () => {
    const { db, planning, project } = fixture([
      ["a", "2026-11-02", "2026-11-03", 0], ["b", "2026-11-02", "2026-11-05", 0],
      ["c", "2026-11-06", "2026-11-06", 0],
    ], [["a", "c"], ["b", "c"]]);
    const result = calculateSchedule(db, planning, n("a"), { start: "2026-11-04" });
    expect(result.dates.get("task:c")?.start).toBe("2026-11-06");
    expect(result.dates.get("task:a")?.finish).toBe("2026-11-05");
    expect(result.conflicts).toEqual([]);
    expect(getPlanningView(db, project.id).approvedFinish).toBe("2026-11-06");
  });
  it("keeps an unchanged later terminal branch in proposed project finish", () => {
    const { db, project, managerId } = fixture([
      ["a", "2026-11-02", "2026-11-03", 0],
      ["later", "2026-11-16", "2026-11-20", 0],
    ]);
    draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("a"),
      actorId: managerId, reason: "Move first task", edit: { start: "2026-11-04" } });
    expect(getPlanningView(db, project.id).proposedFinish).toBe("2026-11-20");
  });
  it("recalculates a new dependency outside the initiating node's old reachable set", () => {
    const { db, project, managerId } = fixture([
      ["a", "2026-11-02", "2026-11-03", 0],
      ["b", "2026-11-02", "2026-11-02", 0],
      ["c", "2026-11-04", "2026-11-04", 0],
    ]);
    const row = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("a"),
      actorId: managerId, reason: "Add cross-branch predecessor", edit: {
        links: [link(project.id, "c", "b")],
      } });
    expect(row.changes.find((change) => change.node.id === "b")?.after.start).toBe("2026-11-05");
    expect(row.conflicts).toEqual([]);
  });
  it("keeps removed-link successors in the impact set and pulls earlier only by explicit PM option", () => {
    const { db, project, managerId } = fixture([
      ["a", "2026-11-02", "2026-11-03", 0],
      ["b", "2026-11-04", "2026-11-05", 0],
      ["c", "2026-11-02", "2026-11-02", 0],
    ], [["a", "b"]]);
    const ordinary = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("c"),
      actorId: managerId, reason: "Remove obsolete link", edit: { links: [] } });
    expect(ordinary.unchangedSuccessors.some((node) => node.id === "b")).toBe(true);
    expect(ordinary.changes.some((change) => change.node.id === "b")).toBe(false);
    const earlier = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("c"),
      actorId: managerId, reason: "Consider earlier dates", edit: { links: [] }, considerEarlierDates: true });
    expect(earlier.changes.find((change) => change.node.id === "b")?.after.start).toBe("2026-11-02");
  });
  it("computes one-day float on a feasible parallel branch and suppresses infeasible CPM", () => {
    const { db, project } = fixture([
      ["a", "2026-11-02", "2026-11-03", 0],
      ["b", "2026-11-04", "2026-11-06", 0],
      ["c", "2026-11-04", "2026-11-05", 0],
      ["d", "2026-11-09", "2026-11-09", 0],
    ], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]);
    const view = getPlanningView(db, project.id);
    expect(view.criticalPathFeasible).toBe(true);
    expect(view.nodes.find((row) => row.node.id === "c")?.totalFloatWorkingDays).toBe(1);
    expect(["a", "b", "d"].every((id) => view.nodes.find((row) => row.node.id === id)?.critical)).toBe(true);
    db.planning![0].taskPlanning.find((row) => row.taskId === "d")!.lockedStart = "2026-11-06";
    const infeasible = getPlanningView(db, project.id);
    expect(infeasible.criticalPathFeasible).toBe(false);
    expect(infeasible.nodes.some((row) => row.critical)).toBe(false);
  });
  it("keeps approved dates and baseline untouched until a submitted PM approval", () => {
    const { db, project, managerId } = fixture([
      ["a", "2026-11-02", "2026-11-03", 0], ["b", "2026-11-04", "2026-11-06", 0],
    ], [["a", "b"]]);
    const baseline = captureScheduleBaseline(db, project.id, managerId, "Initial approved plan");
    const row = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("a"),
      actorId: managerId, reason: "One working day delay", edit: { start: "2026-11-03" } });
    expect(db.tasks.find((task) => task.id === "b")!.start).toBe("2026-11-04");
    expect(row.changes.map((change) => change.node.id)).toEqual(["a", "b"]);
    submitScheduleProposal(db, row.id, managerId);
    approveScheduleProposal(db, row.id, managerId);
    expect(db.tasks.find((task) => task.id === "b")!.start).toBe("2026-11-05");
    expect(db.planning![0].baselineHistory[0]).toEqual(baseline);
    expect(db.planning![0].approvedRevision).toBe(1);
    expect(() => decodeSavedData(JSON.stringify(db))).not.toThrow();
  });
  it("rejects stale approval and preserves all approved records", () => {
    const { db, project, managerId } = fixture([["a", "2026-11-02", "2026-11-03", 0]]);
    const row = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("a"),
      actorId: managerId, reason: "Move work later", edit: { start: "2026-11-04" } });
    submitScheduleProposal(db, row.id, managerId);
    db.planning![0].calendar.holidays.push("2026-11-10");
    const before = structuredClone(db.tasks);
    expect(() => approveScheduleProposal(db, row.id, managerId)).toThrow(/stale/);
    expect(db.tasks).toEqual(before);
  });
  it("treats a new progress report as a stale source before approval", () => {
    const { db, project, managerId } = fixture([["a", "2026-11-02", "2026-11-03", 0]]);
    const row = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("a"),
      actorId: managerId, reason: "Move work later", edit: { start: "2026-11-04" } });
    submitScheduleProposal(db, row.id, managerId);
    reportTaskProgress(db, "a", 25, "2026-11-02", managerId, "Site work started");
    expect(() => approveScheduleProposal(db, row.id, managerId)).toThrow(/stale/);
    expect(db.tasks.find((task) => task.id === "a")?.start).toBe("2026-11-02");
  });
  it("preserves revision history while preventing an older submitted proposal from approval", () => {
    const { db, project, managerId } = fixture([["a", "2026-11-02", "2026-11-03", 0]]);
    const first = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("a"),
      actorId: managerId, reason: "First timing", edit: { start: "2026-11-04" } });
    submitScheduleProposal(db, first.id, managerId);
    const second = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("a"),
      actorId: managerId, reason: "Revised timing", edit: { start: "2026-11-05" } });
    expect(first.revisedByProposalId).toBe(second.id);
    expect(first.history.some((item) => item.action === "Revised")).toBe(true);
    expect(() => approveScheduleProposal(db, first.id, managerId)).toThrow(/revised/);
    expect(getPlanningView(db, project.id).activeProposal?.id).toBe(second.id);
    expect(() => decodeSavedData(JSON.stringify(db))).not.toThrow();
  });
  it("allows non-schedule save but blocks TaskDrawer-style date/link bypass after activation", () => {
    const { db } = fixture([["a", "2026-11-02", "2026-11-03", 0], ["b", "2026-11-04", "2026-11-05", 0]]);
    const task = db.tasks.find((row) => row.id === "b")!;
    expect(() => saveTask(db, { ...task, due: "2026-11-06" })).toThrow(/proposal/);
    expect(() => saveTask(db, { ...task, dependencies: ["a"] })).toThrow(/proposal/);
    saveTask(db, { ...task, notes: "Daily note" });
    expect(db.tasks.find((row) => row.id === "b")?.notes).toBe("Daily note");
  });
  it("rejection and new-task draft never write approved task records", () => {
    const { db, project, managerId } = fixture([["a", "2026-11-02", "2026-11-03", 0]]);
    const row = draftTaskCreation(db, { ...db.tasks[db.tasks.length - 1], id: "new", projectId: project.id,
      phaseId: db.phases.find((phase) => phase.projectId === project.id)!.id,
      name: "New task", start: "2026-11-04", due: "2026-11-05", dependencies: [] },
    "Add new work", managerId);
    expect(db.tasks.some((task) => task.id === "new")).toBe(false);
    submitScheduleProposal(db, row.id, managerId);
    rejectScheduleProposal(db, row.id, managerId, "Not yet approved");
    expect(db.tasks.some((task) => task.id === "new")).toBe(false);
    expect(() => decodeSavedData(JSON.stringify(db))).not.toThrow();
  });
  it("adds a reviewed new task only on approval and round-trips the result", () => {
    const { db, project, managerId } = fixture([["a", "2026-11-02", "2026-11-03", 0]]);
    const original = db.tasks.find((row) => row.id === "a")!;
    const row = draftTaskCreation(db, { ...original, id: "new-task", name: "New task",
      start: "2026-11-04", due: "2026-11-05", dependencies: [] }, "Add follow-on work", managerId);
    submitScheduleProposal(db, row.id, managerId);
    approveScheduleProposal(db, row.id, managerId);
    expect(db.tasks.filter((task) => task.projectId === project.id && task.id === "new-task")).toHaveLength(1);
    expect(() => decodeSavedData(JSON.stringify(db))).not.toThrow();
  });
  it("requires explicit negative-lag acknowledgement before submission", () => {
    const { db, project, managerId } = fixture([
      ["a", "2026-11-02", "2026-11-03", 0], ["b", "2026-11-03", "2026-11-04", 0],
    ]);
    const row = draftScheduleProposal(db, { projectId: project.id, initiatingNode: n("a"),
      actorId: managerId, reason: "Allow one-day overlap", edit: { links: [link(project.id, "a", "b", "FS", -1)] } });
    expect(row.warnings.some((warning) => warning.code === "LeadOverlap")).toBe(true);
    expect(() => submitScheduleProposal(db, row.id, managerId)).toThrow(/Confirm/);
    submitScheduleProposal(db, row.id, managerId, true);
    expect(row.history.some((item) => item.action === "LeadOverlapConfirmed")).toBe(true);
  });
  it("keeps 100% work separate from an explicit inspection milestone", () => {
    const { db, project, managerId } = fixture([["a", "2026-11-02", "2026-11-03", 100]]);
    db.milestones.push({ id: "inspection", projectId: project.id,
      name: "Inspection approved", due: "2026-11-04", taskId: "" });
    db.planning![0].milestonePlanning.push({ milestoneId: "inspection", completionCondition: { kind: "Manual" } });
    const before = getPlanningView(db, project.id);
    expect(before.nodes.find((node) => node.node.id === "a")?.completionSatisfied).toBe(true);
    expect(before.nodes.find((node) => node.node.id === "inspection")?.completionSatisfied).toBe(false);
    expect(before.blockers.some((blocker) => blocker.code === "ManualMilestonePending")).toBe(true);
    completeManualMilestone(db, "inspection", managerId, "Inspection evidence approved");
    expect(getPlanningView(db, project.id).nodes.find((node) => node.node.id === "inspection")?.completionSatisfied).toBe(true);
  });
  it("loads legacy records without baseline or storage writes and preserves all IDs", () => {
    const db = seed();
    const raw = JSON.stringify(db);
    const loaded = decodeSavedData(raw);
    expect(loaded.tasks.map((task) => [task.id, task.start, task.due])).toEqual(db.tasks.map((task) => [task.id, task.start, task.due]));
    expect(loaded.projects.map((project) => [project.id, project.start, project.due])).toEqual(db.projects.map((project) => [project.id, project.start, project.due]));
    expect(loaded.planning).toBeUndefined();
    const planning = getProjectPlanning(loaded, loaded.projects[0].id);
    expect(planning.baselineStatus).toBe("Unset");
    expect(planning.links.every((row) => row.type === "FS" && row.lagWorkingDays === 0)).toBe(true);
  });
  it("rejects malformed and future planning data into the existing recovery path", () => {
    const db = seed();
    const broken = structuredClone(db);
    Object.assign(broken, { planningVersion: 2, planning: [] });
    expect(() => decodeSavedData(JSON.stringify(broken))).toThrow();
    const { db: activated } = fixture([["a", "2026-11-02", "2026-11-03", 0]]);
    expect(() => decodeSavedData(JSON.stringify(activated))).not.toThrow();
    const malformed = structuredClone(activated);
    malformed.planning![0].calendar.workingWeekdays = [];
    expect(() => decodeSavedData(JSON.stringify(malformed))).toThrow();
    const missing = structuredClone(activated);
    missing.planning![0].links.push(link(missing.planning![0].projectId, "missing", "a"));
    expect(() => decodeSavedData(JSON.stringify(missing))).toThrow();
  });
  it("instantiates edited twelve-phase preview exactly once with parallel links", () => {
    const db = seed(), project = db.projects[0];
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
    db.phases = db.phases.filter((row) => row.projectId !== project.id);
    const preview = previewFitOutTemplate();
    expect(preview).toHaveLength(12);
    preview[0].activities[0].name = "Confirmed client scope";
    instantiateFitOutTemplate(db, project.id, preview, project.managerId);
    const tasks = db.tasks.filter((row) => row.projectId === project.id);
    expect(tasks.some((row) => row.name === "Confirmed client scope")).toBe(true);
    expect(new Set(tasks.map((row) => row.id)).size).toBe(tasks.length);
    expect(db.planning?.find((row) => row.projectId === project.id)?.baselineStatus).toBe("Unset");
    expect(db.planning?.find((row) => row.projectId === project.id)?.links.some((row) => row.successor.id ===
      tasks.find((task) => task.name === "Close ceiling after first-fix inspection")?.id)).toBe(true);
    expect(() => decodeSavedData(JSON.stringify(db))).not.toThrow();
    expect(() => instantiateFitOutTemplate(db, project.id, preview, project.managerId)).toThrow(/already has a plan/);
  });
});
