# Golf Scorecard plan review

**Decision: approved for implementation on 2026-10-15 after the corrections below.**

Reviewed the product brief, seven capabilities (one deferred), twelve features, sixty slices and sixty specifications, the orchestration schedule, both screen specifications and nine SVG references. The review bar was the supplied coding and UX instructions, consistent public contracts, recoverable local data, executable dependency order and meaningful acceptance evidence.

All findings below are **RESOLVED IN PLAN [V]** in the working tree. No application implementation or passing runtime test is implied. The repository has no application source, package manifest or lockfile yet; application validation belongs to the implementation and release gates.

## Findings and corrections

| ID | Severity | Verified finding and location | Correction |
| --- | --- | --- | --- |
| P-01 | High | `slice-specs/scoring.yaml` and `round-entry.yaml`: exactly nine holes always returned the turn; continuing changed no persistent state. | Persist `continuedTo18`; distinguish undecided turn, back nine, pending finish and finished. Add reload and failure cases. |
| P-02 | High | `slice-specs/round-entry.yaml`: only confirmed holes were persisted, despite the product promise to retain work. | Persist bounded per-hole drafts and active editor position separately from confirmed totals, with ordered writes and accurate Saving/Saved/Not saved feedback. |
| P-03 | High | `slice-specs/round-entry.yaml`: score and par memory were separate writes, allowing a committed score to appear failed. | Repository commits score, par memory, draft removal and cursor together; corrections follow the same transaction. |
| P-04 | High | `slice-specs/round-storage.yaml`: append/update transitions, simultaneous tabs and restore collisions were underspecified. | Validate round invariants; check revisions in each transaction; enforce one active round, contiguous append, legal edits and safe restore. Preserve conflicting local edits. |
| P-05 | High | `slice-specs/app-shell.yaml` and `round-storage.yaml`: undo expired on unmount and startup purged all trash. | One persistent pending-removal token owned above routing; explicit Undo/Dismiss; token-specific purge; retry failures; no timeout or startup purge. |
| P-06 | High | `slice-specs/platform.yaml`: TypeScript 7.0.2 exceeded the linter peer range; local Node 20.19.5 did not satisfy Vitest 5. | Pin TypeScript 6.0.3, declare the compatible Node engine intersection, add Node types and direct Playwright provider dependency, require exact lockfile installs. |
| P-07 | High | `slices/platform.yaml`: initial build referenced an unowned and unbuilt `src/main.tsx`; package owners lacked lockfile permissions. | Assign the initial mount and configuration files to scaffold; grant manifest and lockfile ownership to every package-changing slice and relevant wiring assignment. |
| P-08 | High | `orchestration.yaml`: readiness prose containing unquoted colons was invalid YAML; advertised feature overlap disagreed with dependencies and shared package writes. | Repair YAML; serialize feature runs, reconcile UI-kit dependencies and regenerate full plan hashes. Validate within-wave file disjointness. |
| P-09 | High | `slice-specs/app-shell.yaml`: service-worker registration happened after the feature that tested it; startup tests required later screens. | Register from the initial mount; use injected route views for shell tests; put product-route acceptance in the owning UI feature. |
| P-10 | High | `slice-specs/app-shell.yaml`: offline readiness and update safety were underspecified; registration errors were console-only. | One manifest source, visible cache readiness/errors, explicit retry, safe activation across live clients, and two-build update tests. Full offline play/reopen/edit is a release gate. |
| P-11 | Medium | Product/capability promises and editor specs disagreed on one-tap entry, required fairway and supported par range. | Use par 3–5 consistently, as implied by the brief's fairway scope. Par 4/5 requires explicit fairway selection plus confirmation; par 3 requires confirmation alone. Never guess fairway or silently rewrite numeric inputs. |
| P-12 | Medium | `slice-specs/round-entry.yaml`: a nullable, number-less draft was passed to a validator for a complete Hole. Round errors also needed a distinct field vocabulary. | Define shared HoleDraft/validateHoleDraft, RoundError/RoundValidationError and explicit storage/session/undo contracts; keep validation and view state distinct. |
| P-13 | Medium | `slice-specs/platform.yaml`: text scanning could flag the guard's own fixtures, checks preceded their tests and browser provisioning ran with tests. | Syntax-aware call detection, helper coverage, harmless-string cases, staged bootstrap checks, explicit browser setup, isolated real-browser fixtures and Chromium/WebKit coverage. |
| P-14 | Medium | Storage errors inferred private browsing or corruption from unrelated failures; migration, transaction failure and concurrency coverage was incomplete. | Preserve typed causes and field diagnostics; add conflict/invalid/io kinds and actionable hints; require real database upgrade/rollback, blocked connections and atomic failure checks. |
| P-15 | Medium | UI specs prescribed timed undo, button-like table rows, small fixed text and portrait locking; static headline scores were treated as a test oracle. | Semantic tables with in-cell controls, persistent undo, scalable text, landscape support, keyboard/focus checks and explicit independent score fixtures. Annotate SVGs as illustrative layout references. |
| P-16 | Medium | Plan schema was legacy; repository files were unclaimed; approvals and execution hashes were stale. | Author schema v2 ownership and inherited quality requirements; ignore OS metadata; approve all specs and product/orchestration, mark implementation planned, retain course-scorecard deferred. |

