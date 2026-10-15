# Implementation evidence policy

The approved schedule in `_tkr_kit/orchestration.yaml` is the execution order. Generated feature plans and their full hashes are verified before feature work. Feature writes are serialized because the manifest and lockfile are shared; dependency-independent assignments within a feature may overlap only with disjoint ownership.

This implementation session acts as coordinator. Source implementation, explicit collaborator injection, real-browser storage tests, functional end-to-end tests, accessibility checks and static route/export/boundary checks provide runtime evidence. Agent reports identify commands, results and remaining blockers. Approval of a specification alone never supplies a passing result.

The installed tkr-kit orchestration adapter is not yet an executable release gate for this project: its `a11y` gate checks story design readiness, while this approved plan contains slice specifications and no story references. Its assurance candidate is a Git revision, so it must not attest uncommitted application files as the already-committed plan. Do not manufacture successful run receipts or promote outcomes through those adapters. Record direct checks against a source fingerprint in the implementation audit; leave unavailable formal or physical checks visible.

Local generated plans are under `.tkr-kit/work/implementation/`. Durable results and corrections belong in `docs/audits/2026-10-15-implementation.md`; physical installation acceptance belongs in `docs/runbooks/golf-scorecard-release.md`.
