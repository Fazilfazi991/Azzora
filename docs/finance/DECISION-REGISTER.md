# Finance decision register

These decisions are open. Pure local domain work can proceed, but no historical accounting migration, real-data posting, secure-login claim or production release follows from this document.

| ID | Owner decision needed | Consequence until answered |
| --- | --- | --- |
| B01 | Which accountant actions require owner approval? | Posting/overrides remain unconnected to live document commands. |
| B02 | Who approves site expenses and can requesters approve their own? | Submission workflow is configurable; no assumed approver. |
| B03 | Which document types require real field extraction? | Manual draft/upload only; no simulated OCR. |
| B04 | Accrual/cash basis and project revenue recognition policy? | No production P&L or legacy posting. |
| B05 | Company VAT/TRN status, tax rates/exemptions and required invoice fields? | No tax compliance claim or default Normal Invoice treatment. |
| B06 | Project/site cost and overhead allocation rules? | No company overhead allocated to projects automatically. |
| B07 | Staff cash-holder visibility and spending permissions? | No shared custody account exposure to site users. |
| B08 | Advances against proformas and related tax treatment? | Proforma remains non-posting; advances are not silently counted as invoice receipts. |
| B09 | Historical PDF import: read-only archive or editable draft after review? | Import remains a separate later workflow. |
| B10 | Cutover/opening balances and legacy outstanding reconciliation? | Original records remain untouched and no auto-posting occurs. |
| B11 | Authorized identity, backend, shared storage and attachment architecture? | Secure individual login and data-level enforcement are blocked. |
| B12 | Supported currencies, exchange source and revaluation? | Core local prototype uses AED integer fils only. |
