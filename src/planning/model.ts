export type LocalDate = string;
export type NodeRef = { kind: "task" | "milestone"; id: string };
export type LinkType = "FS" | "SS" | "FF" | "SF";

export interface ProjectCalendar {
  timezone: string;
  workingWeekdays: number[];
  workdayStart: string;
  workdayEnd: string;
  holidays: LocalDate[];
  projectNonworkingDates: LocalDate[];
}
export interface DependencyLink {
  id: string;
  projectId: string;
  predecessor: NodeRef;
  successor: NodeRef;
  type: LinkType;
  lagWorkingDays: number;
  createdAt: string;
}
export interface ProgressReport {
  id: string;
  taskId: string;
  date: LocalDate;
  actorId: string;
  percent: number;
  notes: string;
  evidenceRefs: string[];
  createdAt: string;
}
export interface TaskPlanning {
  taskId: string;
  durationWorkingDays: number;
  scheduleRole: "work" | "summary";
  durationNeedsReview?: boolean;
  startNoEarlierThan?: LocalDate;
  finishNoLaterThan?: LocalDate;
  lockedStart?: LocalDate;
  lockedFinish?: LocalDate;
  actualStart?: LocalDate;
  actualFinish?: LocalDate;
  explicitProgressWeight?: number;
  assigneeIds?: string[];
  requiredInspectionIds?: string[];
  progressHistory?: ProgressReport[];
}
export type MilestoneCondition =
  | { kind: "Manual" }
  | { kind: "TaskComplete"; taskId: string }
  | { kind: "DocumentApproved"; documentId: string }
  | { kind: "QAApproved"; referenceId: string };
export interface MilestonePlanning {
  milestoneId: string;
  requiredDate?: LocalDate;
  actualDate?: LocalDate;
  completionCondition: MilestoneCondition;
  completedAt?: string;
  completedBy?: string;
}
export interface NodeDates {
  start: LocalDate;
  finish: LocalDate;
  durationWorkingDays: number;
}
export interface ScheduleIssue {
  code: string;
  detail: string;
  node?: NodeRef;
}
export interface ScheduleSnapshot {
  id: string;
  revision: number;
  capturedAt: string;
  actorId: string;
  reason: string;
  calendar: ProjectCalendar;
  nodes: Array<{ node: NodeRef } & NodeDates>;
  links: DependencyLink[];
  finish: LocalDate;
}
export interface ScheduleChange {
  node: NodeRef;
  before: NodeDates;
  after: NodeDates;
  cause: "direct" | "indirect";
}
export interface ScheduleProposal {
  id: string;
  projectId: string;
  revision: number;
  status: "Draft" | "Submitted" | "Approved" | "Rejected";
  sourceApprovedRevision: number;
  sourceFingerprint: string;
  initiatingNode: NodeRef;
  reason: string;
  initiatedBy: string;
  submittedAt?: string;
  submittedBy?: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
  changes: ScheduleChange[];
  unchangedSuccessors: NodeRef[];
  proposedLinks?: DependencyLink[];
  proposedCalendar?: ProjectCalendar;
  proposedTaskPlanning?: TaskPlanning[];
  proposedMilestonePlanning?: MilestonePlanning[];
  proposedTask?: import("../domain/model").Task;
  proposedMilestone?: import("../domain/model").Milestone;
  requestedEdit?: import("./engine").ScheduleEdit;
  considerEarlierDates?: boolean;
  warnings: ScheduleIssue[];
  conflicts: ScheduleIssue[];
  history: Array<{ action: string; actorId: string; at: string; reason: string }>;
}
export interface ProjectPlanning {
  projectId: string;
  enabled?: boolean;
  calendar: ProjectCalendar;
  approvedRevision: number;
  baselineStatus: "Unset" | "Captured";
  baselineHistory: ScheduleSnapshot[];
  taskPlanning: TaskPlanning[];
  milestonePlanning: MilestonePlanning[];
  links: DependencyLink[];
  proposals: ScheduleProposal[];
}
export interface PlanningNodeView {
  node: NodeRef;
  name: string;
  approved: NodeDates;
  baseline?: NodeDates;
  proposed?: NodeDates;
  totalFloatWorkingDays?: number;
  critical: boolean;
  scheduleRole: "work" | "summary" | "milestone";
  progress: number;
  plannedProgress: number;
  completionSatisfied?: boolean;
}
export interface PlanningView {
  projectId: string;
  calendar: ProjectCalendar;
  links: DependencyLink[];
  nodes: PlanningNodeView[];
  proposals: ScheduleProposal[];
  activeProposal?: ScheduleProposal;
  baselineStatus: "Unset" | "Captured";
  approvedRevision: number;
  approvedFinish?: LocalDate;
  baselineFinish?: LocalDate;
  proposedFinish?: LocalDate;
  targetFinish: LocalDate;
  planningProgress: number;
  warnings: ScheduleIssue[];
  blockers: Array<{ code: string; detail: string; node?: NodeRef; sourceId?: string }>;
  conflicts: ScheduleIssue[];
  criticalPathFeasible: boolean;
}
