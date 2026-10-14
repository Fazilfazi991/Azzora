import type { Database, Phase, Task, Milestone } from "../domain/model";
import { uid } from "../domain/logic";
import { activePerson } from "../workforce/commands";
import { finishFromStart, onOrAfter, workOffset } from "./calendar";
import { getProjectPlanning } from "./compatibility";
import { validateLinks } from "./graph";
import type { DependencyLink, MilestoneCondition, NodeRef, ProjectPlanning } from "./model";

export interface TemplateActivity {
  key: string;
  name: string;
  kind: "task" | "milestone";
  durationWorkingDays: number;
  trade: string;
  predecessors: string[];
  completionCondition?: MilestoneCondition;
}
export interface TemplatePhase {
  key: string;
  name: string;
  activities: TemplateActivity[];
}
export type FitOutTemplatePreview = TemplatePhase[];
const task = (key: string, name: string, durationWorkingDays: number, trade: string, predecessors: string[] = []): TemplateActivity =>
  ({ key, name, kind: "task", durationWorkingDays, trade, predecessors });
const milestone = (key: string, name: string, predecessors: string[], completionCondition: MilestoneCondition = { kind: "Manual" }): TemplateActivity =>
  ({ key, name, kind: "milestone", durationWorkingDays: 0, trade: "Other", predecessors, completionCondition });

export function previewFitOutTemplate(): FitOutTemplatePreview {
  return structuredClone([
    { key: "design", name: "Planning and Design", activities: [
      task("scope", "Confirm scope and site access", 2, "Interior Design"),
      task("survey", "Survey existing conditions", 2, "Interior Design", ["scope"]),
      task("drawings", "Develop coordinated fit-out drawings", 5, "Interior Design", ["survey"]),
      milestone("drawings-approved", "Drawings approved", ["drawings"]),
    ] },
    { key: "approvals", name: "Approvals and Procurement", activities: [
      task("authority", "Submit authority and building approvals", 5, "Interior Design", ["drawings"]),
      milestone("noc", "Authority NOC received", ["authority"]),
      task("procure", "Procure long-lead materials", 8, "Other", ["scope"]),
      milestone("delivery", "Material delivery complete", ["procure"]),
    ] },
    { key: "mobilization", name: "Site Mobilization", activities: [
      task("site-setup", "Install protection and set up site", 2, "Civil", ["noc"]),
      task("setting-out", "Set out coordinated trades", 2, "Civil", ["site-setup"]),
    ] },
    { key: "demolition", name: "Demolition and Preparation", activities: [
      task("demolition", "Controlled strip-out and demolition", 4, "Civil", ["site-setup"]),
      task("waste", "Remove debris and prepare substrate", 2, "Civil", ["demolition"]),
    ] },
    { key: "mep-first", name: "MEP First Fix", activities: [
      task("electrical-first", "Electrical first fix", 4, "MEP", ["setting-out", "waste"]),
      task("hvac-first", "HVAC first fix", 4, "MEP", ["setting-out", "waste"]),
      task("plumbing-first", "Plumbing first fix", 3, "MEP", ["setting-out", "waste"]),
      milestone("first-fix-inspection", "MEP first-fix inspection approved", ["electrical-first", "hvac-first", "plumbing-first"]),
    ] },
    { key: "civil", name: "Civil and Partition Work", activities: [
      task("partitions", "Build partitions and supports", 5, "Civil", ["waste"]),
      task("partition-close", "Close inspected partitions", 2, "Civil", ["partitions", "first-fix-inspection"]),
    ] },
    { key: "waterproof", name: "Waterproofing and Tiling", activities: [
      task("waterproofing", "Apply wet-area waterproofing", 3, "Civil", ["partition-close"]),
      milestone("waterproof-inspection", "Waterproofing inspection approved", ["waterproofing"]),
      task("tiling", "Install wall and floor tiling", 5, "Civil", ["waterproof-inspection"]),
    ] },
    { key: "finishes", name: "Ceiling and Finishes", activities: [
      task("ceiling", "Close ceiling after first-fix inspection", 4, "Ceiling", ["electrical-first", "hvac-first", "first-fix-inspection"]),
      task("painting", "Complete painting and surface finishes", 4, "Painting", ["ceiling", "tiling"]),
    ] },
    { key: "joinery", name: "Joinery and Final Fixtures", activities: [
      task("fabrication", "Fabricate joinery off site", 10, "Joinery", ["drawings-approved"]),
      task("joinery-install", "Install joinery and final fixtures", 5, "Joinery", ["fabrication", "painting", "delivery"]),
    ] },
    { key: "mep-second", name: "MEP Second Fix", activities: [
      task("mep-second-fix", "Install MEP fixtures and devices", 4, "MEP", ["painting", "joinery-install"]),
      task("mep-testing", "Test and commission MEP systems", 3, "MEP", ["mep-second-fix"]),
      milestone("mep-tested", "MEP testing approved", ["mep-testing"]),
    ] },
    { key: "qa", name: "QA and Snagging", activities: [
      task("qa-walk", "Conduct final QA walk", 2, "Other", ["mep-tested", "joinery-install"]),
      task("snag-close", "Rectify and close snags", 3, "Other", ["qa-walk"]),
      milestone("final-qa", "Final QA approved", ["snag-close"]),
    ] },
    { key: "handover", name: "Handover", activities: [
      task("asbuilt", "Compile as-built drawings and warranties", 3, "Other", ["mep-tested"]),
      task("client-walk", "Complete client walkthrough", 1, "Other", ["final-qa", "asbuilt"]),
      milestone("handover-complete", "Client handover accepted", ["client-walk", "final-qa", "asbuilt"]),
    ] },
  ] satisfies FitOutTemplatePreview);
}

