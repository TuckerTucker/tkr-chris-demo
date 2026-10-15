# Wireframe Tracker — Golf Scorecard

System: **swiss** · Platforms: mobile (phone-first; desktop is the same single column, not tracked)

## Screens

| Section | Screen | mobile_status | mobile_advisory |
|---------|--------|---------------|-----------------|
| round-entry | start-round | ✅ | 1 |
| round-entry | hole-entry | ✅ | 1 |
| round-entry | hole-entry-par3 | ✅ | 1 |
| round-entry | the-turn | ✅ | 1 |
| round-entry | round-summary | ✅ | 1 |
| round-log | round-list | ✅ | 1 |
| round-log | round-list-empty | ✅ | 1 |
| round-log | round-detail | ✅ | 1 |
| round-log | round-removed-undo | ✅ | 1 |

Legend: ⬜ not generated · ✅ generated + rulebook-clean · 🔶 generated but DEGRADED · 🔀 ESCALATED, needs `/wireframe-compose` · ❌ failed

## Completion

- round-entry: 5 / 5 (100%)
- round-log: 4 / 4 (100%)
- Total: 9 / 9 (100%)

## Notes

- Swiss 1.0.0 has no authored mobile layout for any pattern these screens routed to: modal, empty-state,
  form, or data-table. The skill emitted each one at desktop size (1280×800, 1000×400 or 480×480) under
  `--platform mobile` and gave no warning.
- The keyword router matched negated and incidental words: "no confirmation dialogs", "Confirm hole 5",
  "not a modal", "edit", "table". It reported `fallback: false` each time, so the skill's own flags and
  the 0-failure compliance result both read clean on artifacts that do not match the brief.
- The failed outputs were removed. Every screen goes through `/wireframe-compose` at 375×812.
- Each composed screen has 1 advisory, all from `swiss-grid-alignment` flagging 56 and 88. Both are
  multiples of 8, so they meet the rule as written; the checker's hard-coded `SWISS_GRID` set omits
  them. The defect is in the checker; the layouts were not changed.
- Composed screens use custom components (inline SVG in the Swiss palette) for golf-specific controls.
  Library components cannot be resized and carry stock text. The component ids are kept, so the UX
  clauses read a real inventory (`inventory_source: group-ids`).
- The inline hole editor in round-detail uses 40px-tall chips and buttons to fit the viewport. The
  48px touch-target norm is met everywhere else; revisit this at build time.

## Changelog

- 2026-10-15 — Tracker created from the round-entry and round-log screen SPECs.
- 2026-10-15 — Batch run 20261015_135546_56f0db: system=swiss, screens=9, platforms=mobile,
  advisory_total=7 (over the 8 failed renders; none kept), degraded=0, escalated=1, failed=8.
- 2026-10-15 — wireframe-compose: all 9 screens (mobile) composed in swiss: 0 rule failures,
  1 advisory each (checker grid-set gap), XML well-formed, one validation pass each with no retries.
