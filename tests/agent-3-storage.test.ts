import { afterEach, expect, it, vi } from "vitest";
import { seed } from "../src/domain/seed";
import { localRepository } from "../src/domain/repository";
import { initializeCommercial } from "../src/commercial/migration";
import type { Database } from "../src/domain/model";

afterEach(() => vi.unstubAllGlobals());
function ready(): Database & Record<string, unknown> {
  const db = seed();
  initializeCommercial(db);
  return db as Database & Record<string, unknown>;
}
function expectRejected(db: Record<string, unknown>) {
  const raw = JSON.stringify(db);
  const write = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => raw, setItem: write });
  expect(() => localRepository.load()).toThrow();
  expect(write).not.toHaveBeenCalled();
}
it.each([
  "people",
  "phases",
  "assignments",
  "milestones",
  "updates",
  "snags",
  "documents",
  "handover",
  "activities",
])("A3-006 rejects missing required %s without saving a fallback", (key) => {
  const db = ready();
  delete db[key];
  expectRejected(db);
});
it.each([
  "people",
  "phases",
  "assignments",
  "milestones",
  "updates",
  "snags",
  "documents",
  "handover",
  "activities",
])("A3-006 rejects wrong-type required %s without saving a fallback", (key) => {
  const db = ready();
  db[key] = {};
  expectRejected(db);
});
it.each(["invoices", "payments", "expenses", "contracts"])(
  "rejects malformed existing financial %s while retaining raw storage",
  (key) => {
    const db = ready();
    db[key] = {};
    expectRejected(db);
  },
);
it("rejects an orphan project customer", () => {
  const db = ready();
  db.projects[0].clientId = "qa-missing-customer";
  expectRejected(db);
});
it("rejects a task phase from another project", () => {
  const db = ready();
  const task = db.tasks[0];
  task.phaseId = db.phases.find((p) => p.projectId !== task.projectId)!.id;
  expectRejected(db);
});
it("rejects duplicate project IDs instead of silently joining records", () => {
  const db = ready();
  db.projects[1].id = db.projects[0].id;
  expectRejected(db);
});
it("accepts an unchanged fictional persisted fixture idempotently without writes", () => {
  const raw = JSON.stringify(ready()),
    write = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => raw, setItem: write });
  expect(localRepository.load()).toEqual(localRepository.load());
  expect(write).not.toHaveBeenCalled();
});