Locations above are relative to `_tkr_kit/`, except the product brief in `docs/briefs/2026-10-15-golf-scorecard.md`. Resolutions are uncommitted because this repository has no HEAD; no commit was manufactured as evidence.

## Validation evidence

- **[V]** All 24 YAML documents parse with duplicate-key detection; all nine SVGs parse as XML and screen references resolve.
- **[V]** Twelve features, sixty slices and sixty matching specifications; every referenced slice dependency exists and cross-feature prerequisites occur earlier in the run order.
- **[V]** All twelve generated feature plans succeed: 64 waves and 72 assignments, including mandatory wiring assignments. These are planned assignments; no implementation agents were launched by this review.
- **[V]** Generated within-wave territories do not overlap. Every slice declaring packages owns `package.json` and `package-lock.json`.
- **[V]** Schema audit, schema compatibility, repository reconciliation and slice/spec completion-consistency checks pass without findings. `platform/slice/1` reports startable after approval.
- **[V]** Exact initial package versions were checked against public npm metadata. `typescript-eslint@8.71.0` supports TypeScript `>=4.8.4 <6.1.0`; the revised `typescript@6.0.3` and added `@types/node@22.18.6` exist. The declared runtime range intersects the selected Vite, ESLint and Vitest engines. Metadata verification does not substitute for installation/build tests.

Primary references: [typescript-eslint supported versions](https://typescript-eslint.io/users/dependency-versions/), [Vitest prerequisites](https://vitest.dev/guide/), [exact linter metadata](https://registry.npmjs.org/typescript-eslint/8.71.0), [exact Vitest metadata](https://registry.npmjs.org/vitest/5.0.3).

## Execution and release conditions

Implementation starts with the platform scaffold under a supported Node runtime. The current Node 20.19.5 must not run the selected Vitest toolchain. Scaffold owns dependency installation, peer/engine checks, the lockfile and explicit browser provisioning; later clean checkouts use `npm ci`. Do not suppress engine/peer errors.

A host must resolve actual agent/skill bindings and gate executors before using orchestration. Regenerate each feature plan immediately before running it and compare its full hash. Slice gates validate the slice and already-built regressions; complete end-to-end gates run when their screens exist.

Release requires the complete check pipeline, real IndexedDB migration/failure/concurrency tests, both round lengths, draft/turn/finalisation recovery, persistent undo, offline play and logged-round correction, safe multi-client updates, accessibility checks and physical-phone installation/offline smoke checks. Approval of the plan does not mark any implementation done or authorize a release.

## Provenance and maintenance

Authored 2026-10-15 against the uncommitted working tree; no HEAD exists. The accompanying `2026-10-15-plan-review-inputs.json` fingerprints the approved canonical inputs and records generated plan hashes. Re-review changed contracts before implementation.

| Volatile fact | Re-verification |
| --- | --- |
| Approved plan statuses | `tkr op planning.status --input '{}' --json` |
| Current schema | `tkr op planning.schema_compatibility --input '{}' --json` |
| Unknown plan keys | `tkr op planning.schema_audit --input '{}' --json` |
| Repository ownership | `tkr op governance.plan_audit --input '{}' --json` |
| First slice readiness | `tkr op planning.startability --input '{"entityId":"platform/slice/1"}' --json` |
| Feature hash | `tkr op orchestration.generate_plan --input '{"featureId":"platform/feature/project-scaffold"}' --json` |
| Runtime compatibility | `node --version` and `npm view vitest@5.0.3 engines --json` |
| Linter compatibility | `npm view typescript-eslint@8.71.0 peerDependencies --json` |
