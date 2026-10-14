import { beforeEach, describe, expect, it, vi } from "vitest";
import { seed, blankTask } from "../domain/seed";
import {
  completeProject,
  localRepository,
  saveTask,
} from "../domain/repository";
import { handoverState } from "../domain/logic";
import type {
  Database,
  DocumentRecord,
  Person,
  SiteUpdate,
  Snag,
} from "../domain/model";
import {
  activePerson,
  reviseDocument,
  reviewDocument,
  reviewSiteUpdate,
  saveAssignment,
  saveDocumentDraft,
  saveEmployee,
  saveSiteUpdate,
  saveSnag,
  setEmployeeActive,
} from "./commands";
import { latestDocuments, operationalReadiness } from "./readiness";
let db: Database;
const author = "person-3",
  reviewer = "person-0";
beforeEach(() => {
  db = seed();
});
function employee(): Person {
  return {
    id: "new-person",
    name: "QA Employee",
    email: "employee@example.test",
    phone: "+971501234567",
    department: "Site Operations",
    employeeCode: "EMP-QA",
    role: "Site Engineer",
    status: "Active",
    capacity: 80,
  };
}
function drawing(): DocumentRecord {
  return {
    id: "drawing",
    projectId: db.projects[0].id,
    name: "Reflected ceiling",
    category: "Design Drawings",
    status: "Draft",
    version: 1,
    uploadedAt: "2026-10-14",
    uploadedBy: author,
    revisionNote: "Initial coordinated drawing",
    attachment: {
      id: "file",
      name: "drawing.txt",
      size: 2,
      type: "text/plain",
      category: "Drawings",
      dataUrl: "data:text/plain;base64,b2s=",
    },
  };
}
function site(): SiteUpdate {
  return {
    id: "site",
    projectId: db.projects[0].id,
    date: "2026-10-14",
    completed: "Ceiling works",
    inProgress: "",
    issue: "",
    tomorrow: "Inspection",
    manpower: 4,
    notes: "",
    authorId: author,
    photos: [],
  };
}
function snag(): Snag {
  return {
    id: "snag-qa",
    reference: "SN-QA",
    projectId: db.projects[0].id,
    area: "Reception",
    description: "Joint alignment",
    assigneeId: author,
    priority: "High",
    createdAt: "2026-10-14",
    due: "2026-10-20",
    status: "Open",
    before: [],
    after: [],
    inspection: "",
    createdBy: author,
  };
}
function submitted() {
  saveDocumentDraft(db, drawing(), author);
  reviewDocument(
    db,
    "drawing",
    "Pending",
    author,
    "Submitted for coordination review",
  );
}
describe("workforce relationships and history", () => {
  it("adds and edits a real employee retaining stable ID", () => {
    saveEmployee(db, employee(), reviewer);
    saveEmployee(db, { ...employee(), name: "QA Employee Updated" }, reviewer);
    expect(db.people.filter((p) => p.id === "new-person")).toHaveLength(1);
    expect(db.people.at(-1)?.history).toHaveLength(2);
  });
  it("rejects duplicate code and email without adding records", () => {
    saveEmployee(db, employee(), reviewer);
    expect(() =>
      saveEmployee(db, { ...employee(), id: "duplicate" }, reviewer),
    ).toThrow(/unique/);
    expect(db.people.filter((p) => p.email === employee().email)).toHaveLength(
      1,
    );
  });
  it.each([0, 101, NaN])("rejects invalid capacity %s", (capacity) => {
    expect(() =>
      saveEmployee(db, { ...employee(), capacity }, reviewer),
    ).toThrow(/Capacity/);
  });
  it("retains historical task/project references on deactivation", () => {
    const tasks = JSON.stringify(db.tasks),
      assignments = JSON.stringify(db.assignments),
      id = db.people[3].id;
    setEmployeeActive(db, id, false, reviewer, "Contract ended");
    expect(db.people[3].status).toBe("Inactive");
    expect(JSON.stringify(db.tasks)).toBe(tasks);
    expect(JSON.stringify(db.assignments)).toBe(assignments);
    expect(() => activePerson(db, id)).toThrow();
  });
  it("retains inactive task ownership when recording existing task progress", () => {
    const task = db.tasks.find((t) => t.assigneeId === author)!;
    setEmployeeActive(db, author, false, reviewer, "Contract ended");
    saveTask(db, { ...task, progress: 20 });
    expect(db.tasks.find((t) => t.id === task.id)?.assigneeId).toBe(author);
  });
  it("blocks new task allocations to inactive staff", () => {
    setEmployeeActive(db, author, false, reviewer, "Contract ended");
    expect(() =>
      saveTask(db, {
        ...blankTask(db.projects[0].id, db.phases[0].id, author),
        name: "New site task",
      }),
    ).toThrow(/active/);
  });
  it("reactivates without replacing IDs or erasing history", () => {
    setEmployeeActive(db, author, false, reviewer, "Contract ended");
    setEmployeeActive(db, author, true, reviewer, "Contract renewed");
    expect(activePerson(db, author).history).toHaveLength(2);
  });
  it("links a new task assignee to its project", () => {
    saveEmployee(db, employee(), reviewer);
    const task = {
      ...blankTask(db.projects[0].id, db.phases[0].id, "new-person"),
      name: "Site inspection",
    };
    saveTask(db, task);
    expect(
      db.assignments.some(
        (a) => a.personId === "new-person" && a.projectId === task.projectId,
      ),
    ).toBe(true);
  });
  it("replaces project staff and active tasks while preserving completed work", () => {
    const assignment = db.assignments.find(
      (a) => a.personId === author && a.status === "Active",
    )!;
    const tasks = db.tasks.filter(
      (t) => t.projectId === assignment.projectId && t.assigneeId === author,
    );
    tasks[0].status = "Completed";
    saveAssignment(db, assignment, "person-4", true, reviewer);
    expect(assignment.status).toBe("Replaced");
    expect(tasks[0].assigneeId).toBe(author);
    expect(tasks.slice(1).every((t) => t.assigneeId === "person-4")).toBe(true);
    expect(db.activities.some((a) => a.action === "Task reassigned")).toBe(
      true,
    );
  });
  it("rejects cross-project assignment edits and inactive new assignment", () => {
    const assignment = db.assignments[0];
    expect(() =>
      saveAssignment(
        db,
        { ...assignment, projectId: db.projects[1].id },
        author,
        false,
        reviewer,
      ),
    ).toThrow(/separate/);
    setEmployeeActive(db, author, false, reviewer, "Left");
    expect(() =>
      saveAssignment(db, { ...assignment, id: "new" }, author, false, reviewer),
    ).toThrow(/active/);
  });
});
describe("immutable drawing revisions and explicit reviews", () => {
  it("requires submit before approve and independent reviewer", () => {
    saveDocumentDraft(db, drawing(), author);
    expect(() =>
      reviewDocument(db, "drawing", "Approved", reviewer, "OK"),
    ).toThrow(/Submit/);
    reviewDocument(db, "drawing", "Pending", author, "Submit");
    expect(() =>
      reviewDocument(db, "drawing", "Approved", author, "OK"),
    ).toThrow(/different/);
  });
  it("rejects, resubmits corrected drawing, and approves revision", () => {
    submitted();
    reviewDocument(
      db,
      "drawing",
      "Rejected",
      reviewer,
      "Correct ceiling dimensions",
    );
    const rejected = JSON.stringify(
      db.documents.find((d) => d.id === "drawing"),
    );
    const next = reviseDocument(db, "drawing", author, "Corrected dimensions");
    saveDocumentDraft(
      db,
      {
        ...next,
        attachment: { ...drawing().attachment!, name: "corrected.txt" },
      },
      author,
    );
    reviewDocument(
      db,
      next.id,
      "Pending",
      author,
      "Corrected drawing submitted",
    );
    reviewDocument(db, next.id, "Approved", reviewer, "Dimensions verified");
    expect(next.version).toBe(2);
    expect(db.documents.find((d) => d.id === next.id)?.status).toBe("Approved");
    expect(JSON.stringify(db.documents.find((d) => d.id === "drawing"))).toBe(
      rejected,
    );
    expect(
      db.documents.find((d) => d.id === next.id)?.history?.at(-1)?.actorName,
    ).toBe(db.people[0].name);
  });
  it("preserves approved attachment, metadata and history byte-for-byte when revising", () => {
    submitted();
    reviewDocument(db, "drawing", "Approved", reviewer, "Approved");
    const old = db.documents.find((d) => d.id === "drawing")!,
      snapshot = JSON.stringify(old);
    const next = reviseDocument(db, old.id, author, "New finish specification");
    expect(JSON.stringify(old)).toBe(snapshot);
    expect(next.attachment).toBeUndefined();
    expect(next.previousRevisionId).toBe(old.id);
    expect(() =>
      saveDocumentDraft(db, { ...old, name: "Overwrite" }, author),
    ).toThrow(/locked/);
  });
  it("blocks duplicate revision branches and editing revision identity", () => {
    submitted();
    reviewDocument(db, "drawing", "Rejected", reviewer, "Correct");
    const next = reviseDocument(db, "drawing", author, "Correction");
    expect(() => reviseDocument(db, "drawing", author, "Duplicate")).toThrow(
      /latest/,
    );
    expect(() =>
      saveDocumentDraft(db, { ...next, version: 9 }, author),
    ).toThrow(/identity/);
  });
  it("requires actor and reason, and rejects inactive reviewers", () => {
    submitted();
    expect(() =>
      reviewDocument(db, "drawing", "Rejected", reviewer, " "),
    ).toThrow(/reason/);
    expect(() =>
      reviewDocument(db, "drawing", "Rejected", "", "Correct"),
    ).toThrow(/active/);
    setEmployeeActive(db, reviewer, false, author, "Leave");
    expect(() =>
      reviewDocument(db, "drawing", "Approved", reviewer, "OK"),
    ).toThrow(/active/);
  });
  it("uses the latest family revision for readiness without hiding old approvals", () => {
    submitted();
    reviewDocument(db, "drawing", "Approved", reviewer, "Approved");
    reviseDocument(db, "drawing", author, "Correction");
    expect(
      latestDocuments(db).find((d) => d.familyId === "drawing")?.version,
    ).toBe(2);
    expect(operationalReadiness(db, db.projects[0].id).documentsReady).toBe(
      false,
    );
  });
  it("records actor names as historical snapshots", () => {
    submitted();
    const doc = db.documents.find((d) => d.id === "drawing")!,
      name = doc.history![0].actorName;
    db.people.find((p) => p.id === author)!.name = "Renamed";
    expect(doc.history![0].actorName).toBe(name);
  });
});
describe("site supervision, QA and operational handover", () => {
  it("clears the manager pointer when a manager's project role changes", () => {
    const assignment = db.assignments.find(
      (a) => a.role === "Project Manager" && a.status === "Active",
    )!;
    saveAssignment(
      db,
      { ...assignment, role: "Site Supervisor" },
      assignment.personId,
      false,
      reviewer,
    );
    expect(
      db.projects.find((p) => p.id === assignment.projectId)?.managerId,
    ).toBe("");
  });
  it("requires fresh inspection notes after reopening a closed snag", () => {
    const input = {
      ...snag(),
      status: "Closed" as const,
      inspection: "Previous inspection",
      closedBy: reviewer,
      closedAt: "2026-10-14",
    };
    db.snags.push(input);
    saveSnag(db, input, "Rectification", reviewer, "Defect recurred");
    expect(input.inspection).toBe("");
    saveSnag(db, input, "Ready for Inspection", reviewer, "Corrected");
    expect(() => saveSnag(db, input, "Closed", reviewer, "Checked")).toThrow(
      /notes/,
    );
  });
  it("requires independent site supervision and preserves corrections", () => {
    saveSiteUpdate(db, site(), author);
    expect(() =>
      reviewSiteUpdate(db, "site", "Approved", author, "OK"),
    ).toThrow(/different/);
    reviewSiteUpdate(
      db,
      "site",
      "Changes Requested",
      reviewer,
      "Add inspection detail",
    );
    saveSiteUpdate(
      db,
      {
        ...db.updates.find((u) => u.id === "site")!,
        completed: "Ceiling works inspected",
      },
      author,
    );
    reviewSiteUpdate(db, "site", "Approved", reviewer, "Verified");
    const record = db.updates.find((u) => u.id === "site")!;
    expect(record.history).toHaveLength(4);
    expect(record.history![2].previous).toContain("Ceiling works");
    expect(() => saveSiteUpdate(db, record, author)).toThrow(/returned/);
  });
  it("rejects fractional manpower and missing site content", () => {
    expect(() =>
      saveSiteUpdate(db, { ...site(), manpower: 1.5 }, author),
    ).toThrow();
    expect(() =>
      saveSiteUpdate(db, { ...site(), completed: " " }, author),
    ).toThrow();
  });
  it("records QA creation, reassignment, inspection and reopening", () => {
    saveSnag(db, snag(), "Open", author, "Raised at site");
    let s = db.snags.find((s) => s.id === "snag-qa")!;
    saveSnag(db, s, "Assigned", reviewer, "Assigned to site engineer");
    saveSnag(
      db,
      { ...s, assigneeId: "person-4" },
      "Rectification",
      reviewer,
      "Reassigned to MEP",
    );
    saveSnag(db, s, "Ready for Inspection", author, "Alignment corrected");
    saveSnag(
      db,
      { ...s, inspection: "Verified alignment" },
      "Closed",
      reviewer,
      "Inspection passed",
    );
    s = db.snags.find((s) => s.id === "snag-qa")!;
    expect(s.closedBy).toBe(reviewer);
    expect(s.history).toHaveLength(5);
    saveSnag(db, s, "Rectification", reviewer, "Defect recurred");
    expect(s.closedAt).toBeUndefined();
    expect(s.history?.at(-1)?.previous).toContain('"status":"Closed"');
  });
  it("blocks skipped QA transitions and self inspection", () => {
    expect(() => saveSnag(db, snag(), "Closed", reviewer, "Skip")).toThrow(
      /step/,
    );
    saveSnag(db, snag(), "Assigned", reviewer, "Assigned");
    const s = db.snags.find((s) => s.id === "snag-qa")!;
    saveSnag(db, s, "Rectification", reviewer, "Working");
    saveSnag(db, s, "Ready for Inspection", reviewer, "Ready");
    expect(() =>
      saveSnag(
        db,
        { ...s, inspection: "Self checked" },
        "Closed",
        author,
        "Passed",
      ),
    ).toThrow(/independent/);
    expect(() => saveSnag(db, s, "Closed", reviewer, "Passed")).toThrow(
      /notes/,
    );
  });
  it("blocks handover until supervision, documents and QA pass while preserving commercial flags", () => {
    const id = db.projects[0].id;
    db.tasks
      .filter((t) => t.projectId === id)
      .forEach((t) => {
        t.progress = 100;
        t.status = "Completed";
      });
    db.snags
      .filter((s) => s.projectId === id)
      .forEach((s) => (s.status = "Closed"));
    db.handover
      .filter((h) => h.projectId === id)
      .forEach((h) => (h.complete = true));
    db.documents = [];
    db.updates = [];
    const commercial = JSON.stringify(
      db.handover.filter((h) => h.group === "Commercial"),
    );
    expect(handoverState(db, id).ready).toBe(false);
    saveSiteUpdate(db, site(), author);
    reviewSiteUpdate(db, "site", "Approved", reviewer, "Site ready");
    expect(handoverState(db, id).ready).toBe(true);
    submitted();
    expect(handoverState(db, id).ready).toBe(false);
    reviewDocument(db, "drawing", "Approved", reviewer, "Approved");
    expect(handoverState(db, id).ready).toBe(true);
    completeProject(db, id, reviewer, "Handover verified");
    expect(
      JSON.stringify(db.handover.filter((h) => h.group === "Commercial")),
    ).toBe(commercial);
    expect(db.projects[0].status).toBe("Completed");
  });
  it("persists all operational records and legacy IDs through reload", () => {
    const ids = db.people.map((p) => p.id);
    saveEmployee(db, employee(), reviewer);
    submitted();
    let raw = "";
    vi.stubGlobal("localStorage", {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    });
    localRepository.save(db);
    const loaded = localRepository.load();
    expect(loaded.people.slice(0, ids.length).map((p) => p.id)).toEqual(ids);
    expect(loaded.people.at(-1)?.email).toBe(employee().email);
    expect(
      loaded.documents.find((d) => d.id === "drawing")?.history,
    ).toHaveLength(2);
    vi.unstubAllGlobals();
  });
  it("leaves all financial collections unchanged by workforce actions", () => {
    const before = JSON.stringify([
      db.invoices,
      db.payments,
      db.expenses,
      db.contracts,
    ]);
    saveEmployee(db, employee(), reviewer);
    submitted();
    saveSiteUpdate(db, site(), author);
    saveSnag(db, snag(), "Assigned", reviewer, "Assigned");
    expect(
      JSON.stringify([db.invoices, db.payments, db.expenses, db.contracts]),
    ).toBe(before);
  });
});
