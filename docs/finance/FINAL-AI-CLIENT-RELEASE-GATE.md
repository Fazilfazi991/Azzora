# Final AI client-demo release gate

6 November 2026. **Recommendation: GO for restricted fictional-data client review and preparation of the stable Accounts alias switch.** No alias was reassigned. Real-company documents and production accounting remain disabled.

## Verified candidate

| Item | Value |
| --- | --- |
| Client Preview | https://azzora-accounts-client-review-38pefljhg-faziils-projects.vercel.app/accountant.html |
| Deployment | `dpl_FiNSszjSsMrVrnXBtCra3qxxxHis`, READY, Preview |
| Tested application | `28a52f01b30a012620b0e1e3cd938dad26b059ad` |
| Isolated source branch | `codex/azzora-ai-client-release-gate` |
| Stable alias prepared | `https://azzora-accounts-client-review-faziils-projects.vercel.app` |
| Current stable / rollback deployment | `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy`, retained and still assigned |

The previous immutable Preview accepted only its immutable hostname. An alias-only reassignment would therefore have broken sign-in. This candidate explicitly opts in to the **one exact existing Accounts alias**, while retaining its immutable origin and same-origin/CSRF checks. Arbitrary origins, Manager production and production-mode promotion remain rejected. This configuration prepares compatibility; it does not change the alias. Actual stable-host smoke tests must follow the separately authorized alias switch, with rollback on failure.

## Seven requested gates

| Gate | Verified result |
| --- | --- |
| Individual restricted account and MFA | Dedicated `client-review@staging.azzora.test`; actual browser password → existing authenticator challenge → dashboard, assurance `aal2`. Only `finance.read` and `finance.draft`, Accountant workspace. No Manager, financial simulation, real posting or administration capability. |
| Fresh actual extraction | Previously unseen fictional G14 uploaded once by that restricted account to this exact deployment. Genuine `deepseek-flash` response, uncached, provider request `a539b37f-d0d5-46cd-aaf8-ea356479cfa2`. Supplier, dates, reference, department, both item rows, quantities, rates, VAT and totals populated. |
| Editing and uncertainty | All six item quantity/rate/total fields and the document total edited and restored. Classification changed through the form. Unknown classification and missing information were flagged; review remained mandatory. |
| Draft does not post | Save Draft preserved original extraction and one correction revision. Metrics, every ledger/report, invoices, bills, receipts, supplier payments, expenses, cash accounts, transfers and supplier/project catalog remained exactly unchanged. |
| Permission isolation | Six attempted financial commands returned 403. Client Manager access denied; anonymous snapshot/attachments denied; unknown attachment 404; forged company query could not switch the catalog. Existing Site Staff login verified scoped projects and omission of customers/suppliers/Accountant bills; Finance snapshot and attachment requests returned403. Authorized attachment matched the original SHA256. |
| Metering and spending | Actual provider usage 1289 input/217 output tokens matched the new shared ledger record. Full-envelope reservation 324404 microUSD preceded inference; metered upper amount 648 microUSD. Existing history was retained. Provider billing remains unverified. |
| Final hosted regression | 30 route/viewport checks: 15 routes at 1440 and 390px, no page overflow or browser errors. Mobile navigation, actual MFA sign-in, refresh and durable logout passed. Financial reports and all 20 journal balances reconciled. |

Exact results: [hosted client checks](evidence/client-release-gate-2026-11-06/hosted-client-results.json), [staff permission checks](evidence/client-release-gate-2026-11-06/staff-permission-results.json), [metering proof](evidence/client-release-gate-2026-11-06/actual-usage-metering-proof.json).

## Accuracy limitation — disclose to the client

G14's quantities, rates, line totals, subtotal, VAT and grand total matched its fictional original: subtotal AED 70.50, VAT AED 3.53 and total AED 74.03. **The model left classification unknown and the printed document discount blank.** They were flagged for review, and the reviewer explicitly chose Supplier purchase bill and entered the printed zero discount. The original AI response remains unchanged. The screenshots labeled “reviewed” show those human choices; they are not evidence of correct automatic classification.

The earlier new G13 original on `8570f1c` likewise populated all three rows and amounts but left classification unknown and document discount blank. Its strict classification assertion failed and is preserved. The same record was then reviewed, corrected and saved successfully without another provider call or financial change. No fixture, answer or cached result was substituted to turn those omissions into accuracy passes.

This is a successful **partial extraction → human review → draft** workflow. It is not 100% extraction accuracy. Do not promise that classification or every optional field will fill correctly. The prior ten-document results and their department omissions also remain preserved in the [earlier report](GENERAL-DOCUMENT-AUTOFILL-REVIEW.md).

## Financial regression evidence

Activity period: 1 January–6 November 2026; balances as of 6 November 2026. All figures are fictional.

- Revenue AED 2,000.00 − cost of sales AED 205.00 = gross profit AED 1,795.00.
- Operating expenses AED 0.00; net profit AED 1,795.00.
- Receivables AED 1,680.00 and payables AED 90.00 matched outstanding document totals.
- Bank AED 100,205.00; cash AED 0.00.
- Trial balance debit and credit each AED 102,090.00; balance-sheet difference AED 0.00.
- General-ledger closing balances matched trial balances; all 20 journal IDs balanced individually.
- All these values and authoritative transactions were identical before and after both extraction and Save Draft.

