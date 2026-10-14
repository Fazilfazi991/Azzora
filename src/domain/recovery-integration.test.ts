import { describe, it, expect, vi, afterEach } from "vitest";
import { seed } from "./seed";
import type { Database, DocumentRecord } from "./model";
import {
  decodeSavedData,
  localRepository,
  completeProject,
} from "./repository";
import { initializeCommercial } from "../commercial/migration";
import {
  blankInvoice,
  saveInvoice,
  issueInvoice,
} from "../commercial/repository";
import {
  reviewDocument,
  saveDocumentDraft,
  reviseDocument,
} from "../workforce/commands";
import { activeApprovals, approvalView } from "../workforce/document-approvals";
import {
  submitApproval,
  decideApproval,
  reassignApproval,
} from "../operations/repository";
import { closureSummary } from "../operations/closure-domain";
import { handoverState } from "./logic";
const ready = () => {
  const db = seed();
  initializeCommercial(db);
  return db;
};
afterEach(() => vi.unstubAllGlobals());

describe("protected loading and additive migration", () => {
  it("validates posted allocation metadata before rendering while retaining original records", () => {
    const db = ready(),
      draft = blankInvoice(db.clients[0].id, db.projects[0].id);
    draft.lines[0].description = "Posted allocation schema";
    draft.lines[0].rate = "1";
    saveInvoice(db, draft);
    issueInvoice(db, draft.id);
    const value = JSON.parse(JSON.stringify(db));
    value.invoices[0].snapshot.allocationVersion = 1;
    value.invoices[0].snapshot.lineAllocations = [
      {
        itemId: draft.lines[0].id,
        tax: "Exclusive",
        subtotal: "100",
        discount: "0",
        net: 100,
        vat: "5",
        grand: "105",
      },
    ];
    expect(() => decodeSavedData(JSON.stringify(value))).toThrow(
      /lineAllocations/,
    );
    value.invoices[0].snapshot.lineAllocations[0].net = "100";
    delete value.invoices[0].snapshot.allocationVersion;
    expect(() => decodeSavedData(JSON.stringify(value))).toThrow(/allocations/);
  });
  it.each([
    "people",
    "clients",
    "projects",
    "phases",
    "assignments",
    "tasks",
    "milestones",
    "updates",
    "snags",
    "documents",
    "handover",
    "activities",
  ])(
    "rejects missing %s before rendering without touching raw storage",
    (key) => {
      const value = ready() as unknown as Record<string, unknown>;
      delete value[key];
      const raw = JSON.stringify(value),
        write = vi.fn();
      vi.stubGlobal("localStorage", { getItem: () => raw, setItem: write });
      expect(() => localRepository.load()).toThrow(/incompatible/);
      expect(write).not.toHaveBeenCalled();
    },
  );
  it.each(["", "null", "{broken", "[]"])(
    "protects malformed JSON %s",
    (raw) => {
      expect(() => decodeSavedData(raw)).toThrow();
    },
  );
  it("rejects invalid records and orphan/cross-project links", () => {
    const db = ready();
    const broken = structuredClone(db);
    broken.tasks[0].dependencies.push("missing-task");
    expect(() => decodeSavedData(JSON.stringify(broken))).toThrow(
      /relationships/,
    );
    broken.tasks[0].dependencies = [];
    broken.tasks[0].phaseId = db.phases.find(
      (p) => p.projectId !== broken.tasks[0].projectId,
    )!.id;
    expect(() => decodeSavedData(JSON.stringify(broken))).toThrow(
      /relationships/,
    );
    const bad = structuredClone(db) as unknown as { documents: unknown[] };
    bad.documents[0] = null;
    expect(() => decodeSavedData(JSON.stringify(bad))).toThrow(/documents/);
  });
  it("rejects missing financial/operations collections in versioned data", () => {
    const db = ready() as unknown as Record<string, unknown>;
    delete db.invoices;
    expect(() => decodeSavedData(JSON.stringify(db))).toThrow(/invoices/);
    const partial = ready();
    partial.operations = { version: 1 } as Database["operations"];
    expect(() => decodeSavedData(JSON.stringify(partial))).toThrow(
      /operations/,
    );
  });
  it("preserves legacy IDs and all commercial records through idempotent reload", () => {
    const db = ready(),
      raw = JSON.stringify(db);
    const loaded = decodeSavedData(raw),
      twice = decodeSavedData(JSON.stringify(loaded));
    expect(twice).toEqual(loaded);
    expect(loaded).toEqual(db);
    const legacy = seed() as unknown as Record<string, unknown>;
    delete legacy.operations;
    delete legacy.commercialVersion;
    for (const k of [
      "invoices",
      "payments",
      "expenses",
      "contracts",
      "commercialNumbering",
    ])
      delete legacy[k];
    const migrated = decodeSavedData(JSON.stringify(legacy));
    expect(migrated.projects.map((p) => p.id)).toEqual(
      (legacy.projects as { id: string }[]).map((p) => p.id),
    );
    expect(migrated.invoices).toEqual([]);
    expect(migrated.operations?.bills).toEqual([]);
  });
  it("retains original legacy document representation and historical approval bytes", () => {
    const db = ready(),
      d = db.documents[0];
    d.status = "Pending";
    d.reviewState = "Revise & Resubmit";
    const original = JSON.stringify(d),
      loaded = decodeSavedData(JSON.stringify(db));
    expect(loaded.documents[0].status).toBe("Rejected");
    expect(loaded.documents[0].legacyWorkflowSnapshot).toBe(original);
    expect(decodeSavedData(JSON.stringify(loaded))).toEqual(loaded);
  });
  it("protects conflicting legacy approval states rather than inventing a decision", () => {
    const db = ready();
    db.documents[0].status = "Approved";
    db.documents[0].reviewState = "Submitted";
    expect(() => decodeSavedData(JSON.stringify(db))).toThrow(/conflict/);
    db.documents[0].workflowVersion = 1;
    expect(() => decodeSavedData(JSON.stringify(db))).toThrow(/conflict/);
  });
});

