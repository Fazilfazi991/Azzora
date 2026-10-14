import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions } from "./browser-runtime.mjs";
const base = process.env.AZZORA_TEST_URL || "http://127.0.0.1:5176";
const dir = "docs/workforce-evidence";
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const route = async (path) => {
  await page.goto(`${base}/#/${path}`);
  await page.locator("main h1").first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
};
const dialog = () => page.getByRole("dialog").last();
const db = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1")));
const hidden = () => page.getByRole("dialog").waitFor({ state: "hidden" });
const pass = (name) => {
  checks.push({ name, passed: true });
  console.log("PASS " + name);
};
try {
  await route("team");
  await page
    .getByRole("button", { name: "+ Add Employee", exact: true })
    .click();
  await expect(dialog()).toHaveAccessibleName("Add Employee");
  // Native dialog keyboard containment and Escape handling.
  for (let i = 0; i < 17; i++) {
    await page.keyboard.press("Tab");
    if (
      !(await page.evaluate(() => !!document.activeElement?.closest("dialog")))
    )
      throw Error("Focus escaped employee dialog");
  }
  await page.keyboard.press("Escape");
  await hidden();
  await page
    .getByRole("button", { name: "+ Add Employee", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await dialog()
    .getByLabel("Employee name", { exact: true })
    .fill("QA Workforce Employee");
  await dialog().getByLabel("Employee code", { exact: true }).fill("EMP-WF-QA");
  await dialog()
    .getByLabel("Email", { exact: true })
    .fill("workforce@example.test");
  await dialog().getByLabel("Phone", { exact: true }).fill("+971501234567");
  await dialog()
    .getByLabel("Demo actor", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByRole("button", { name: "Save Employee", exact: true })
    .click();
  await hidden();
  let state = await db();
  const person = state.people.find((p) => p.email === "workforce@example.test");
  if (!person || person.history.length !== 1)
    throw Error("Employee creation failed");
  const legacyIds = state.people
    .filter((p) => p.id !== person.id)
    .map((p) => p.id);
  pass("Add employee and keyboard dialog containment/activation/Escape");
  await page
    .locator(".team-card")
    .filter({ hasText: "QA Workforce Employee" })
    .click();
  await dialog()
    .getByRole("button", { name: "Edit Employee", exact: true })
    .click();
  await dialog().getByLabel("Department", { exact: true }).fill("Supervision");
  await dialog().getByLabel("Role", { exact: true }).fill("Site Supervisor");
  await dialog().getByLabel("Capacity %", { exact: true }).fill("80");
  await dialog()
    .getByLabel("Demo actor", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByRole("button", { name: "Save Employee", exact: true })
    .click();
  await hidden();
  state = await db();
  if (state.people.find((p) => p.id === person.id).department !== "Supervision")
    throw Error("Employee edit failed");
  pass("Edit employee department, role and capacity with stable ID");
  // Isolated operational fixture: one project/task/checklist; no financial records or user browser data.
  await page.evaluate(
    ({ personId }) => {
      const state = JSON.parse(localStorage.getItem("azzora-demo-v1"));
      const original = state.projects[0];
      state.projects.push({
        ...original,
        id: "wf-project",
        code: "WF-QA",
        name: "QA Workforce Approval Fit-Out",
        managerId: "person-0",
        status: "Active",
        start: "2026-10-14",
        due: "2026-11-14",
      });
      const phase = state.phases.find((p) => p.projectId === original.id);
      state.phases.push({
        ...phase,
        id: "wf-phase",
        projectId: "wf-project",
        weight: 100,
      });
      const task = state.tasks.find((t) => t.projectId === original.id);
      state.tasks.push({
        ...task,
        id: "wf-task",
        phaseId: "wf-phase",
        projectId: "wf-project",
        parentId: undefined,
        name: "QA Site Verification",
        status: "Not Started",
        progress: 0,
        start: "2026-10-14",
        due: "2026-11-14",
        assigneeId: "person-0",
        dependencies: [],
        comments: [],
        attachments: [],
      });
      state.handover
        .filter((h) => h.projectId === original.id)
        .forEach((h, i) =>
          state.handover.push({
            ...h,
            id: "wf-handover-" + i,
            projectId: "wf-project",
            complete: false,
          }),
        );
      localStorage.setItem("azzora-demo-v1", JSON.stringify(state));
    },
    { personId: person.id },
  );
  await page.reload();
  await route("projects/wf-project/team");
  await page
    .getByRole("button", { name: "+ Assign Person", exact: true })
    .click();
  await dialog().getByLabel("Person", { exact: true }).selectOption(person.id);
  await dialog()
    .getByLabel("Project role", { exact: true })
    .selectOption("Site Supervisor");
  await dialog()
    .getByLabel("Demo actor", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByRole("button", { name: "Save Assignment", exact: true })
    .click();
  await hidden();
  state = await db();
  if (
    !state.assignments.some(
      (a) => a.projectId === "wf-project" && a.personId === person.id,
    )
  )
    throw Error("Assignment missing");
  pass("Assign employee to project");
  await route("projects/wf-project/tasks");
  await page
    .locator(".task-row")
    .filter({ hasText: "QA Site Verification" })
    .click();
  await dialog()
    .getByLabel("Assigned to", { exact: true })
    .selectOption(person.id);
  await dialog().getByLabel("Allocation %", { exact: true }).fill("60");
  await dialog()
    .getByRole("button", { name: "Save Changes", exact: true })
    .click();
  await hidden();
  state = await db();
  if (state.tasks.find((t) => t.id === "wf-task").assigneeId !== person.id)
    throw Error("Task allocation missing");
  await route("projects/wf-project/team");
  await expect(
    page.getByText("60% allocated / 80% capacity", { exact: false }).first(),
  ).toBeVisible();
  pass("Task assignment shares project relationships and employee workload");
  await route("projects/wf-project/documents");
  await page
    .getByRole("button", { name: "+ Add Document", exact: true })
    .click();
  await dialog()
    .getByLabel("Document name", { exact: true })
    .fill("QA Ceiling Drawing");
  await dialog()
    .getByLabel("Revision description", { exact: true })
    .fill("Initial ceiling coordination");
  await dialog()
    .getByLabel("Attach files")
    .setInputFiles({
      name: "ceiling-v1.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Revision 1: initial dimensions"),
    });
  await dialog()
    .getByLabel("Demo submitter", { exact: true })
    .selectOption(person.id);
  await dialog()
    .getByLabel("Review note / reason", { exact: true })
    .fill("Submitted for review");
  await dialog()
    .getByRole("button", { name: "Submit Revision", exact: true })
    .click();
  await hidden();
  state = await db();
  let drawing = state.documents.find((d) => d.projectId === "wf-project");
  if (drawing.status !== "Pending") throw Error("Submission failed");
  pass("Submit drawing with browser-local attachment");
  await page
    .getByRole("button", { name: "Review QA Ceiling Drawing v1", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo reviewer", { exact: true })
    .selectOption(person.id);
  await dialog()
    .getByLabel("Review note / reason", { exact: true })
    .fill("Self review should fail");
  await dialog()
    .getByRole("button", { name: "Approve Revision", exact: true })
    .click();
  await expect(dialog()).toBeVisible();
  await expect(dialog().getByRole("alert")).toContainText("different");
  state = await db();
  if (state.documents.find((d) => d.id === drawing.id).status !== "Pending")
    throw Error("Self review allowed");
  await dialog()
    .getByLabel("Demo reviewer", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByLabel("Review note / reason", { exact: true })
    .fill("Correct ceiling dimensions");
  await dialog()
    .getByRole("button", { name: "Reject Revision", exact: true })
    .click();
  await hidden();
  state = await db();
  const rejectedSnapshot = JSON.stringify(
    state.documents.find((d) => d.id === drawing.id),
  );
  pass("Reject drawing with explicit reviewer/reason; prevent self approval");
  await page
    .getByRole("button", { name: "Review QA Ceiling Drawing v1", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo reviewer", { exact: true })
    .selectOption(person.id);
  await dialog()
    .getByLabel("Review note / reason", { exact: true })
    .fill("Corrected ceiling dimensions");
  await dialog()
    .getByRole("button", { name: "Create Revision", exact: true })
    .click();
  await dialog()
    .getByLabel("Attach files")
    .setInputFiles({
      name: "ceiling-v2.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Revision 2: corrected dimensions"),
    });
  await dialog()
    .getByLabel("Demo submitter", { exact: true })
    .selectOption(person.id);
  await dialog()
    .getByLabel("Review note / reason", { exact: true })
    .fill("Corrected drawing resubmitted");
  await dialog()
    .getByRole("button", { name: "Submit Revision", exact: true })
    .click();
  await hidden();
  await page
    .getByRole("button", { name: "Review QA Ceiling Drawing v2", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo reviewer", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByLabel("Review note / reason", { exact: true })
    .fill("Corrected dimensions verified");
  await dialog()
    .getByRole("button", { name: "Approve Revision", exact: true })
    .click();
  await hidden();
  state = await db();
  if (
    JSON.stringify(state.documents.find((d) => d.id === drawing.id)) !==
      rejectedSnapshot ||
    state.documents.find((d) => d.previousRevisionId === drawing.id).status !==
      "Approved"
  )
    throw Error("Revision history corrupted");
  pass("Resubmit corrected drawing and approve v2 without overwriting v1");
  await page
    .getByRole("button", { name: "Review QA Ceiling Drawing v2", exact: true })
    .click();
  await dialog().getByRole("button", { name: "View v1", exact: true }).click();
  await expect(
    dialog().getByRole("link", { name: "Download v1", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await hidden();
  pass("Historical revision file and review history remain accessible");
  await route("projects/wf-project/site-updates");
  await page
    .getByRole("button", { name: "+ Post Site Update", exact: true })
    .click();
  await dialog()
    .getByLabel("Work completed", { exact: true })
    .fill("QA ceiling installation");
  await dialog().getByLabel("Manpower count", { exact: true }).fill("4");
  await dialog()
    .getByLabel("Demo site author", { exact: true })
    .selectOption("person-3");
  await dialog()
    .getByRole("button", { name: "Post Update", exact: true })
    .click();
  await hidden();
  await page
    .getByRole("button", { name: "Supervisory review / history", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo supervisor", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByLabel("Supervision note / reason", { exact: true })
    .fill("Include alignment inspection");
  await dialog()
    .getByRole("button", { name: "Request Site Corrections", exact: true })
    .click();
  await hidden();
  await page
    .getByRole("button", { name: "Correct & resubmit", exact: true })
    .click();
  await dialog()
    .getByLabel("Work completed", { exact: true })
    .fill("QA ceiling installation and alignment inspected");
  await dialog()
    .getByLabel("Demo site author", { exact: true })
    .selectOption("person-3");
  await dialog()
    .getByRole("button", { name: "Resubmit Update", exact: true })
    .click();
  await hidden();
  await page
    .getByRole("button", { name: "Supervisory review / history", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo supervisor", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByLabel("Supervision note / reason", { exact: true })
    .fill("Site works verified against approved drawing");
  await dialog()
    .getByRole("button", { name: "Approve Site Record", exact: true })
    .click();
  await hidden();
  pass("Post, return, correct, resubmit and supervise site record");
  await route("projects/wf-project/snags-qa");
  await page
    .getByRole("button", { name: "+ Create Snag", exact: true })
    .click();
  await dialog()
    .getByLabel("Area / Room", { exact: true })
    .fill("Reception ceiling");
  await dialog()
    .getByLabel("Description", { exact: true })
    .fill("QA joint alignment defect");
  await dialog()
    .getByLabel("Responsible person", { exact: true })
    .selectOption("person-3");
  await dialog()
    .getByLabel("Demo QA actor", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByLabel("Action reason", { exact: true })
    .fill("Raised during site inspection");
  await dialog()
    .getByRole("button", { name: "Save Snag", exact: true })
    .click();
  await hidden();
  for (const status of [
    "Assigned",
    "Rectification",
    "Ready for Inspection",
    "Closed",
  ]) {
    await page
      .locator(".snag-card")
      .filter({ hasText: "QA joint alignment defect" })
      .click();
    await dialog().getByLabel("Status", { exact: true }).selectOption(status);
    await dialog()
      .getByLabel("Demo QA actor", { exact: true })
      .selectOption("person-0");
    await dialog()
      .getByLabel("Action reason", { exact: true })
      .fill("QA verification: " + status);
    if (status === "Closed")
      await dialog()
        .getByLabel("Inspection notes", { exact: true })
        .fill("Alignment verified against approved drawing");
    await dialog()
      .getByRole("button", { name: "Save Snag", exact: true })
      .click();
    await hidden();
  }
  state = await db();
  if (
    state.snags.find((s) => s.projectId === "wf-project").history.length !== 5
  )
    throw Error("QA history missing");
  pass(
    "Create, assign, rectify, inspect and close QA snag with resolution history",
  );
  await route("team");
  await page
    .getByLabel("Search employees", { exact: true })
    .fill("QA Workforce Employee");
  await page.locator(".team-card").click();
  await dialog()
    .getByRole("button", { name: "Deactivate Employee", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo actor", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByLabel("Reason", { exact: true })
    .fill("QA employee contract ended");
  await dialog()
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await hidden();
  state = await db();
  if (
    state.people.find((p) => p.id === person.id).status !== "Inactive" ||
    state.tasks.find((t) => t.id === "wf-task").assigneeId !== person.id ||
    !state.assignments.some(
      (a) => a.projectId === "wf-project" && a.personId === person.id,
    )
  )
    throw Error("Deactivation erased references");
  pass("Deactivate employee while retaining project and task assignments");
  await route("projects/wf-project/handover");
  await expect(
    page.getByRole("button", { name: "Complete Project", exact: true }),
  ).toBeDisabled();
  await route("projects/wf-project/tasks");
  await page.locator(".task-row").click();
  await expect(dialog().getByLabel("Assigned to", { exact: true })).toHaveValue(
    person.id,
  );
  await dialog().getByLabel("Progress report note").fill("Completed for workforce handover check");
  await dialog()
    .getByRole("button", { name: "Mark Complete", exact: true })
    .click();
  await hidden();
  await route("projects/wf-project/handover");
  for (const checkbox of await page
    .locator("main input[type=checkbox]:not([disabled])")
    .all())
    await checkbox.check();
  await expect(
    page.getByRole("button", { name: "Complete Project", exact: true }),
  ).toBeEnabled();
  pass(
    "Operational handover derives site/QA/document readiness and preserves existing checklist",
  );
  // Screens and dialogs at all requested widths, including keyboard and reduced motion.
  const paths = {
    team: "team",
    documents: "documents",
    site: "site-updates",
    qa: "snags-qa",
    handover: "handover",
  };
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [screen, path] of Object.entries(paths)) {
      await route(`projects/wf-project/${path}`);
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw Error(`Page overflow ${screen} ${width}`);
      if (await page.locator(".toast button").count())
        await page.locator(".toast button").click();
      await page.screenshot({
        path: `${dir}/${screen}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      checks.push({ name: "Responsive screen", screen, width, passed: true });
    }
    await route("projects/wf-project/documents");
    await page
      .getByRole("button", {
        name: "Review QA Ceiling Drawing v2",
        exact: true,
      })
      .click();
    if (
      await dialog().evaluate(
        (d) =>
          d.getBoundingClientRect().right > innerWidth ||
          d.scrollWidth > d.clientWidth + 1,
      )
    )
      throw Error(`Dialog overflow ${width}`);
    await page.screenshot({
      path: `${dir}/review-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await hidden();
    checks.push({ name: "Responsive revision drawer", width, passed: true });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await route("projects/wf-project/team");
  await page
    .getByRole("button", { name: "+ Add Employee", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(dialog()).toBeVisible();
  await page.keyboard.press("Escape");
  await hidden();
  pass("Keyboard access with reduced motion at mobile width");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await route("projects/wf-project/handover");
  await page
    .getByRole("button", { name: "Complete Project", exact: true })
    .click();
  await dialog()
    .getByLabel("Demo handover reviewer", { exact: true })
    .selectOption("person-0");
  await dialog()
    .getByLabel("Handover confirmation note", { exact: true })
    .fill("QA operational handover verified");
  await dialog().getByRole("button", { name: "Confirm", exact: true }).click();
  await hidden();
  await page.reload();
  state = await db();
  if (
    state.projects.find((p) => p.id === "wf-project").status !== "Completed" ||
    state.people.find((p) => p.id === person.id).status !== "Inactive" ||
    state.documents.find((d) => d.previousRevisionId === drawing.id).status !==
      "Approved" ||
    legacyIds.some((id) => !state.people.some((p) => p.id === id))
  )
    throw Error("Reload lost operational state");
  pass(
    "Complete handover with reviewer and note; reload all workflows and legacy employee IDs",
  );
  await route("team");
  await page
    .getByRole("button", { name: "+ Add Employee", exact: true })
    .click();
  await dialog()
    .getByLabel("Employee name", { exact: true })
    .fill("QA Duplicate Employee");
  await dialog()
    .getByLabel("Email", { exact: true })
    .fill("workforce@example.test");
  await dialog()
    .getByLabel("Demo actor", { exact: true })
    .selectOption("person-0");
  const peopleCount = (await db()).people.length;
  await dialog()
    .getByRole("button", { name: "Save Employee", exact: true })
    .click();
  await expect(dialog().getByRole("alert")).toContainText("unique");
  if ((await db()).people.length !== peopleCount)
    throw Error("Duplicate added");
  pass("Duplicate employee validation is visible inside the dialog");
  await dialog()
    .getByLabel("Email", { exact: true })
    .fill("quota-test@example.test");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("QA storage quota reached", "QuotaExceededError");
    };
  });
  await dialog()
    .getByRole("button", { name: "Save Employee", exact: true })
    .click();
  await expect(dialog().getByRole("alert")).toContainText("quota");
  if ((await db()).people.length !== peopleCount)
    throw Error("Storage failure overwrote saved employee data");
  await page.reload();
  if ((await db()).people.some((p) => p.email === "quota-test@example.test"))
    throw Error("Unsaved employee survived reload");
  pass(
    "Failed storage writes preserve saved employees and show an inline error",
  );
  if (errors.length) throw Error("Browser errors: " + errors.join("; "));
  fs.writeFileSync(
    `${dir}/browser-results.json`,
    JSON.stringify(
      { checks, errors, date: new Date().toISOString(), base },
      null,
      2,
    ),
  );
  console.log(`${checks.length} checks passed; zero browser errors`);
} catch (error) {
  await page.screenshot({ path: `${dir}/failure.png`, fullPage: true });
  fs.writeFileSync(
    `${dir}/browser-failure.json`,
    JSON.stringify({ checks, errors, error: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
