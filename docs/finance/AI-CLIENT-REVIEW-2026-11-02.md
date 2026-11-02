# Accounts AI client review — 2 November 2026

## Hosted delivery

- URL: https://azzora-accounts-client-review-hrsea2ws1-faziils-projects.vercel.app/accountant.html
- Deployment: `dpl_4vDXws16NwMzG4wYe9Q3GqEgG3Ku`, READY Preview, target null.
- Tested application SHA: `3f9b8f95abb632cfd78b878508b587288ba7d392`.
- Branch: `codex/azzora-accounts-stabilization-final`.
- Existing Accountant credentials work; no Vercel account is required. Passwords and provider keys are not included here.
- Purchase bills & upload → Upload & Auto-Fill. Download the fictional image, PDF or Arabic/English sample on that page, upload, review and correct the fields, select the category/project, confirm and Save reviewed draft.

## Authorization and safeguards

Owner explicitly approved a shared USD5 APPLICATION allowance in place of independently verified provider-account caps for fictional client testing. Provider billing controls remain unverified. Preview-only deployment overrides enable DeepSeek and the application allowance; the existing sensitive Preview key is inherited without retrieving or printing it.

The server restricts paid extraction to the 40 approved synthetic hashes. No real documents are authorized. A conditional shared private budget reserves the complete model envelope before each request, retains uncertain charges, and survives session/deployment/key changes. No automatic paid retries. Raw successful provider responses and validated real results are privately cached; repeated files clearly display cached real AI results without another paid request. Missing historical results do not permit charging the same digest again. No synthetic replay is labelled as live AI. Draft saving does not post a bill, expense, payment or journal.

VAT policy remains pending. This is a fictional client-review workspace, not production accounting or legal tax-invoice functionality.

## Verification

- 748 unit tests across 50 files passed on the final application; full ESLint passed. TypeScript and document tests passed on the integrated recovery implementation. Hosted production build passed.
- Tracked-file/client-bundle credential scan: no findings. Source deployed from frozen Git archives, excluding local credentials, dependencies, local databases and generated output.
- Three actual DeepSeek extractions succeeded: English image 05, selectable PDF 04, Arabic/English image 03. Actual request IDs and nonzero usage were captured; provider-reconciled dollar cost remains unknown (`costUsd: null`). This was a smoke test, not the deferred 40-document model benchmark.
- Final root hosted smoke passed: login without Vercel SSO, real extraction provenance, original image/PDF rendering, desktop/1024/768/390 layouts, editable fields, explicit human project/category selection, correction history and immutable original extraction, Save Draft with unchanged finance metrics, refresh, isolated sessions, cross-session real-result reuse, Manager browser-storage sentinel, logout/401, zero browser JavaScript errors.
- Independent hosted QA passed: 13 desktop finance navigation routes, four mobile routes, separate login/refresh/logout/401, cached real sample 05, original preview, correction and draft saving with existing transactions/metrics unchanged; eight fresh screenshots visually inspected; no new paid calls or native503 in that short run.
- Manager production remains `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`; existing stable Accounts alias remains `dpl_7F7DwZXXLWHsz8WjXUePuDsN4KTb`. GitHub main remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`. No push, main merge, alias reassignment or production promotion was performed.

## Measured limitations

Selected document fields matched fixture expectations in 20/21 exact comparisons; selected item fields matched 32/36. These small-sample exact comparisons are not a general accuracy estimate.

- Arabic/English 03: supplier-bill ground truth received a project-expense suggestion. Its Arabic-expanded item description also differs from the English-only fixture wording.
- PDF04: second item printed quantity3/rate16.25 was extracted as quantity2/rate3; the printed total51.19 was retained. The UI flags arithmetic/subtotal inconsistencies. Its second description also dropped the trailing2. An accountant must correct these fields; no posting occurred.
- Earlier diagnostic samples01/02 fell back to manual after field validation failures; those attempts/history remain preserved and are not recharged. Current public links use approved05/04/03. A Node24 JSON-import packaging fault was corrected before the successful final release.
- Earlier strict concurrent-write testing recorded a native503 on a previous revision. This AI release does not claim that concurrency fault is resolved; normal single-user review checks passed. No production-readiness claim is made.
- Live extraction accepts only approved fictional files. Repeated sample results are explicitly cached; new real client bills and unrestricted paid use remain outside this approval.

## Local evidence

- `tmp/ai-client-review/hosted/results.json` — final hosted smoke and extraction results.
- `tmp/ai-client-review/first-real-05-required-human-classification.json` — first successful live05 response; initial harness omitted the required human project selection, corrected before the final pass.
- `tmp/ai-client-review/field-checks.json` — selected exact field comparisons.
- `tmp/ai-client-review/unit-final.txt` — 748 passing tests.
- `tmp/stabilization/ai-client-cached05/summary.json` — independent final hosted QA and screenshots.
- `tmp/ai-client-review/hosted/*.png` — desktop/mobile English, PDF and Arabic review screenshots.

Evidence folders are ignored and were not uploaded. This report is documentation after the frozen tested application SHA; no rebuild is required for it.
