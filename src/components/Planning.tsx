import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "../store";
import type { Milestone, Phase, Task } from "../domain/model";
import { addDays, days, today, dateLabel, phaseProgress, taskProgress, overdue } from "../domain/logic";
import { blankTask } from "../domain/seed";
import { Header, Badge, Progress, personName, Empty, Modal } from "./ui";
import {
  approveScheduleProposal,
  captureScheduleBaseline,
  completeManualMilestone,
  draftMilestoneCreation,
  draftScheduleProposal,
  getPlanningView,
  getProjectPlanning,
  instantiateFitOutTemplate,
  previewFitOutTemplate,
  rejectScheduleProposal,
  submitScheduleProposal,
  type FitOutTemplatePreview,
  type PlanningNodeView,
  type ProjectCalendar,
} from "../planning";
import { uid } from "../domain/logic";

type Row = { phase: Phase } | { task: Task } | { milestone: Milestone };
type Scale = "Day" | "Week" | "Month";
const scales: Record<Scale, { span: number; dayWidth: number; step: number }> = {
  Day: { span: 21, dayWidth: 44, step: 14 },
  Week: { span: 56, dayWidth: 24, step: 14 },
  Month: { span: 180, dayWidth: 10, step: 60 },
};
const chartGutter = 16;

export function Planning({ projectId, onTask, filteredIds }: {
  projectId?: string;
  onTask: (task: Task) => void;
  filteredIds?: string[];
}) {
  const { db, mutate } = useStore();
  const [selected, setSelected] = useState(projectId || db.projects[0]?.id || "");
  const [scale, setScale] = useState<Scale>("Week");
  const [anchor, setAnchor] = useState(today());
  const [zoom, setZoom] = useState(1);
  const [showLinks, setShowLinks] = useState(true);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [assignee, setAssignee] = useState("");
  const [mobilePane, setMobilePane] = useState<"Tasks" | "Timeline">("Tasks");
  const [reason, setReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [leadConfirmedId, setLeadConfirmedId] = useState("");
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneDate, setMilestoneDate] = useState(today());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarHoliday, setCalendarHoliday] = useState("");
  const [calendarClosure, setCalendarClosure] = useState("");
  const [calendarDraft, setCalendarDraft] = useState<ProjectCalendar | null>(null);
  const [templatePreview, setTemplatePreview] = useState<FitOutTemplatePreview | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [manualMilestoneReason, setManualMilestoneReason] = useState("");
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [chartBodyHeight, setChartBodyHeight] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef(new Map<string, HTMLButtonElement>());
  const config = scales[scale];
  const width = Math.round(config.dayWidth * zoom);
  const chartWidth = config.span * width + chartGutter;
  const project = db.projects.find((item) => item.id === selected);
  const canApplyTemplate = !!project &&
    !db.phases.some((item) => item.projectId === selected) &&
    !db.tasks.some((item) => item.projectId === selected) &&
    !db.milestones.some((item) => item.projectId === selected) &&
    !db.planning?.some((item) => item.projectId === selected);
  const planning = selected && project ? getPlanningView(db, selected, today()) : undefined;
  const projectPlanning = selected && project ? getProjectPlanning(db, selected) : undefined;
  const nodeView = new Map(planning?.nodes.map((item) => [item.node.kind + ":" + item.node.id, item]) ?? []);
  const actorId = project?.managerId || "";
  const phases = db.phases.filter((item) => item.projectId === selected).sort((a, b) => a.order - b.order);
  const tasks = db.tasks.filter((item) => item.projectId === selected && (!assignee || item.assigneeId === assignee) && (!filteredIds || filteredIds.includes(item.id)));
  const milestones = db.milestones.filter((item) => item.projectId === selected);
  const rows: Row[] = [];
  const seen = new Set<string>();
  const appendTask = (task: Task) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    rows.push({ task });
    tasks.filter((candidate) => candidate.parentId === task.id).forEach(appendTask);
  };
  phases.forEach((phase) => {
    rows.push({ phase });
    if (collapsed.includes(phase.id)) return;
    tasks.filter((task) => task.phaseId === phase.id && !task.parentId).forEach(appendTask);
    tasks.filter((task) => task.phaseId === phase.id).forEach(appendTask);
  });
  const phaseIds = new Set(phases.map((phase) => phase.id));
  tasks.filter((task) => !seen.has(task.id) && !phaseIds.has(task.phaseId)).forEach(appendTask);
  milestones.forEach((milestone) => rows.push({ milestone }));
  const linkKey = planning?.links.map((link) => link.id + ":" + link.type + ":" + link.predecessor.id + ":" + link.successor.id).join("|") || "";
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const selectedLinks = planning?.links.filter((link) => link.predecessor.id === selectedTaskId || link.successor.id === selectedTaskId) ?? [];
  const linkedTaskIds = new Set(selectedLinks.flatMap((link) => [link.predecessor.id, link.successor.id]));
  const approvedFinish = planning?.approvedFinish;
  const riskCount = tasks.filter((task) => overdue(task) || task.status === "Blocked").length;
  const issueCount = (planning?.warnings.length || 0) + (planning?.blockers.length || 0) + (planning?.conflicts.length || 0);
  const todayOffset = days(anchor, today());

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart || !showLinks) return;
    const measure = () => {
      setChartBodyHeight(chart.scrollHeight);
      const origin = chart.getBoundingClientRect();
      const next: { id: string; d: string }[] = [];
      planning?.links.forEach((link) => {
          const from = barRefs.current.get(link.predecessor.id);
          const to = barRefs.current.get(link.successor.id);
          if (!from || !to) return;
          const a = from.getBoundingClientRect();
          const b = to.getBoundingClientRect();
          const sourceSide = link.type === "FS" || link.type === "FF" ? "right" : "left";
          const targetSide = link.type === "FS" || link.type === "SS" ? "left" : "right";
          const x1 = (sourceSide === "right" ? a.right : a.left) - origin.left - paneWidth();
          const x2 = (targetSide === "right" ? b.right : b.left) - origin.left - paneWidth();
          const y1 = a.top + a.height / 2 - origin.top;
          const y2 = b.top + b.height / 2 - origin.top;
          const direction = y2 >= y1 ? 1 : -1;
          const sourceRow = from.closest(".gantt-row")!.getBoundingClientRect();
          const targetRow = to.closest(".gantt-row")!.getBoundingClientRect();
          const sourceExitY = (direction > 0 ? sourceRow.bottom - 2 : sourceRow.top + 2) - origin.top;
          const targetEntryY = (direction > 0 ? targetRow.top + 2 : targetRow.bottom - 2) - origin.top;
          const sourceStub = x1 + (sourceSide === "right" ? 9 : -9);
          const targetStub = x2 + (targetSide === "right" ? 9 : -9);
          let lane = sourceSide === "right" && targetSide === "left" && x2 - x1 >= 32
            ? (x1 + x2) / 2
            : sourceSide === "left" ? Math.max(2, Math.min(x1, x2) - 18) : Math.max(x1, x2) + 18;
          const between = [...barRefs.current.values()].map((bar) => bar.getBoundingClientRect())
            .filter((rect) => rect.top > Math.min(a.top, b.top) && rect.top < Math.max(a.top, b.top));
          if (between.some((rect) => lane >= rect.left - origin.left - paneWidth() - 5 && lane <= rect.right - origin.left - paneWidth() + 5)) {
            lane = Math.max(x1, x2, ...between.map((rect) => rect.right - origin.left - paneWidth())) + 18;
          }
          next.push({ id: link.id, d: `M${x1} ${y1} H${sourceStub} V${sourceExitY} H${lane} V${targetEntryY} H${targetStub} V${y2} H${x2}` });
      });
      setPaths(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(chart);
    measure();
    return () => observer.disconnect();
  }, [db, selected, linkKey, rows.length, width, scale, anchor, showLinks, mobilePane, collapsed, assignee]);

  useLayoutEffect(() => {
    if (headingRef.current && ganttRef.current) headingRef.current.scrollLeft = ganttRef.current.scrollLeft;
  }, [width, scale, selected, mobilePane]);

  function paneWidth() {
    return parseFloat(getComputedStyle(chartRef.current!).getPropertyValue("--gantt-pane")) || 0;
  }
  function bar(node: Task | Milestone, isMilestone: boolean) {
    const start = isMilestone ? (node as Milestone).due : (node as Task).start;
    const finish = isMilestone ? (node as Milestone).due : (node as Task).due;
    const first = days(anchor, start);
    const last = days(anchor, finish);
    if (last < 0 || first >= config.span) return null;
    const barWidth = isMilestone ? Math.max(18, width) : Math.max(width / 2, (Math.min(config.span - 1, last) - Math.max(0, first) + 1) * width);
    const barLeft = Math.max(0, first) * width + (isMilestone ? (width - barWidth) / 2 : 0);
    const shortBar = !isMilestone && barWidth < 100;
    const label = `${isMilestone ? "Milestone" : "Task"} ${node.name}. Approved ${dateLabel(start)} to ${dateLabel(finish)}.${isMilestone ? "" : ` Reported progress ${(node as Task).progress}%.`}`;
    const projection = nodeView.get((isMilestone ? "milestone:" : "task:") + node.id);
    const accessibleDates = `${projection?.baseline ? ` Baseline ${dateLabel(projection.baseline.start)} to ${dateLabel(projection.baseline.finish)}.` : " Baseline not captured."}${projection?.proposed ? ` Proposed ${dateLabel(projection.proposed.start)} to ${dateLabel(projection.proposed.finish)}; not approved.` : " No active proposed date."}`;
    const taskMetadata = !isMilestone ? projectPlanning?.taskPlanning.find((item) => item.taskId === node.id) : undefined;
    const blocking = planning?.blockers.filter((item) => item.node?.id === node.id && item.node.kind === (isMilestone ? "milestone" : "task")) ?? [];
    const overlay = (dates: PlanningNodeView["baseline"] | PlanningNodeView["proposed"], kind: "baseline" | "proposed") => {
      if (!dates || days(anchor, dates.finish) < 0 || days(anchor, dates.start) >= config.span) return null;
      return <span className={`gantt-overlay ${kind}`} title={`${kind === "baseline" ? "Baseline" : "Proposed"} ${dateLabel(dates.start)} to ${dateLabel(dates.finish)}`}
        style={{ left: Math.max(0, days(anchor, dates.start)) * width,
          width: Math.max(width / 2, (Math.min(config.span - 1, days(anchor, dates.finish)) - Math.max(0, days(anchor, dates.start)) + 1) * width) }} />;
    };
    return <>
      {overlay(projection?.baseline, "baseline")}
      {overlay(projection?.proposed, "proposed")}
      {taskMetadata?.actualStart && days(anchor, taskMetadata.actualStart) >= 0 && days(anchor, taskMetadata.actualStart) < config.span && <span className="gantt-actual-tick" style={{ left: days(anchor, taskMetadata.actualStart) * width }} title={`Actual start ${dateLabel(taskMetadata.actualStart)}`}>A</span>}
      {taskMetadata?.actualFinish && days(anchor, taskMetadata.actualFinish) >= 0 && days(anchor, taskMetadata.actualFinish) < config.span && <span className="gantt-actual-tick finish" style={{ left: days(anchor, taskMetadata.actualFinish) * width }} title={`Actual finish ${dateLabel(taskMetadata.actualFinish)}`}>F</span>}
      <button key={node.id} ref={(element) => { if (element) barRefs.current.set(node.id, element); else barRefs.current.delete(node.id); }}
      type="button" className={`gantt-bar ${isMilestone ? "milestone" : ""} ${shortBar ? "short" : ""} ${!isMilestone && selectedTaskId === node.id ? "selected" : ""} ${!isMilestone && selectedTaskId && linkedTaskIds.has(node.id) && selectedTaskId !== node.id ? "linked" : ""} ${projection?.critical && planning?.criticalPathFeasible ? "critical" : ""} ${!isMilestone && (overdue(node as Task) || (node as Task).status === "Blocked") ? "risk" : ""}`}
      style={{ left: barLeft, width: barWidth }} data-task-id={!isMilestone ? node.id : undefined} data-full-label={node.name} aria-label={label + accessibleDates + (!isMilestone && selectedTaskId === node.id ? " Selected in timeline." : "") + (taskMetadata?.actualStart ? ` Actual start ${dateLabel(taskMetadata.actualStart)}.` : "") + (taskMetadata?.actualFinish ? ` Actual finish ${dateLabel(taskMetadata.actualFinish)}.` : "") + (projection?.critical && planning?.criticalPathFeasible ? " Approved critical path." : "") + (blocking.length ? ` ${blocking.length} operational blockers.` : "")} title={label + accessibleDates}
      onFocus={(event) => { if (!isMilestone && event.currentTarget.matches(":focus-visible")) setSelectedTaskId(node.id); }}
      onClick={() => { if (isMilestone) setSelectedMilestoneId(node.id); else { setSelectedTaskId(node.id); onTask(node as Task); } }}>
      {!isMilestone && <i style={{ width: taskProgress(db, node as Task) + "%" }} />}
      <span aria-hidden="true">{isMilestone ? "◆" : shortBar ? "" : node.name}</span>
      </button>
      {!isMilestone && (projection?.critical && planning?.criticalPathFeasible || blocking.length > 0) && <span className="gantt-status-text" style={{ left: Math.max(0, first) * width }}>{projection?.critical && planning?.criticalPathFeasible ? "Approved critical" : ""}{blocking.length ? " · Blocked" : ""}</span>}
    </>;
  }

  return <>
    <Header title="Planning & Timeline" description="Review approved programme dates, handoffs and project milestones."
      action={<button className="primary" onClick={() => {
        if (!project) return;
        if (!phases.length) { window.alert("Add a project phase before creating a task."); return; }
        onTask(blankTask(project.id, phases[0].id, project.managerId));
      }}>+ Add Task</button>} />
    <section className="planning-summary" aria-label="Programme summary">
      <div><small>Approved finish</small><strong>{approvedFinish ? dateLabel(approvedFinish) : "No dates"}</strong></div>
      <div><small>Project target</small><strong>{project ? dateLabel(project.due) : "Not set"}</strong></div>
      <div><small>Baseline finish</small><strong>{planning?.baselineFinish ? dateLabel(planning.baselineFinish) : "Not captured"}</strong></div>
      <div><small>Planning progress</small><strong>{planning?.planningProgress ?? 0}%</strong></div>
    </section>
    <div className="planning-mobile-switch" role="group" aria-label="Mobile programme view">
      <button type="button" aria-pressed={mobilePane === "Tasks"} onClick={() => setMobilePane("Tasks")}>Tasks</button>
      <button type="button" aria-pressed={mobilePane === "Timeline"} onClick={() => setMobilePane("Timeline")}>Timeline</button>
    </div>
    <div className="planning-toolbar" role="group" aria-label="Timeline controls">
      {!projectId && <select aria-label="Planning project" value={selected} onChange={(event) => setSelected(event.target.value)}>{db.projects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>}
      <select aria-label="Timeline scale" value={scale} onChange={(event) => setScale(event.target.value as Scale)}>{(["Day", "Week", "Month"] as const).map((item) => <option key={item}>{item}</option>)}</select>
      <button type="button" onClick={() => setAnchor(addDays(anchor, -config.step))}>← Previous</button>
      <button type="button" onClick={() => setAnchor(today())}>Today</button>
      <button type="button" onClick={() => setAnchor(addDays(anchor, config.step))}>Next →</button>
      <button type="button" aria-label="Zoom in" onClick={() => setZoom(Math.min(2, zoom + 0.25))}>Zoom +</button>
      <button type="button" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>Zoom −</button>
      <select aria-label="Planning assignee filter" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">All assignees</option>{db.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
      <label className="inline"><input type="checkbox" checked={showLinks} onChange={(event) => setShowLinks(event.target.checked)} /> Dependencies</label>
      <button type="button" onClick={() => { setCalendarDraft(planning ? structuredClone(planning.calendar) : null); setCalendarOpen(!calendarOpen); }} aria-expanded={calendarOpen}>Calendar</button>
      <button type="button" onClick={() => setTemplatePreview(previewFitOutTemplate())}>Fit-out template</button>
      <button type="button" onClick={() => document.getElementById("planning-review")?.scrollIntoView({ block: "start" })}>Review proposals{planning?.activeProposal ? " · 1 active" : ""}</button>
    </div>
    {templatePreview && <section className="planning-edit-panel planning-template" aria-label="Editable fit-out template preview">
      <div className="planning-review-head"><div><small>Review before instantiation</small><h2>Twelve-phase fit-out template</h2></div><button type="button" onClick={() => setTemplatePreview(null)}>Close preview</button></div>
      <p className="muted">Review activity names, durations and parallel predecessor branches. Preview edits do not create task records.</p>
      {!canApplyTemplate && <p role="status" className="planning-lead-note">This project already has a plan. Applying this template would duplicate task records, so it is available for review only. Create an empty project to instantiate it.</p>}
      {templatePreview.map((phase, phaseIndex) => <details key={phase.key} className="planning-template-phase" open={phaseIndex === 0}>
        <summary>{String(phaseIndex + 1).padStart(2, "0")} {phase.name} · {phase.activities.length} activities</summary>
        <label>Phase name<input value={phase.name} onChange={(event) => setTemplatePreview(templatePreview.map((item, index) => index === phaseIndex ? { ...item, name: event.target.value } : item))} /></label>
        {phase.activities.map((activity, activityIndex) => <div className="planning-template-activity" key={activity.key}>
          <label>Activity name<input value={activity.name} onChange={(event) => setTemplatePreview(templatePreview.map((item, index) => index === phaseIndex ? { ...item, activities: item.activities.map((entry, position) => position === activityIndex ? { ...entry, name: event.target.value } : entry) } : item))} /></label>
          <label>Type<input value={activity.kind === "milestone" ? "Milestone" : "Task"} readOnly /></label>
          {activity.kind === "task" && <label>Working days<input type="number" min={1} step={1} value={activity.durationWorkingDays} onChange={(event) => setTemplatePreview(templatePreview.map((item, index) => index === phaseIndex ? { ...item, activities: item.activities.map((entry, position) => position === activityIndex ? { ...entry, durationWorkingDays: Number(event.target.value) } : entry) } : item))} /></label>}
          <label>Predecessors<select multiple aria-label={`Predecessors for ${activity.name}`} value={activity.predecessors} onChange={(event) => setTemplatePreview(templatePreview.map((item, index) => index === phaseIndex ? { ...item, activities: item.activities.map((entry, position) => position === activityIndex ? { ...entry, predecessors: Array.from(event.target.selectedOptions, (option) => option.value) } : entry) } : item))}>
            {templatePreview.flatMap((item) => item.activities).filter((entry) => entry.key !== activity.key).map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
          </select></label>
          <button type="button" aria-label={`Remove ${activity.name}`} onClick={() => setTemplatePreview(templatePreview.map((item) => ({ ...item, activities: item.activities.filter((entry) => entry.key !== activity.key).map((entry) => ({ ...entry, predecessors: entry.predecessors.filter((key) => key !== activity.key) })) })))}>Remove</button>
        </div>)}
        <button type="button" onClick={() => setTemplatePreview(templatePreview.map((item, index) => index === phaseIndex ? { ...item, activities: [...item.activities, { key: "draft-" + uid(), name: "New activity", kind: "task", durationWorkingDays: 1, trade: "Other", predecessors: [] }] } : item))}>+ Add activity</button>
      </details>)}
      <button type="button" className="primary" disabled={!canApplyTemplate} onClick={() => {
        const saved = mutate((next) => { instantiateFitOutTemplate(next, selected, templatePreview, actorId); }, "Fit-out template instantiated");
        if (saved) setTemplatePreview(null);
      }}>Confirm template for this empty project</button>
    </section>}
    {calendarOpen && calendarDraft && <section className="planning-edit-panel" aria-label="Project working calendar">
      <h2>Working calendar</h2>
      <p className="muted">Calendar changes create a proposal. Existing approved dates stay in place until a Project Manager approves it.</p>
      <div className="planning-calendar-days" role="group" aria-label="Working weekdays">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => <label key={day}><input type="checkbox" checked={calendarDraft.workingWeekdays.includes(index + 1)} onChange={(event) => setCalendarDraft({ ...calendarDraft, workingWeekdays: event.target.checked ? [...calendarDraft.workingWeekdays, index + 1].sort() : calendarDraft.workingWeekdays.filter((value) => value !== index + 1) })} /> {day}</label>)}
      </div>
      <div className="planning-calendar-fields">
        <label>Timezone<input value={calendarDraft.timezone} onChange={(event) => setCalendarDraft({ ...calendarDraft, timezone: event.target.value })} /></label>
        <label>Workday start<input type="time" value={calendarDraft.workdayStart} onChange={(event) => setCalendarDraft({ ...calendarDraft, workdayStart: event.target.value })} /></label>
        <label>Workday end<input type="time" value={calendarDraft.workdayEnd} onChange={(event) => setCalendarDraft({ ...calendarDraft, workdayEnd: event.target.value })} /></label>
        <label>Add holiday<input type="date" value={calendarHoliday} onChange={(event) => setCalendarHoliday(event.target.value)} /></label>
        <label>Add project nonworking date<input type="date" value={calendarClosure} onChange={(event) => setCalendarClosure(event.target.value)} /></label>
      </div>
      <div className="planning-calendar-dates"><strong>Holidays:</strong> {calendarDraft.holidays.length ? calendarDraft.holidays.map((date) => <span key={date}>{date} <button type="button" aria-label={`Remove holiday ${date}`} onClick={() => setCalendarDraft({ ...calendarDraft, holidays: calendarDraft.holidays.filter((item) => item !== date) })}>×</button></span>) : "None set"}</div>
      <button type="button" onClick={() => { if (calendarHoliday) setCalendarDraft({ ...calendarDraft, holidays: [...new Set([...calendarDraft.holidays, calendarHoliday])].sort() }); setCalendarHoliday(""); }}>Add holiday</button>{" "}
      <div className="planning-calendar-dates"><strong>Project nonworking dates:</strong> {calendarDraft.projectNonworkingDates.length ? calendarDraft.projectNonworkingDates.map((date) => <span key={date}>{date} <button type="button" aria-label={`Remove project nonworking date ${date}`} onClick={() => setCalendarDraft({ ...calendarDraft, projectNonworkingDates: calendarDraft.projectNonworkingDates.filter((item) => item !== date) })}>×</button></span>) : "None set"}</div>
      <button type="button" onClick={() => { if (calendarClosure) setCalendarDraft({ ...calendarDraft, projectNonworkingDates: [...new Set([...calendarDraft.projectNonworkingDates, calendarClosure])].sort() }); setCalendarClosure(""); }}>Add nonworking date</button>{" "}
      <button type="button" disabled={!planning?.nodes.length || reason.trim().length < 3} onClick={() => {
        const node = planning?.nodes[0]?.node;
        if (node) mutate((next) => { draftScheduleProposal(next, { projectId: selected, initiatingNode: node, actorId, reason, edit: { calendar: calendarDraft } }); }, "Working calendar proposal drafted");
      }}>Draft calendar change</button>
    </section>}
    {riskCount > 0 && <p className="planning-warning" role="status"><Badge>{riskCount} tasks need attention</Badge> Review blocked or overdue activities before proposing a date.</p>}
    {issueCount > 0 && <details className="planning-issues"><summary>{issueCount} planning warnings, blockers or conflicts</summary><ul>
      {planning?.conflicts.map((issue, index) => <li key={"c" + index}><strong>Conflict:</strong> {issue.detail}</li>)}
      {planning?.warnings.map((issue, index) => <li key={"w" + index}><strong>Warning:</strong> {issue.detail}</li>)}
      {planning?.blockers.map((issue, index) => <li key={"b" + index}><strong>{issue.code}:</strong> {issue.detail}</li>)}
    </ul><p className="muted">Operational blockers are separate from schedule links and never move dates automatically.</p></details>}
    <p className="muted planning-range">{dateLabel(anchor)} – {dateLabel(addDays(anchor, config.span - 1))}. Dates change only after project manager approval.
      {selectedTask && <> <strong>Selected: {selectedTask.name}</strong> · {selectedLinks.length} connected handoffs. <button type="button" onClick={() => setSelectedTaskId("")}>Clear chart selection</button></>}
    </p>
    <div className={`gantt-shell ${mobilePane === "Timeline" ? "show-mobile-timeline" : ""}`}>
      <div className="gantt-heading-viewport" ref={headingRef}>
        <div className="gantt-inner" style={{ "--gantt-chart-width": chartWidth + "px" } as CSSProperties}>
        <div className="gantt-row gantt-heading">
          <div className="gantt-info gantt-table-head"><span>Task / phase</span><span>Assigned</span><span>Approved dates</span><span>Progress</span></div>
          <div className="gantt-date-head" style={{ width: chartWidth }}>
            {Array.from({ length: config.span }, (_, index) => {
              const date = addDays(anchor, index);
              const boundary = scale === "Day" || index === 0 || (scale === "Week" ? new Date(date + "T12:00:00Z").getUTCDay() === 1 : date.slice(8) === "01");
              return <span key={date} data-date={date} className={boundary ? "group-start" : ""} style={{ width }}><b>{scale === "Day" ? date.slice(8) : boundary ? scale === "Week" ? dateLabel(date).slice(0, 6) : date.slice(0, 7) : ""}</b>{scale === "Day" && <small>{new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short" })}</small>}</span>;
            })}
          </div>
        </div>
        </div>
      </div>
      <div className={`gantt ${mobilePane === "Timeline" ? "show-mobile-timeline" : ""}`} ref={ganttRef} onScroll={(event) => { if (headingRef.current) headingRef.current.scrollLeft = event.currentTarget.scrollLeft; }} aria-label="Project programme" role="region" tabIndex={0}>
        <div className="gantt-inner" style={{ "--gantt-chart-width": chartWidth + "px" } as CSSProperties}>
        <div className="gantt-body" ref={chartRef}>
          {rows.map((row) => {
            const key = "phase" in row ? row.phase.id : "task" in row ? row.task.id : row.milestone.id;
            return <div className={`gantt-row ${"phase" in row ? "phase-row" : ""} ${"task" in row && selectedTaskId === key ? "selected-row" : ""} ${"task" in row && selectedTaskId && linkedTaskIds.has(key) && selectedTaskId !== key ? "linked-row" : ""}`} key={key} data-row-id={key}>
              <div className="gantt-info">
                {"phase" in row ? <button className="gantt-phase" type="button" aria-expanded={!collapsed.includes(row.phase.id)} onClick={() => setCollapsed(collapsed.includes(row.phase.id) ? collapsed.filter((id) => id !== row.phase.id) : [...collapsed, row.phase.id])}><span>{collapsed.includes(row.phase.id) ? "▸" : "▾"} {String(row.phase.order + 1).padStart(2, "0")} {row.phase.name}</span><Progress value={phaseProgress(db, row.phase.id)} /></button> :
                  "task" in row ? <button className="gantt-task" type="button" title={row.task.name} onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setSelectedTaskId(row.task.id); }} onClick={() => { setSelectedTaskId(row.task.id); onTask(row.task); }} aria-label={`Open task ${row.task.name}. Approved ${dateLabel(row.task.start)} to ${dateLabel(row.task.due)}. ${planning?.links.filter((link) => link.successor.kind === "task" && link.successor.id === row.task.id).length || 0} predecessors.${selectedTaskId === row.task.id ? " Selected in timeline." : ""}`}><span className="gantt-name"><strong>{row.task.parentId ? "↳ " : ""}{row.task.name}</strong>{nodeView.get("task:" + row.task.id)?.critical && planning?.criticalPathFeasible && <small className="gantt-inline-status">Approved critical path</small>}<small className="mobile-dates">{dateLabel(row.task.start)} → {dateLabel(row.task.due)} · {personName(db, row.task.assigneeId)}</small></span><span>{personName(db, row.task.assigneeId).split(" ")[0]}</span><span>{row.task.start.slice(5)} → {row.task.due.slice(5)}</span><Progress value={taskProgress(db, row.task)} /></button> :
                  <button className="gantt-milestone-info" type="button" onClick={() => setSelectedMilestoneId(row.milestone.id)}><span className="gantt-name"><strong>◆ {row.milestone.name}</strong><small>Milestone{row.milestone.taskId ? ` · linked to ${db.tasks.find((task) => task.id === row.milestone.taskId)?.name || "task"}` : ""}</small></span><span>—</span><span>{row.milestone.due.slice(5)}</span><span>Event</span></button>}
              </div>
              <div className="gantt-track" style={{ width: chartWidth, backgroundSize: width + "px 100%" }}>
                {todayOffset >= 0 && todayOffset < config.span && <span className="gantt-today" style={{ left: todayOffset * width }} title="Today" />}
                {"task" in row ? bar(row.task, false) : "milestone" in row ? bar(row.milestone, true) : null}
              </div>
            </div>;
          })}
          {showLinks && <svg className="dependency-lines" width={chartWidth} height={chartBodyHeight} style={{ left: "var(--gantt-pane)" }} aria-hidden="true"><defs><marker id="planning-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3.5 L0 7" fill="#745a37" /></marker><marker id="planning-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8" fill="#7b2510" /></marker></defs>{paths.map((path) => {
            const link = planning?.links.find((item) => item.id === path.id);
            const active = !!selectedTaskId && !!link && (link.predecessor.id === selectedTaskId || link.successor.id === selectedTaskId);
            return <path key={path.id} d={path.d} className={`dependency-path ${active ? "selected" : selectedTaskId ? "subdued" : ""}`} data-link-id={path.id} data-link-type={link?.type} data-selected={active ? "true" : "false"} data-from={link?.predecessor.id} data-to={link?.successor.id} markerEnd={`url(#${active ? "planning-arrow-active" : "planning-arrow"})`} />;
          })}</svg>}
        </div>
      </div>
      </div>
    </div>
    {!tasks.length && <Empty>No tasks in this programme. Add a task to begin.</Empty>}
    {selectedMilestoneId && (() => {
      const milestone = db.milestones.find((item) => item.id === selectedMilestoneId);
      if (!milestone) return null;
      const projection = nodeView.get("milestone:" + milestone.id);
      const condition = projectPlanning?.milestonePlanning.find((item) => item.milestoneId === milestone.id)?.completionCondition;
      const linkedTask = db.tasks.find((item) => item.id === milestone.taskId);
      return <Modal title={`Milestone: ${milestone.name}`} onClose={() => { setSelectedMilestoneId(""); setManualMilestoneReason(""); }}>
        <p><strong>Approved event:</strong> {dateLabel(milestone.due)}</p>
        <p><strong>Baseline:</strong> {projection?.baseline ? dateLabel(projection.baseline.start) : "Not captured"}</p>
        <p><strong>Proposed:</strong> {projection?.proposed ? dateLabel(projection.proposed.start) : "None"}</p>
        <p><strong>Completion condition:</strong> {condition?.kind || "Manual"}</p>
        <p><strong>Condition state:</strong> {projection?.completionSatisfied ? "Satisfied" : "Pending"}. An event date alone does not complete this milestone.</p>
        {planning?.blockers.filter((item) => item.node?.kind === "milestone" && item.node.id === milestone.id).map((item, index) => <p key={index} role="status">{item.detail}</p>)}
        {condition?.kind === "Manual" && !projection?.completionSatisfied && <div className="planning-manual-completion">
          <label>Project Manager confirmation reason<input value={manualMilestoneReason} minLength={3} onChange={(event) => setManualMilestoneReason(event.target.value)} placeholder="Record the explicit condition check" /></label>
          <button type="button" disabled={manualMilestoneReason.trim().length < 3} onClick={() => {
            const saved = mutate((next) => { completeManualMilestone(next, milestone.id, actorId, manualMilestoneReason); }, "Manual milestone condition confirmed");
            if (saved) { setSelectedMilestoneId(""); setManualMilestoneReason(""); }
          }}>Confirm manual milestone condition</button>
        </div>}
        {linkedTask && <button type="button" onClick={() => { setSelectedMilestoneId(""); setManualMilestoneReason(""); onTask(linkedTask); }}>Open linked task</button>}
      </Modal>;
    })()}
    <section className="planning-review" id="planning-review" aria-label="Schedule proposal review">
      <div className="planning-review-head">
        <div><small>Project Manager decision desk</small><h2>Schedule review</h2></div>
        <span className="badge">{planning?.activeProposal ? planning.activeProposal.status : "No active proposal"}</span>
      </div>
      <p className="muted">The designated Project Manager is the demo approver. This browser-local identity is not secure authentication.</p>
      <label className="planning-reason">Reason for proposal or baseline capture
        <input value={reason} minLength={3} onChange={(event) => setReason(event.target.value)} placeholder="Describe the site or handoff change" />
      </label>
      <div className="planning-review-actions">
        <button type="button" disabled={!project || reason.trim().length < 3} onClick={() => mutate((next) => { captureScheduleBaseline(next, selected, actorId, reason); }, "Planning baseline captured")}>
          {planning?.baselineStatus === "Captured" ? "Capture new baseline revision" : "Capture baseline"}
        </button>
      </div>
      <form className="planning-milestone-form" onSubmit={(event) => {
        event.preventDefault();
        if (!project) return;
        const saved = mutate((next) => { draftMilestoneCreation(next, { id: uid(), projectId: selected, name: milestoneName.trim(), due: milestoneDate, taskId: "" }, reason, actorId); }, "Milestone proposal drafted");
        if (saved) setMilestoneName("");
      }}>
        <h3>Add milestone by proposal</h3>
        <label>Milestone name<input required minLength={2} value={milestoneName} onChange={(event) => setMilestoneName(event.target.value)} /></label>
        <label>Event date<input required type="date" value={milestoneDate} onChange={(event) => setMilestoneDate(event.target.value)} /></label>
        <button type="submit" disabled={reason.trim().length < 3}>Draft milestone</button>
      </form>
      {planning?.activeProposal ? <div className="planning-proposal">
        <h3>Proposal revision {planning.activeProposal.revision} · {planning.activeProposal.status}</h3>
        <p><strong>Reason:</strong> {planning.activeProposal.reason}</p>
        <p><strong>Approved finish:</strong> {approvedFinish ? dateLabel(approvedFinish) : "Not set"} · <strong>Proposed finish:</strong> {planning.proposedFinish ? dateLabel(planning.proposedFinish) : "No change"} · <strong>Target:</strong> {planning.targetFinish ? dateLabel(planning.targetFinish) : "Not set"}</p>
        <div className="planning-review-table-wrap"><table className="planning-review-table"><thead><tr><th scope="col">Activity</th><th scope="col">Cause</th><th scope="col">Approved</th><th scope="col">Proposed</th></tr></thead><tbody>
          {planning.activeProposal.changes.map((change) => <tr key={change.node.kind + change.node.id}><th scope="row">{nodeView.get(change.node.kind + ":" + change.node.id)?.name || change.node.id}</th><td>{change.cause}</td><td>{dateLabel(change.before.start)} – {dateLabel(change.before.finish)}</td><td>{dateLabel(change.after.start)} – {dateLabel(change.after.finish)}</td></tr>)}
          {!planning.activeProposal.changes.length && <tr><td colSpan={4}>No approved dates change in this proposal. Review link, calendar or new-event details before submission.</td></tr>}
        </tbody></table></div>
        {planning.activeProposal.unchangedSuccessors.length > 0 && <p className="muted">Float absorbed the change for: {planning.activeProposal.unchangedSuccessors.map((node) => nodeView.get(node.kind + ":" + node.id)?.name || node.id).join(", ")}.</p>}
        {planning.activeProposal.proposedTask && <p><strong>New task on approval:</strong> {planning.activeProposal.proposedTask.name}</p>}
        {planning.activeProposal.proposedMilestone && <p><strong>New milestone on approval:</strong> {planning.activeProposal.proposedMilestone.name}</p>}
        {planning.activeProposal.conflicts.length > 0 && <ul className="planning-conflicts">{planning.activeProposal.conflicts.map((issue, index) => <li key={index}>Conflict: {issue.detail}</li>)}</ul>}
        {planning.activeProposal.warnings.length > 0 && <ul>{planning.activeProposal.warnings.map((issue, index) => <li key={index}>Warning: {issue.detail}</li>)}</ul>}
        <div className="planning-review-actions">
          {planning.activeProposal.warnings.some((issue) => issue.code === "LeadOverlap") && <label className="planning-lead-check"><input type="checkbox" checked={leadConfirmedId === planning.activeProposal.id} onChange={(event) => setLeadConfirmedId(event.target.checked ? planning.activeProposal!.id : "")} /> I confirm that negative working-day lag allows the successor to overlap its predecessor.</label>}
          {planning.activeProposal.status === "Draft" && <button type="button" disabled={planning.activeProposal.conflicts.length > 0 || (planning.activeProposal.warnings.some((issue) => issue.code === "LeadOverlap") && leadConfirmedId !== planning.activeProposal.id)} onClick={() => mutate((next) => { submitScheduleProposal(next, planning.activeProposal!.id, actorId, leadConfirmedId === planning.activeProposal!.id); }, "Schedule proposal submitted")}>Submit for PM review</button>}
          {planning.activeProposal.status === "Submitted" && <button type="button" className="primary" disabled={planning.activeProposal.conflicts.length > 0} onClick={() => mutate((next) => { approveScheduleProposal(next, planning.activeProposal!.id, actorId); }, "Schedule proposal approved")}>Approve proposal</button>}
          {planning.activeProposal.requestedEdit && <button type="button" onClick={() => mutate((next) => { draftScheduleProposal(next, { projectId: selected, initiatingNode: planning.activeProposal!.initiatingNode, actorId, reason: reason.trim().length >= 3 ? reason : planning.activeProposal!.reason, edit: planning.activeProposal!.requestedEdit!, considerEarlierDates: planning.activeProposal!.considerEarlierDates }); }, "Schedule proposal recalculated")}>Recalculate as new draft</button>}
          <label>Rejection reason<input value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Why was this rejected?" /></label>
          {planning.activeProposal.status === "Submitted" && <button type="button" disabled={decisionReason.trim().length < 3} onClick={() => mutate((next) => { rejectScheduleProposal(next, planning.activeProposal!.id, actorId, decisionReason); }, "Schedule proposal rejected")}>Reject proposal</button>}
        </div>
      </div> : <p className="muted">Edit a task date, dependency, milestone or working calendar to draft a reviewable proposal.</p>}
      {planning && planning.proposals.filter((item) => item.status === "Approved" || item.status === "Rejected" || item.revisedByProposalId).length > 0 && <details><summary>Decision and revision history · {planning.proposals.filter((item) => item.status === "Approved" || item.status === "Rejected" || item.revisedByProposalId).length}</summary><ul>{planning.proposals.filter((item) => item.status === "Approved" || item.status === "Rejected" || item.revisedByProposalId).map((item) => <li key={item.id}>Revision {item.revision}: {item.revisedByProposalId ? "Revised by a later proposal" : item.status} · {item.reason}{item.decisionReason ? " · " + item.decisionReason : ""}</li>)}</ul></details>}
    </section>
    <p className="planning-note">The timeline shows approved dates. Select a task to review its dates and predecessors. Demo project manager actions are browser-local and are not secure authentication.</p>
  </>;
}
