import { describe, expect, it } from "vitest";
import { blankTask, seed } from "../domain/seed";
import {
  approveScheduleProposal,
  draftScheduleProposal,
  getPlanningView,
  getProjectPlanning,
  submitScheduleProposal,
  type DependencyLink,
} from "./index";
import { weekdayCalendar } from "./timeline-independent-fixtures";

describe("independent schedule integration", () => {
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
});
