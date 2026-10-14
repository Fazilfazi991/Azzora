import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "../store";
import type { Milestone, Phase, Task } from "../domain/model";
import { addDays, days, today, dateLabel, phaseProgress, taskProgress, overdue } from "../domain/logic";
import { blankTask } from "../domain/seed";
import { Header, Badge, Progress, personName, Empty } from "./ui";
import {
  approveScheduleProposal,
  captureScheduleBaseline,
  draftMilestoneCreation,
  draftScheduleProposal,
  getPlanningView,
  rejectScheduleProposal,
  submitScheduleProposal,
  type PlanningNodeView,
  type ProjectCalendar,
} from "../planning";
import { uid } from "../domain/logic";

type Row = { phase: Phase } | { task: Task } | { milestone: Milestone };
type Scale = "Day" | "Week" | "Month";
const scales: Record<Scale, { span: number; dayWidth: number; step: number }> = {
  Day: { span: 21, dayWidth: 44, step: 14 },
  Week: { span: 84, dayWidth: 19, step: 28 },
  Month: { span: 180, dayWidth: 10, step: 60 },
};

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
  const [calendarDraft, setCalendarDraft] = useState<ProjectCalendar | null>(null);
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef(new Map<string, HTMLButtonElement>());
  const config = scales[scale];
  const width = Math.round(config.dayWidth * zoom);
  const chartWidth = config.span * width;
  const project = db.projects.find((item) => item.id === selected);
  const planning = selected && project ? getPlanningView(db, selected, today()) : undefined;
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
  tasks.filter((task) => !seen.has(task.id)).forEach(appendTask);
  milestones.forEach((milestone) => rows.push({ milestone }));
  const linkKey = planning?.links.map((link) => link.id + ":" + link.predecessor.id + ":" + link.successor.id).join("|") || "";
  const approvedFinish = planning?.approvedFinish;
  const riskCount = tasks.filter((task) => overdue(task) || task.status === "Blocked").length;
  const issueCount = (planning?.warnings.length || 0) + (planning?.blockers.length || 0) + (planning?.conflicts.length || 0);
  const todayOffset = days(anchor, today());

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart || !showLinks) return;
    const measure = () => {
      const origin = chart.getBoundingClientRect();
      const next: { id: string; d: string }[] = [];
      planning?.links.forEach((link) => {
          const from = barRefs.current.get(link.predecessor.id);
          const to = barRefs.current.get(link.successor.id);
          if (!from || !to) return;
          const a = from.getBoundingClientRect();
          const b = to.getBoundingClientRect();
          const x1 = a.right - origin.left - paneWidth();
          const x2 = b.left - origin.left - paneWidth();
          const y1 = a.top + a.height / 2 - origin.top;
          const y2 = b.top + b.height / 2 - origin.top;
          const bend = Math.max(x1 + 10, Math.min(x1 + 24, x2 - 10));
          next.push({ id: link.id, d: `M${x1} ${y1} H${bend} V${y2} H${x2}` });
      });
      setPaths(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(chart);
    measure();
    return () => observer.disconnect();
  }, [db, selected, linkKey, rows.length, width, scale, anchor, showLinks, mobilePane, collapsed, assignee]);

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
    const label = `${isMilestone ? "Milestone" : "Task"} ${node.name}. Approved ${dateLabel(start)} to ${dateLabel(finish)}.${isMilestone ? "" : ` Reported progress ${(node as Task).progress}%.`}`;
    const projection = nodeView.get((isMilestone ? "milestone:" : "task:") + node.id);
    const blocking = planning?.blockers.filter((item) => item.node?.id === node.id && item.node.kind === (isMilestone ? "milestone" : "task")) ?? [];
    const linkedTask = isMilestone ? db.tasks.find((task) => task.id === (node as Milestone).taskId) : undefined;
    const overlay = (dates: PlanningNodeView["baseline"] | PlanningNodeView["proposed"], kind: "baseline" | "proposed") => {
      if (!dates || days(anchor, dates.finish) < 0 || days(anchor, dates.start) >= config.span) return null;
      return <span className={`gantt-overlay ${kind}`} title={`${kind === "baseline" ? "Baseline" : "Proposed"} ${dateLabel(dates.start)} to ${dateLabel(dates.finish)}`}
        style={{ left: Math.max(0, days(anchor, dates.start)) * width,
          width: Math.max(width / 2, (Math.min(config.span - 1, days(anchor, dates.finish)) - Math.max(0, days(anchor, dates.start)) + 1) * width) }} />;
    };
    return <>
      {overlay(projection?.baseline, "baseline")}
      {overlay(projection?.proposed, "proposed")}
      <button key={node.id} ref={(element) => { if (element) barRefs.current.set(node.id, element); else barRefs.current.delete(node.id); }}
      type="button" className={`gantt-bar ${isMilestone ? "milestone" : ""} ${projection?.critical && planning?.criticalPathFeasible ? "critical" : ""} ${!isMilestone && (overdue(node as Task) || (node as Task).status === "Blocked") ? "risk" : ""}`}
      style={{ left: Math.max(0, first) * width, width: barWidth }} aria-label={label} title={label}
      onClick={() => { if (linkedTask) onTask(linkedTask); else if (!isMilestone) onTask(node as Task); }}>
      {!isMilestone && <i style={{ width: taskProgress(db, node as Task) + "%" }} />}
      <span aria-hidden="true">{isMilestone ? "◆" : barWidth >= 70 ? node.name : ""}</span>
      </button>
      {(projection?.critical && planning?.criticalPathFeasible || blocking.length > 0) && <span className="gantt-status-text" style={{ left: Math.max(0, first) * width }}>{projection?.critical && planning?.criticalPathFeasible ? "Critical" : ""}{blocking.length ? " · Blocked" : ""}</span>}
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
      <button type="button" onClick={() => document.getElementById("planning-review")?.scrollIntoView({ block: "start" })}>Review proposals{planning?.activeProposal ? " · 1 active" : ""}</button>
    </div>
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
      </div>
      <p>Holidays: {calendarDraft.holidays.length ? calendarDraft.holidays.join(", ") : "None set"}</p>
      <button type="button" onClick={() => { if (calendarHoliday) setCalendarDraft({ ...calendarDraft, holidays: [...new Set([...calendarDraft.holidays, calendarHoliday])].sort() }); setCalendarHoliday(""); }}>Add holiday</button>{" "}
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
    <p className="muted planning-range">{dateLabel(anchor)} – {dateLabel(addDays(anchor, config.span - 1))}. Dates change only after project manager approval.</p>
    <div className={`gantt ${mobilePane === "Timeline" ? "show-mobile-timeline" : ""}`} aria-label="Project programme" role="region" tabIndex={0}>
      <div className="gantt-inner" style={{ "--gantt-chart-width": chartWidth + "px" } as CSSProperties}>
        <div className="gantt-row gantt-heading">
          <div className="gantt-info gantt-table-head"><span>Task / phase</span><span>Assigned</span><span>Approved dates</span><span>Progress</span></div>
          <div className="gantt-date-head" style={{ width: chartWidth }}>
            {Array.from({ length: config.span }, (_, index) => {
              const date = addDays(anchor, index);
              const boundary = scale === "Day" || index === 0 || (scale === "Week" ? new Date(date + "T12:00:00Z").getUTCDay() === 1 : date.slice(8) === "01");
              return <span key={date} className={boundary ? "group-start" : ""} style={{ width }}><b>{scale === "Day" ? date.slice(8) : boundary ? scale === "Week" ? dateLabel(date).slice(0, 6) : date.slice(0, 7) : ""}</b>{scale === "Day" && <small>{new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short" })}</small>}</span>;
            })}
          </div>
        </div>
        <div className="gantt-body" ref={chartRef}>
          {rows.map((row) => {
            const key = "phase" in row ? row.phase.id : "task" in row ? row.task.id : row.milestone.id;
            return <div className={`gantt-row ${"phase" in row ? "phase-row" : ""}`} key={key} data-row-id={key}>
              <div className="gantt-info">
                {"phase" in row ? <button className="gantt-phase" type="button" aria-expanded={!collapsed.includes(row.phase.id)} onClick={() => setCollapsed(collapsed.includes(row.phase.id) ? collapsed.filter((id) => id !== row.phase.id) : [...collapsed, row.phase.id])}><span>{collapsed.includes(row.phase.id) ? "▸" : "▾"} {String(row.phase.order + 1).padStart(2, "0")} {row.phase.name}</span><Progress value={phaseProgress(db, row.phase.id)} /></button> :
                  "task" in row ? <button className="gantt-task" type="button" onClick={() => onTask(row.task)} aria-label={`Open task ${row.task.name}. Approved ${dateLabel(row.task.start)} to ${dateLabel(row.task.due)}. ${row.task.dependencies.length} predecessors.`}><span className="gantt-name"><strong>{row.task.parentId ? "↳ " : ""}{row.task.name}</strong><small className="mobile-dates">{dateLabel(row.task.start)} → {dateLabel(row.task.due)} · {personName(db, row.task.assigneeId)}</small></span><span>{personName(db, row.task.assigneeId).split(" ")[0]}</span><span>{row.task.start.slice(5)} → {row.task.due.slice(5)}</span><Progress value={taskProgress(db, row.task)} /></button> :
                  <div className="gantt-milestone-info"><span className="gantt-name"><strong>◆ {row.milestone.name}</strong><small>Milestone{row.milestone.taskId ? ` · linked to ${db.tasks.find((task) => task.id === row.milestone.taskId)?.name || "task"}` : ""}</small></span><span>—</span><span>{row.milestone.due.slice(5)}</span><span>Event</span></div>}
              </div>
              <div className="gantt-track" style={{ width: chartWidth, backgroundSize: width + "px 100%" }}>
                {todayOffset >= 0 && todayOffset < config.span && <span className="gantt-today" style={{ left: todayOffset * width }} title="Today" />}
                {"task" in row ? bar(row.task, false) : "milestone" in row ? bar(row.milestone, true) : null}
              </div>
            </div>;
          })}
          {showLinks && <svg className="dependency-lines" width={chartWidth} height={rows.length * 64} style={{ left: "var(--gantt-pane)" }} aria-hidden="true"><defs><marker id="planning-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#745a37" /></marker></defs>{paths.map((path) => <path key={path.id} d={path.d} fill="none" stroke="#745a37" strokeWidth="1.5" markerEnd="url(#planning-arrow)" />)}</svg>}
        </div>
      </div>
    </div>
    {!tasks.length && <Empty>No tasks in this programme. Add a task to begin.</Empty>}
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
      {planning && planning.proposals.filter((item) => item.status === "Approved" || item.status === "Rejected").length > 0 && <details><summary>Decision history · {planning.proposals.filter((item) => item.status === "Approved" || item.status === "Rejected").length}</summary><ul>{planning.proposals.filter((item) => item.status === "Approved" || item.status === "Rejected").map((item) => <li key={item.id}>Revision {item.revision}: {item.status} · {item.reason}{item.decisionReason ? " · " + item.decisionReason : ""}</li>)}</ul></details>}
    </section>
    <p className="planning-note">The timeline shows approved dates. Select a task to review its dates and predecessors. Demo project manager actions are browser-local and are not secure authentication.</p>
  </>;
}
