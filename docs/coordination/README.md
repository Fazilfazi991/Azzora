# AZZORA coordination

The Master Coordinator maintains this folder on `codex/azzora-integration`, in the separate `azzora-integration` worktree. Feature worktrees remain independent. This folder is the central source for project status; source reports remain authoritative for their exact test runs.

- [Master status](MASTER-STATUS.md)
- [Task board](TASK-BOARD.md)
- [Agent registry](AGENT-REGISTRY.md)
- [Ownership](OWNERSHIP.md)
- [Integration plan](INTEGRATION-PLAN.md)
- [Decisions](DECISIONS.md)
- [Changelog](CHANGELOG.md)
- [Consolidated integration report](FINAL-INTEGRATION-REPORT.md)
- Agent inboxes: [1](agent-1-tasks.md), [2](agent-2-tasks.md), [3](agent-3-tasks.md)
- Collected handoffs: [1](agent-1-handoff.md), [2](agent-2-handoff.md), [3](agent-3-handoff.md)

On every coordinator invocation, run `node docs/coordination/refresh-evidence.cjs` here, collect new reports and supported chat status, reconcile the board, and update the master status. The script records repository evidence only: it does not run tests, dispatch tasks, or infer that a branch means a live agent. No continuous monitor or recurring automation is configured.

Source reports can be read directly from sibling worktrees without copying completion messages. Supported messaging has dispatched three scoped review tasks to the existing chats. Delivery, acknowledgement, completion, independent verification, and integration are separate states.

Do not edit another agent's handoff file while its task runs. Coordinator owns all other files here. Only committed, pinned, reviewed work may enter integration. Pinned feature deliveries and reviewed corrections are merged locally with checkpoints. Independent gates19051cc anddb6bb114 failed and are preserved. Reviewed search/print corrections are integrated;finalf72e6c1 passes304units,20suites on each target,visual/PDF/static/build gates. Owner acceptance is Ready. MASTER-STATUS/TASK-BOARD and the consolidated report hold current readiness; initial handoffs remain historical evidence.
