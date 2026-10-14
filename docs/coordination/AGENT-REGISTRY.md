# Agent registry

Observed 14 October 2026, Asia/Dubai. Paths below are under `C:/Users/USER/Desktop/Projects/Azzora/`.

| Agent / exact chat title | Chat ID / host | Responsibility | Worktree | Branch | Latest verified SHA | Last observed activity | Current task / blocker | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Agent 1 / Build Azzora CRM foundation | `01a13802-7fbf-77b1-b59e-e2dcccf9f1a7` / local | Commercial, procurement, variations, financial rules, company settings | `azzora-main/azzora-main` | `codex/azzora-operational-completion` | `647762d99fa0837df1c991d17bcd38459ab960f9` | FIX-A1-01 acknowledged/committed/integrated; read-only review complete; active financial follow-up | FIX-A1-02 in progress (legacy allocations/cumulative VAT) | `docs/OPERATIONAL-COMPLETION-REPORT.md`; coordinator handoff `agent-1-handoff.md` |
| Agent 2 / Agent 2 | `01a13866-2fc6-7f22-b3eb-cd8f5ae3a270` / local | Workforce, documents, site, QA, operational handover | `azzora-workforce-approvals` | `codex/azzora-workforce-approvals` | `94c568b737fc3f58713ef6f9c866729868bb2612` | FIX-A2-01 committed/integrated; additional source review complete; idle | Three coordinator review findings corrected | `docs/AGENT-2-WORKFORCE-REPORT.md`; coordinator handoff `agent-2-handoff.md` |
| Agent 3 / Agent 3 | `01a13866-d749-7aa3-8553-c646d03b7802` / local | Independent testing, audit, isolated stabilization | `azzora-qa-stabilization` | `codex/azzora-qa-stabilization` | `b88191b8dcb4c0bc568b35796dbf46563cb2d9bb` | QA-PREP-02 committed/integrated; QA-COMPOSE-03 active in integration worktree (tests only) | Final gate awaits harness composition and frozen SHA | `docs/AGENT-3-QA-REPORT.md`, `docs/AGENT-3-ISSUES.md`; coordinator handoff `agent-3-handoff.md` |
| Master Coordinator / Coordinator agent | Current chat / local | Task board, evidence, ownership, integration control | `azzora-integration` | `codex/azzora-integration` | Common foundation `ada782a` before coordination commit | Active in this invocation | COORD-001 complete; preserve feature worktrees | This folder |

Delivery is confirmed by Git/report inspection, not filenames alone. A delivery SHA identifies a commit, not a running agent. Thread tools confirmed existing chats and dispatch; handoff files or subsequent supported status must establish acknowledgement.
