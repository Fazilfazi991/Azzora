import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { auditUrl, browserOptions } from "./browser-runtime.mjs";

const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const failures = [];
const near = (actual, expected, label, tolerance = 1.1) => {
  if (Math.abs(actual - expected) > tolerance)
    failures.push(`${label}: observed ${actual.toFixed(2)}px, expected ${expected.toFixed(2)}px`);
};
const delta = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
try {
  await page.clock.install({ time: new Date("2026-11-02T08:00:00Z") });
  await page.goto(`${auditUrl}/#/planning`);
  const db = await page.evaluate(async () => (await import("/src/domain/seed.ts")).seed());
  const projectId = "date-geometry-project", phaseId = "date-geometry-phase";
  const project = { ...db.projects[0], id: projectId, code: "AZ-GEOM", name: "Synthetic date geometry",
    start: "2026-10-30", due: "2026-12-31" };
  db.projects.unshift(project);
  db.phases.push({ id: phaseId, projectId, name: "Geometry", weight: 1, order: 0 });
  const source = db.tasks[0];
  const specs = [
    ["left", "Left-clipped task", "2026-10-30", "2026-11-03", 3],
    ["a", "One working day", "2026-11-02", "2026-11-02", 1],
    ["b", "Three working days", "2026-11-03", "2026-11-05", 3],
    ["c", "Start-to-start branch", "2026-11-02", "2026-11-04", 3],
    ["d", "Finish-to-finish branch", "2026-11-04", "2026-11-05", 2],
    ["e", "Start-to-finish branch", "2026-11-02", "2026-11-03", 2],
    ["f", "Two predecessors", "2026-11-06", "2026-11-06", 1],
    ["weekend", "Weekend-spanning task", "2026-11-06", "2026-11-09", 2],
    ["holiday", "Holiday-spanning task", "2026-11-10", "2026-11-12", 2],
    ["right", "Right-clipped task", "2026-11-20", "2026-11-24", 3],
  ];
  for (const [key, name, start, due] of specs) db.tasks.push({ ...source,
    id: `geom-${key}`, projectId, phaseId, name, start, due,
    dependencies: [], parentId: undefined, completedAt: undefined,
    status: "Not Started", progress: 0, attachments: [], comments: [], notes: "" });
  db.milestones.push({ id: "geom-event", projectId, name: "Friday event", due: "2026-11-06", taskId: "" });
  const links = [
    ["a", "b", "FS"], ["a", "c", "SS"], ["b", "d", "FF"], ["b", "e", "SF"],
    ["b", "f", "FS"], ["c", "f", "FS"], ["weekend", "holiday", "FS"],
  ].map(([from, to, type]) => ({ id: `geom-${from}-${to}`, projectId,
    predecessor: { kind: "task", id: `geom-${from}` },
    successor: { kind: "task", id: `geom-${to}` },
    type, lagWorkingDays: 0, createdAt: "2026-11-01T00:00:00Z" }));
  db.planningVersion = 1;
  db.planning ??= [];
  db.planning.push({ projectId, enabled: true, approvedRevision: 0,
    calendar: { timezone: "Asia/Dubai", workingWeekdays: [1, 2, 3, 4, 5],
      workdayStart: "08:00", workdayEnd: "17:00", holidays: ["2026-11-11"], projectNonworkingDates: [] },
    baselineStatus: "Unset", baselineHistory: [],
    taskPlanning: specs.map(([key, , , , duration]) => ({ taskId: `geom-${key}`, durationWorkingDays: duration, scheduleRole: "work" })),
    milestonePlanning: [{ milestoneId: "geom-event", completionCondition: { kind: "Manual" } }],
    links, proposals: [] });
  await page.evaluate((fixture) => localStorage.setItem("azzora-demo-v1", JSON.stringify(fixture)), db);
  await page.reload();
  await page.getByLabel("Planning project").selectOption(projectId);
  await page.getByRole("heading", { name: "Planning & Timeline" }).waitFor();
  assert.equal(await page.locator(".gantt-bar").count(), specs.length + 1, "fixture must render every approved task and milestone");
  const rules = await page.evaluate(async () => {
    const { linkFirstPermittedDate, getProjectPlanning } = await import("/src/planning/index.ts");
    const { calculateSchedule } = await import("/src/planning/engine.ts");
    const db = JSON.parse(localStorage.getItem("azzora-demo-v1"));
    const planning = getProjectPlanning(db, "date-geometry-project");
    const predecessor = { start: "2026-11-03", finish: "2026-11-05", durationWorkingDays: 3 };
    const bounds = Object.fromEntries(planning.links.filter((link) => link.predecessor.id === "geom-b")
      .map((link) => [link.type, linkFirstPermittedDate(planning.calendar, link, predecessor,
        planning.taskPlanning.find((row) => row.taskId === link.successor.id).durationWorkingDays)]));
    const result = calculateSchedule(db, planning, { kind: "task", id: "geom-b" }, { start: "2026-11-04" });
    return { bounds, successor: result.dates.get("task:geom-f")?.start,
      conflicts: result.conflicts.map((issue) => issue.code) };
  });
  assert.deepEqual(rules.bounds, { FF: "2026-11-04", SF: "2026-11-02", FS: "2026-11-06" });
  assert.equal(rules.successor, "2026-11-09", "multiple-predecessor FS bound follows delayed latest predecessor");
  assert.deepEqual(rules.conflicts, [], "calculation fixture remains feasible");

  for (const scale of ["Day", "Week", "Month"]) {
    await page.getByLabel("Timeline scale").selectOption(scale);
    await page.locator(".gantt-date-head span").first().waitFor();
    const geometry = await page.evaluate(({ specs }) => {
      const chart = document.querySelector(".gantt");
      const firstCell = document.querySelector('.gantt-date-head span[data-date="2026-11-02"]');
      const cell = firstCell.getBoundingClientRect().width;
      const span = document.querySelectorAll(".gantt-date-head span[data-date]").length;
      const out = { cell, span, bars: {}, track: {}, paths: [], headerX: firstCell.getBoundingClientRect().left,
        scrollWidth: chart.scrollWidth, clientWidth: chart.clientWidth,
        firstCellDate: firstCell.dataset.date };
      for (const [key] of specs) {
        const trackElement = document.querySelector(`[data-row-id="geom-${key}"] .gantt-track`);
        const track = trackElement.getBoundingClientRect();
        const bar = document.querySelector(`[data-row-id="geom-${key}"] .gantt-bar`).getBoundingClientRect();
        out.bars[key] = { left: bar.left - track.left, right: bar.right - track.left, width: bar.width };
        out.track[key] = { left: track.left,
          gridOrigin: Number.parseFloat(getComputedStyle(trackElement).backgroundPositionX),
          gridCell: Number.parseFloat(getComputedStyle(trackElement).backgroundSize) };
      }
      const eventTrack = document.querySelector('[data-row-id="geom-event"] .gantt-track').getBoundingClientRect();
      const event = document.querySelector('[data-row-id="geom-event"] .gantt-bar').getBoundingClientRect();
      out.event = { center: event.left + event.width / 2 - eventTrack.left, left: event.left - eventTrack.left, width: event.width };
      out.paths = [...document.querySelectorAll("svg.dependency-lines > path[data-link-id]")].map((path) => {
        const length = path.getTotalLength();
        const start = path.getPointAtLength(0), end = path.getPointAtLength(length);
        return { id: path.dataset.linkId, type: path.dataset.linkType,
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y }, length,
          markerEnd: path.getAttribute("marker-end") };
      });
      return out;
    }, { specs });
    assert.equal(geometry.span, { Day: 21, Week: 56, Month: 180 }[scale], `${scale} visible date-cell count`);
    assert.ok(geometry.scrollWidth > geometry.clientWidth, `${scale} date rail must scroll`);
    assert.equal(geometry.firstCellDate, "2026-11-02", `${scale} first date cell is the approved geometry anchor`);
    const dateOrigin = geometry.headerX - geometry.track.a.left;
    near(geometry.track.a.gridOrigin, dateOrigin, `${scale} date grid begins at first date cell`);
    near(geometry.track.a.gridCell, geometry.cell, `${scale} date grid cell width`);
    for (const [key, , start, finish] of specs) {
      near(geometry.track[key].left, geometry.track.a.left, `${scale} ${key} track aligns with date header`);
      near(geometry.track[key].gridOrigin, dateOrigin, `${scale} ${key} grid begins at first date cell`);
      const first = delta("2026-11-02", start), last = delta("2026-11-02", finish);
      if (last < 0 || first >= geometry.span) continue;
      const expectedLeft = dateOrigin + Math.max(0, first) * geometry.cell;
      const expectedWidth = (Math.min(geometry.span - 1, last) - Math.max(0, first) + 1) * geometry.cell;
      near(geometry.bars[key].left, expectedLeft, `${scale} ${key} approved start`);
      near(geometry.bars[key].right, expectedLeft + expectedWidth, `${scale} ${key} inclusive finish`);
    }
    const eventIndex = delta("2026-11-02", "2026-11-06");
    near(geometry.event.center, dateOrigin + (eventIndex + 0.5) * geometry.cell, `${scale} milestone diamond center`);

    // A typed link must visually attach to its predecessor/successor event edge.
    for (const link of links) {
      const path = geometry.paths.find((item) => item.id === link.id);
      assert.ok(path, `${scale} connector ${link.id} must render`);
      assert.equal(path.type, link.type, `${scale} connector ${link.id} keeps dependency type`);
      assert.ok(path.length > 0, `${scale} connector ${link.id} must have nonzero measured length`);
      assert.equal(path.markerEnd, "url(#planning-arrow)", `${scale} connector ${link.id} must retain a visible arrowhead`);
      const from = geometry.bars[link.predecessor.id.slice(5)];
      const to = geometry.bars[link.successor.id.slice(5)];
      const expectedFrom = link.type === "SS" || link.type === "SF" ? from.left : from.right;
      const expectedTo = link.type === "FF" || link.type === "SF" ? to.right : to.left;
      near(path.start.x, expectedFrom, `${scale} ${link.type} ${link.id} predecessor endpoint`, 2);
      near(path.end.x, expectedTo, `${scale} ${link.type} ${link.id} successor endpoint`, 2);
    }
    await page.locator(".gantt").evaluate((element) => { element.scrollLeft = 227; });
    const scrolled = await page.evaluate(() => {
      const track = document.querySelector('[data-row-id="geom-a"] .gantt-track').getBoundingClientRect();
      const bar = document.querySelector('[data-row-id="geom-a"] .gantt-bar').getBoundingClientRect();
      const header = document.querySelector('.gantt-date-head span[data-date="2026-11-02"]').getBoundingClientRect();
      return { barOffset: bar.left - track.left, headerLeft: header.left,
        trackLeft: track.left, scrollLeft: document.querySelector(".gantt").scrollLeft };
    });
    near(scrolled.barOffset, geometry.bars.a.left, `${scale} bar after horizontal scroll`);
    near(scrolled.headerLeft - scrolled.trackLeft, dateOrigin, `${scale} date origin after horizontal scroll`);
    assert.ok(scrolled.scrollLeft > 0, `${scale} scroll position must change`);
    await page.locator(".gantt").evaluate((element) => { element.scrollLeft = 0; });
  }
  if (failures.length) throw Error(`Gantt date geometry mismatches:\n${failures.join("\n")}`);
  console.log("Gantt approved-date geometry, calendar spans, milestone positions, typed links and horizontal scroll passed at Day/Week/Month.");
} finally {
  await browser.close();
}
