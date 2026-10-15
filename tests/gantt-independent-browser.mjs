import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { auditUrl, browserOptions } from "./browser-runtime.mjs";

const out = process.env.GANTT_EVIDENCE_DIR || "tmp/gantt-independent-qa";
const evidenceLabel = process.env.GANTT_EVIDENCE_LABEL || "candidate";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
const failures = [];
let passed = 0;
page.on("pageerror", (error) => errors.push(error.message));
const check = async (name, run) => {
  try {
    await run();
    passed++;
    console.log("PASS", name);
  } catch (error) {
    failures.push({ name, detail: error?.message || String(error) });
    console.error("FAIL", name, error?.message || error);
  }
};
const ids = {
  long: "gantt-qa-long",
  fs: "gantt-qa-fs",
  ss: "gantt-qa-ss",
  ff: "gantt-qa-ff",
  sf: "gantt-qa-sf",
  milestone: "gantt-qa-milestone",
};
const longName = "Architecture review with a deliberately long client-facing programme activity name";
const dates = {
  [ids.long]: ["2026-10-15", "2026-10-15"],
  [ids.fs]: ["2026-10-20", "2026-10-21"],
  [ids.ss]: ["2026-10-15", "2026-10-20"],
  [ids.ff]: ["2026-10-21", "2026-10-22"],
  [ids.sf]: ["2026-10-23", "2026-10-26"],
};
const linkDefs = [
  ["gantt-qa-link-fs", ids.long, ids.fs, "FS"],
  ["gantt-qa-link-ss", ids.long, ids.ss, "SS"],
  ["gantt-qa-link-ff", ids.fs, ids.ff, "FF"],
  ["gantt-qa-link-sf", ids.ss, ids.sf, "SF"],
  ["gantt-qa-link-multiple", ids.ff, ids.sf, "FS"],
];
const dubaiToday = "2026-10-15";

