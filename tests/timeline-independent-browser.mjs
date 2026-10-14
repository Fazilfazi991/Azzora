import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { auditUrl, browserOptions } from "./browser-runtime.mjs";

const browser = await chromium.launch(browserOptions);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(auditUrl + "/#/planning");
  await page.getByRole("heading", { name: "Planning & Timeline" }).waitFor();

  // Save the first isolated browser seed through an ordinary PM action. No user profile or data is reused.
  await page.getByLabel("Reason for proposal or baseline capture").fill("Independent QA fixture preparation");
  await page.getByRole("button", { name: "Capture baseline", exact: true }).click();
  await page.waitForFunction(() => !!localStorage.getItem("azzora-demo-v1"));
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("azzora-demo-v1"));
    const sourceProject = db.projects[0];
    const sourceTask = db.tasks[0];
    const projectId = "timeline-independent-browser-project";
    const phaseId = "timeline-independent-browser-phase";
    db.projects.unshift({ ...sourceProject, id: projectId, code: "AZ-QAI",
      name: "Independent schedule rollback fixture", start: "2026-11-02", due: "2026-11-30" });
    db.phases.push({ id: phaseId, projectId, name: "Independent phase", weight: 1, order: 0 });
    const base = { ...sourceTask, projectId, phaseId, parentId: undefined,
      assigneeId: "", progress: 0, status: "Not Started", completedAt: undefined,
      attachments: [], comments: [], allocation: 10 };
    db.tasks.push(
      { ...base, id: "timeline-independent-a", name: "Independent upstream",
        start: "2026-11-02", due: "2026-11-03", dependencies: [] },
      { ...base, id: "timeline-independent-b", name: "Independent downstream",
        start: "2026-11-04", due: "2026-11-05", dependencies: ["timeline-independent-a"] },
    );
    localStorage.setItem("azzora-demo-v1", JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole("heading", { name: "Planning & Timeline" }).waitFor();
  await page.getByLabel("Planning project").selectOption("timeline-independent-browser-project");
  await page.getByLabel("Reason for proposal or baseline capture").fill("Original approved synthetic plan");
  await page.getByRole("button", { name: "Capture baseline", exact: true }).click();
  await page.getByRole("button", { name: /Open task Independent upstream/ }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Due", { exact: true }).fill("2026-11-04");
  await drawer.getByLabel("Schedule proposal reason").fill("Independent downstream delay");
  await drawer.getByRole("button", { name: "Save Changes" }).click();
  const review = page.locator(".planning-proposal");
  await review.waitFor();
  assert.match(await review.innerText(), /Independent downstream/);
  await review.getByRole("button", { name: "Submit for PM review" }).click();
  const rawBeforeApproval = await page.evaluate(() => localStorage.getItem("azzora-demo-v1"));
  const before = JSON.parse(rawBeforeApproval);
  assert.equal(before.tasks.find((row) => row.id === "timeline-independent-a").due, "2026-11-03");
  assert.equal(before.tasks.find((row) => row.id === "timeline-independent-b").start, "2026-11-04");

  await page.evaluate(() => {
    window.__originalTimelineSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException("Independent QA simulated full browser storage", "QuotaExceededError");
    };
  });
  await review.getByRole("button", { name: "Approve proposal" }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")), rawBeforeApproval,
    "failed storage write must preserve exact saved bytes");
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalTimelineSetItem; });
  await page.reload();
  await page.getByRole("heading", { name: "Planning & Timeline" }).waitFor();
  const recoveryAfterQuota = page.getByRole("region", { name: "Saved data recovery" });
  if (await recoveryAfterQuota.isVisible())
    throw Error(`Saved submitted proposal could not reload: ${await recoveryAfterQuota.innerText()}`);
  await page.getByLabel("Planning project").selectOption("timeline-independent-browser-project");
  const afterReload = JSON.parse(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")));
  assert.equal(afterReload.tasks.find((row) => row.id === "timeline-independent-a").due, "2026-11-03");
  assert.equal(afterReload.tasks.find((row) => row.id === "timeline-independent-b").start, "2026-11-04");
  assert.equal(afterReload.planning.find((row) => row.projectId === "timeline-independent-browser-project")
    .proposals.at(-1).status, "Submitted");
  await page.locator(".planning-proposal").getByRole("button", { name: "Approve proposal" }).click();
  const approved = JSON.parse(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")));
  assert.equal(approved.tasks.find((row) => row.id === "timeline-independent-a").due, "2026-11-04");
  assert.equal(approved.tasks.find((row) => row.id === "timeline-independent-b").start, "2026-11-05");
  assert.equal(approved.planning.find((row) => row.projectId === "timeline-independent-browser-project")
    .baselineHistory[0].nodes.find((row) => row.node.id === "timeline-independent-a").finish,
    "2026-11-03");

  const incompatible = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("azzora-demo-v1"));
    saved.planningVersion = 99;
    const originalBytes = JSON.stringify(saved);
    localStorage.setItem("azzora-demo-v1", originalBytes);
    return originalBytes;
  });
  await page.reload();
  await page.getByRole("region", { name: "Saved data recovery" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")), incompatible);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export original saved data" }).first().click();
  const download = await downloadPromise;
  assert.equal(fs.readFileSync(await download.path(), "utf8"), incompatible,
    "recovery export must contain byte-identical original browser data");
  console.log("planning approval rollback, reload, baseline, and incompatible-data export passed");
} finally {
  await browser.close();
}
