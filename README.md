# AZZORA — Interior Fit-Out Project Control

A functional, browser-local demo adapted from the supplied Google Stitch screens. Supplied HTML, design screenshots and logo PDF are retained. The redundant ZIP and generated QA/browser database exports are excluded from GitHub publication.

See the [complete CRM GitHub delivery and verification record](docs/coordination/GITHUB-DELIVERY.md) and [client demo walkthrough](docs/coordination/CLIENT-DEMO-WALKTHROUGH.md).

## Run

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the Vite Local URL. All routes use hash navigation, so the static build does not require server rewrites.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
npm run test:quotations:browser
npm run test:commercial:browser
npm run test:commercial:boundaries
npm run test:operational:browser
npm run test:operational:boundaries
npm run test:boq:visual
```

Browser verification uses an isolated headless Chrome/Edge context and does not modify your normal browser profile. The dev server must be running on port 5173. The browser helper detects Windows/macOS/Linux Chrome or Edge; set `CHROME_PATH` to override, or install Playwright Chromium if neither is available. Commercial journey tests also accept `AZZORA_URL` for testing a static production preview.

## Architecture

- `src/domain/model.ts`: strict relationship types.
- `src/domain/seed.ts`: fictional UAE data, standard plan and checklist factories.
- `src/domain/logic.ts`: weighted progress, hierarchy, risk, workload, handover and date rules.
- `src/domain/repository.ts`: repository contract, browser persistence and validated domain commands.
- `src/store.tsx`: shared application state and atomic mutations; persistence failure leaves the visible data unchanged.
- `src/components/`: shell content, directory, dashboard, wizard, workspace, shared task drawer, planning, operations, team and handover.
- `src/styles.css`: local tokens translated from Stitch's Architectural Prestige design, responsive navigation and mobile task programme.
- `tests/browser.mjs`: route/viewport and full delivery journey checks.
- `src/commercial/`: Customer Master, contracts, invoices, receipts/reversals, incurred expenses, financial calculations, reports, PDF and additive migrations. All use the existing repository and storage key.
- `tests/commercial-browser.mjs` and `tests/commercial-boundaries.mjs`: connected commercial journeys, responsive layouts, storage failures and conversion boundaries.
- `src/operations/`: variations, supplier master, procurement, shared demo approvals, credits/refunds, budgets, company settings, document revisions and commercial closure. Its additive `operations` namespace lives in the same database and storage key.
- `tests/operational-browser.mjs`: complete operational and financial journeys at 1440/1024/768/390px. Run it before `tests/operational-boundaries.mjs`, which uses its isolated UI-created fixture for search, quick actions, reversals, reassignment and settings checks. Both accept `AZZORA_URL`.

## Demo boundaries

Seven operational projects plus the reference quotation project, sixteen employees, 259 tasks, weighted phases, milestones, team assignments, updates, snags and document metadata. These are fictional examples. Financial collections start empty; project estimates are not treated as accepted contracts. Current demo actor is Sarah Mansoor. Records are stored under `azzora-demo-v1` in browser localStorage. Export from Settings before resetting or clearing the browser.

LocalStorage supplies no authentication, authorization, backups, collaboration or durable cloud file storage. Small attachments (up to 750 KB each) are browser-local data URLs; quota errors are surfaced and do not commit a mutation. Seeded documents have metadata only. No backend or production deployment was created.

Inter and Space Grotesk are referenced by Stitch but no font binaries were supplied. The application uses system sans-serif fallbacks without downloading fonts. The displayed logo is a rendered crop from the supplied PDF; the original is preserved.

See [initial audit](docs/INITIAL-AUDIT.md), [implementation report](docs/IMPLEMENTATION-REPORT.md) and [backend readiness](docs/BACKEND-READINESS.md).

See the [commercial foundation audit](docs/COMMERCIAL-AUDIT.md) and [commercial delivery report](docs/COMMERCIAL-DELIVERY.md) for feature coverage, formulas, test results, screenshots and production blockers.

See the [Phase 3 audit](docs/OPERATIONAL-AUDIT.md) and [operational completion report](docs/OPERATIONAL-COMPLETION-REPORT.md) for the connected operational modules, accounting rules, verification results and retained screenshots. Approvals use recorded demo identities, without secure role enforcement. Operational handover is independent of commercial closure unless the explicit Settings policy is enabled.
