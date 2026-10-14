# GitHub publication — complete AZZORA CRM

Publication date: 2026-10-14. Target: https://github.com/Fazilfazi991/Azzora.
Review branch: `codex/azzora-final-crm`. No automatic merge or deployment.

## Verified source and publication provenance

- Original tested application: `861db54bcbb171fe3ac4f8a36b604333b4595e67`.
- Original documentation delivery: `060b35dac2882834f0e9539aadde2f8da24b0c76`.
- Sanitized corresponding delivery: `8c52840438d92fe2ff70e7e87cd0cd2339e4d988`.
- Sanitized initial baseline: `620f4e40948ecf71fa923e28a886a1c2eb784a64`.
- Application source tree: `8439141b90e0d2e6c8f7dd6dab701073480d6d37`.
- Test tree: `4afbd991131652d1b7548e6ffcb1580e04195b4e`.

The target repository had no branches or commits when inspected. Its initial `main` is the sanitized supplied baseline; the complete CRM is proposed through a pull request. Existing local `main`, tested worktree, original commits and original QA evidence remain intact locally.

All 62 original commits are represented in the publication history with their parent relationships, author metadata and messages retained. Every publication commit records its original local SHA. `PUBLICATION-COMMIT-MAP.json` provides the complete mapping. SHAs change because exported browser databases and generated evidence were removed throughout history, rather than merely deleted from the final tree. One additional publication-only commit adds this report, the map, publication ignore rules and a README clarification.

Source, tests, public runtime assets, lockfile, package manifest and build configuration are byte-for-byte identical to the verified delivery. No implementation changes or backend work were performed for publication.

## Publication audit

The full proposed history was checked: 401 unique retained blobs scanned; zero matches for private keys, GitHub tokens, AWS access keys, OpenAI keys, Google API keys, Slack tokens or credential-bearing URLs. An additional assignment-pattern check found no credential assignments in current source, tests or primary coordination documentation. Pattern scans do not establish the absence of every possible secret format.

Excluded throughout history: browser database snapshots, generated QA/PDF/screenshots/logs/results and evidence manifests, output folders, environment files, credentials/key files, dependencies, build/coverage/temp folders and the redundant supplied ZIP archive. The filter excluded 1,039 historical paths. Intentional application demonstration seeds, source reference data, ordinary test code and supplied design references remain part of the unchanged application.

All narrative Markdown reports and the client walkthrough are included. Historical evidence links and original Git SHAs in those reports refer to retained local evidence and the original local history; raw evidence is deliberately not published. Do not interpret those links as files available on GitHub. The client walkthrough can be followed manually without exporting its browser database.

## Completed modules

Customers; project planning and tasks; guided quotations and nested BOQ; accounts; contracts; invoices; receipts and reversals; expenses; VAT, discounts, credits, refunds, budgets and reports; variations; suppliers; procurement, purchase orders, deliveries, supplier bills and costs; workforce assignments; immutable document versions; approvals; site updates; QA/snags; handover and commercial closure; global search, quick actions, settings, backup and recovery.

Quotation entry uses five guided steps with progressive BOQ disclosure, worked examples, category summaries, payment milestones, terms and preview/issue. Accepted quotations and issued financial snapshots remain immutable. Financial and workforce integrations preserve canonical command paths, atomic transitions and the existing `azzora-demo-v1` storage key.

## Verification inherited from the frozen application

The independent verification reports for the original tested SHA record:

- 304 unit tests passed; no expected failures or skipped regressions.
- 21/21 browser suites passed on development and again on production builds.
- TypeScript, ESLint and production build passed.
- Responsive checks passed at 1440, 1024, 768 and 390 pixels.
- PDF verification passed, including quotation, invoice, procurement, credit and report output. Detailed scope and infrastructure attempts are documented in `AGENT-3-QUOTATION-UX-QA.md` and `QUOTATION-UX-DELIVERY.md`.

Publication verification compares Git trees and every retained file against the frozen delivery. These inherited results are not a claim that the full browser suite was rerun on the publication-only commit. No GitHub CI configuration is supplied in this revision.

## Remaining limitations

This is a browser-local demonstration, ready for owner acceptance review. Demo identities are not secure authentication or authorization. LocalStorage and small data-URL attachments are not server persistence, cloud backup or concurrent multi-user storage. Physical devices, other browser engines and production print environments require separate acceptance. The existing Vite bundle-size advisory remains.

Production work still requires separately scoped authentication/RBAC, transactional database and API, concurrency controls, secure file storage, audit/security review, backups, deployment and CI. No production readiness or backend implementation is asserted.

See `CLIENT-DEMO-WALKTHROUGH.md`, `QUOTATION-UX-DELIVERY.md`, `FINAL-INTEGRATION-REPORT.md` and `../BACKEND-READINESS.md`.
