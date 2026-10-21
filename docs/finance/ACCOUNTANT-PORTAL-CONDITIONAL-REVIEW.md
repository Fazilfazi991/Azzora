# Accountant Portal — conditional owner review

**21 October 2026.** The accepted independent AZZORA Accounts visual direction has been extended in the isolated `codex/azzora-accountant-portal-design` worktree. This is a local design and architecture checkpoint based on finance integration source `968b58e01cb4f723361c67a9e31d62be2858b58b`. No `src/` application code, Manager sidebar, browser database key, production deployment, GitHub branch or backend configuration was changed.

## Visual and navigation evidence

The [old Manager-embedded Accountant Preview](portal-design/evidence/before-accountant-workspace.png) is compared with the [new desktop dashboard](portal-design/evidence/dashboard-1440.png), [mobile dashboard](portal-design/evidence/dashboard-390.png), [desktop login](portal-design/evidence/login-1440.png), [mobile login](portal-design/evidence/login-390.png) and [mobile finance navigation](portal-design/evidence/mobile-navigation-390.png). The [sitemap and functional-status matrix](portal-design/SITEMAP-AND-DESIGN-REVIEW.md) links desktop and mobile screenshots for every other requested page: sales invoices, new invoice, purchase bills, customer receipt, supplier payment, expenses, bank/cash, ledger, Profit & Loss, Balance Sheet and AR/AP aging.

The finance-only sidebar keeps its brand header and footer in place while the middle navigation scrolls. At 390 × 600 and 390 × 844 px the final Access model item can be scrolled fully above the footer. Wide financial tables scroll within their panels. The logo and `ACCOUNTS` lockup stay aligned in desktop and mobile layouts.

## Authentication demonstration and true security status

The separate `#/login` concept opens `#/demo/dashboard` when “View portal design” is selected. The visible “Log out” link returns to the login concept. The form is cleared on entry, and the login copy says not to enter real credentials. There is **no password check, authenticated session, role enforcement or credential storage**. Direct `#/demo/*` navigation remains available because every record is fictional. `#/demo/access` explains proposed Accountant, Manager and Owner boundaries and labels them as not active security. This route separation is a design demonstration; the current Manager app still has its old Accountant Preview and `#/accounts/*` routes.

The [trusted authentication and authorization proposal](ACCOUNTANT-AUTH-ARCHITECTURE.md) recommends, subject to owner approval, Supabase Auth/Postgres/private Storage and same-origin Vercel Functions with server-held sessions, MFA, per-request grants, audit, private attachments and migration controls. Actual accounts, role denials, logout revocation, shared records and financial APIs are **blocked by B11 infrastructure approval and B01/B02 permission decisions**. Production credentials have not been created.

## Financial accuracy

The in-memory [fixture](portal-design/finance-fixture.mjs) contains seven balanced journal events in integer fils. The dashboard labels revenue, cost of sales, operating expenses, gross profit and net profit as **activity for 1 January–21 October 2026**. Receivables, payables and bank/cash are **balances as of 21 October 2026**. This period includes the older August invoice; the previous October-only revenue label was incorrect and is gone.

| Journal-derived check | AED |
| --- | ---: |
| Revenue − cost of sales = gross profit | 20,000 − 8,000 = **12,000** |
| Gross profit − operating expenses = net profit | 12,000 − 1,000 = **11,000** |
| Open issued invoices = receivables | 12,000 + 3,000 = **15,000** |
| Open supplier bills = payables | 5,000 + 1,000 = **6,000** |
| Bank + petty cash | 52,000 + 0 = **52,000** |
| Assets = liabilities + equity | **67,000 = 6,000 + 61,000** |
| Combined journal debits = credits | **87,000 = 87,000** |

Draft proformas and pending expense submissions do not enter revenue or expense. Original due dates continue to age after partial settlement. No Thomas cash balance or live VAT treatment is invented. The Profit & Loss and Balance Sheet on screen derive from this fictional journal, **not** from CRM posting or approved accounting policy; they must not be accepted as live company statements. The [functional integration map](ACCOUNTANT-FUNCTIONAL-MAP.md) identifies the canonical commands to reuse and the missing source-to-journal bridge.

## Verification evidence

| Check | Result |
| --- | --- |
| Fictional journal and open-document unit assertions | 2/2 passed |
| Accountant prototype direct route × width (16 routes × 5 widths) | 80/80 passed at 390, 430, 768, 1024 and 1440 px; no page error, missing logo or page-level horizontal overflow |
| Prototype interactions | All 13 sidebar links, login-to-demo, demo exit, mobile menu open/close, short-viewport menu/footer clearance, invoice filters, visible fixture warning, Manager-shell absence and `azzora-demo-v1` sentinel preservation passed |
| Existing CRM domain unit tests | 462/462 passed against unchanged finance source |
| Existing CRM TypeScript / ESLint / production build | Passed against unchanged finance source; build retains its existing large-chunk warning |
| Existing CRM general browser | 66 route/viewport checks passed; project-to-handover journey passed |
| Existing commercial browser | 129 checks passed |
| Existing commercial boundaries | 6 checks passed |
| Existing operational browser | 136 checks passed |
| Existing quotation browser | Passed desktop/mobile quotation workflow, PDF download, print, lifecycle and persistence; script reports no numeric count |
| Existing operational boundaries | 18 checks passed |
| Existing BOQ visual | Passed at 1440, 1024, 768 and 390 px for nesting, detachment/reattachment, amount, keyboard focus and document width; script reports four width-level results |
| Existing corrective financial/accessibility browser | 35 checks passed; no browser errors |

The prototype [browser result JSON](portal-design/evidence/visual-checks.json) and screenshots are saved with this review. Existing CRM browser suites ran against the unmodified source in its isolated worktree at `http://127.0.0.1:5260`; their generated files are ignored and not part of this branch. The prototype ran from its own local static server at port 5241. No real client records were opened by the prototype.

## Next gate

The owner can review the expanded visual and information architecture now. Connecting these pages to working finance commands requires approval of the visual direction and B01/B02/B04/B05/B07/B10/B11 accounting, role, cutover and backend decisions. After that, the frontend, server authorization, migration and live posting must be implemented and independently retested together before any production merge or deployment. The current source remains browser-local and is **not production accounting ready**.
