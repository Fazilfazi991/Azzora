/** Deterministic acceptance fixtures from docs/planning/TEST-AND-ACCEPTANCE-PLAN.md.
 * These are independent test data, not application scheduling defaults.
 */
export const weekdayCalendar = {
  timezone: "Asia/Dubai",
  workingWeekdays: [1, 2, 3, 4, 5],
  workdayStart: "09:00",
  workdayEnd: "18:00",
  holidays: [] as string[],
  projectNonworkingDates: [] as string[],
};

export const holidayCalendar = {
  ...weekdayCalendar,
  holidays: ["2026-11-09"],
};

export const boundaryCases = {
  oneDay: { start: "2026-11-02", duration: 1, finish: "2026-11-02" },
  threeDays: { start: "2026-11-02", duration: 3, finish: "2026-11-04" },
  holidayFS: {
    predecessorFinish: "2026-11-06",
    lagWorkingDays: 0,
    earliestSuccessorStart: "2026-11-10",
  },
  lagPlusTwo: {
    predecessorFinish: "2026-11-03",
    lagWorkingDays: 2,
    earliestSuccessorStart: "2026-11-06",
  },
  leadMinusOne: {
    predecessorFinish: "2026-11-03",
    lagWorkingDays: -1,
    earliestSuccessorStart: "2026-11-03",
    overlapWarning: true,
  },
  multiplePredecessors: {
    predecessorFinishes: ["2026-11-03", "2026-11-05"],
    earliestSuccessorStart: "2026-11-06",
  },
};

/** Each relationship uses an anchor where the finish-bound conversion is observable. */
export const relationshipCases = [
  {
    type: "FS",
    predecessor: { start: "2026-11-02", finish: "2026-11-03" },
    successorDuration: 2,
    lagWorkingDays: 0,
    earliestSuccessorStart: "2026-11-04",
    earliestSuccessorFinish: "2026-11-05",
  },
  {
    type: "SS",
    predecessor: { start: "2026-11-02", finish: "2026-11-03" },
    successorDuration: 2,
    lagWorkingDays: 1,
    earliestSuccessorStart: "2026-11-03",
    earliestSuccessorFinish: "2026-11-04",
  },
  {
    type: "FF",
    predecessor: { start: "2026-11-04", finish: "2026-11-06" },
    successorDuration: 2,
    lagWorkingDays: 0,
    earliestSuccessorStart: "2026-11-05",
    earliestSuccessorFinish: "2026-11-06",
  },
  {
    type: "SF",
    predecessor: { start: "2026-11-05", finish: "2026-11-06" },
    successorDuration: 2,
    lagWorkingDays: 0,
    earliestSuccessorStart: "2026-11-04",
    earliestSuccessorFinish: "2026-11-05",
  },
] as const;

export const parallelNetwork = {
  calendar: weekdayCalendar,
  activities: [
    { id: "A", start: "2026-11-02", finish: "2026-11-03", duration: 2 },
    { id: "B", start: "2026-11-04", finish: "2026-11-06", duration: 3 },
    { id: "C", start: "2026-11-04", finish: "2026-11-05", duration: 2 },
    { id: "D", start: "2026-11-09", finish: "2026-11-09", duration: 1 },
  ],
  links: [
    { predecessor: "A", successor: "B", type: "FS", lagWorkingDays: 0 },
    { predecessor: "A", successor: "C", type: "FS", lagWorkingDays: 0 },
    { predecessor: "B", successor: "D", type: "FS", lagWorkingDays: 0 },
    { predecessor: "C", successor: "D", type: "FS", lagWorkingDays: 0 },
  ],
  expected: {
    finish: "2026-11-09",
    criticalIds: ["A", "B", "D"],
    floatWorkingDays: { A: 0, B: 0, C: 1, D: 0 },
    oneDayCDelayKeepsD: "2026-11-09",
  },
};

export const weightedProgress = {
  leaves: [
    { id: "short", durationWorkingDays: 2, reportedPercent: 100 },
    { id: "long", durationWorkingDays: 6, reportedPercent: 0 },
  ],
  summaryPercent: 100,
  milestonePercent: 100,
  expectedPlanningPercent: 25,
};
