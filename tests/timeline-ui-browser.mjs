import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";

const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(auditUrl + "/#/planning");
await page.getByRole("heading", { name: "Planning & Timeline" }).waitFor();
await page.evaluate(async () => {
  const { seed, blankTask } = await import("/src/domain/seed.ts");
  const { initializeCommercial } = await import("/src/commercial/migration.ts");
  const db = seed();
  initializeCommercial(db);
  const original = db.projects[0];
  const project = { ...original, id: "timeline-ui-fixture", code: "AZ-QA", name: "Synthetic planning project", start: "2026-10-14", due: "2026-11-30" };
  const empty = { ...project, id: "timeline-template-fixture", code: "AZ-QT", name: "Empty template project" };
  db.projects.unshift(empty);
  db.projects.unshift(project);
  db.phases.push({ id: "timeline-ui-phase", projectId: project.id, name: "Fit-out", weight: 1, order: 0 });
  const a = { ...blankTask(project.id, "timeline-ui-phase", project.managerId), id: "timeline-ui-a", name: "Fit-out mock-up", start: "2026-10-15", due: "2026-10-16" };
  const b = { ...blankTask(project.id, "timeline-ui-phase", project.managerId), id: "timeline-ui-b", name: "Client inspection", start: "2026-10-19", due: "2026-10-20", dependencies: [a.id] };
  db.tasks.push(a, b);
  db.milestones.push({ id: "timeline-ui-milestone", projectId: project.id, name: "Client sign-off", due: "2026-10-22", taskId: "" });
  localStorage.setItem("azzora-demo-v1", JSON.stringify(db));
});
await page.reload();
await page.getByRole("heading", { name: "Planning & Timeline" }).waitFor();
assert.equal(await page.locator(".gantt-task").count(), 2);
let saved;
await page.getByRole("button", { name: /Client sign-off/ }).first().click();
let milestoneDialog = page.getByRole("dialog");
assert.match(await milestoneDialog.innerText(), /Condition state: Pending/);
await milestoneDialog.getByLabel("Project Manager confirmation reason").fill("Signed off after client visit");
await milestoneDialog.getByRole("button", { name: "Confirm manual milestone condition" }).click();
saved = JSON.parse(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")));
assert.ok(saved.planning.find((row) => row.projectId === "timeline-ui-fixture").milestonePlanning.find((row) => row.milestoneId === "timeline-ui-milestone").completedAt);
await page.getByLabel("Reason for proposal or baseline capture").fill("Approved synthetic programme");
await page.getByRole("button", { name: "Capture baseline", exact: true }).click();
await page.getByText("Not captured", { exact: true }).waitFor({ state: "detached" });
await page.getByRole("button", { name: /Open task Fit-out mock-up/ }).click();
let drawer = page.getByRole("dialog");
await drawer.getByLabel("Due", { exact: true }).fill("2026-10-19");
await drawer.getByLabel("Schedule proposal reason").fill("Site access delay");
await drawer.getByRole("button", { name: "Save Changes" }).click();
assert.equal(await drawer.count(), 0);
const review = page.locator(".planning-proposal");
await review.waitFor();
assert.match(await review.innerText(), /Fit-out mock-up/);
assert.match(await review.innerText(), /Client inspection/);
saved = JSON.parse(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")));
assert.equal(saved.tasks.find((task) => task.id === "timeline-ui-a").due, "2026-10-16", "draft must not change approved task");
await review.getByRole("button", { name: "Submit for PM review" }).click();
await review.getByRole("button", { name: "Approve proposal" }).click();
saved = JSON.parse(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")));
assert.equal(saved.tasks.find((task) => task.id === "timeline-ui-a").due, "2026-10-19");
assert.equal(saved.tasks.find((task) => task.id === "timeline-ui-b").start, "2026-10-20");
assert.equal(saved.planning.find((row) => row.projectId === "timeline-ui-fixture").baselineHistory.at(-1).nodes.find((row) => row.node.id === "timeline-ui-a").finish, "2026-10-16");
await page.reload();
await page.getByRole("heading", { name: "Planning & Timeline" }).waitFor();
for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [390, 600]]) {
  await page.setViewportSize({ width, height });
  if (width === 390) {
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    assert.equal(await page.locator(".gantt-date-head").isVisible(), true, "mobile chart must be reachable");
  }
  const geometry = await page.locator(".gantt").evaluate((element) => ({
    scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  assert.equal(geometry.horizontalOverflow, false, `page overflow at ${width}`);
  assert.ok(geometry.scrollWidth > geometry.clientWidth, `date rail must scroll at ${width}`);
  console.log(`${width}x${height}: aligned chart reachable, no page overflow`);
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByLabel("Planning project").selectOption("timeline-template-fixture");
await page.getByRole("button", { name: "Fit-out template" }).click();
const preview = page.getByLabel("Editable fit-out template preview");
assert.equal(await preview.locator(".planning-template-phase").count(), 12);
await preview.locator(".planning-template-phase").first().getByRole("button", { name: "+ Add activity" }).click();
await preview.locator(".planning-template-phase").first().getByRole("button", { name: "Remove New activity" }).click();
await preview.getByRole("button", { name: "Confirm template for this empty project" }).click();
saved = JSON.parse(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")));
assert.equal(saved.phases.filter((item) => item.projectId === "timeline-template-fixture").length, 12);
assert.ok(saved.tasks.filter((item) => item.projectId === "timeline-template-fixture").length > 12);
assert.deepEqual(errors, []);
console.log("proposal approval, immutable baseline, template instantiation and five responsive views passed");
await browser.close();
