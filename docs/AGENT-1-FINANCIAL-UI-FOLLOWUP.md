# FIX-A1-03 — Financial dialog rejection feedback

14 October 2026. Implemented on `codex/azzora-operational-completion` from **`d4d251fe6674f2354a40aaee5a08569f5d0cc9e2`**.

Source/tests commit: **`62c694814ba2a79a20f2b54b2b5ee98815738ffd`**. The following report/evidence commit is supplied in the completion handoff and can be found with `git log -1 --format=%H -- docs/AGENT-1-FINANCIAL-UI-FOLLOWUP.md`.

## Confirmed reproduction

Before changing source, tested four rejection cases at **1440px and 390px**: over-credit, excessive refund, legacy invoice allocation review, and whitespace-only refund reversal reason. All **8 observations** confirmed zero alerts inside the native dialog. Chrome's accessibility tree marked every external error toast **ignored**, with reason **`activeModalDialog`**. The external DOM text existed, but the active dialog did not expose the failure. Storage and typed values already remained unchanged.

Baseline evidence: [observations and native accessibility-tree results](agent-1-financial-ui-evidence/baseline-observations.json). The file also records Playwright role-locator counts; the Chrome AX ignored reason is the native-modal accessibility evidence.

## Correction

Added reusable `FinancialDialogError` inside **Credit Note Draft**, **Customer Refund** and **Reverse Refund**, immediately before each submit button. It renders the actual store error as visible existing-style error text with `role="alert"`, atomic announcement and programmatic keyboard focus. Focus/scroll makes the message readable within the active dialog.

Each rejected submission increments a scoped attempt counter. The component captures that failure message locally, so expiration of the unrelated global toast cannot erase feedback while the user corrects the form. Native dialogs stay open and fields are retained; success still closes the form through the existing `mutate` result.

New/edit credit, refund and reversal opening reset scoped feedback. **No store `clear`/reset is called.** Persistent read-only/protection errors remain in the store, and every write still goes through its original guarded `mutate` path. No bypass, pre-validation shortcut, changed financial message or alternative persistence path was introduced.

Existing AZZORA error color, typography, spacing and native dialog layout are reused, following the interface-design skill and existing Architectural Prestige design. No styles, motion or shared modal implementation changed.

## Verification

| Check | Final result |
|---|---|
| Baseline reproduction | **8 confirmed missing/inaccessible dialog-feedback observations** |
| Focused corrected production-browser test | **38 passed**, no console/page errors, **1440px / 390px** |
| Existing standalone unit suite | **192 passed, 0 failed, 0 pending; 7 files** |
| TypeScript / ESLint | `tsc --noEmit` and `eslint src` passed |
| Whitespace | `git diff --check` passed |
| Production build | Passed; main **591.28 kB / 164.63 kB gzip**, existing non-blocking bundle-size warning retained |

The browser assertions verify actual error text **inside** the dialog, visible/focused geometry and an **unignored `alert` node in Chrome's native accessibility tree**. Rejections preserve the exact localStorage string and typed amounts, references, reasons and invoice selection. Coverage includes:

- Over-credit, invalid refund, legacy allocation review and invalid reversal reason, with valid corrections/replacement drafts proceeding normally.
- Storage quota failures and successful recovery/retry for all three dialogs.
- Error persistence after the global toast expires; stale scoped feedback is absent on reopening while the store error remains intact.
- Real corrupt-data recovery/read-only rejection, including a repeated attempt after reopening. The original malformed string remains byte-for-byte unchanged. These guard probes deliberately bypass native required-field validation in disposable test contexts solely to reach the store's actual read-only check; no owner browser data is used.
- The legacy invoice stays unchanged when the user abandons its blocked draft and saves a valid replacement against a different invoice.

Tracked results: [38 checks](agent-1-financial-ui-evidence/browser-results.json), [unit summary](agent-1-financial-ui-evidence/unit-summary.json). Raw test outputs/screenshots are in ignored `tmp/financial-modal-feedback/`. Run `node tests/financial-modal-feedback-browser.mjs` against a local preview; default port is **5197**, overridable with `AZZORA_URL`. `--diagnose` is for the pinned pre-fix build and expects the baseline defect.

Visually inspected: [mobile over-credit](agent-1-financial-ui-evidence/over-credit-390.png), [desktop refund](agent-1-financial-ui-evidence/excessive-refund-1440.png), [mobile legacy review](agent-1-financial-ui-evidence/legacy-allocation-review-390.png), [mobile reversal storage failure](agent-1-financial-ui-evidence/reversal-feedback-390.png). Messages are readable without losing the draft fields or submit action.

## Scope and integration handoff

Source changes are confined to `src/operations/Credits.tsx`, new `src/operations/FinancialDialogError.tsx` and the focused browser test. **Store, validators, shared `components/ui.tsx`, workforce, shell, styles, math, models and history remain untouched.** No central coordinator files were authored; no broad unrelated browser suites reran.

Integrate the source commit relative to `d4d251f`, followed by the report/evidence commit. Preserve Agent 2's shared modal behavior and the coordinator's read-only/schema protections. The separate customer-only Credit Note approval schema rejection is **not fixed or certified here**.

This standalone correction is verified; combined-SHA certification remains Agent 3's frozen-source gate. Native Chromium AX and keyboard checks are targeted evidence, not complete physical-device/screen-reader certification. Browser-local/demo limitations and the build warning remain. No merge, push, deployment, backend, reset or worktree removal occurred.
