# Accountant Portal redesign — first owner design gate

> This records the initial nine-route, 45-check gate. The expanded 16-route conditional review and current results are in [ACCOUNTANT-PORTAL-CONDITIONAL-REVIEW.md](ACCOUNTANT-PORTAL-CONDITIONAL-REVIEW.md).

21 October 2026. This package is a **local visual and architecture review**, not a secure portal release. The owner rejected the Checkpoint 3 Accountant page as an accounting workspace. This review keeps the tested finance domain intact while defining a separate Accountant product surface for approval before integration.

## Verified starting point

- Source branch: `codex/azzora-finance-integration` at `968b58e01cb4f723361c67a9e31d62be2858b58b`. This includes the earlier `edf96d31275b84820d2ebff018466ecb3c1c857b` verified finance source, `cfeb117b0b5c2f2343b0344af10896cca4d129cf` documentation checkpoint, and Checkpoint 3 synthetic demo.
- Design branch: `codex/azzora-accountant-portal-design`, created from the above commit in its own worktree. Existing GitHub `main` and the protected Checkpoint 3 Vercel Preview have not been changed by this design gate.
- Current `src/App.tsx` mounts `AccountantWorkspace` inside the Manager shell and lists **Accountant Preview** under Management. It also exposes `#/accounts/*` commercial finance routes inside that shell. Current `src/main.tsx` wraps the single `App` in the browser-local Provider.
- `src/domain/repository.ts` uses the `azzora-demo-v1` localStorage key. `src/accounting/permissions.ts` explicitly marks its role matrix as proposed and non-enforcing. There is no trusted AZZORA login, financial API, shared database or server authorization in this source.

## Gate boundary

The visual prototype is for evaluating information architecture, screen hierarchy, responsive navigation and form/report composition. Example amounts and actions are fictional. A sign-in design does **not** authenticate anyone; a protected Vercel deployment does not provide in-app roles. No portal source routing, Manager sidebar, financial command, historical record, data key, production deployment or backend configuration is changed at this gate.

The owner should review the ten requested screen designs and approve or request changes to navigation, content density and the separate login experience. Separately, the owner must authorize the trusted identity/backend architecture and resolve finance policy decisions before a real login or live financial posting can be built. After both decisions, implementation can remove Accountant Preview from the Manager shell, establish the portal route boundary, reuse canonical commercial/finance commands, and verify server-enforced authorization. The later integration must receive full CRM and financial regression testing on its own frozen SHA.

## Review package

- [Interactive visual prototype](portal-design/index.html) (serve locally, then open `#/login`)
- [Portal sitemap, design rationale and before/after evidence](portal-design/SITEMAP-AND-DESIGN-REVIEW.md)
- [Authentication and authorization architecture](ACCOUNTANT-AUTH-ARCHITECTURE.md)
- [Existing finance capability and integration map](ACCOUNTANT-FUNCTIONAL-MAP.md)

## Design evidence and validation

The design prototype covers nine routes that present all ten requested acceptance views, including desktop and mobile login. The [rejected Manager-shell view](portal-design/evidence/before-accountant-workspace.png) can be compared with the [separate desktop dashboard](portal-design/evidence/dashboard-1440.png), [mobile dashboard](portal-design/evidence/dashboard-390.png), [desktop login](portal-design/evidence/login-1440.png), [mobile login](portal-design/evidence/login-390.png), and [mobile Accountant navigation](portal-design/evidence/mobile-navigation-390.png). The sitemap links screenshots for every route at desktop and mobile sizes.

The local Playwright capture was rerun against the completed prototype: **45/45 direct route-width checks passed** (nine routes at 390, 430, 768, 1024 and 1440 px), with zero page errors, missing images or page-level horizontal overflow. Mobile drawer open/close, route navigation, invoice-type filtering and status filtering passed. See [machine-readable results](portal-design/evidence/visual-checks.json). Coordinator visual review covered desktop login/dashboard/invoice and mobile login/dashboard/sales/receipt; the design agent inspected every route at desktop and mobile width.

No application source changed at this gate, so the prior 462/462 finance/CRM unit result and Checkpoint 3 browser/PDF result remain *baseline evidence*, not fresh portal regression results. No auth, permission, data migration, posting or production build test can be claimed for the prototype. The fictional fixture reconciles visibly (AED 67,000 assets = AED 6,000 liabilities + AED 61,000 equity), but is not a live journal connected to CRM records.

## Approval questions

1. Does the separate Accountant navigation and screen design meet the owner's day-to-day accounting workflow expectations?
2. Which Accountant, Finance Manager and Owner permissions should be granted for reading, drafting, approving, posting, reversing and period administration (B01/B11)?
3. Is the proposed trusted backend/identity direction acceptable for a scoped implementation plan and costed provisioning request? This review does not authorize provisioning or account creation.
