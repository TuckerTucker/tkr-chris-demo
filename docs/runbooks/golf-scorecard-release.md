# Golf Scorecard validation and release

The application is local-only. A successful automated check is not evidence of installation or background recovery on a physical phone. Do not mark release ready until the checks below have recorded device, OS, browser, build identity and outcome.

## Reproducible setup

Use a Node version allowed by package.json (Node 24 is recommended), `npm ci`, then `npm run setup:browsers`. Browser setup is separate from testing. Run `npm run check` against the candidate. Serve `dist/` using HTTPS in production; localhost is allowed for browser tests. No server API or account is required.

## Physical phone acceptance

On the intended iPhone/Safari home-screen installation and Android/Chrome installation:

1. Visit online, verify install name/icon, install to the home screen, and wait for the explicit offline-ready status.
2. Disable networking. Start a round, change par/strokes/putts and fairway, wait for Saved, lock the screen, close the app and reopen. Check that draft values and confirmed totals remain distinct.
3. Record nine holes. Restart at the turn, continue, restart again, and verify hole ten opens. Finish eighteen holes and verify the log and summary.
4. Start a separate nine-hole round and finish at the turn. Correct a logged hole offline, close/reopen during a partial correction, then Cancel and verify the original score remains.
5. Remove a round. Navigate and restart; Undo must still restore it. Remove again, explicitly Dismiss, and verify it stays removed. An abandoned active round must reserve the active slot until Undo or Dismiss.
6. Use portrait, landscape, 200% text size, light/dark mode, increased contrast, reduced motion and the device screen reader. Confirm controls and inline errors remain readable and reachable. Check thumb reach and visible keyboard focus with a hardware keyboard where available.
7. Open another tab. Confirm concurrent edits preserve local input and require explicit conflict resolution. Install a second build while an active round, unsaved edit or pending undo exists; activation must wait until every open client is safe and the user requests it.

Record each result with a candidate fingerprint. A failure blocks release. Browser storage may be cleared by the user or browser; local persistence is not a backup.

## Last full-suite candidate record

Automated validation passed on 2026-10-15: 225 unit, 167 real-browser and 81 production E2E cases, plus typecheck, lint, architecture and no-mocks checks after a clean install. See the [implementation audit](../audits/2026-10-15-implementation.md#final-candidate-verification) and [source manifest](../audits/2026-10-15-source-manifest.json).

- Source SHA-256: `84ceafd7039266da3ca54c4782c72d5be191be521189a72e78967413087ac0a0`
- Built application identity: `7d419135-dbe3-44f0-b7ec-1d5c3102780c`; schema compatibility: 1
- Physical iPhone/Safari home-screen checks: **not performed; pending**
- Physical Android/Chrome installation checks: **not performed; pending**
- Release approval: **pending physical acceptance**

A new build receives a new identity. Record the identity actually installed when completing the checklist.

The subsequent footer theme chooser is documented and validated in the [implementation audit](../audits/2026-10-15-implementation.md#footer-theme-chooser-follow-up). It changes the source/build after the full-suite record above; run the complete check suite again against the eventual release candidate. Physical acceptance remains pending.
