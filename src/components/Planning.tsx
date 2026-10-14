import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "../store";
import type { Milestone, Phase, Task } from "../domain/model";
import { addDays, days, today, dateLabel, phaseProgress, taskProgress, overdue } from "../domain/logic";
import { blankTask } from "../domain/seed";
import { Header, Badge, Progress, personName, Empty } from "./ui";

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
  const { db } = useStore();
  const [selected, setSelected] = useState(projectId || db.projects[0]?.id || "");
  const [scale, setScale] = useState<Scale>("Week");
  const [anchor, setAnchor] = useState(today());
  const [zoom, setZoom] = useState(1);
  const [showLinks, setShowLinks] = useState(true);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [assignee, setAssignee] = useState("");
  const [mobilePane, setMobilePane] = useState<"Tasks" | "Timeline">("Tasks");
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef(new Map<string, HTMLButtonElement>());
  const config = scales[scale];
  const width = Math.round(config.dayWidth * zoom);
  const chartWidth = config.span * width;
  const project = db.projects.find((item) => item.id === selected);
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
  const linkKey = tasks.map((task) => task.id + ":" + task.dependencies.join(",")).join("|");
  const dates = [...tasks.map((task) => task.due), ...milestones.map((milestone) => milestone.due)];
  const approvedFinish = dates.length ? dates.sort().at(-1) : undefined;
  const riskCount = tasks.filter((task) => overdue(task) || task.status === "Blocked").length;
  const todayOffset = days(anchor, today());

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart || !showLinks) return;
    const measure = () => {
      const origin = chart.getBoundingClientRect();
      const next: { id: string; d: string }[] = [];
      db.tasks.filter((task) => task.projectId === selected).forEach((task) => {
        task.dependencies.forEach((id) => {
          const from = barRefs.current.get(id);
          const to = barRefs.current.get(task.id);
          if (!from || !to) return;
          const a = from.getBoundingClientRect();
          const b = to.getBoundingClientRect();
          const x1 = a.right - origin.left - paneWidth();
          const x2 = b.left - origin.left - paneWidth();
          const y1 = a.top + a.height / 2 - origin.top;
          const y2 = b.top + b.height / 2 - origin.top;
          const bend = Math.max(x1 + 10, Math.min(x1 + 24, x2 - 10));
          next.push({ id: id + ":" + task.id, d: `M${x1} ${y1} H${bend} V${y2} H${x2}` });
        });
      });
      setPaths(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(chart);
    measure();
    return () => observer.disconnect();
  }, [db, selected, linkKey, rows.length, width, scale, anchor, showLinks, mobilePane]);

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
    const linkedTask = isMilestone ? db.tasks.find((task) => task.id === (node as Milestone).taskId) : undefined;
    return <button key={node.id} ref={(element) => { if (element) barRefs.current.set(node.id, element); else barRefs.current.delete(node.id); }}
      type="button" className={`gantt-bar ${isMilestone ? "milestone" : ""} ${!isMilestone && (overdue(node as Task) || (node as Task).status === "Blocked") ? "risk" : ""}`}
      style={{ left: Math.max(0, first) * width, width: barWidth }} aria-label={label} title={label}
      onClick={() => { if (linkedTask) onTask(linkedTask); else if (!isMilestone) onTask(node as Task); }}>
      {!isMilestone && <i style={{ width: taskProgress(db, node as Task) + "%" }} />}
      <span aria-hidden="true">{isMilestone ? "◆" : barWidth >= 70 ? node.name : ""}</span>
    </button>;
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
      <div><small>Baseline</small><strong>Not captured</strong></div>
      <div><small>Tasks needing attention</small><strong>{riskCount}</strong></div>
    </section>
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
    </div>
    {riskCount > 0 && <p className="planning-warning" role="status"><Badge>{riskCount} tasks need attention</Badge> Review blocked or overdue activities before proposing a date.</p>}
    <p className="muted planning-range">{dateLabel(anchor)} – {dateLabel(addDays(anchor, config.span - 1))}. Dates change only after project manager approval.</p>
    <div className="planning-mobile-switch" role="group" aria-label="Mobile programme view">
      <button type="button" aria-pressed={mobilePane === "Tasks"} onClick={() => setMobilePane("Tasks")}>Tasks</button>
      <button type="button" aria-pressed={mobilePane === "Timeline"} onClick={() => setMobilePane("Timeline")}>Timeline</button>
    </div>
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
    <p className="planning-note">The timeline shows approved dates. Select a task to review its dates and predecessors. Demo project manager actions are browser-local and are not secure authentication.</p>
  </>;
}
