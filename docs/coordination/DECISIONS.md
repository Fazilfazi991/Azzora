# Coordination decisions

14 October 2026, Asia/Dubai.

| ID | Decision | Reason / evidence | State |
| --- | --- | --- | --- |
| D-001 | Use actual nested repository; preserve all source worktrees | Git root/worktree discovery; three clean source deliveries | Adopted |
| D-002 | Central coordination resides in isolated `codex/azzora-integration`, initially based on `ada782a` | Avoid adding files to another agent's feature checkout; common ancestor confirmed | Adopted |
| D-003 | Reuse the existing three Codex chats; do not spawn duplicate feature agents | Supported chat discovery found all three idle delivered agents | Adopted; follow-ups dispatched |
| D-004 | Initial follow-ups are read-only application reviews; one handoff file per agent | Avoid restarting delivered work and overlapping shared source edits | Adopted |
| D-005 | Do not combine branches until workforce/document/approval/closure authority is agreed | Six shared source files and semantic duplicate implementations | Satisfied; deliberate composition executed |
| D-006 | Prioritize negative VAT and incompatible-storage recovery as P0 triage | Financial correctness/recovery risk; A3-005/006 original P1 severity preserved in evidence | Corrected/integrated; final combined gate pending |
| D-007 | Distinguish claim, commit, recorded tests, independent review and integration | Separate branch counts overlap; QA has two expected failures | Adopted |
| D-008 | Backend/auth/Supabase/deployment stay deferred; no main merge without approval | Owner's coordinator brief | Binding scope |
| D-009 | Refresh on invocation; no continuous monitor | No persistent automation requested/configured | Adopted |
| D-010 | Adopt Agent 2 workforce/document commands and Agent 1 financial/procurement/closure authority | Both completed handoffs agree; A1 reproduced stale approval after competing document writes | Implemented with ordinary regressions; final combined gate pending |
| D-011 | Legacy IMPLEMENTATION-REPORT is historical, not current Git/test truth | It contains stale no-Git claims and embedded old task text; current Git and pinned newer evidence prevail | Adopted |

Resolved during controlled integration: Agent2 canonical employee/document commands; actual requester and assigned independent reviewer semantics; shared canonical approval visibility with immutable supersession; combined operational/financial completion policy; additive protected migration and history preservation; one save boundary; public UI source-bound fixtures and consistent URL aliases. New freeze db6bb1148effb35e32ee39c120013a588b468813 is undergoing independent final QA. Source corrections require safe stopped-runner checkpoint and refreeze; reports alone do not certify acceptance.