The restricted user cannot issue invoices, post purchase bills, record payments/expenses or transfer cash: six direct API attempts returned 403 without changing balances. Other Accountant modules remain readable. This account is deliberately for read/review/document-draft acceptance, not unrestricted financial demonstration.

## Build and security checks

- **1,050/1,050 unit tests**, 80 files, tested release source.
- New identity migration: **27 offline PostgreSQL security cases** including exact identity/purpose, capability drift, tenant boundaries, MFA, ACLs, revocation and preservation of the existing four identities.
- TypeScript and ESLint passed. Accounts staging and combined default builds passed. Native unbundled Node server startup passed.
- Nine existing browser suites remain recorded at `771ff3c`; affected document UI and Accounts checks remain recorded at `8570f1c`. This release changes only the admission function and exact-origin configuration, with the final actual hosted client/security/report checks above; no financial engine or UI redesign was introduced.
- Staging migration `20261106063844_ai_client_review_identity.sql`, SHA256 `f2f2844d923718ec31c524dda4c54264f99f8f4ab243fddefe5c23c0dba917e6`, generated with the official CLI, reviewed and executed through the authorized staging SQL Editor. The initial editor append caused a parse error; the document was cleared and the reviewed migration was successfully applied and verified. No financial data was affected by that failed attempt.
- This adds only the exact new fictional Auth UUID/email/purpose with read/draft grants. It does not allow arbitrary new users, change the four existing users, enable real processing, or make the grant RPC browser-callable. It is not a production migration or a `db push` claim.

## Spending result

The shared USD 5 application allowance was **not reset**. It now contains 22 metered records, with total conservative exposure USD 0.014440 and **USD 4.985560 remaining**; there are no unresolved reservation records.

This release gate made two new paid calls: G13 at 686 microUSD upper estimate and G14 at 648 microUSD, totaling **USD 0.001334 upper estimate**. These are usage-based conservative estimates, **not confirmed provider-billed charges**. Provider-account spending controls remain unverified under the owner's previously approved application-cap exception. No automatic paid retries occurred. No live real-document processing was enabled.

## Client access instructions

1. Open the Client Preview above. No Vercel login is required.
2. Sign in as `client-review@staging.azzora.test` using the password from the private local owner access packet. Assign this account to one reviewer only; deliver its password privately, not through Git or a public message.
3. On the client's first sign-in, scan the generated QR code with their own authenticator and enter its six-digit code. A genuine temporary QA enrollment was verified, both known client QA sessions were logged out, and only that newly created QA factor was retired. No QA authenticator seed is handed to the client; the original four users' factors were untouched. Portal access still requires verified MFA.
4. Open Purchase bills & upload → Read a bill, confirm fictional-file consent and choose Upload & Auto-Fill.
5. Use PDF/PNG/JPEG files up to 2 MB (PDFs up to five pages). Compare the original against every field. Choose classification and correct highlighted/missing values where needed. Confirm review and Save reviewed draft.
6. Check the saved draft and reports. Uploading or saving drafts must not change financial balances. This account cannot issue, pay or post.

The private packet is `tmp/PRIVATE-CLIENT-ACCESS.txt` in the release worktree. It is ignored, contains no API key, is not part of the evidence/repository, and was not sent to anyone. No real client invitation or email was sent. This reserved staging address is a login identifier, not a working mailbox or verified email-recovery service.

Handoff state: [MFA verification](evidence/client-release-gate-2026-11-06/restricted-client-mfa-verification.json), [temporary-factor cleanup and client enrollment requirement](evidence/client-release-gate-2026-11-06/client-handoff-status.json).

## Alias replacement and rollback plan

Prepared replacement, **not executed**:

- Reassign only `azzora-accounts-client-review-faziils-projects.vercel.app` to `dpl_FiNSszjSsMrVrnXBtCra3qxxxHis` after owner approval.
- Do not rebuild, promote to production, change Manager aliases, change production environment variables or merge/push main.
- Immediately verify the real stable hostname: app login without Vercel authentication, MFA, private APIs, refresh/logout, upload/review/draft, unchanged reports and mobile navigation.
- If a hosted acceptance check fails, reassign that alias to retained `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy`. Preserve both deployments and test data; do not reset storage or the budget. The previous deployment retains its earlier demo-login flow; the new individual staging login remains available at the new immutable Preview.

Latest preservation check: Accounts stable still `dpl_ESphaGfTKeRK8wzRt7AcYiaWwSjy`; Manager `azzora-seven.vercel.app` still `dpl_F9kD9Vu4ioWTCJrQwD2ev5J6mYmp`; GitHub main still `fd7754dfe0022f9b64bf875313bd9679cb0144eb`.

## Screenshots

- [Client login](evidence/client-release-gate-2026-11-06/client-login-1440.png)
- [AI-populated fields after explicit human classification/discount review — desktop](evidence/client-release-gate-2026-11-06/G14-reviewed-fields-1440.png)
- [Reviewed fields — mobile](evidence/client-release-gate-2026-11-06/G14-reviewed-fields-390.png)
- [G13 original unknown classification, before correction](evidence/client-release-gate-2026-11-06/G13-uncertain-classification-1440.png)
- [Verified restricted staging grant](evidence/client-release-gate-2026-11-06/restricted-grant-supabase.png)

**Release scope remains fictional client review. Real documents require separate provider-processing/privacy and operational-budget approval; real accounting also requires the outstanding business-policy and production approvals.**
