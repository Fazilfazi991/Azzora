# Isolated production-schema RLS verification

One PGlite integration test passed on 11 November 2026 with 160 assertions. The test loaded the reviewed local production migration manifest into a new in-memory database, then used the actual restricted `azzora_api` role, two fictional local-only companies and eight fictional Owner, Manager, Accountant and Site Staff identities. It did not connect to any hosted or production database.

For each identity, assertions checked own and foreign invoice, task, expense, receipt, supplier-payment, party, account and balanced-journal visibility. Own finance rows were visible to Owner/Accountant only; own task rows were visible to Owner and assigned Manager/Staff. Foreign-company rows remained hidden. Direct INSERT, UPDATE and DELETE attempts were rejected; party counts remained unchanged. The single integration test, scoped ESLint and TypeScript passed.

This checks the reviewed private-table policies under an isolated restricted SQL role. It does not verify the currently empty hosted production database, production application login/RPC wiring, or a two-company production configuration; the candidate production environment intentionally pins one authorized company. No hosted RLS pass, production readiness, or real financial posting approval is implied.
