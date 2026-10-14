# Quotation UX delivery — implementation in progress

This cycle continues the existing AZZORA coordination system. It does not change the original verified integration worktree or merge into main.

Baseline: f72e6c1dd7c5914e97c509a635b64de8c6aa9750;rollback tag azzora-browser-demo-baseline-2026-10-14. New worktree C:/Users/USER/Desktop/Projects/Azzora/azzora-quotation-ux,branch codex/azzora-quotation-ux,created directly from that SHA. Documentation-only commit f6c8449 was cherry-picked as698d375 to retain the completed coordination record;source/test/config remained identical. A cold before-build was captured before edits and serves5210.

## Assignments and ownership

| ID | Owner | Files / responsibility | State |
| --- | --- | --- | --- |
| QUOT-UX-01 | Agent1,Coordinator fallback if capacity prevents resume |Quotationstsx and optionalnewguidedhelpers;five-step orchestration,simple/advancedBOQ,labels/help,persistence/lifecycle |In Progress;acknowledged,capacity retry recovered |
| QUOT-UX-02 | Agent2 |New QuotationGuide.tsx andquotation-ux.css only;accessible responsive navigation,visual hierarchy/usability review |In Progress |
| QUOT-UX-03 | Agent3 |Independent newquotationUXbrowser suite,legitimate oldharnessstep/label adaptations,actualbefore/after screenshots,fullfrozenQA |Assigned |
| QUOT-UX-04 | Coordinator |File contracts,serialized reviewable commits,conflict resolution,demo content/walkthrough,consolidated reporting |In Progress |

Agents share only the new isolated worktree with disjoint file ownership. Only Coordinator stages/commits;source and tests are reviewed at explicit completed checkpoints. No unfinished branch is merged. Existing agents/worktrees are not reset or reused for source writes.

## Interface intent

The operator is a fit-out owner or client-facing administrator making a quotation during a meeting,without estimating vocabulary. The interface should feel like a calm project brief progressing toward an existing AZZORA branded document.

Domain:rooms,trades,work categories,material quantities,unit rates,scope exclusions andstage payments. Color world:limestone cream,terracotta,bronze hardware,espresso joinery andmuted olive;retain the current Architectural Prestige tokens/fonts. Signature:a direct work-category→priced-item path,with a clear calculated financial summary and separately explained payment division.

Avoid a flat toolbar of equally prominent hierarchy buttons,unexplained BOQ terminology,and one long page mixing scope/pricing/payments/terms. Use five guided steps and optional advanced disclosure;preserve all nested/override/revision capabilities. Existing native controls/components and data/calculation/PDF lifecycle remain authoritative. No added motion or PDF redesign.

## Required result

Customer &Project → Scope ofWork/BOQ → PricingSummary → PaymentSchedule &Terms → Preview &Issue. Simple labels andshorthelp,only relevant hierarchy controls,fictional worked example (explicit user action only),step draft persistence,keyboard/mobile access,calculated versus editable pricing distinction,and payment stages that divide rather than increase the total. Issued history remains immutable;new revisions use existing commands.

## Verification and delivery

Before screenshots must come from the pinned actual app. After screenshots/demo must come from implemented UI. Final unit/domain,quotation/BOQ/commercial/operational/workforce/browser,responsive1440/1024/768/390,PDF preview/download/nativeprint,TypeScript/ESLint/build all run freshly on a consolidated fullSHA. Old304unit/20suite outcomes are baseline evidence,not proof of new work.

Final source commits,actual before/after links,exact pass/fail counts,limitations,fulltestedSHA and owner/client readiness will replace this in-progress checkpoint. No backend/Supabase/auth,production DB,push/deploy,main merge,unrelated worktree write or automatic browser reset is authorized.

Before evidence collected:32 actual screenshots at1440/1024/768/390;all14served build files match the pinned cold build;captured browser errors0. Blank editor~7000–9900px tall,populated reference~35000–78000px. Progressive scope-category disclosure is required as well as step navigation. Before artifacts live in docs/integration-evidence/quotation-ux/before;Agent3 records exactmanifest/geometry andwillbind afters to finalsource.
