# Assurance

Dated, scoped reviews that reach a **verdict** on one capability: security, dependency trust,
exposed surface. An Assurance record answers "is this safe to ship, and what did we accept?"

Distinct from [Audit](../audits/README.md), which sweeps the whole repo for a class of defect and
reports findings. An Audit asks *what is wrong here*; an Assurance record asks *does this pass*, and
must say what it accepted when the answer is a qualified yes.

- **Authoring bar:** the scope reviewed (named exactly, not "the code"), the methods applied, a
  verdict, and — when the verdict is anything but a clean pass — the residual risks accepted and by
  whom. A review that records no accepted risk either found none or did not look.
- **Written by:** human, or an agent pass whose verdict a human adopts. The verdict is the human's;
  the evidence may be gathered.
- **Provenance:** every record carries `**Date:**` and `**Scope:**`, and states the version of what
  it reviewed (a lockfile digest, a pinned dependency set, a commit). A verdict without a scope is
  not re-checkable, and a verdict that cannot be re-checked cannot be renewed.
- **Retention:** exempt — append-only. A superseded review is kept: what was accepted, and when,
  is the record. A new review is a new file, never an edit to an old verdict.

**Renewal:** an Assurance record goes stale when what it reviewed changes — a dependency or lock
change renews dependency, threat and trust-boundary review (see
[`.claude/rules/tkr-kit/security-philosophy.md`](../../.claude/rules/tkr-kit/security-philosophy.md)
and the security triage record). Renewal means a new dated record, not a rewrite.

## Release attestations

Release readiness is derived for one exact candidate. Its identity includes revision, dirty-state
policy, artifact ids, targets, quality profile, and evaluation time. The aggregate lists every
required dimension as passed, reasoned not-applicable, accepted-risk, or blocked; missing and stale
evidence stay visible in coverage and the policy trace.

Risk acceptance never rewrites a failed, missing, or stale source verdict as passed. It adds the
actor, rationale, exact scope and candidate, expiry, approval reference, and retained source state.
Expired or broader-than-authorized acceptance cannot clear a blocker.

Generated release attestations are append-only Markdown files in this directory. They link to
source-canonical evidence locators rather than copying evidence payloads. A filename collision is an
error, renewal creates a new dated file, and writing an attestation never changes planning status.
