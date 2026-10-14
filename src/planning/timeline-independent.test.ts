import { afterEach, describe, expect, it, vi } from "vitest";
import { blankTask, seed } from "../domain/seed";
import { decodeSavedData, localRepository } from "../domain/repository";
import {
  approveScheduleProposal,
  captureScheduleBaseline,
  draftScheduleProposal,
  getPlanningView,
  getProjectPlanning,
  inclusiveWorkingDuration,
  linkFirstPermittedDate,
  submitScheduleProposal,
  type DependencyLink,
} from "./index";
import {
  parallelNetwork,
  relationshipCases,
  weekdayCalendar,
} from "./timeline-independent-fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("independent schedule integration", () => {
  it("honors four typed relationship bounds at working-day precision", () => {
    for (const scenario of relationshipCases) {
      const link: DependencyLink = {
        id: `independent-${scenario.type}`,
        projectId: "fixture-project",
        predecessor: { kind: "task", id: "predecessor" },
        successor: { kind: "task", id: "successor" },
        type: scenario.type,
        lagWorkingDays: scenario.lagWorkingDays,
        createdAt: "2026-11-01T00:00:00.000Z",
      };
      const predecessor = {
        ...scenario.predecessor,
        durationWorkingDays: inclusiveWorkingDuration(
          weekdayCalendar,
          scenario.predecessor.start,
          scenario.predecessor.finish,
        )!,
      };
      expect(linkFirstPermittedDate(
        weekdayCalendar,
        link,
        predecessor,
        scenario.successorDuration,
      )).toBe(scenario.earliestSuccessorStart);
    }
  });

  it("finds both the parallel critical branch and the alternate branch float", () => {
    const db = seed();
    const project = db.projects[0];
    const phase = db.phases.find((row) => row.projectId === project.id)!;
    project.start = "2026-11-02";
    project.due = "2026-11-30";
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
    for (const row of parallelNetwork.activities)
      db.tasks.push({
        ...blankTask(project.id, phase.id, ""),
        id: row.id,
        name: `Network ${row.id}`,
        start: row.start,
        due: row.finish,
      });
    const planning = structuredClone(getProjectPlanning(db, project.id));
    planning.enabled = true;
    planning.calendar = structuredClone(weekdayCalendar);
    planning.links = parallelNetwork.links.map((row, index) => ({
      id: `parallel-link-${index}`,
      projectId: project.id,
      predecessor: { kind: "task", id: row.predecessor },
      successor: { kind: "task", id: row.successor },
      type: "FS",
      lagWorkingDays: row.lagWorkingDays,
      createdAt: "2026-11-01T00:00:00.000Z",
    }));
    db.planningVersion = 1;
    db.planning = [planning];

    const view = getPlanningView(db, project.id);
    expect(view.criticalPathFeasible).toBe(true);
    expect(view.approvedFinish).toBe(parallelNetwork.expected.finish);
    expect(view.nodes.filter((row) => row.critical).map((row) => row.node.id).sort())
      .toEqual(parallelNetwork.expected.criticalIds);
    for (const [id, expectedFloat] of Object.entries(parallelNetwork.expected.floatWorkingDays))
      expect(view.nodes.find((row) => row.node.id === id)?.totalFloatWorkingDays)
        .toBe(expectedFloat);
  });

  it("keeps an unchanged later terminal branch in proposed project finish", () => {
    const db = seed();
    const project = db.projects[0];
    const phase = db.phases.find((row) => row.projectId === project.id)!;
    project.start = "2026-11-02";
    project.due = "2026-11-30";
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);

    const task = (id: string, start: string, due: string) => ({
      ...blankTask(project.id, phase.id, ""),
      id,
      name: `Independent ${id}`,
      start,
      due,
    });
    db.tasks.push(
      task("branch-a", "2026-11-02", "2026-11-03"),
      task("branch-b", "2026-11-04", "2026-11-05"),
      task("terminal-c", "2026-11-02", "2026-11-13"),
    );
    const planning = structuredClone(getProjectPlanning(db, project.id));
    planning.enabled = true;
    planning.calendar = structuredClone(weekdayCalendar);
    const dependency: DependencyLink = {
      id: "branch-a-to-b",
      projectId: project.id,
      predecessor: { kind: "task", id: "branch-a" },
      successor: { kind: "task", id: "branch-b" },
      type: "FS",
      lagWorkingDays: 0,
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    planning.links = [dependency];
    db.planningVersion = 1;
    db.planning = [planning];

    expect(getPlanningView(db, project.id).approvedFinish).toBe("2026-11-13");
    const proposal = draftScheduleProposal(db, {
      projectId: project.id,
      initiatingNode: { kind: "task", id: "branch-a" },
      reason: "Independent terminal branch regression",
      actorId: project.managerId,
      edit: { start: "2026-11-03" },
    });
    expect(proposal.conflicts).toEqual([]);
    expect(proposal.changes.map((change) => change.node.id)).toEqual([
      "branch-a",
      "branch-b",
    ]);
    expect(proposal.changes.find((change) => change.node.id === "branch-b")?.after.finish)
      .toBe("2026-11-06");
    expect(db.tasks.find((row) => row.id === "terminal-c")?.due).toBe("2026-11-13");

    const preview = getPlanningView(db, project.id);
    expect(preview.approvedFinish).toBe("2026-11-13");
    expect(preview.proposedFinish).toBe("2026-11-13");
    expect(preview.targetFinish).toBe("2026-11-30");

    submitScheduleProposal(db, proposal.id, project.managerId);
    approveScheduleProposal(db, proposal.id, project.managerId);
    expect(getPlanningView(db, project.id).approvedFinish).toBe("2026-11-13");
  });

  it("applies a newly added link even when its successor is outside the edited task branch", () => {
    const db = seed();
    const project = db.projects[0];
    const phase = db.phases.find((row) => row.projectId === project.id)!;
    project.start = "2026-11-02";
    project.due = "2026-11-30";
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
    for (const id of ["edited-a", "predecessor-c", "successor-d"])
      db.tasks.push({
        ...blankTask(project.id, phase.id, ""),
        id,
        name: id,
        start: "2026-11-02",
        due: "2026-11-03",
      });
    const planning = structuredClone(getProjectPlanning(db, project.id));
    planning.enabled = true;
    planning.calendar = structuredClone(weekdayCalendar);
    db.planningVersion = 1;
    db.planning = [planning];

    const newLink: DependencyLink = {
      id: "new-unrelated-link",
      projectId: project.id,
      predecessor: { kind: "task", id: "predecessor-c" },
      successor: { kind: "task", id: "successor-d" },
      type: "FS",
      lagWorkingDays: 0,
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    const proposal = draftScheduleProposal(db, {
      projectId: project.id,
      initiatingNode: { kind: "task", id: "edited-a" },
      reason: "Add a dependency in a parallel branch",
      actorId: project.managerId,
      edit: { start: "2026-11-03", links: [newLink] },
    });
    expect(proposal.conflicts).toEqual([]);
    expect(proposal.changes.find((change) => change.node.id === "successor-d")?.after)
      .toMatchObject({ start: "2026-11-04", finish: "2026-11-05" });
    expect(db.tasks.find((row) => row.id === "successor-d")?.start).toBe("2026-11-02");

    submitScheduleProposal(db, proposal.id, project.managerId);
    approveScheduleProposal(db, proposal.id, project.managerId);
    expect(db.tasks.find((row) => row.id === "successor-d")?.start).toBe("2026-11-04");
    expect(db.planning?.[0].links).toEqual([newLink]);
    expect(getPlanningView(db, project.id).criticalPathFeasible).toBe(true);
  });

  it("keeps a zero-duration milestone distinct from work and pending QA approval", () => {
    const db = seed();
    const project = db.projects[0];
    const phase = db.phases.find((row) => row.projectId === project.id)!;
    project.start = "2026-11-02";
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
    db.tasks.push({
      ...blankTask(project.id, phase.id, ""),
      id: "finished-work",
      name: "Finished work awaiting inspection",
      start: "2026-11-02",
      due: "2026-11-03",
      progress: 100,
      status: "Completed",
    });
    db.milestones.push({
      id: "inspection-event",
      projectId: project.id,
      name: "Inspection approval",
      due: "2026-11-03",
      taskId: "finished-work",
    });
    const planning = structuredClone(getProjectPlanning(db, project.id));
    planning.enabled = true;
    planning.calendar = structuredClone(weekdayCalendar);
    planning.milestonePlanning[0].completionCondition = {
      kind: "QAApproved",
      referenceId: "inspection-not-yet-approved",
    };
    db.planningVersion = 1;
    db.planning = [planning];

    const view = getPlanningView(db, project.id);
    const milestone = view.nodes.find((row) => row.node.id === "inspection-event")!;
    expect(milestone.approved).toEqual({
      start: "2026-11-03",
      finish: "2026-11-03",
      durationWorkingDays: 0,
    });
    expect(db.tasks.find((row) => row.id === "finished-work")?.progress).toBe(100);
    expect(view.blockers.some((row) => row.code === "QAPending" &&
      row.node?.id === "inspection-event")).toBe(true);
    expect(linkFirstPermittedDate(weekdayCalendar, {
      id: "inspection-to-next-work",
      projectId: project.id,
      predecessor: { kind: "milestone", id: "inspection-event" },
      successor: { kind: "task", id: "future-work" },
      type: "FS",
      lagWorkingDays: 0,
      createdAt: "2026-11-01T00:00:00.000Z",
    }, milestone.approved, 1)).toBe("2026-11-04");
  });

  it("blocks a proposed hard finish deadline instead of shortening work", () => {
    const db = seed();
    const project = db.projects[0];
    const phase = db.phases.find((row) => row.projectId === project.id)!;
    project.start = "2026-11-02";
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
    db.tasks.push(
      { ...blankTask(project.id, phase.id, ""), id: "deadline-a", name: "Upstream",
        start: "2026-11-02", due: "2026-11-03" },
      { ...blankTask(project.id, phase.id, ""), id: "deadline-b", name: "Fixed-duration downstream",
        start: "2026-11-04", due: "2026-11-05" },
    );
    const planning = structuredClone(getProjectPlanning(db, project.id));
    planning.enabled = true;
    planning.calendar = structuredClone(weekdayCalendar);
    planning.links = [{
      id: "deadline-link", projectId: project.id,
      predecessor: { kind: "task", id: "deadline-a" },
      successor: { kind: "task", id: "deadline-b" },
      type: "FS", lagWorkingDays: 0,
      createdAt: "2026-11-01T00:00:00.000Z",
    }];
    const downstream = planning.taskPlanning.find((row) => row.taskId === "deadline-b")!;
    downstream.startNoEarlierThan = "2026-11-04";
    downstream.finishNoLaterThan = "2026-11-05";
    db.planningVersion = 1;
    db.planning = [planning];

    const proposal = draftScheduleProposal(db, {
      projectId: project.id,
      initiatingNode: { kind: "task", id: "deadline-a" },
      reason: "Upstream work delayed one working day",
      actorId: project.managerId,
      edit: { start: "2026-11-03" },
    });
    expect(proposal.changes.find((row) => row.node.id === "deadline-b")?.after)
      .toMatchObject({ start: "2026-11-05", finish: "2026-11-06", durationWorkingDays: 2 });
    expect(proposal.conflicts.map((row) => row.code)).toContain("FinishConstraint");
    expect(() => submitScheduleProposal(db, proposal.id, project.managerId)).toThrow(/conflict/i);
    expect(db.tasks.find((row) => row.id === "deadline-b")?.due).toBe("2026-11-05");

    // An already-infeasible approved graph must not carry a definitive critical claim.
    db.planning[0].taskPlanning.find((row) => row.taskId === "deadline-b")!
      .finishNoLaterThan = "2026-11-04";
    const infeasible = getPlanningView(db, project.id);
    expect(infeasible.criticalPathFeasible).toBe(false);
    expect(infeasible.nodes.some((row) => row.critical)).toBe(false);
  });

  it("blocks movement of a required milestone date", () => {
    const db = seed();
    const project = db.projects[0];
    project.start = "2026-11-02";
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
    db.milestones.push({
      id: "required-event", projectId: project.id, name: "Required inspection",
      due: "2026-11-03", taskId: "",
    });
    const planning = structuredClone(getProjectPlanning(db, project.id));
    planning.enabled = true;
    planning.calendar = structuredClone(weekdayCalendar);
    planning.milestonePlanning[0].requiredDate = "2026-11-03";
    db.planningVersion = 1;
    db.planning = [planning];
    const proposal = draftScheduleProposal(db, {
      projectId: project.id,
      initiatingNode: { kind: "milestone", id: "required-event" },
      reason: "Move required inspection",
      actorId: project.managerId,
      edit: { milestoneDate: "2026-11-04" },
    });
    expect(proposal.conflicts.map((row) => row.code)).toContain("RequiredMilestoneDate");
    expect(() => submitScheduleProposal(db, proposal.id, project.managerId)).toThrow(/conflict/i);
    expect(db.milestones[0].due).toBe("2026-11-03");
  });

  it("keeps earlier baseline revisions immutable through approval and recapture", () => {
    const db = seed();
    const project = db.projects[0];
    const phase = db.phases.find((row) => row.projectId === project.id)!;
    project.start = "2026-11-02";
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
    db.tasks.push({ ...blankTask(project.id, phase.id, ""), id: "baseline-task",
      name: "Baseline task", start: "2026-11-02", due: "2026-11-03" });
    const first = captureScheduleBaseline(db, project.id, project.managerId, "Initial PM capture");
    const frozenFirst = structuredClone(first);
    const proposal = draftScheduleProposal(db, {
      projectId: project.id,
      initiatingNode: { kind: "task", id: "baseline-task" },
      reason: "Approved move after site access",
      actorId: project.managerId,
      edit: { start: "2026-11-04" },
    });
    submitScheduleProposal(db, proposal.id, project.managerId);
    approveScheduleProposal(db, proposal.id, project.managerId);
    expect(db.planning?.[0].baselineHistory).toEqual([frozenFirst]);
    const second = captureScheduleBaseline(db, project.id, project.managerId,
      "Explicit revised PM baseline");
    expect(second.revision).toBe(2);
    expect(second.nodes.find((row) => row.node.id === "baseline-task")?.start)
      .toBe("2026-11-04");
    expect(db.planning?.[0].baselineHistory[0]).toEqual(frozenFirst);
    expect(db.planning?.[0].baselineHistory).toHaveLength(2);
  });

  it("weights leaf work progress by duration without parent or milestone double count", () => {
    const db = seed();
    const project = db.projects[0];
    const phase = db.phases.find((row) => row.projectId === project.id)!;
    project.start = "2026-11-02";
    db.tasks = db.tasks.filter((row) => row.projectId !== project.id);
    db.milestones = db.milestones.filter((row) => row.projectId !== project.id);
    db.tasks.push(
      { ...blankTask(project.id, phase.id, ""), id: "summary-parent",
        name: "Summary parent", start: "2026-11-02", due: "2026-11-09", progress: 100 },
      { ...blankTask(project.id, phase.id, ""), id: "short-leaf",
        name: "Short leaf", parentId: "summary-parent", start: "2026-11-02",
        due: "2026-11-03", progress: 100, status: "Completed" },
      { ...blankTask(project.id, phase.id, ""), id: "long-leaf",
        name: "Long leaf", parentId: "summary-parent", start: "2026-11-02",
        due: "2026-11-09", progress: 0 },
    );
    db.milestones.push({ id: "unweighted-milestone", projectId: project.id,
      name: "Unweighted event", due: "2026-11-03", taskId: "" });
    const view = getPlanningView(db, project.id);
    expect(view.planningProgress).toBe(25);
    expect(view.nodes.find((row) => row.node.id === "summary-parent")?.scheduleRole)
      .toBe("summary");
  });

  it("preserves raw legacy bytes and rejects incompatible planning without a storage write", () => {
    const db = seed();
    const raw = JSON.stringify(db);
    const writes = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => raw, setItem: writes });
    const loaded = localRepository.load();
    expect(JSON.stringify(loaded)).toBe(raw);
    expect(getProjectPlanning(loaded, loaded.projects[0].id).baselineStatus).toBe("Unset");
    expect(writes).not.toHaveBeenCalled();

    const future = structuredClone(db) as unknown as { planningVersion?: number };
    future.planningVersion = 99;
    const futureRaw = JSON.stringify(future);
    vi.stubGlobal("localStorage", { getItem: () => futureRaw, setItem: writes });
    expect(() => localRepository.load()).toThrow(/planning|incompatible/i);
    expect(localStorage.getItem("azzora-demo-v1")).toBe(futureRaw);
    expect(writes).not.toHaveBeenCalled();
    expect(() => decodeSavedData("{broken")).toThrow();
  });
});
