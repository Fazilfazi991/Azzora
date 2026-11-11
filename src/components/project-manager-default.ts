import type { Database } from "../domain/model";
import type { Store } from "../store";

/** Match the server's self-assignment rule for staging Project Managers. */
export function projectManagerDefault(
  people: Database["people"],
  mode: Store["mode"],
  actor: Store["actor"],
): string {
  const active = people.filter((person) => person.status !== "Inactive");
  if (mode === "staging" && actor?.role === "project_manager") {
    const actorPersonId = actor.personId || actor.userId;
    return active.find((person) => person.id === actorPersonId)?.id || "";
  }
  return active[0]?.id || "";
}
