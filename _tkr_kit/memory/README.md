# Promoted memory

Git-canonical home for kept insights and Patterns — the durable half of the Remember pillar.
Decisions do NOT live here: the Decision log is `docs/adr/` (ADR-023).

## How records get here

Explicit promotion only, through `knowledge.triage` against raw findings in
`.tkr-kit/work/findings/`. `/commit` offers triage of a session's deferred findings after a
successful commit; nothing auto-promotes. `core/knowledge/projector.ts` walks this directory to
rebuild the Koji memory index on reseed — the files stay canonical, the index stays disposable.

## The promotion bar (ADR-024)

A raw finding is evidence; a promoted memory is knowledge. To earn this directory a record must
be `disposition: kept` **with a stated `rationale`** (why this is worth keeping — enforced,
`knowledge.triage` rejects a rationale-less kept) and **should carry `who`** (who judged it).
When in doubt, `deferred` beats an unrationalized `kept`.

## Resolved incidents

A promoted finding is a **snapshot**: `triage` copies its body, so `body.status` is the status at
`provenance.snapshotAt` and nothing ever updates it. Readers present it that way —
`knowledge.recallPromoted` returns `statusAtSnapshot: {status, asOf}`, and the Koji projection
text reads `status at snapshot <asOf>: <status> (as recorded when kept — not current status)`.
It is never the finding's present status, and it is not a claim that a vulnerability is live now.

When the incident a finding described is resolved:

- **Do not edit the promoted finding**, and do not expect anything to mark it resolved — no
  reader infers resolution. The snapshot stays true about the moment it records.
- **Record the lesson in the existing insight shape** — `{problem, resolution, principle, files}`,
  no other schema — citing the source finding's immutable ids (`find-…` raw id and/or `mem-…`
  canonical id) and the fix evidence (commit, test, observation) in `resolution`:
  ```
  tkr op knowledge.record_insight --input '{"problem":"<what went wrong>","resolution":"source finding <find-id> (memory <mem-id>); fixed in <sha>, verified by <test>","principle":"<the rule that prevents a repeat>","files":["<path>"]}' --json
  ```
- **Promote it** like any record — the promotion bar applies, so the `rationale` says why the
  lesson is worth keeping and may restate the evidence:
  ```
  tkr op knowledge.triage --input '{"recordId":"<ins-id>","disposition":"kept","rationale":"<why>","who":"<operator>"}' --json
  ```
- If the finding no longer describes anything that exists, retire it under the retirement bar
  below, naming the insight as its successor.

## Retention

Declared in `KIT_ACCUMULATION_DIRS` (`core/governance/retention-audit.ts`) as an honest
`finding`: the directory grows with every kept promotion and nothing automated evicts the
canonical tier (`knowledge.evict` touches only the Koji working set). The retention audit
re-emits this leak on every run until an automated mechanism lands.

**Retirement bar (manual, until then):** a kept insight retires via `knowledge.demote` when the
thing it describes no longer exists, when a later record supersedes it (link the successor in the
demotion rationale), or when its `verify`-style claim fails on re-check. Review the directory
when the retention audit's declared-leak finding surfaces in a health sweep — deleting a stale
memory is maintenance, not loss; the git history keeps the record.
