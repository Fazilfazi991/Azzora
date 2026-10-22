# AZZORA Accounts — Purchase Bill Auto-Fill Review

Updated 22 October 2026. This is a local, isolated Accounts client-review change. It is not deployed, pushed, promoted, or merged. Manager CRM production was not changed.

## Workflow

Purchase Bills now offers two routes: **Upload & Auto-Fill** opens the existing DocumentEntry review, and **Manual Entry** retains the existing validated bill form with an optional supplier invoice reference and attachment. The review keeps the original document beside editable fields, highlights missing or uncertain values, matches existing suppliers/products/projects/categories, warns on duplicate references and known product price changes, records correction history, and offers a separate explicit bill-creation action after draft saving.

Saving a document draft changes only the document review record. It does not change bills, expenses, settlements, the accounting journal, or reports. A reviewed supplier bill can be converted through the existing `bill` transaction branch, using the existing journal posting, payable, attachment, idempotency, and duplicate checks. A retry with a new action key is rejected after conversion; normal API retries are idempotent.

The current demo ledger has no input-VAT account or approved VAT posting policy. Consequently, conversion refuses VAT-bearing documents; it requires the accountant to verify a VAT-free subtotal equal to total, a due date, a PO reference, and a supported category. Other classified documents remain drafts. No AI-generated account or journal mapping is accepted.

## Reading and classification

Selectable-text PDFs use PDF.js locally on the server to read up to five pages and extract labeled supplier, invoice reference, invoice/due dates, PO reference, item rows, quantities, units, unit rates, line tax/amounts, subtotal, tax, and total where the text layout is supported. A deterministic parser proposes classification from printed words; exact existing-catalog matching and saved, explicitly confirmed supplier defaults apply afterward. Each value remains editable and requires human confirmation.

The 40 prepared synthetic fixtures continue to show **prepared demo suggestions**, not actual extraction or AI. Arbitrary PDFs with selectable text show **local PDF text extraction**. No paid AI provider is called. No open-source image OCR executable or package is installed in this worktree, so photos and image-only/scanned PDFs stay blank for manual entry; the UI labels that limitation instead of guessing. Arabic/English labeled fields and Arabic numerals are handled by the local text parser when present as selectable PDF text. Layouts outside the supported labels/table format need manual correction.

## Verification

Final tested source revision: `e2cbe5de1ad36fadb99f9b93979763ce6f3a67ec`.

- TypeScript: pass.
- ESLint: pass.
- Full Vitest regression: 557 passed across 34 files.
- Accounts-only Vite production build: pass.
- Combined Vite production build: pass.
- Purchase-bill browser workflow: 21/21 checks passed with zero page errors against the local HTTPS hosted-handler harness. It verified uploads and prepared examples, actual PDF text extraction for an unregistered file, manual fallback for an unregistered image, preview and correction flows, draft posting boundaries, refresh, duplicate upload, logout, and 1440/1024/768/390 px layouts.
- Existing Accountant browser regression: 14/14 checks passed with zero errors, including invoice and bill posting, receipts, supplier payments, paid expenses, ledger/report reconciliation, PDF downloads, login/logout, isolation, and 1024/768/390 px layouts.
- Unit/API coverage includes multi-item and multi-page PDF extraction, Arabic/English labels, missing fields, image OCR fallback, draft-only persistence, VAT refusal, line-math refusal, one-time conversion, authenticated hosted action, idempotent retry, and duplicate conversion rejection.
- Visual review screenshots are in the ignored local folder `tmp/purchase-bill-autofill-browser/`, including Purchase Bills at desktop/mobile, the filled sample review, and the actual local PDF extraction screen.

## Hosted review gate

No push or deployment was performed. Before a hosted client review, the owner must authorize publication and the dedicated Accounts Vercel Preview must be built with `AZZORA_ACCOUNTS_PREVIEW=1`, protected by the application Accountant login, and supplied only its existing Preview-only password hash and private Blob token. Verify login, refresh, upload/preview, extraction labels, draft persistence, bill conversion, duplicate retries, PDFs, responsive layouts, and isolated fictional data against the immutable Preview URL before sharing the stable client alias. Do not promote this branch or change the Manager project.

This remains a fictional demo, not production accounting. Image OCR, input VAT posting, a live AI provider, and production authentication/accounting policies are unavailable.
