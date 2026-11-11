import { describe, expect, it } from "vitest";
import type { Database } from "../domain/model";
import { projectManagerDefault } from "./project-manager-default";

const people = [
  { id: "engineer", status: "Active" },
  { id: "manager", status: "Active" },
  { id: "inactive", status: "Inactive" },
] as Database["people"];
const actor = {
  userId: "manager",
  personId: "manager",
  email: "manager@staging.azzora.test",
  role: "project_manager",
};

describe("new project manager selection", () => {
  it("selects the signed-in Project Manager despite a different first person", () => {
    expect(projectManagerDefault(people, "staging", actor)).toBe("manager");
  });
  it("does not silently assign another person when the actor is unavailable", () => {
    expect(projectManagerDefault(people, "staging", { ...actor, personId: "missing" })).toBe("");
    expect(projectManagerDefault(people, "staging", { ...actor, personId: "inactive" })).toBe("");
  });
  it("preserves existing selection behavior for owner and local demos", () => {
    expect(projectManagerDefault(people, "staging", { ...actor, role: "owner_admin" })).toBe("engineer");
    expect(projectManagerDefault(people, "local", actor)).toBe("engineer");
  });
});
