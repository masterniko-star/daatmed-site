# DaatMed unified dashboard transfer

This branch contains the complete source diff for the unified **General Light + Kanban**
dashboard work transferred from the private application repository.

## Provenance

- Source repository: `masterniko-star/daatmed`
- Source branch: `codex/unified-dashboard-switching`
- Source head: `29799aa7cffec0119be61edc9a66b6a3fe15e92d`
- Target repository: `masterniko-star/daatmed-site`
- Target branch: `codex/unified-dashboard-switching`
- Transfer date: 2026-07-27
- Transfer environment: ChatGPT/Codex

All 18 files changed by `main...codex/unified-dashboard-switching` were copied at
their original repository-relative paths. Their Git blob SHAs are verified after transfer.

## What is included

- the General Light / Kanban view registry and live switcher;
- the personal Kanban dashboard, styles and state model;
- state recovery, layout migration and safe column deletion;
- paginated loading beyond the first 100 cases;
- RU / HE / EN dashboard translations;
- unit and component regression tests;
- architecture, ownership, DEV-LOG, block index and AI handoff documentation.

## Validation inherited from the source branch

- TypeScript strict + `noUncheckedIndexedAccess` for the changed Kanban module: passed;
- Oxlint for changed TS/TSX: 0 errors and 0 warnings;
- unit/component regression tests: 8/8 passed;
- RU/HE/EN dashboard JSON: valid;
- source PR was mergeable with its source `main`.

## Important repository boundary

The `main` branch of `daatmed-site` is a compiled GitHub Pages deployment containing
`index.html`, hashed assets and `CNAME`. It does not contain the full application source,
`package.json`, or the dependencies required to build these transferred modules.

Therefore this branch is an exact, reviewable source transfer, **not a deployable rebuild of
the public site by itself**. Do not copy these TypeScript files into `main` and claim that
the site was rebuilt. A deployment requires the complete DaatMed application tree, a full
build, and replacement of the hashed production assets.

## Remaining separate tasks

- namespace personal Kanban settings by user/tenant;
- add touch/keyboard movement for cards;
- run the complete repository build in an environment with the full source checkout.
