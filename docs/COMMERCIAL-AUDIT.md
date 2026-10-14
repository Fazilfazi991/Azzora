# Commercial foundation audit — 14 October 2026

The supplied copy contains React 19/Vite/TypeScript, one synchronous browser-local repository (`azzora-demo-v1`), operational domain commands and shared modal/drawer controls. No Git metadata, installed dependencies, remote or preview deployment configuration was supplied. A new local baseline preserves the supplied files; work continues on `codex/azzora-commercial-accounts`. Historical commit identifiers in prior reports cannot be recovered from this copy.

Reviewed the source inventory, shell/routes/search/settings/reports, project directory/wizard/workspace, planning/dependencies, tasks, team, updates, snags, documents, handover, seed/repository/progress logic, quotation models/repository/calculations/editor/vector PDF renderer and existing tests/validation reports. Original Stitch assets remain unchanged.

## Gaps

- Client has only ID/name/contact. No customer directory, profile, archive or duplicate detection. Project creation unconditionally inserts a client, including when the ID already exists.
- Quotation has customer/project snapshots and optional master IDs; selectors cannot create records and project choices are not customer filtered. Relationship validation does not reject mismatched customers/projects.
- Existing quotation statuses use Finalized/Sent for issuance. Transition controls permit arbitrary terminal-state changes. Accepted quotations lack a contract/conversion association. Existing BOQ, nested rows, VAT, payment schedule, revision and PDF features must be retained. No discount field exists in this copy.
- No invoices, receipts, allocation/reversal, expenses, contracts, ageing or project financials. Dashboard only reports delivery; Reports only exports portfolio CSV. Quick Add opens only the project wizard. Search lacks commercial entities.
- Browser scripts hardcode a macOS Chrome path, incompatible with this Windows host. Existing validation counts are historical evidence, not results for this implementation.
- Storage load failure falls back to seed, allowing a later mutation to overwrite unreadable saved data; this needs a write lock until explicit reset.

## Implementation contract and UI intent

Extend the existing client master and database additively. Preserve stable IDs, operational records, quotation revision history and the storage key; add a commercial schema marker. Empty financial collections are intentional: legacy project values are labelled estimates, not accepted contracts. Use decimal strings and BigInt integer cents in calculations; serialize snapshots as strings. Reuse existing project plan/handover factories.

For the studio director and accounts administrator, lead with receivables and record references, then related actions. Reuse rust `#9a3c25`, bronze `#745a37`, warm substrate, white panels, existing type fallbacks and 8/16/24px spacing. Numeric tables align right and scroll within their panel on mobile. Customer, invoice, receipt, conversion and expense forms reuse native dialog/Field patterns; the compact BOQ remains intact. No new motion is needed.

Accepted contract amounts and gross margin exclude output VAT; invoice receivables include VAT; recorded project costs exclude expense VAT (an explicit estimate assuming recoverable input VAT). Cash collections never serve as profit. Expenses distinguish incurred net cost, gross liability and paid gross cash. Full accounting recognition, tax compliance certification, credit notes, variations, permissions and production persistence remain outside this browser demo.
