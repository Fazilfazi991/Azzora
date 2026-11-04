import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { seed, blankTask } from "../domain/seed";
import { activateProjectPlanning } from "../planning/compatibility";
import { sourceFingerprint } from "../planning/engine";
import {
  approveScheduleProposal,
  draftTaskCreation,
  submitScheduleProposal,
} from "../planning/commands";
import type { Database } from "../domain/model";

let sql: PGlite;
beforeAll(async () => {
  sql = new PGlite();
  // Start WASM/PostgreSQL in setup rather than charging cold initialization to
  // the first 5-second behavior assertion when the full suite runs in parallel.
  await sql.waitReady;
}, 30_000);
afterAll(async () => {
  await sql.close();
});
async function jsonb(db: Database) {
  return (
    await sql.query<{ value: Database }>("select $1::jsonb value", [
      JSON.stringify(db),
    ])
  ).rows[0].value;
}
function fixture() {
  const db = seed(),
    project = db.projects[0],
    phase = db.phases.find((value) => value.projectId === project.id)!;
  project.managerId = "person-0";
  const task = {
    ...blankTask(project.id, phase.id, ""),
    id: "fictional-jsonb-task",
    name: "Fictional JSONB task",
    start: "2026-11-04",
    due: "2026-11-05",
    assigneeId: "",
    dependencies: [],
  };
  return { db, project, task };
}
describe("schedule fingerprints across real PostgreSQL JSONB persistence", () => {
  it("keeps the same semantic fingerprint after database object-key reordering", async () => {
    const { db, project } = fixture();
    activateProjectPlanning(db, project.id);
    const before = sourceFingerprint(db, project.id),
      restored = await jsonb(db);
    expect(Object.keys(restored.planning![0].calendar)).not.toEqual(
      Object.keys(db.planning![0].calendar),
    );
    expect(sourceFingerprint(restored, project.id)).toBe(before);
  });
  it("submits and approves a new-task proposal after actual JSONB roundtrip", async () => {
    const { db, project, task } = fixture(),
      proposal = draftTaskCreation(
        db,
        task,
        "Fictional persisted task review",
        "person-0",
      );
    const restored = await jsonb(db);
    submitScheduleProposal(restored, proposal.id, "person-0");
    const submitted = await jsonb(restored);
    approveScheduleProposal(submitted, proposal.id, "person-0");
    expect(
      submitted.tasks.filter((value) => value.id === task.id),
    ).toHaveLength(1);
    expect(
      submitted.planning!.find((value) => value.projectId === project.id)!
        .proposals[0].status,
    ).toBe("Approved");
    expect(
      submitted.planning!.find((value) => value.projectId === project.id)!
        .baselineHistory,
    ).toEqual([]);
  });
  it("requires explicit recalculation of legacy fingerprints while retaining their original history", async () => {
    const { db, project, task } = fixture(),
      old = draftTaskCreation(db, task, "Fictional old proposal", "person-0");
    old.sourceFingerprint = "legacy-order-dependent-hash";
    const restored = await jsonb(db),
      before = structuredClone(
        restored.planning!.find((value) => value.projectId === project.id)!
          .proposals[0],
      );
    expect(() => submitScheduleProposal(restored, old.id, "person-0")).toThrow(
      /stale; recalculate/,
    );
    expect(
      restored.planning!.find((value) => value.projectId === project.id)!
        .proposals[0],
    ).toEqual(before);
    const next = draftTaskCreation(
      restored,
      task,
      "Explicitly recalculated by fictional PM",
      "person-0",
    );
    submitScheduleProposal(restored, next.id, "person-0");
    approveScheduleProposal(restored, next.id, "person-0");
    const historical = restored
      .planning!.find((value) => value.projectId === project.id)!
      .proposals.find((value) => value.id === old.id)!;
    expect(historical.sourceFingerprint).toBe(before.sourceFingerprint);
    expect(historical.history.slice(0, before.history.length)).toEqual(
      before.history,
    );
    expect(historical.revisedByProposalId).toBe(next.id);
  });
});