export function instantiateFitOutTemplate(db: Database, projectId: string,
  preview: FitOutTemplatePreview, actorId: string): void {
  activePerson(db, actorId);
  const project = db.projects.find((row) => row.id === projectId);
  if (!project || project.managerId !== actorId)
    throw Error("Only the project's demo Project Manager can initialize its plan.");
  if (db.tasks.some((row) => row.projectId === projectId) ||
      db.milestones.some((row) => row.projectId === projectId) ||
      db.phases.some((row) => row.projectId === projectId) ||
      db.planning?.some((row) => row.projectId === projectId))
    throw Error("This project already has a plan. The template cannot create duplicate task records.");
  if (!preview.length || preview.length !== 12) throw Error("Review all twelve template phases before applying.");
  const next = structuredClone(db);
  const calendar = getProjectPlanning(next, projectId).calendar;
  const keys = new Set<string>(), phaseKeys = new Set<string>();
  for (const phase of preview) {
    if (!phase.key || phaseKeys.has(phase.key) || !phase.name.trim()) throw Error("Template phase is invalid or duplicated.");
    phaseKeys.add(phase.key);
    for (const item of phase.activities) {
      if (!item.key || keys.has(item.key) || !item.name.trim() ||
          item.kind === "task" && (!Number.isInteger(item.durationWorkingDays) || item.durationWorkingDays < 1) ||
          item.kind === "milestone" && item.durationWorkingDays !== 0)
        throw Error("Template activity is invalid or duplicated.");
      keys.add(item.key);
    }
  }
  const all = preview.flatMap((phase) => phase.activities);
  for (const item of all)
    if (item.predecessors.some((key) => !keys.has(key) || key === item.key) ||
        new Set(item.predecessors).size !== item.predecessors.length)
      throw Error("Template has an invalid or duplicate predecessor.");
  const remaining = new Map(all.map((item) => [item.key, item]));
  const ordered: TemplateActivity[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((item) => item.predecessors.every((key) => !remaining.has(key))).sort((a, b) => a.key.localeCompare(b.key));
    if (!ready.length) throw Error("Template dependencies contain a cycle.");
    for (const item of ready) { ordered.push(item); remaining.delete(item.key); }
  }
  const phaseIds = new Map<string, string>();
  for (const [index, phase] of preview.entries()) {
    const id = uid(); phaseIds.set(phase.key, id);
    next.phases.push({ id, projectId, name: phase.name.trim(), weight: 1, order: index } satisfies Phase);
  }
  const ids = new Map(all.map((item) => [item.key, uid()]));
  const phaseByKey = new Map(preview.flatMap((phase) => phase.activities.map((item) => [item.key, phase.key] as const)));
  const dates = new Map<string, { start: string; finish: string }>();
  const first = onOrAfter(calendar, project.start);
  for (const item of ordered) {
    let start = first;
    for (const predecessor of item.predecessors) {
      const finish = dates.get(predecessor)!.finish;
      const bound = workOffset(calendar, finish, 1);
      if (bound > start) start = bound;
    }
    const finish = finishFromStart(calendar, start, item.durationWorkingDays);
    dates.set(item.key, { start, finish });
    if (item.kind === "task") {
      const now = new Date().toISOString();
      next.tasks.push({ id: ids.get(item.key)!, projectId, phaseId: phaseIds.get(phaseByKey.get(item.key)!)!,
        name: item.name.trim(), description: "", assigneeId: "", start, due: finish, progress: 0,
        status: "Not Started", priority: "Normal", dependencies: [], allocation: 0,
        trade: item.trade, notes: "", attachments: [], comments: [], createdAt: now, updatedAt: now } satisfies Task);
    } else {
      next.milestones.push({ id: ids.get(item.key)!, projectId, name: item.name.trim(), due: start, taskId: "" } satisfies Milestone);
    }
  }
  const links: DependencyLink[] = all.flatMap((item) => item.predecessors.map((key) => {
    const predecessor = all.find((row) => row.key === key)!;
    return { id: uid(), projectId,
      predecessor: { kind: predecessor.kind, id: ids.get(key)! } satisfies NodeRef,
      successor: { kind: item.kind, id: ids.get(item.key)! } satisfies NodeRef,
      type: "FS", lagWorkingDays: 0, createdAt: new Date().toISOString() };
  }));
  validateLinks(next, projectId, links);
  const planning: ProjectPlanning = {
    projectId, enabled: true, calendar, approvedRevision: 0,
    baselineStatus: "Unset", baselineHistory: [],
    taskPlanning: all.filter((item) => item.kind === "task").map((item) => ({
      taskId: ids.get(item.key)!, durationWorkingDays: item.durationWorkingDays, scheduleRole: "work" })),
    milestonePlanning: all.filter((item) => item.kind === "milestone").map((item) => ({
      milestoneId: ids.get(item.key)!, completionCondition: item.completionCondition ?? { kind: "Manual" } })),
    links, proposals: [],
  };
  next.planningVersion = 1; next.planning ??= []; next.planning.push(planning);
  next.activities.unshift({ id: uid(), actorId, action: "Fit-out plan initialized", entityType: "Project",
    entityId: projectId, projectId, timestamp: new Date().toISOString(),
    summary: `${next.tasks.filter((row) => row.projectId === projectId).length} task records and ${next.milestones.filter((row) => row.projectId === projectId).length} milestones created from reviewed template.` });
  Object.assign(db, next);
}
