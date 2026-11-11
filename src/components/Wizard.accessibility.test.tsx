import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { seed } from "../domain/seed";
import { StoreContext, type Store } from "../store";
import { Wizard } from "./Wizard";

it("keeps the self-assigned project manager control accessible by its label", () => {
  const db = seed();
  const manager = db.people.find((person) => person.status !== "Inactive")!;
  const store: Store = {
    db,
    mode: "staging",
    actor: { userId: manager.id, personId: manager.id, role: "project_manager", email: "manager@staging.azzora.test" },
    mutate: () => true,
    toast: "",
    error: "",
    clear: () => {},
    reset: () => {},
    exportOriginal: () => {},
  };
  const html = renderToStaticMarkup(
    <StoreContext.Provider value={store}>
      <Wizard onClose={() => {}} onCreated={() => {}} />
    </StoreContext.Provider>,
  );
  const label = html.match(/<label for="([^"]+)">Project manager<\/label>/);
  expect(label).not.toBeNull();
  const select = html.match(new RegExp(`<select(?=[^>]*id="${label![1]}")[^>]*>`));
  expect(select).not.toBeNull();
  expect(select![0]).toContain("disabled");
  expect(select![0]).toContain('aria-describedby="project-manager-help"');
  expect(html).toContain('id="project-manager-help"');
});