try {
  await page.clock.install({ time: new Date("2026-10-15T08:00:00+04:00") });
  await page.goto(auditUrl + "/#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export demo data", exact: true }).click();
  const download = await downloadPromise;
  const fixturePath = out + "/fixture-export.json";
  await download.saveAs(fixturePath);
  const db = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const source = db.tasks[0];
  const original = db.projects[0];
  const projectId = "gantt-independent-fixture";
  db.projects.unshift({
    ...original, id: projectId, code: "AZ-GANTT-QA",
    name: "Independent Gantt geometry fixture",
    start: "2026-10-15", due: "2026-11-30",
  });
  const phaseOne = "gantt-qa-phase-one";
  const phaseTwo = "gantt-qa-phase-two";
  db.phases.push(
    { id: phaseOne, projectId, name: "Client design and handoffs", weight: 50, order: 0 },
    { id: phaseTwo, projectId, name: "Site execution and approvals", weight: 50, order: 1 },
  );
  const createTask = (id, name, start, due, phaseId, progress) => {
    const task = {
      ...source, id, projectId, phaseId, name, start, due, progress,
      status: progress ? "In Progress" : "Not Started",
      dependencies: [], description: "", notes: "", attachments: [], comments: [],
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    };
    delete task.parentId;
    delete task.completedAt;
    return task;
  };
  db.tasks.push(
    createTask(ids.long, longName, ...dates[ids.long], phaseOne, 40),
    createTask(ids.fs, "Client materials approval", ...dates[ids.fs], phaseOne, 20),
    createTask(ids.ss, "Parallel design coordination", ...dates[ids.ss], phaseOne, 50),
    createTask(ids.ff, "Technical finish review", ...dates[ids.ff], phaseTwo, 10),
    createTask(ids.sf, "Handover readiness review", ...dates[ids.sf], phaseTwo, 0),
  );
  for (let i = 0; i < 9; i++)
    db.tasks.push(createTask("gantt-qa-filler-" + i, "Additional work package " + (i + 1),
      "2026-10-28", "2026-10-29", phaseTwo, i * 10));
  db.milestones.push({
    id: ids.milestone, projectId, name: "Client handover decision",
    due: "2026-10-27", taskId: "",
  });
  db.planningVersion = 1;
  db.planning ??= [];
  db.planning.push({
    projectId, enabled: true,
    calendar: {
      timezone: "Asia/Dubai", workingWeekdays: [1, 2, 3, 4, 5],
      workdayStart: "08:00", workdayEnd: "17:00",
      holidays: ["2026-10-19"], projectNonworkingDates: [],
    },
    approvedRevision: 0, baselineStatus: "Unset", baselineHistory: [],
    taskPlanning: db.tasks.filter((task) => task.projectId === projectId).map((task) => ({
      taskId: task.id,
      durationWorkingDays: task.id === ids.long ? 1 : task.id === ids.ss ? 3 : 2,
      scheduleRole: "work",
    })),
    milestonePlanning: [{ milestoneId: ids.milestone, completionCondition: { kind: "Manual" } }],
    links: linkDefs.map(([id, from, to, type]) => ({
      id, projectId,
      predecessor: { kind: "task", id: from },
      successor: { kind: "task", id: to },
      type, lagWorkingDays: 0, createdAt: "2026-10-15T00:00:00.000Z",
    })),
    proposals: [],
  });
  await page.evaluate((fixture) => localStorage.setItem("azzora-demo-v1", JSON.stringify(fixture)), db);
  await page.goto(auditUrl + "/#/planning");
  await page.reload();
  await page.getByRole("heading", { name: "Planning & Timeline" }).waitFor();
  await page.getByLabel("Planning project").selectOption(projectId);

  const chart = page.getByRole("region", { name: "Project programme" });
  const geometry = async () => page.evaluate(({ ids, dates, dubaiToday }) => {
    const chart = document.querySelector(".gantt");
    const rows = [...chart.querySelectorAll(".gantt-row[data-row-id]")];
    const dateHead = document.querySelector(".gantt-date-head");
    const cell = dateHead.querySelector("span").getBoundingClientRect().width;
    const offset = (date) => Math.round((Date.parse(date + "T12:00:00Z") -
      Date.parse(dubaiToday + "T12:00:00Z")) / 86400000);
    const headerCell = dateHead.querySelector("span")?.getBoundingClientRect();
    const byId = Object.fromEntries(Object.entries(dates).map(([id, pair]) => {
      const row = chart.querySelector('[data-row-id="' + id + '"]');
      const track = row?.querySelector(".gantt-track");
      const bar = row?.querySelector(".gantt-bar");
      const info = row?.querySelector(".gantt-info");
      const a = bar?.getBoundingClientRect(), t = track?.getBoundingClientRect();
      const i = info?.getBoundingClientRect();
      return [id, {
        actualLeft: a ? a.left - t.left : null,
        actualWidth: a?.width ?? null,
        expectedLeft: t ? headerCell.left - t.left + offset(pair[0]) * cell : null,
        expectedWidth: t ? (offset(pair[1]) - offset(pair[0]) + 1) * cell : null,
        rowAligned: !!i && Math.abs(i.top - t.top) <= 1 && Math.abs(i.height - t.height) <= 1,
        aria: bar?.getAttribute("aria-label") || "",
        title: bar?.getAttribute("title") || "",
        fillRatio: bar?.querySelector("i") && a ? bar.querySelector("i").getBoundingClientRect().width / a.width : null,
      }];
    }));
    const milestoneRow = chart.querySelector('[data-row-id="' + ids.milestone + '"]');
    const milestone = milestoneRow?.querySelector(".gantt-bar");
    const milestoneTrack = milestoneRow?.querySelector(".gantt-track");
    const milestoneBox = milestone?.getBoundingClientRect();
    const milestoneTrackBox = milestoneTrack?.getBoundingClientRect();
    const todayBox = chart.querySelector(".gantt-today")?.getBoundingClientRect();
    const svg = chart.querySelector("svg.dependency-lines");
    const paths = svg ? [...svg.querySelectorAll("path[data-link-id]")].map((path) => {
      const length = path.getTotalLength();
      const ctm = path.getScreenCTM();
      const point = (at) => {
        const value = path.getPointAtLength(at).matrixTransform(ctm);
        return { x: value.x, y: value.y };
      };
      const sampled = [];
      for (let at = 8; at < length - 8; at += 3) sampled.push(point(at));
      return {
        id: path.getAttribute("data-link-id"),
        type: path.getAttribute("data-link-type"),
        selected: path.getAttribute("data-selected"),
        marker: path.getAttribute("marker-end"),
        start: point(0), end: point(length), sampled,
      };
    }) : [];
    const bars = Object.fromEntries(
      [...chart.querySelectorAll('.gantt-row[data-row-id] .gantt-bar')].map((bar) => {
        const id = bar.closest("[data-row-id]").getAttribute("data-row-id");
        const box = bar.getBoundingClientRect();
        return [id, { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          cy: box.top + box.height / 2 }];
      }),
    );
    const chartBox = chart.getBoundingClientRect();
    const headingElement = document.querySelector(".gantt-heading-viewport") ||
      document.querySelector(".gantt-heading");
    const heading = headingElement?.getBoundingClientRect();
    const firstTrack = chart.querySelector(".gantt-track")?.getBoundingClientRect();
    const paneRight = chart.querySelector(".gantt-info")?.getBoundingClientRect().right;
    const shell = document.querySelector(".gantt-shell")?.getBoundingClientRect();
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const mobileSwitch = document.querySelector(".planning-mobile-switch");
    const mobileSwitchBox = mobileSwitch && getComputedStyle(mobileSwitch).display !== "none"
      ? mobileSwitch.getBoundingClientRect() : null;
    const body = chart.querySelector(".gantt-body");
    return {
      cell, byId, paths, bars, milestoneLabel: milestone?.getAttribute("aria-label") || "",
      milestoneLeft: milestoneBox && milestoneTrackBox ? milestoneBox.left - milestoneTrackBox.left : null,
      expectedMilestoneLeft: milestoneTrackBox ? headerCell.left - milestoneTrackBox.left +
        offset("2026-10-27") * cell : null,
      milestoneWidth: milestoneBox?.width,
      todayLeft: todayBox?.left,
      expectedTodayLeft: headerCell?.left,
      svgHeight: Number(svg?.getAttribute("height")), bodyHeight: body?.scrollHeight,
      chartScrollWidth: chart.scrollWidth, chartClientWidth: chart.clientWidth,
      chartScrollHeight: chart.scrollHeight, chartClientHeight: chart.clientHeight,
      chartLeft: chartBox.left, chartTop: chartBox.top, headingTop: heading?.top,
      chartRight: chartBox.right, paneRight, shellTop: shell?.top,
      headingBottom: heading?.bottom, headerGridLeft: headerCell?.left,
      firstTrackLeft: firstTrack?.left,
      gridOriginDelta: headerCell?.left - firstTrack?.left,
      stickyMinimum: Math.max(topbar?.bottom || 0, mobileSwitchBox?.bottom || 0),
      documentScrollable: document.documentElement.scrollHeight > innerHeight + 100,
      chartScrollTop: chart.scrollTop,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      visibleRows: rows.length,
    };
  }, { ids, dates, dubaiToday });

  const assertDateGeometry = (measured) => {
    assert.ok(measured.cell > 0);
    assert.ok(Math.abs(measured.todayLeft - measured.expectedTodayLeft) <= 2,
      "today line must align with first date cell");
    assert.ok(Math.abs(measured.milestoneLeft + measured.milestoneWidth / 2 -
      (measured.expectedMilestoneLeft + measured.cell / 2)) <= 2,
      "milestone center must align with approved event date cell");
    assert.ok(measured.milestoneWidth > 0 && measured.milestoneWidth <= Math.max(24, measured.cell) + 2,
      "milestone diamond exceeds its compact date marker width");
    for (const [id, item] of Object.entries(measured.byId)) {
      assert.ok(item.rowAligned, id + " task/chart row alignment");
      assert.ok(Math.abs(item.actualLeft - item.expectedLeft) <= 2,
        id + " start edge: " + item.actualLeft + " versus " + item.expectedLeft);
      assert.ok(Math.abs(item.actualWidth - item.expectedWidth) <= 2,
        id + " inclusive width: " + item.actualWidth + " versus " + item.expectedWidth);
    }
  };
  const assertLinks = (measured) => {
    assert.equal(measured.paths.length, linkDefs.length, "all typed paths must render");
    for (const [linkId, from, to, type] of linkDefs) {
      const path = measured.paths.find((item) => item.id === linkId);
      assert.ok(path, "missing semantic connector " + linkId);
      assert.equal(path.type, type);
      assert.ok(path.marker, linkId + " needs a visible arrowhead");
      const source = measured.bars[from], target = measured.bars[to];
      const sourceEdge = type[0] === "F" ? source.right : source.left;
      const targetEdge = type[1] === "S" ? target.left : target.right;
      assert.ok(Math.abs(path.start.x - sourceEdge) <= 8,
        linkId + " source endpoint " + path.start.x + " versus " + sourceEdge);
      assert.ok(Math.abs(path.end.x - targetEdge) <= 8,
        linkId + " target endpoint " + path.end.x + " versus " + targetEdge);
      assert.ok(Math.abs(path.start.y - source.cy) <= 8 && Math.abs(path.end.y - target.cy) <= 8,
        linkId + " vertical endpoint misalignment");
      for (const [barId, box] of Object.entries(measured.bars)) {
        if (barId === from || barId === to) continue;
        assert.ok(!path.sampled.some((point) => point.x > box.left + 2 &&
          point.x < box.right - 2 && point.y > box.top + 2 && point.y < box.bottom - 2),
          linkId + " crosses unrelated bar " + barId);
      }
      assert.ok(path.sampled.every((point) => point.x >= measured.firstTrackLeft - 1),
        linkId + " crosses left of the date grid into task labels");
      if (type[0] === "S" && (from === ids.long || from === ids.ss)) {
        assert.ok(source.left - measured.firstTrackLeft >= 7,
          linkId + " source at day zero needs visible connector gutter");
        assert.ok(path.sampled.some((point) => point.x >= measured.firstTrackLeft + 1 &&
          point.x <= measured.chartRight),
          linkId + " left-edge stub is not visible in the date grid");
      }
    }
  };

  await check("fixture loads with milestone, long task and two phases", async () => {
    assert.equal(await page.locator(".gantt-task").count(), 14);
    assert.equal(await page.locator(".gantt-phase").count(), 2);
    assert.match((await geometry()).milestoneLabel, /Client handover decision/);
    assert.deepEqual(errors, []);
  });
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    if (width === 390) await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await chart.evaluate((element) => { element.scrollLeft = 0; element.scrollTop = 0; });
    await page.locator(".gantt-heading-viewport, .gantt-heading").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: out + "/gantt-" + width + "-" + evidenceLabel + ".png", fullPage: true });
    await check(width + " no document overflow and one horizontal chart rail", async () => {
      const measured = await geometry();
      assert.equal(measured.pageOverflow, false);
      assert.ok(measured.chartScrollWidth > measured.chartClientWidth);
      assert.ok(measured.documentScrollable, "long chart must allow page scrolling");
      assert.equal(measured.visibleRows, 17);
      assert.ok(measured.headingTop >= 0 && measured.headingBottom < height,
        "date header must be visible before page scroll");
      assert.ok(measured.svgHeight >= measured.bodyHeight - 1);
    });
    for (const scale of ["Day", "Week", "Month"]) {
      await page.getByLabel("Timeline scale").selectOption(scale);
      await page.getByRole("button", { name: "Today", exact: true }).click();
      await check(width + " " + scale + " approved inclusive date edges", async () =>
        assertDateGeometry(await geometry()));
    }
    await page.getByLabel("Timeline scale").selectOption("Week");
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await check(width + " typed connector endpoints and obstacle avoidance", async () =>
      assertLinks(await geometry()));
    const unscrolled = await geometry();
    await chart.evaluate((element) => { element.scrollLeft = 180; element.scrollTop = 0; });
    await page.evaluate(() => {
      const chart = document.querySelector(".gantt");
      window.scrollTo({ top: window.scrollY + chart.getBoundingClientRect().top + 250, behavior: "instant" });
    });
    await check(width + " sticky header and synchronized document/horizontal scroll", async () => {
      const measured = await geometry();
      assert.equal(measured.pageOverflow, false);
      assert.ok(measured.chartScrollHeight <= measured.chartClientHeight + 2,
        "chart must not trap a second vertical scrollbar");
      assert.ok(measured.headingTop >= measured.stickyMinimum - 3,
        "header slipped behind fixed controls: top " + measured.headingTop +
        ", fixed bottom " + measured.stickyMinimum);
      assert.ok(measured.headingBottom < height - 20, "date header left viewport");
      assert.ok(Math.abs(measured.gridOriginDelta - unscrolled.gridOriginDelta) <= 2,
        "date header and task grid desynchronized horizontally");
      assert.ok(Object.values(measured.byId).every((row) => row.rowAligned));
      assert.ok(measured.svgHeight >= measured.bodyHeight - 1);
    });
    await page.screenshot({ path: out + "/gantt-" + width + "-" + evidenceLabel + "-scrolled.png" });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("Timeline scale").selectOption("Week");
  await chart.evaluate((element) => { element.scrollLeft = 0; element.scrollTop = 0; });
  await check("one-day bar keeps progress and full accessible task name", async () => {
    const measured = await geometry();
    const bar = measured.byId[ids.long];
    assert.ok(bar.actualWidth <= measured.cell + 2);
    assert.ok(Math.abs(bar.fillRatio - 0.4) <= 0.06);
    assert.ok(bar.aria.includes(longName) && bar.title.includes(longName));
    assert.match(bar.aria, /40%/);
  });
  await check("milestone and short bar open complete keyboard details", async () => {
    const bar = page.locator('[data-row-id="' + ids.long + '"] .gantt-bar');
    await bar.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Task name").inputValue(), longName);
    await page.keyboard.press("Escape");
    const milestone = page.locator('[data-row-id="' + ids.milestone + '"] .gantt-bar');
    await milestone.focus();
    await page.keyboard.press("Enter");
    assert.match(await page.getByRole("dialog").innerText(), /Completion condition/);
    await page.keyboard.press("Escape");
  });
  await check("selected task highlights only its incident connectors", async () => {
    await page.locator('[data-row-id="' + ids.fs + '"] .gantt-bar').click();
    try {
      const measured = await geometry();
      const active = measured.paths.filter((path) => path.selected === "true").map((path) => path.id).sort();
      assert.deepEqual(active, ["gantt-qa-link-ff", "gantt-qa-link-fs"]);
    } finally {
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
  });
  await check("collapsed phase removes hidden connectors and keeps visible row alignment", async () => {
    await page.getByRole("button", { name: /01 Client design and handoffs/ }).click();
    try {
      const measured = await geometry();
      assert.equal(await page.locator('[data-row-id="' + ids.long + '"]').count(), 0);
      assert.ok(measured.paths.every((path) => path.id === "gantt-qa-link-multiple"));
      assert.ok(Object.values(measured.byId).filter((row) => row.actualLeft !== null)
        .every((row) => row.rowAligned));
    } finally {
      await page.getByRole("button", { name: /01 Client design and handoffs/ }).click();
    }
  });
  await page.getByLabel("Reason for proposal or baseline capture")
    .fill("Independent visual baseline");
  await page.getByRole("button", { name: "Capture baseline", exact: true }).click();
  await check("task bar opens edit drawer after baseline capture", async () => {
    await page.locator('[data-row-id="' + ids.long + '"] .gantt-bar').click();
    await page.screenshot({ path: out + "/gantt-post-baseline-click-" + evidenceLabel + ".png", fullPage: true });
    const hit = await page.evaluate(() => {
      const bar = document.querySelector('[data-row-id="gantt-qa-long"] .gantt-bar');
      const rect = bar.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { dialogs: document.querySelectorAll('[role="dialog"]').length,
        hitTag: target?.tagName, hit: target?.outerHTML.slice(0, 250),
        barRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
    });
    const drawer = page.getByRole("dialog");
    assert.equal(await drawer.count(), 1,
      "task bar must open the edit drawer after baseline capture: " + JSON.stringify(hit));
  });
  if (await page.getByRole("dialog").count() === 0) {
    const bar = page.locator('[data-row-id="' + ids.long + '"] .gantt-bar');
    await bar.focus();
    await bar.click({ position: { x: 18, y: 14 } });
    if (await page.getByRole("dialog").count() === 0) {
      await bar.press("Enter");
    }
  }
  await check("approved bar remains fixed while baseline and proposed overlays differ", async () => {
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Due", { exact: true }).fill("2026-10-20");
    await drawer.getByLabel("Schedule proposal reason").fill("Independent connector overlay review");
    await drawer.getByRole("button", { name: "Save Changes" }).click();
    await page.locator(".planning-proposal").waitFor();
    const row = page.locator('[data-row-id="' + ids.long + '"]');
    assert.equal(await row.locator(".gantt-overlay.baseline").count(), 1);
    assert.equal(await row.locator(".gantt-overlay.proposed").count(), 1);
    assert.match(await row.locator(".gantt-bar").getAttribute("aria-label"), /Proposed .*not approved/);
    const overlays = await row.evaluate((element) => {
      const track = element.querySelector(".gantt-track").getBoundingClientRect();
      const box = (selector) => {
        const rect = element.querySelector(selector).getBoundingClientRect();
        return { left: rect.left - track.left, width: rect.width };
      };
      return { approved: box(".gantt-bar"), baseline: box(".gantt-overlay.baseline"),
        proposed: box(".gantt-overlay.proposed") };
    });
    assert.ok(Math.abs(overlays.baseline.left - overlays.approved.left) <= 2,
      "baseline and approved start edges drifted apart");
    assert.ok(Math.abs(overlays.proposed.left - overlays.approved.left) <= 2,
      "proposed and approved start edges drifted apart");
    assert.ok(overlays.proposed.width > overlays.approved.width,
      "proposed finish extension must be visibly wider than approved bar");
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("azzora-demo-v1")));
    assert.equal(saved.tasks.find((task) => task.id === ids.long).due, "2026-10-15");
    await page.screenshot({ path: out + "/gantt-proposal-1440-" + evidenceLabel + ".png", fullPage: true });
  });
  assert.deepEqual(errors, [], "browser page errors");
  console.log("GANTT_INDEPENDENT_RESULTS", JSON.stringify({
    source: process.env.GANTT_SOURCE_SHA || await page.evaluate(() =>
      document.querySelector("meta[name='git-sha']")?.content || ""),
    passed,
    failed: failures.length,
    failures,
    evidence: out,
  }));
  if (failures.length) throw Error(failures.map((item) => item.name + ": " + item.detail).join("\n"));
} finally {
  await context.close();
  await browser.close();
}
