# Audits

Dated, findings-bearing audit records. An audit is a **measurement of the repo against a stated
bar**, producing numbered findings that stay addressable until closed.

Distinct from its neighbours:

| Home | Holds | Not this |
|---|---|---|
| `docs/audits/` | dated measurements + numbered findings | — |
| `docs/adr/` | decisions | an audit records what *is*, not what was decided |
| `docs/drp/` | the doc-review-protocol campaign and its corpora | that campaign's own findings live with it |
| `_review/` | frozen point-in-time reviews of superseded builds | audits here are live work queues |
| `.tkr-kit/work/findings/` | machine-recorded raw findings (gitignored, ephemeral) | audits here are durable and citable |

## Conventions

- **Authoring bar:** a dated measurement against a stated bar, with numbered findings that each
  carry a location and an evidence marker. A claim with neither is not a finding.
- **Written by:** human, or an agent sweep whose output a human re-verifies before it lands.
- **Retention:** unbounded by design — an audit record is the durable trace of what was measured and
  when. Findings are closed in place, never deleted; superseded audits stay for the history.

> **Routing status:** registered as a canonical artifact type in `LAYOUT_HOMES`
> (`core/governance/layout-conformance.ts`) and the `docs/canonical-layout.md` table per
> [ADR-028](../adr/028-audit-records-are-a-canonical-artifact-type.md), so
> `governance.layout_conformance` measures this home (README bar + retention) like every other. This
> closed finding B-15 — the home no longer passes conformance by being invisible to it.

- **One file per audit**, named `YYYY-MM-DD-<slug>.md`.
- **Stable finding IDs** (`A-01`, `B-03`, …) scoped to the file. IDs are never reused or
  renumbered — a withdrawn finding keeps its number and records why.
- **Evidence markers** on every claim: **[V]** verified directly during the pass ·
  **[R]** reported by a sub-agent or reviewer, not independently re-verified ·
  **[W]** withdrawn, with the reason stated.
- **Provenance and maintenance** section closes every file: authored date, HEAD pin, and a table
  of volatile facts mapped to one-line re-verification commands.

Findings are closed by editing the entry in place (status → RESOLVED, with the commit that did
it), not by deleting it. A deleted finding is indistinguishable from one that was never found —
which is the failure mode `2026-07-21-silent-failure-modes.md` exists to document.

## Index

- [`2026-07-21-silent-failure-modes.md`](2026-07-21-silent-failure-modes.md) — code paths whose
  "did nothing" outcome is encoded identically to "nothing to do". 51 findings, 5 detection checks.
- [`2026-08-24-agent-workspace-isolation.md`](2026-08-24-agent-workspace-isolation.md) — a measured
  two-worktree run against a foreign repo (`compass_app`); its pinned SHA deliberately does not
  resolve here. Companion brief: `docs/briefs/tkr-kit-workspace-integration.md`.
- [`2026-08-29-full-review-sweep.md`](2026-08-29-full-review-sweep.md) — a whole-tree `/full-review`
  pass: checks narrower than their claims, correct implementations left unadopted in a sibling, and
  derivable facts maintained by hand. 52 findings across 7 classes, 1 withdrawn, 1 resolved in
  place (A-07 — the backlog rollup nothing could reach).
- [`2026-09-08-high-review-remediation.md`](2026-09-08-high-review-remediation.md) — remediation of
  the five confirmed high findings from review `20260908_174800_a6f821` (the ledger fix and the
  fast-uri bump).
- [`2026-09-23-findings-adjudication.md`](2026-09-23-findings-adjudication.md) — every untriaged
  substantive finding in the store re-derived against the tree: 147 findings, 16 live (12 fixed, 4
  filed), 5 already fixed, 126 not a defect; the 85 journal rows left to the declared age-out.
  Closes `work-wlG3vhSp`.
- [`2026-09-27-detection-backfill.md`](2026-09-27-detection-backfill.md) — the one-time
  `detection` backfill over 195 legacy backlog items (sustainment slices 11-12): 91 classified from
  their own record, 104 recorded `unclassified`, `work.audit` byte-identical before and after. Its
  per-item bases are in the JSON beside it.
