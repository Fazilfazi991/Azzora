import { describe, expect, it } from "vitest";
import { blankTask, seed } from "../domain/seed";
import {
  approveScheduleProposal,
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
});
