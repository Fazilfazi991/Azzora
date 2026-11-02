# Specifically authorized document review — 2 November 2026

Preview: https://azzora-accounts-client-review-e8vgx5e5a-faziils-projects.vercel.app/accountant.html

- Tested application SHA: `039869b2fa563fea457a35a775c8f34fdd15b540`.
- Deployment: `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy`, READY Preview, target null.
- Owner explicitly approved the supplied quotation photo for DeepSeek processing under the existing shared USD5 application cap, acknowledging unverified API-specific retention/training controls. This is not permission for arbitrary real documents or production posting.

## Implemented scope

One exact document digest is configured server-side for this deployment. It supplements the forty existing synthetic hashes. The document, its digest value and extracted business details are not committed or placed in public assets. API credentials remain server-side. Removing the authorization prevents access even to a cached result. Unknown other documents remain rejected before provider access.

The authorized document is always restricted to review drafts. The policy is applied to fresh and cached results and persists in saved review history. Conversion buttons are unavailable, and both bill and expense conversion commands reject the document server-side. Editing the document type cannot bypass the restriction. Raw model fields remain immutable; the review policy identifies the supplied source as a quotation. Labels distinguish the fictional demo ledger from the authorized source document.

## Actual-photo verification

The supplied original JPEG was uploaded through the hosted Accountant form. One uncached actual DeepSeek request completed: `20b7cf75-8482-45dd-b4fe-0bf42dc2000d`,1316 input tokens and898 output tokens. The initial response was preserved locally as private evidence. Later validations reused that same real response with an explicit cached label and no second paid call.

The issuer, date, reference, quotation type and all twelve rows populated the editable form. Every row's quantity, rate, VAT and gross figure matched the supplied image; document VAT and grand total matched as well. The model left subtotal blank and flagged it uncertain; the reviewer entered the printed subtotal explicitly. Classification/category were selected explicitly before saving. These corrections are not presented as original AI results. Units not printed on the source were not invented.

The reviewed draft saved with correction history and unchanged raw extraction. Finance metrics remained unchanged. Both bill and expense conversion requests returned HTTP400 with document-specific rejection messages. A prior candidate blocked the quotation but classified its domain error as HTTP503; the final application corrects that response classification, and no financial conversion occurred.

Desktop1440px and mobile390px rendering passed, with the original photo, editable fields, uncertainties and review-only warning checked. Another isolated session retrieved the same real extraction and retained the posting restriction. No browser JavaScript errors occurred in the final run.

## Checks and preservation

-758/758 unit tests across51 files passed; TypeScript, full source ESLint and hosted production build passed.
- Six final hosted workflow groups passed, including the exact authorized JPEG and both server-side posting prohibitions.
- Credential/source/client-bundle scan found no credentials or forbidden local artifacts.
- Stable Accounts alias remains `dpl_7F7DwZXXLWHsz8WjXUePuDsN4KTb`; Manager production remains `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`; GitHub main remains `fd7754dfe0022f9b64bf875313bd9679cb0144eb`. No push, main merge, stable-alias reassignment or production promotion occurred.

The observed token usage has a conservative published-peak upper estimate of USD0.001473. Actual provider-billed dollars remain unverified. Previous spending and uncertain reservations remain within the same shared application budget; this release did not create a new USD5 allowance or assert verified provider-account controls. Review-only scope, VAT-policy restrictions and no automatic posting remain in effect.

Private local evidence is under ignored `tmp/owner-review/`: `private-first-uncached.json`, `private-extraction.json`, desktop/mobile screenshots, `summary.json` and `final-unit.txt`. These files contain authorized document information and were not deployed or committed. This report intentionally omits the document's business identities, reference and financial figures.