function draft(db: Database): DocumentRecord {
  return {
    id: "integration-drawing",
    projectId: db.projects[0].id,
    name: "Integrated drawing",
    category: "Design Drawings",
    status: "Draft",
    version: 1,
    uploadedAt: "2026-10-14",
    uploadedBy: "person-3",
    reviewerId: "person-0",
    revisionNote: "Initial coordinated drawing",
  };
}
describe("one document command boundary and atomic approval ledger", () => {
  it("protects unknown legacy workflow states and orphan approval sources", () => {
    const db = ready(),
      d = draft(db);
    saveDocumentDraft(db, d, "person-3");
    const a = submitApproval(
      db,
      "Document",
      d.id,
      "Review",
      "person-3",
      "person-0",
    );
    const raw = structuredClone(db) as unknown as {
      documents: { reviewState?: string }[];
    };
    raw.documents.at(-1)!.reviewState = "Corrupted Legacy State";
    expect(() => decodeSavedData(JSON.stringify(raw))).toThrow(/documents/);
    a.entityId = "missing-document";
    expect(() => decodeSavedData(JSON.stringify(db))).toThrow(/approval/);
  });
  it("prevents the actual requester from self-review even when draft author differs", () => {
    const db = ready(),
      d = draft(db);
    saveDocumentDraft(db, d, "person-3");
    const a = submitApproval(
      db,
      "Document",
      d.id,
      "Review",
      "person-1",
      "person-0",
    );
    expect(() =>
      reassignApproval(
        db,
        a.id,
        "person-1",
        "Attempt requester assignment",
        "person-0",
      ),
    ).toThrow(/independent/);
    expect(() =>
      reviewDocument(db, d.id, "Approved", "person-1", "Attempt self review"),
    ).toThrow(/submitter/);
    expect(a.status).toBe("Pending Approval");
    expect(db.documents.at(-1)?.status).toBe("Pending");
  });
  it("submission in workforce and decision in shared inbox update the same record/history", () => {
    const db = ready(),
      d = draft(db);
    saveDocumentDraft(db, d, "person-3");
    reviewDocument(db, d.id, "Pending", "person-3", "Review requested");
    const a = activeApprovals(db).find((a) => a.entityId === d.id)!;
    decideApproval(db, a.id, true, "Independent approval", "person-0");
    expect(db.documents.at(-1)?.status).toBe("Approved");
    expect(db.operations?.approvals.find((x) => x.id === a.id)?.status).toBe(
      "Approved",
    );
    expect(db.documents.at(-1)?.history?.at(-1)?.actorId).toBe("person-0");
  });
  it("shared submission and workforce review update the same approval without stale pending rows", () => {
    const db = ready(),
      d = draft(db);
    saveDocumentDraft(db, d, "person-3");
    const a = submitApproval(
      db,
      "Document",
      d.id,
      "Drawing review",
      "person-3",
      "person-0",
    );
    reviewDocument(db, d.id, "Rejected", "person-0", "Correct dimensions");
    expect(a.status).toBe("Rejected");
    expect(
      activeApprovals(db).filter(
        (a) => a.entityId === d.id && a.status === "Pending Approval",
      ),
    ).toHaveLength(0);
  });
  it("enforces assigned independent reviewers and retains immutable previous versions", () => {
    const db = ready(),
      d = draft(db);
    saveDocumentDraft(db, d, "person-3");
    submitApproval(db, "Document", d.id, "Review", "person-3", "person-0");
    expect(() =>
      reviewDocument(db, d.id, "Approved", "person-1", "Other actor"),
    ).toThrow(/assigned/);
    expect(() =>
      reassignApproval(
        db,
        db.operations!.approvals.at(-1)!.id,
        "person-3",
        "Self review",
        "person-0",
      ),
    ).toThrow(/independent/);
    reviewDocument(db, d.id, "Approved", "person-0", "Approved");
    const old = JSON.stringify(db.documents.at(-1));
    const next = reviseDocument(db, d.id, "person-3", "Revised layout");
    expect(next.previousRevisionId).toBe(d.id);
    expect(JSON.stringify(db.documents.find((x) => x.id === d.id))).toBe(old);
  });
  it("supersedes an unreviewed revision without inventing a historical rejection", () => {
    const db = ready(),
      d = draft(db);
    saveDocumentDraft(db, d, "person-3");
    const a = submitApproval(
        db,
        "Document",
        d.id,
        "Review",
        "person-3",
        "person-0",
      ),
      snapshot = a.snapshot;
    const next = reviseDocument(db, d.id, "person-3", "Replace before review");
    expect(a.status).toBe("Pending Approval");
    expect(a.supersededBy).toBe(next.id);
    expect(a.snapshot).toBe(snapshot);
    expect(activeApprovals(db).some((x) => x.id === a.id)).toBe(false);
    expect(() =>
      decideApproval(db, a.id, true, "Obsolete", "person-0"),
    ).toThrow();
    expect(() =>
      reviewDocument(db, d.id, "Approved", "person-0", "Obsolete"),
    ).toThrow(/latest/);
  });
  it("reconciles stale legacy approval views without rewriting original ledger history", () => {
    const db = ready(),
      d = draft(db);
    saveDocumentDraft(db, d, "person-3");
    const a = submitApproval(
      db,
      "Document",
      d.id,
      "Review",
      "person-3",
      "person-0",
    );
    db.documents.find((x) => x.id === d.id)!.status = "Approved";
    const original = JSON.stringify(a);
    expect(approvalView(db).find((x) => x.id === a.id)?.status).toBe(
      "Approved",
    );
    expect(JSON.stringify(a)).toBe(original);
    expect(closureSummary(db, d.projectId).pendingApprovals).toBe(0);
  });
  it("keeps operational supervision mandatory regardless of financial policy", () => {
    const db = ready(),
      id = db.projects[0].id;
    db.tasks
      .filter((t) => t.projectId === id)
      .forEach((t) => {
        t.progress = 100;
        t.status = "Completed";
      });
    db.snags
      .filter((s) => s.projectId === id)
      .forEach((s) => {
        s.status = "Closed";
      });
    db.documents
      .filter((d) => d.projectId === id)
      .forEach((d) => {
        d.status = "Approved";
      });
    db.handover
      .filter((h) => h.projectId === id)
      .forEach((h) => {
        h.complete = true;
      });
    expect(handoverState(db, id).ready).toBe(false);
    expect(() =>
      completeProject(db, id, "person-0", "Attempted bypass"),
    ).toThrow(/criteria/);
    db.updates
      .filter((u) => u.projectId === id)
      .forEach((u) => {
        u.reviewStatus = "Approved";
      });
    expect(handoverState(db, id).ready).toBe(true);
    completeProject(db, id, "person-0", "All operational checks completed");
    expect(db.projects[0].status).toBe("Completed");
  });
});
