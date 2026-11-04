import { describe, expect, it } from "vitest";
import type { Database, Person, Task } from "../domain/model";
import { createReviewState } from "../accounts-review/domain";
import { emptyOperations } from "../operations/migration";
import { AccessDenied, type BackendAction } from "../backend/permissions";
import type { SharedActor, SharedCompanyState } from "./domain";
import { applyManagerCommand, managerCommandScope } from "./manager-commands";
import { getProjectPlanning } from "../planning/compatibility";
import { previewFitOutTemplate } from "../planning/template";

const people: Person[] = ["owner", "pm", "staff", "other"].map((id) => ({
  id,
  name: `Fictional ${id}`,
  role: id === "pm" ? "Project Manager" : "Site Engineer",
  demoRole: id === "owner" ? "Owner" : id === "pm" ? "Project Manager" : "Site",
  department: "Fictional site",
  email: `${id}@staging.test`,
  phone: "",
  status: "Active",
  capacity: 100,
}));
function actor(id = "pm"): SharedActor {
  return {
    userId: id,
    companyId: "fictional",
    sessionId: id,
    assurance: id === "owner" ? "aal2" : "aal1",
    grant: {
      userId: id,
      companyId: "fictional",
      active: true,
      roles: [
        id === "owner"
          ? "owner"
          : id === "pm"
            ? "project_manager"
            : "site_staff",
      ],
      workspaces: ["manager"],
      projectIds: ["p1"],
      capabilities: (id === "owner"
        ? ["project.write", "access.manage"]
        : id === "pm"
          ? ["project.write"]
          : [
              "task.update",
              "site.submit",
              "document.submit",
              "qa.update",
            ]) as BackendAction[],
    },
  };
}
const task = (): Task => ({
  id: "task",
  projectId: "p1",
  phaseId: "phase",
  name: "Fictional installation",
  description: "",
  assigneeId: "staff",
  start: "2026-11-04",
  due: "2026-11-05",
  progress: 0,
  status: "Not Started",
  priority: "Normal",
  dependencies: [],
  allocation: 50,
  trade: "Civil",
  notes: "",
  attachments: [],
  comments: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
});
function fixture() {
  const manager: Database = {
    version: 1,
    clients: [{ id: "client", name: "Fictional client", contact: "Fictional" }],
    projects: [
      {
        id: "p1",
        code: "FICT-1",
        name: "Fictional project",
        clientId: "client",
        location: "Fictional Dubai",
        emirate: "Dubai",
        building: "",
        unit: "",
        area: 0,
        scope: "",
        disciplines: [],
        type: "Office",
        value: 0,
        start: "2026-11-04",
        due: "2026-12-31",
        managerId: "pm",
        priority: "Normal",
        status: "Active",
      },
    ],
    people: structuredClone(people),
    phases: [
      {
        id: "phase",
        projectId: "p1",
        name: "Fictional work",
        weight: 100,
        order: 0,
      },
    ],
    assignments: people.map((person) => ({
      id: person.id + "-assignment",
      projectId: "p1",
      personId: person.id,
      role: person.role,
      start: "2026-11-04",
      end: "2026-12-31",
      responsibility: "Fictional work",
      status: "Active",
    })),
    tasks: [task()],
    milestones: [],
    updates: [],
    snags: [],
    documents: [],
    handover: [
      {
        id: "manual",
        projectId: "p1",
        group: "Client",
        name: "Fictional client confirmation",
        required: true,
        applicable: true,
        complete: false,
      },
    ],
    activities: [],
    quotations: [],
    invoices: [],
    contracts: [],
    payments: [],
    expenses: [],
    commercialNumbering: { customer: 1, invoice: 1, receipt: 1, expense: 1 },
    quotationNumbering: { prefix: "FICT-", next: 1 },
    operations: emptyOperations(),
  };
  let state: SharedCompanyState = {
    version: 1,
    mode: "fictional-staging",
    manager,
    finance: createReviewState(),
    expenseSubmissions: [],
  };
  return {
    state: () => state,
    run: (kind: string, payload: unknown, user = actor()) => {
      const next = structuredClone(state);
      expect(applyManagerCommand(next, { kind, payload }, user)).toBe(true);
      state = next;
      return state;
    },
  };
}
describe("finite nonfinancial Manager staging commands", () => {
  it("instantiates the reviewed template once without inventing a legacy baseline", () => {
    const f = fixture();
    f.state().manager.tasks = [];
    f.state().manager.phases = [];
    f.run("planning.template", {
      projectId: "p1",
      preview: previewFitOutTemplate(),
    });
    expect(f.state().manager.phases).toHaveLength(12);
    expect(f.state().manager.tasks.length).toBeGreaterThan(20);
    expect(f.state().manager.planning![0].baselineStatus).toBe("Unset");
    const count = f.state().manager.tasks.length;
    expect(() =>
      f.run("planning.template", {
        projectId: "p1",
        preview: previewFitOutTemplate(),
      }),
    ).toThrow(/already has a plan/);
    expect(f.state().manager.tasks).toHaveLength(count);
  });
  it("applies calendar holidays and working-hour metadata only through submitted PM approval", () => {
    const f = fixture(),
      calendar = {
        ...getProjectPlanning(f.state().manager, "p1").calendar,
        holidays: ["2026-11-05"],
        workdayStart: "09:00",
        workdayEnd: "18:00",
      };
    f.run("planning.propose", {
      projectId: "p1",
      initiatingNode: { kind: "task", id: "task" },
      reason: "Fictional working calendar review",
      edit: { calendar },
    });
    expect(f.state().manager.tasks[0].due).toBe("2026-11-05");
    expect(f.state().manager.planning![0].calendar.holidays).toEqual([]);
    const id = f.state().manager.planning![0].proposals[0].id;
    f.run("planning.submit", { id });
    f.run("planning.approve", { id });
    expect(f.state().manager.planning![0].calendar).toEqual(calendar);
    expect(f.state().manager.tasks[0].due).toBe("2026-11-06");
  });
  it("allows assigned Staff progress with server-authored comments and audit identity", () => {
    const f = fixture(),
      updated = {
        ...task(),
        progress: 40,
        notes: "Fictional progress",
        comments: [
          {
            id: "forged",
            authorId: "owner",
            text: "forged",
            createdAt: "fake",
          },
        ],
      };
    f.run(
      "task.save",
      {
        task: updated,
        comment: "Actual fictional note",
        progressDate: "2026-11-04",
        progressNote: "Fictional evidence",
        links: [],
      },
      actor("staff"),
    );
    expect(f.state().manager.tasks[0].progress).toBe(40);
    expect(f.state().manager.tasks[0].comments.map((c) => c.authorId)).toEqual([
      "staff",
    ]);
    expect(
      f.state().manager.activities.every((a) => a.actorId === "staff"),
    ).toBe(true);
    expect(
      getProjectPlanning(f.state().manager, "p1").taskPlanning[0]
        .progressHistory![0].actorId,
    ).toBe("staff");
  });
  it("rejects another employee's task, forged project scope and Staff schedule edits atomically", () => {
    const f = fixture(),
      before = structuredClone(f.state());
    expect(() =>
      f.run(
        "task.progress",
        { id: "task", percent: 20, date: "2026-11-04", notes: "Fictional" },
        actor("other"),
      ),
    ).toThrow(AccessDenied);
    expect(() =>
      f.run(
        "task.save",
        { task: { ...task(), projectId: "unrelated" } },
        actor("staff"),
      ),
    ).toThrow(/another project/);
    expect(() =>
      f.run(
        "task.save",
        { task: { ...task(), due: "2026-11-06" } },
        actor("staff"),
      ),
    ).toThrow(AccessDenied);
    expect(f.state()).toEqual(before);
  });
  it("preserves approved task dates until designated PM approval and captures baselines explicitly", () => {
    const f = fixture();
    f.run("task.save", {
      task: { ...task(), start: "2026-11-09", due: "2026-11-10" },
      scheduleReason: "Fictional delay",
      links: [],
    });
    expect(f.state().manager.tasks[0].start).toBe("2026-11-04");
    expect(f.state().manager.planning![0].baselineStatus).toBe("Unset");
    const id = f.state().manager.planning![0].proposals[0].id;
    f.run("planning.submit", { id });
    expect(() => f.run("planning.approve", { id }, actor("owner"))).toThrow(
      AccessDenied,
    );
    f.run("planning.approve", { id });
    expect(f.state().manager.tasks[0].start).toBe("2026-11-09");
    f.run("planning.baseline", {
      projectId: "p1",
      reason: "Explicit fictional baseline",
    });
    expect(f.state().manager.planning![0].baselineHistory).toHaveLength(1);
  });
  it("creates tasks and milestones only through approved proposals, with no duplicate task records", () => {
    const f = fixture();
    f.run("task.save", {
      task: {
        ...task(),
        id: "child",
        parentId: "task",
        name: "Fictional child",
        assigneeId: "other",
      },
      scheduleReason: "Reviewed child scope",
    });
    expect(f.state().manager.tasks).toHaveLength(1);
    let id = f.state().manager.planning![0].proposals.at(-1)!.id;
    f.run("planning.submit", { id });
    f.run("planning.approve", { id });
    expect(f.state().manager.tasks).toHaveLength(2);
    expect(() => f.run("planning.approve", { id })).toThrow();
    f.run("planning.milestone", {
      milestone: {
        id: "milestone",
        projectId: "p1",
        name: "Fictional checkpoint",
        due: "2026-11-10",
        taskId: "",
      },
      reason: "Reviewed manual checkpoint",
    });
    id = f.state().manager.planning![0].proposals.at(-1)!.id;
    f.run("planning.submit", { id });
    f.run("planning.approve", { id });
    f.run("planning.milestone-complete", {
      id: "milestone",
      reason: "Fictional confirmation",
    });
    expect(
      f.state().manager.planning![0].milestonePlanning[0].completedBy,
    ).toBe("pm");
  });
  it("rejects circular dependencies and progress-history replacement", () => {
    const f = fixture();
    expect(() =>
      f.run("planning.propose", {
        projectId: "p1",
        initiatingNode: { kind: "task", id: "task" },
        reason: "Invalid cycle",
        edit: {
          links: [
            {
              id: "cycle",
              projectId: "p1",
              predecessor: { kind: "task", id: "task" },
              successor: { kind: "task", id: "task" },
              type: "FS",
              lagWorkingDays: 0,
              createdAt: "2026-11-04T00:00:00Z",
            },
          ],
        },
      }),
    ).toThrow();
    const metadata = getProjectPlanning(f.state().manager, "p1")
      .taskPlanning[0];
    expect(() =>
      f.run("planning.propose", {
        projectId: "p1",
        initiatingNode: { kind: "task", id: "task" },
        reason: "Forged progress",
        edit: {
          taskPlanning: [
            { ...metadata, progressHistory: [{ actorId: "owner" }] },
          ],
        },
      }),
    ).toThrow(/history/);
  });
  it("retains all planning metadata and simultaneous progress when proposing a constraint edit", () => {
    const f = fixture(),
      constraint = {
        ...getProjectPlanning(f.state().manager, "p1").taskPlanning[0],
        finishNoLaterThan: "2026-11-10",
      };
    f.run("task.save", {
      task: { ...task(), progress: 25 },
      constraint,
      progressDate: "2026-11-04",
      progressNote: "Fictional progress evidence",
      scheduleReason: "Reviewed constraint adjustment",
      links: [],
    });
    const plan = f.state().manager.planning![0],
      proposal = plan.proposals.at(-1)!;
    expect(plan.taskPlanning[0].progressHistory).toHaveLength(1);
    expect(proposal.proposedTaskPlanning![0].progressHistory).toEqual(
      plan.taskPlanning[0].progressHistory,
    );
    expect(() =>
      f.run("planning.propose", {
        projectId: "p1",
        initiatingNode: { kind: "task", id: "task" },
        reason: "Drop planning history",
        edit: { taskPlanning: [] },
      }),
    ).toThrow(/each existing task/);
  });
  it("submits, independently reviews and revises documents while retaining original history", () => {
    const f = fixture(),
      document = {
        id: "doc",
        projectId: "p1",
        name: "Fictional drawing",
        category: "Drawing",
        status: "Draft",
        version: 1,
        uploadedBy: "owner",
        uploadedAt: "forged",
        history: [{ actorId: "owner" }],
      };
    f.run("document.save", { document }, actor("staff"));
    expect(f.state().manager.documents[0].uploadedBy).toBe("staff");
    f.run(
      "document.review",
      {
        id: "doc",
        status: "Pending",
        reason: "Fictional review request",
        reviewerId: "pm",
      },
      actor("staff"),
    );
    expect(() =>
      f.run(
        "document.review",
        { id: "doc", status: "Approved", reason: "Fake self review" },
        actor("staff"),
      ),
    ).toThrow(AccessDenied);
    f.run("document.review", {
      id: "doc",
      status: "Approved",
      reason: "Independent fictional approval",
    });
    const original = structuredClone(f.state().manager.documents[0]);
    f.run(
      "document.revise",
      { id: "doc", reason: "Fictional revised drawing" },
      actor("staff"),
    );
    expect(f.state().manager.documents[0]).toEqual(original);
    expect(f.state().manager.documents[1].version).toBe(2);
    expect(f.state().manager.documents[1].uploadedBy).toBe("staff");
  });
  it("preserves site author identity and requires independent supervisory review", () => {
    const f = fixture(),
      update = {
        id: "update",
        projectId: "p1",
        date: "2026-11-04",
        completed: "Fictional work",
        inProgress: "",
        issue: "",
        tomorrow: "",
        manpower: 2,
        notes: "",
        authorId: "owner",
        photos: [],
      };
    f.run("site.save", { update }, actor("staff"));
    expect(f.state().manager.updates[0].authorId).toBe("staff");
    expect(() =>
      f.run(
        "site.review",
        { id: "update", status: "Approved", reason: "Fake" },
        actor("staff"),
      ),
    ).toThrow(AccessDenied);
    f.run("site.review", {
      id: "update",
      status: "Changes Requested",
      reason: "Add fictional evidence",
    });
    expect(() => f.run("site.save", { update }, actor("other"))).toThrow(
      AccessDenied,
    );
    f.run(
      "site.save",
      { update: { ...update, completed: "Corrected fictional work" } },
      actor("staff"),
    );
    f.run("site.review", {
      id: "update",
      status: "Approved",
      reason: "Independent fictional evidence checked",
    });
    expect(f.state().manager.updates[0].history).toHaveLength(4);
  });
  it("keeps QA closure independent and disallows workflow jumps", () => {
    const f = fixture(),
      snag = {
        id: "snag",
        reference: "FICT-1",
        projectId: "p1",
        area: "Fictional room",
        description: "Fictional inspection finding",
        assigneeId: "staff",
        priority: "Normal",
        createdAt: "forged",
        due: "2026-11-10",
        status: "Open",
        before: [],
        after: [],
        inspection: "",
        createdBy: "owner",
      };
    f.run(
      "snag.save",
      { snag, status: "Open", reason: "Fictional issue" },
      actor("staff"),
    );
    expect(() =>
      f.run("snag.save", { snag, status: "Closed", reason: "Invalid jump" }),
    ).toThrow();
    f.run("snag.save", {
      snag,
      status: "Assigned",
      reason: "Fictional responsible person",
    });
    f.run(
      "snag.save",
      { snag, status: "Rectification", reason: "Fictional correction" },
      actor("staff"),
    );
    f.run(
      "snag.save",
      { snag, status: "Ready for Inspection", reason: "Evidence ready" },
      actor("staff"),
    );
    expect(() =>
      f.run(
        "snag.save",
        {
          snag: { ...snag, inspection: "Fake self inspection" },
          status: "Closed",
          reason: "Fake",
        },
        actor("staff"),
      ),
    ).toThrow(AccessDenied);
    f.run("snag.save", {
      snag: { ...snag, inspection: "Independent fictional inspection passed" },
      status: "Closed",
      reason: "Independent closure",
    });
    expect(f.state().manager.snags[0].closedBy).toBe("pm");
  });
  it("preserves financial project fields, validated phase weights and derived handover checks", () => {
    const f = fixture(),
      project = f.state().manager.projects[0];
    f.run("project.update", {
      project: { ...project, name: "Updated fictional name" },
    });
    expect(() =>
      f.run("project.update", { project: { ...project, start: "2026-11-05" } }),
    ).toThrow(/dates/);
    expect(() =>
      f.run("project.update", { project: { ...project, value: 100 } }),
    ).toThrow(/commercial/);
    f.run("project.weights", {
      projectId: "p1",
      weights: [{ id: "phase", weight: 100 }],
    });
    expect(() =>
      f.run("project.weights", {
        projectId: "p1",
        weights: [{ id: "foreign-phase", weight: 100 }],
      }),
    ).toThrow();
    f.run("handover.check", { id: "manual", complete: true });
    expect(f.state().manager.handover[0].complete).toBe(true);
    expect(() =>
      f.run("project.complete", {
        id: "p1",
        reason: "Premature fictional handover",
      }),
    ).toThrow();
  });
  it("restricts employee management and preserves authenticated email and legacy role", () => {
    const f = fixture(),
      employee = f.state().manager.people[2];
    expect(() => f.run("employee.save", { employee })).toThrow(AccessDenied);
    f.run(
      "employee.save",
      {
        employee: {
          ...employee,
          name: "Updated fictional employee",
          email: "forged@fake.test",
          demoRole: "Owner",
        },
      },
      actor("owner"),
    );
    expect(f.state().manager.people[2].email).toBe(employee.email);
    expect(f.state().manager.people[2].demoRole).toBe("Site");
    expect(
      managerCommandScope(f.state(), {
        kind: "employee.save",
        payload: { employee },
      })?.capability,
    ).toBe("access.manage");
    expect(() =>
      f.run(
        "employee.status",
        { id: "owner", active: false, reason: "Self lockout must fail" },
        actor("owner"),
      ),
    ).toThrow(AccessDenied);
  });
  it("retains removed assignments and rejects repeat removal", () => {
    const f = fixture();
    f.run("assignment.remove", {
      id: "other-assignment",
      reason: "Fictional staffing change",
    });
    expect(
      f
        .state()
        .manager.assignments.find((value) => value.id === "other-assignment")!
        .status,
    ).toBe("Removed");
    expect(() =>
      f.run("assignment.remove", { id: "other-assignment" }),
    ).toThrow(/active assignments/);
  });
  it("completes handover only after tasks, manual confirmation and independent site supervision pass", () => {
    const f = fixture();
    f.run("handover.check", { id: "manual", complete: true });
    f.run(
      "site.save",
      {
        update: {
          id: "handover-update",
          projectId: "p1",
          date: "2026-11-04",
          completed: "Fictional final work",
          inProgress: "",
          issue: "",
          tomorrow: "",
          manpower: 1,
          notes: "",
          authorId: "forged",
          photos: [],
        },
      },
      actor("staff"),
    );
    f.run("site.review", {
      id: "handover-update",
      status: "Approved",
      reason: "Independent fictional final site review",
    });
    expect(() =>
      f.run("project.complete", { id: "p1", reason: "Premature" }),
    ).toThrow(/task plan/);
    f.run(
      "task.progress",
      {
        id: "task",
        percent: 100,
        date: "2026-11-04",
        notes: "Fictional task completion evidence",
      },
      actor("staff"),
    );
    f.run("project.complete", {
      id: "p1",
      reason: "All operational checks reviewed",
    });
    expect(f.state().manager.projects[0].status).toBe("Completed");
    expect(() =>
      f.run("handover.check", { id: "manual", complete: false }),
    ).toThrow(/history/);
  });
});
