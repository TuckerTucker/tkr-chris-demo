# Brief — Golf Scorecard

- **Date:** 2026-10-15
- **Feeds:** `product` (`_tkr_kit/product.yaml`)
- **Status:** Intent. Nothing is built. When the first release ships, convert this brief to a Model or retire it.

The structured plan in `_tkr_kit/product.yaml` owns the success criteria, scope in and scope out. This brief doesn't repeat them. It records the intent behind them and the decisions that shaped them.

## What we're making

A golf scorecard web app for one person, on their own device. The golfer uses it on a phone during a round, entering each hole as it's finished. It tracks strokes, putts, greens in regulation (GIR) and fairways hit, and keeps a log of every round played.

## Decisions taken while framing the brief

| Question | Answer | Effect on the design |
|---|---|---|
| Where will it be used? | On a phone, on the course | One hole at a time, large touch targets, one-handed entry with no keyboard, and it must work with no signal. |
| 9 or 18 holes? | Ask after hole 9 | A round's length isn't fixed at the start. The golfer chooses at the turn, and both lengths are stored and summarised. |
| One round or a history? | A log | Finished rounds are kept and can be browsed. Totals across rounds (trends, averages) aren't part of this brief. |
| Where does course data come from? | To be decided later | Par is asked for on every hole for now. Pulling a card from a course is a future capability and doesn't block the first release. |

## Design intent the plan doesn't spell out

- **GIR is worked out, not asked for.** A green is hit in regulation when
  `strokes − putts ≤ par − 2`. Since par, strokes and putts are already entered, asking for GIR as well would be extra work for the golfer and could contradict the other three.
- **Fairways only count on par 4s and 5s.** On a par 3 the fairway control is greyed out rather than hidden, and the fairway figure is shown as hit out of eligible holes.
- **Par comes from a swappable source.** Today the golfer types it in, pre-filled with the par last entered for that hole number. Later it comes from course data. The scoring logic shouldn't care which, so the future course feature adds a new source of par rather than a separate path through the app.
- **Losing data is the main risk.** A round lasts hours, the phone locks, and signal comes and goes. Every editor change is queued for durable draft storage; confirmed scores and par memory commit together. The UI distinguishes Saving, Saved and Not saved. An unfinished round restores its draft, turn decision and cursor. Browser storage removal is outside the local-only durability guarantee.

## Open

- Where course scorecard data comes from: a provider API, scanning a card, or reusing a card the golfer has already typed in for that course. The golfer will decide this later.

## Provenance and maintenance

Written 2026-10-15. The repo has no commits yet, so there's no HEAD to pin this brief to.

| Volatile fact | Re-verify |
|---|---|
| Plan entity `product` exists and holds the criteria | `tkr op planning.get --input '{"id":"product"}' --json` |
| Course scorecard is still out of scope | `grep -n "Loading a scorecard" _tkr_kit/product.yaml` |
