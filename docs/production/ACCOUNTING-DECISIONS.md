# Owner / Accountant decision sheet

Status: **deferred by the Owner; real posting remains locked.** Free-tier infrastructure may be prepared. Skipping policy collection does not approve VAT, opening balances, real documents, or financial cutover. No decision below has been inferred from the fictional demo.

| Decision | Required owner/accountant input | Current behavior |
| --- | --- | --- |
| Company VAT/TRN | Authorized legal company details, registration state/TRN, applicable tax treatment/rates and account mappings | Unapproved; real tax posting blocked |
| Tax / Normal / Proforma | Legal document fields, numbering prefixes, Tax Invoice eligibility and Proforma advance treatment | Proforma never recognizes revenue; legal Tax Invoice execution remains blocked pending approved implementation/acceptance |
| Revenue recognition | Invoice issue, receipt, or certified milestone; deferred revenue / WIP treatment if applicable | Only existing invoice-issue mechanics are exercised in synthetic contract tests; other methods explicitly block activation |
| Expense / financial authority | Posting roles, independent approver roles, monetary limit, reversal authority and chart-change approval | Production `finance.post` and MFA required; independent source-linked expense approval required; chart changes invalidate the approved chart digest |
| Customer advances | Liability, allocation, recognition and refund timing | Real advances blocked until the approved treatment is implemented and tested |
| Project cost allocation | Direct project/company expense rules and any overhead allocation | Explicit project/company dimensions supported; custom overhead policies blocked until implemented |
| Opening balances | Reconciled bank/cash/staff cash, AR/AP documents, capital/retained balances, supporting evidence and approved import digest | Empty initialization creates no opening journals or fake balances |
| Cutover | Effective date, approved migration plan, verified backup/restore receipts and accountant reconciliation | Ordinary posting before the approved cutover/effective date is blocked; no real import or cutover authorized |

## Review / approval mechanism

The implemented `productionPolicySchema` stores a versioned company-specific draft with explicit nullable deferred decisions. `productionCompanySettingsDigest` binds legal/tax settings and numbering **prefixes**, excluding routine next-number counters. The chart digest binds the exact accounts. Changing a prefix, tax setting, company detail, or chart invalidates the corresponding approval.

The trusted server must load immutable Owner **and separate Accountant** policy approval receipts for the exact policy digest/revision, and separate real-posting-activation receipts. Approval identities must have genuine same-company role/MFA evidence. SHA256 is an integrity binding, **not** an identity signature; these receipts must come from a reviewed ACL-protected approval store and never from browser command fields.

`applySharedCommand` accepts an optional fourth **server-only** `ProductionCommandOptions`. Missing options, unsigned/deferred decisions, invalid identity/role/MFA, changed config, missing activation or unverified production RPC/storage contract deny production financial writes. The actual candidate backend must leave this context unconfigured until all approvals and runtime verification exist; synthetic tests deliberately supply isolated fixture approvals, not real approvals.

Nonfinancial typed Manager commands and authorized document drafts reuse the existing command engine. Production cannot inherit the client-review password-only exception or substitute `finance.simulate` for `finance.post`. Master-data finance commands use the same production gate; no new posting engine or parallel finance database was added.

## Technical handoff / limitations

- Empty production constructors require explicit company settings. They never import demo seed records, parties, bank masters, periods or balances; supplied chart/period definitions are validated by the existing accounting core.
- Existing stage behavior and its separately authorized fictional opening balance are unchanged.
- Positive synthetic tests cover zero-tax itemized Normal invoices, nonposting Proforma, receipt allocation, supplier bill/payment, independently approved project expense, bank/cash transfer and balanced reports through the existing engine. Failure/limit/duplicate/backdate cases preserve the prior state.
- Full real production activation remains **NO-GO**: no approved production database/atomic RPC contract, no real approval receipts, no signed policies/openings/cutover. Nonzero VAT/legal Tax Invoice, advances, alternative recognition, custom overhead rules and review-to-expense independent-approval linkage remain explicitly blocked rather than guessed.
- Existing demo-origin PDFs and journal `recordedAt` generation need production-context verification/correction before real traffic; these are not represented as solved by a policy model.
- Company expense submission/approval routing must support the approved company-level policy before real company expenses can post; project expense approval does not imply that approval.

Only after the Owner resumes policy collection should this sheet be completed with values, approver identities, dates and source evidence. No repeated request for the deferred details is needed during the safe implementation checkpoint.
