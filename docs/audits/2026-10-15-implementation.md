# Implementation evidence, 2026-10-15

Platform execution uses Node 24.11.1 (recorded in `.nvmrc`) and npm 11.6.2.
The first strict TypeScript scaffold build identified a missing declaration
dependency in `@preact/preset-vite@2.10.6`: its public options import Babel's
types, but `@babel/core` does not include declarations. Added exact
`@types/babel__core@7.20.5` to the platform specification and implementation
instead of disabling dependency declaration checks. The type package declares
no peer or engine restrictions. Preset peers explicitly support Vite 8.x and
Babel core 7.x, matching the installed dependency tree. Dependencies were
installed without force or legacy peer resolution, with `engine-strict=true`.

Browser tools share a portable temporary cache, defaulting to
`join(tmpdir(), 'golf-scorecard-browsers')`. `PLAYWRIGHT_BROWSERS_PATH` can override
it for both explicit setup and all browser test commands. Missing binaries
report `npm run setup:browsers`; tests do not download browsers.

Platform scaffold evidence (before later feature changes):

- `PATH=/Users/tucker/.nvm/versions/node/v24.11.1/bin:$PATH npm ci` passed:
  224 packages installed, zero audit vulnerabilities, no peer/engine overrides.
- `PATH=/Users/tucker/.nvm/versions/node/v24.11.1/bin:$PATH PLAYWRIGHT_BROWSERS_PATH=/private/tmp/golf-scorecard-browsers npm run setup:browsers`
  passed, explicitly installing Chromium and WebKit.
- With that same PATH and browser cache override, `npm run check` passed:
  strict typecheck, zero-warning lint, executable mock guard, 33 unit cases,
  one real IndexedDB round-trip browser test, production build, and three
  mounted-heading e2e cases (Chromium phone, Chromium desktop, WebKit phone).
- A final CLI rejection regression test was then added. `npm run typecheck`,
  `npm run lint`, and `npm run test:unit` passed with 34 unit cases. This test
  creates a real helper containing a forbidden executable mock call and proves
  the guard process exits 1 with the exact file/line/construct diagnostic.
- `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/golf-scorecard-browsers-intentionally-absent npm run test:browser`
  intentionally exited 1 with the actionable `npm run setup:browsers` message;
  no download was attempted.
- `npm ls --depth=0` passed with every approved direct dependency pinned exactly.

The reviewed platform plan hash after the declaration dependency and path
corrections is `1e842437f1eb039f702ec486573f4a90d6074b2392743843af4fd7890132413d`.
This records direct runtime evidence, not formal orchestrator gate completion
or physical iOS home-screen release evidence.

Offline-shell compatibility review:

- Added exact `vite-plugin-pwa@1.3.0` and its declaration peer
  `@vite-pwa/assets-generator@1.0.4`, satisfying the plugin's `^1.0.0` peer range.
  npm's engine/peer checks remained enabled; install reported zero vulnerabilities.
- A separate `tsconfig.vite.json` checks the build configuration with strict
  TypeScript and Node/WebWorker libraries, without importing application source.
  Application and test declarations retain `skipLibCheck=false`. The build-only
  config uses a bounded `skipLibCheck=true` exception for published declaration
  defects: assets-generator 1.0.4 references `sharp.ResizeOptions` without a
  namespace import (`TS2503`), and transitive `unconfig@7.5.0` references undefined
  `Args[0]` (`TS2304`). No declaration stubs, vendor patches or peer overrides
  were introduced. Used runtime APIs are exercised by production builds/tests.
- Chromium offline reopening passed with Playwright 1.63.0, while WebKit reported
  an internal error even with a controlling worker. This matches upstream
  [Playwright issue 42775](https://github.com/microsoft/playwright/issues/42775).
  Both direct Playwright packages were upgraded together to exact `1.64.0`,
  which contains the upstream fix. The Vitest provider accepts `playwright:*`;
  Playwright requires Node >=20, satisfied by Node 24.11.1. Browser setup was
  rerun explicitly. Tests continue using actual `context.setOffline(true)` in
  every browser; no synthetic responses or bypass was retained.
- Worker updates now have explicit user intent, nonce-bound acknowledgements
  from every live client, synchronous mutation locks, and timeout/abort recovery.
  Only the initiating tab reloads. Build caches referenced by live clients stay
  available; cleanup defers for unidentified clients or staged workers, and
  retained-asset fallback is limited to same-origin application caches.
- Added the worker source and separate build-typecheck config to offline-shell
  ownership. Added `renderEditor` to the scorecard contract for semantic inline
  editing; corrected stale `onExpire` prose to the existing `onDismiss` contract.

The revised platform hash after the browser-runner correction is
`8b9b0b7d0b89d9d3bd254dc0d2e97daeb3221847bd176f78253dc348f9da8f2a`.
The revised offline-shell hash is
`5d1e9e66ea7c88cab55c954a5063580caf5c417e65ea17eb57689f299cce6af6`.

Offline-shell gate passed with Node 24.11.1 and Playwright 1.64.0:
`PATH=/Users/tucker/.nvm/versions/node/v24.11.1/bin:$PATH PLAYWRIGHT_BROWSERS_PATH=/private/tmp/golf-scorecard-browsers npm run check`.
Results: strict source typechecks, zero-warning lint, no-mocks CLI, 225 unit
tests, 69 real-browser storage tests, production PWA build, and 9 e2e tests
passed. Every browser project validates the manifest and all three icon sizes;
Chromium phone/desktop and WebKit phone close/reopen a page in an isolated
persistent profile with true offline emulation and render the mounted heading.
Two-build application-state/update race tests remain owned by composition-root;
physical iOS home-screen checks remain a release gate.

UI-kit gate passed with the same Node/browser environment and `npm run check`:
225 unit tests, 83 real-browser tests (including 14 component cases), production
PWA build, and all 9 e2e tests. Native browser keyboard/pointer tests cover
spinbutton bounds, retained independent inputs, radio roving focus, disabled
reasons, async undo/duplicate prevention/failure retry, no dismiss on unmount,
semantic 9/18-hole tables, and the separate colspan editor row. Axe runs against
the actual DOM with no disabled rules. Chromium media emulation verifies light,
dark, higher-contrast and reduced-motion preferences; 320px viewport and 200%
text scaling checks keep stepper buttons reachable and at least 48px.

Exact `@testing-library/preact@3.2.4` accepts Preact >=10 and
`axe-core@4.13.0` accepts this Node runtime; installation had no peer/engine
override and zero audit vulnerabilities. Theme imports once through the named
kit barrel. Test-only helpers live under `src/ui/kit/__tests__/`.
The ui-kit plan hash after helper path ownership is
`2eb6ca00b12bf44cbe34c14c0abfbe6e48c22667d25459fe5498edc0dfacca9f`.

Scoring execution completed in order: `hole-rules`, then `round-rules`. Each
feature's generated plan hash matched `_tkr_kit/orchestration.yaml` immediately
before its source writes: `b78e5830a228706a84ff902ba30259c4eca818cf2d6b8e9d9f2aaba525fe20f7`
and `b53fde456aa8e8de2fa6588cc6151ddbf8f05b0b44cd582e7a9d2f5ff7e2f218`.

- Hole rules passed 78 domain cases plus 34 guard and 5 architecture cases, strict
  typecheck and lint before round-rule implementation began.
- Completed scoring passed 185 domain cases plus 34 guard and 5 architecture cases
  (224 total), strict typecheck, zero-warning lint and the executable mock guard.
  Cases include null/malformed/sparse persisted records, finite safe integer
  boundaries, Gregorian leap dates within years 0001–9999, every round state,
  independently tallied 9/18-hole totals, corrections and injected par memory.
- Existing browser regression passed its real IndexedDB case; the production
  build and all three Chromium/WebKit scaffold e2e cases passed. Browser tests
  required sandbox escalation for localhost listeners after a sandbox EPERM;
  the escalated run passed without changing application or test behavior.
- The source fingerprint of the 11 `src/domain/*.ts` files is
  `67d8d271b0f750b9a2f4b991bb5190558f8a0077c1a2fc93a5867057ceb8f01f`:
  SHA-256 of each sorted relative path, NUL, its contents, NUL, concatenated.

The par-source contract additionally exports `ParValidationError`, carrying
the invalid field and value, to implement the specification's typed validation
failure requirement. Domain operations remain pure and use named barrel
exports. No package changes were needed. No scoring blockers remain; later
UI/storage acceptance and release evidence remain separate.

Before composition-root implementation, the shared session contract was clarified
with retained `localDrafts`, the currently stored `conflictRound`, explicit
`resolveConflict('reload' | 'reapply')`, a detail-session factory and a navigation
flush boundary. This makes the already-required conflict comparison/reapply and
route-remount recovery executable without module globals or guessing at a retry.
Reapply persists reviewed drafts; it never silently confirms scores. The
composition-root plan was regenerated after this contract review. Its hash remained
unchanged because generated assignments reference specification IDs, not their
prose contents. The reviewed app-shell specification SHA-256 at this point is
`351723a876fc2fd6e6977ee97aa8c9bbcbc929c76c304fbb17ab75a9ddf003f8`.


Storage execution completed in order: `round-repository`, then `par-memory`.
Immediately before each feature, generated hashes matched the approved plan:
`216554506c2af3788913bb69049f459f9cddb11b2a6420af88779c90084e6b07` and
`86e5a06890282856337926576ce63a896e5e0da09a25d7d42ec500084472de6c`.
Installed exact production dependency `idb@8.0.3`; npm reported zero audit
vulnerabilities. Production schema remains version 1.

- Repository-stage gate passed strict typecheck, zero-warning lint, executable
  mock guard, 224 unit cases, 52 real Chromium browser cases, production build,
  and the three previously implemented Chromium/WebKit smoke cases.
- After par-memory, the complete `npm run check` passed with the Node 24 PATH
  and `/private/tmp/golf-scorecard-browsers` override above: 224 unit cases,
  69 real Chromium browser cases, typecheck, lint, mock guard, production build
  and three existing E2E cases. Local browser servers required escalation for
  the sandbox's localhost EPERM; tests otherwise ran unchanged.
- Native IndexedDB coverage includes close/reopen recovery of invalid partial
  drafts, one-active-slot creation races, revision-checked append/correction/
  continue/finish/removal races, persistent one-token undo, token-scoped
  dismissal, restore collisions and stale pre-removal revisions. Stored malformed
  rounds are rejected before history filtering, including unknown statuses and
  string-valued cursors. Finished history sorting and bounded par memory are
  tested through the real stores and manual ParSource.
- A real injected test v2 migration preserves v1 records; a failing migration
  rolls schema and data back. Blocked upgrade rejects without leaking its late
  connection. Version changes close the old connection and notify its owner
  after writes settle. Native transaction aborts and incompatible test-only par
  key paths prove atomic rollback of scores, par memory, drafts and cursor on
  both append and correction. Production uses strict readwrite durability and
  waits for transaction completion. No storage mocks or mutation fault hooks
  were introduced.
- Native tests exposed two implementation issues, both corrected: consume idb's
  companion upgrade-transaction rejection on migration failure, and defer owner
  version-change notification until settled write promises reach callers.
  Fixture cleanup and the original browser smoke test now wait for readonly
  transaction completion before deletion; request success alone can still leave
  a closing native transaction temporarily blocking deletion.
- The source fingerprint of all 14 `src/storage/*.ts` files is
  `e160a015e8f1ab5beb82cc9d870f291f04c7ce4204b54c23519e98ff78338f5b`, using the
  same sorted path/NUL/content/NUL SHA-256 procedure as scoring.

No storage implementation blockers remain. These are direct automated results;
formal orchestrator receipts, later UI acceptance, physical-phone persistence
and installation checks remain separate release evidence.


Composition-root controller assignment (`src/app/session.ts`, `undo.ts` and their
browser tests) implemented against the shared repository/trash ports and injected
logger, clock date, commit observer and mutation-admission guard. No dependencies
or package manifests changed in this assignment.

- Session writes serialize every input, expose committed rounds separately from
  retained local drafts, and guard duplicate commands with shared promises.
  Conflicts preserve both local values and fresh stored values; explicit reapply
  writes reviewed drafts without confirming scores. Retry preserves newer input
  and never confirms an obsolete failed command. Refresh retains existing durable
  correction drafts when another tab changes the revision.
- Failed load/refresh reads retain their actual operation and target for Retry.
  Validation-only lifecycle errors permit navigation when all edits are durable;
  persistence failures and conflicts continue to block unsafe navigation.
  Temporary update locks reject new work, allow already admitted writes to drain,
  and do not leave the next command or navigation permanently blocked after unlock.
- Undo survives controller disposal/restart. Concurrent restore callers recover
  the already restored round, stale dismissals reread the token without purging a
  newer removal, and failures retain the undo item for an explicit retry.
- Targeted real Chromium controller tests passed 27 cases. The integration run
  including root-owned container/router tests passed 35 cases. Strict project
  typecheck, targeted zero-warning ESLint and the executable mock guard passed.
  Tests use real unique IndexedDB databases, native closed-connection failures,
  two live connections and injected scheduling gates around actual repositories;
  no module mocks or fabricated database responses were introduced.
- Commands used Node 24 PATH and `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/golf-scorecard-browsers`:
  `npm run typecheck`, `npx eslint src/app/session.ts src/app/undo.ts src/app/session.test.ts src/app/undo.test.ts --max-warnings 0`,
  `npm run check:no-mocks`, and
  `npm run test:browser -- src/app/session.test.ts src/app/undo.test.ts`.
  The integration browser command additionally included `src/app/container.test.ts`
  and `src/app/router.test.tsx`.
- The sorted path/NUL/content/NUL SHA-256 fingerprint of the four assigned files is
  `7d46ee66fd74461a45ef24b9614d9849fb1773f7add3fb5bbcc972270c4412e9`.

Controller assignment has no remaining implementation blockers. Full composition
and cross-browser update acceptance are recorded by their owning assignments;
this evidence does not claim later screen or physical-device completion.

Composition two-build update acceptance passed in Chromium phone, Chromium
desktop and WebKit phone (six e2e cases). Each project creates two actual
production builds in isolated temporary directories and switches a real static
origin between them. Native IndexedDB fixture transactions seed valid production
records in `golf-scorecard`; there are no module substitutes, request
interceptions, production globals or database-selector backdoors.

- The waiting worker defers for an active round, active draft, finished-round
  correction draft, and pending undo. Even a stale direct activation request
  cannot discard these states; records and the old entry asset remain unchanged.
- A visible `Update app` action activates only once all clients are safe. Only
  the initiating document reloads. The second tab retains its document, view,
  original hashed asset and build cache. Fetching that old asset succeeds through
  the new worker even though the real origin returns 404 for it.
- Closing the old client and focusing the current one removes the unreferenced
  old build cache. Offline close/reopen preserves the finished round unchanged.
- A same-origin silent HTML document opened before initial clientsClaim becomes
  controlled but supplies no acknowledgement. The update waits, visibly locks
  mutation controls, aborts and unlocks without navigation. Closing the silent
  client permits an explicit retry to activate successfully.
- This final case exposed a real lifecycle error: an initially installed worker
  becomes redundant when its successor activates, but its state listener treated
  normal retirement as install failure and released the initiating nonce before
  controllerchange. The listener now reports redundancy as failure only before
  successful installation, and duplicate worker listeners are prevented.

Commands with the documented Node/browser environment:
`node --import tsx scripts/browser-tool.ts e2e e2e/update.spec.ts` passed all six
cases; `npm run typecheck`, `npm run lint`, and `npm run check:no-mocks` also
passed. Full composition aggregation remains the host coordinator's gate.
The sorted path/NUL/content/NUL fingerprint of `e2e/update.spec.ts` and
`src/app/sw-update.ts` is
`375ccd2890521e4f47b91c481f13607e0730454a1b56ebebcc597e0b314365ce`.

## Composition-root integration gate

- Fresh plan hash verified as `3cfba3630f18b0a1783172832eae7f6e0fb9017c1bc3307242e39a62308a1428` before implementation. Added pinned `pino@10.3.1`; installation reported zero vulnerabilities. Logger emits structured browser objects with lifecycle identifiers/counts only.
- One dependency container owns storage, active and isolated editor sessions, persistent undo, local calendar dates, commit subscriptions, real BroadcastChannel refresh and lifecycle cleanup. Update safety reads durable active rounds, all finished correction drafts and pending trash as well as editor queues. The worker handshake locks new mutations while already accepted writes drain.
- Router waits for registered writers before changing hashes, preserves the visible route on failure, handles malformed/unknown paths in place, restores draft/turn/finish destinations, and moves focus to the new screen heading. Startup failures offer retry without resetting stored records. Browser persistence requests report their actual outcome.
- Controller review found and fixed temporary admission locks latching after unlock, failed reads that retry did not repeat, and validation-only finish errors preventing navigation to the correction needed to resolve them. Cross-tab refresh coalescing schedules another read when a commit arrives during an earlier read.
- Full `npm run check` passed on Node 24.11.1 with the explicit browser cache: **225 unit tests, 118 native Chromium browser tests, 18 Chromium/WebKit E2E tests**, strict app/build typechecks, zero-warning ESLint, syntax-aware no-mocks guard, production build and architecture checks. Architecture check is now part of the standard gate: 30 production TS modules satisfy dependency boundaries, named exports and entry reachability.
- Startup E2E deliberately stores an invalid record through native IndexedDB, verifies actionable retry in all three browser projects, and verifies the record remains after retry. Two-build and controller details/fingerprints appear above.
- The gate's 17 files under `src/app/` plus `src/main.tsx` have sorted path/NUL/content/NUL SHA-256 `145890d7a101c32abb96da9b9bf1ec7d892dd069f1352a16503120bebc78e4db`. Product route registration was intentionally empty at this stage; entry/log feature wiring follows in approved order.
- Spec interface prose now names `refresh()` and `editorVersion` alongside retained local drafts and explicit conflict resolution. Generated assignment hashes do not encode prose edits; this refinement is recorded separately rather than treating an unchanged hash as proof of identical semantics.

During subsequent integration review, container notifications were isolated per subscriber so one throwing listener cannot suppress later subscribers or cross-tab broadcasts. The five container browser cases passed again, including an injected failing observer followed by a real BroadcastChannel refresh. The final source fingerprint below will include this post-composition hardening.

## Completion-driven shared-table refinement

The approved eighteen-hole summary collapses holes 10–18 while retaining full totals. `ScorecardTable` now accepts optional `showBackNine` (default true), hiding only those body rows while computing Out/In/Total from all eighteen holes. The four scorecard browser cases passed, including full independent numeric totals and axe with the back nine collapsed. The interface/behavior prose was refined; the generated kit assignment hash remains `2eb6ca00b12bf44cbe34c14c0abfbe6e48c22667d25459fe5498edc0dfacca9f` because paths/assignments are unchanged. Subsequent full gates include this additive API.

The common E2E fixture now also fails on uncaught page errors, including errors in additional same-context tabs. Handled persistence diagnostics may still log structured events; they do not count as uncaught failures.

## Round-entry and completion gates

- Executed `hole-entry` before `round-completion`. The original hole-entry plan
  hash `886ee8925b992c8ba72be3a087fb877f5d5a4dfca593f098270834995851ea9e`
  matched immediately before source work. The coordinator subsequently recorded
  shared `SessionStatus`, entry CSS and explicit next-hole navigation ownership;
  the refined hash is `88c09041dd1de09fcda34f2a99c8865a15d933fef437f204927518dc36f45b66`.
  Completion hash `aadd79ead4097401a8d497b0fa79de9c1173c23d6c29a21cc3c32129ac3fd8a9`
  matched immediately before completion implementation.
- Shared hole editing initializes once, restores invalid drafts exactly, derives
  GIR independently of unanswered fairway and retains each numeric field when
  other fields change. Suggestions cannot overwrite edits. Atomic confirmation
  waits behind queued drafts; local and saved conflict values are shown before
  explicit reload/reapply. Current-hole navigation scrolls within its strip,
  and returning to the available next draft remains one action.
- Nine-hole completion persists the explicit decision. Eighteen-hole entry
  attempts finalisation once and shows its recoverable finish route on failure;
  retries never skip transaction completion. Pending corrections have actionable
  review links. Abandon flushes writes and reads the latest revision, preserves
  persistent Undo across navigation/restart, and Dismiss releases the active slot.
  The completed summary retains Out/In/Total while its back nine is collapsed.
- The hole-entry stage passed 225 unit cases, 131 browser cases and all 33 E2E
  cases. Its initial run passed 30 E2E cases; three conflict-comparison tests
  selected only the bold label instead of its paragraph. After correcting that
  locator, all three passed. No application behavior was changed for that fix.
- The final completion `npm run check` passed **225 unit tests, 140 native
  browser tests and 45 Chromium/WebKit E2E tests**, strict app/build typechecks,
  zero-warning lint, no-mocks guard, architecture checks (43 reachable modules),
  and production PWA build. Twenty-one browser cases belong to entry/completion,
  including injected real-repository failures, rapid inputs, duplicate actions,
  persisted invalid drafts, conflicts, completion recovery and rendered finish
  retry with axe. Phone E2E covers native double-click on consecutive par threes,
  320px/200% text keyboard use, full 9/18 flows, stale routes, correction recovery,
  second-round start without reload, persistent abandon and offline play/reopen.
- A test originally reloaded immediately after clicking Continue, before its
  durable acknowledgement. The test now waits for committed hole-ten navigation
  before restarting; stale turn URLs also resolve to the canonical resumed route.
  Abrupt termination before a commit is never represented as Saved.
- The 20 files in `src/ui/entry/*`, `src/app/routes.ts`,
  `e2e/hole-entry.spec.ts` and `e2e/round-completion.spec.ts` have sorted
  path/NUL/content/NUL SHA-256
  `16ee831cc0a856feac6f7f5fb0efe861549d81541e8a32309222b53c1aa5a46d`.
  No dependencies were changed. Browser execution used the documented Node and
  explicit browser cache, with localhost server sandbox escalation.

Logged-round correction while offline depends on the following round-log
feature and remains part of its final acceptance flow. Physical phone
installation and release evidence are still separate from these runtime gates.

## Cross-screen visual and navigation corrections

Visual inspection found defects that axe and document-width assertions did not detect: at 320px and 200% text the full editor stepper center collapsed to zero width, and the sticky action panel obscured keyboard focus. Bounded pixel-based stepper columns preserve the numeric value; action panels now remain in document flow. The application header is compact and wraps cleanly. Independent browser measurements after rebuilding found a 121.63px center with 51.19px buttons and 16px gaps at the enlarged viewport, and all thirteen keyboard-focused controls had unobscured centers and at least 48px widths. The coordinator inspected the resulting standard and enlarged screenshots. Temporary inspection artifacts are in `/private/tmp/golf-visual-entry-fixed-20261015/`; permanent accessibility regressions follow in the final gate.

History integration also exposed a native WebKit reload/hash-navigation race. Startup now preserves navigation that occurs during the asynchronous storage recovery; recovery rechecks the current hash after reading storage. The router installs its native listener in a layout effect and reconciles the current hash. Five native router browser tests (including two new navigation-race cases) and all twelve production completion E2E cases passed across Chromium phone/desktop and WebKit phone. No test delay or navigation workaround was used.

The kit's custom spinbutton also explicitly honors a disabled ancestor fieldset for keyboard input, matching its native increment/decrement buttons during save and update locks. A real-browser lock/unlock regression passed with the three existing Stepper cases. Detail integration adds optional `selectionDisabled` to preserve row-button DOM identity while disabling pending selection; the interface prose records this additive shared-table refinement.

Detail integration exposed a navigation recovery boundary: a failed read with no unsaved edits must not trap the user on an unavailable round. Session flush now permits that transition while retaining its read error for retry; failed mutations and retained local drafts still block navigation. All nineteen session browser cases pass, including missing-id/read-failure exit and a combined native read/write failure that continues to preserve unsaved input. The reconnect fixture supplies its new real repository to both read and write ports. App state subscription also reconciles its current snapshot after subscribing, closing the initial render/effect gap for storage/update state.

## Round-history and round-detail gates

- History ran before detail. The approved history contract was refined to use
  `StoredRound` for its persisted cursor, display progress without claiming 18
  holes before the decision to continue, reserve New round during an active
  pending abandonment, and preserve readable results during failed refreshes.
  Calendar dates are rendered locally without a UTC date shift. Shared
  presentation/CSS paths were explicitly assigned to slice 2. Its regenerated
  hash is `5582ad9d982e167ec028fbbedb5be9d3bf6bced839675373f7ab809fc76a5d80`.
- Detail clarified isolated editor ownership, recoverable correction selection,
  ordered drafts, explicit conflict comparison, and removal/navigation failure
  handling. Slice 6 now owns its shared CSS changes; the navigation port is
  optionally injected for real-storage failure tests. Regenerated detail hash
  `9cd9d5790db15fdfcd40d018c9e8de2aa040dd3e9a82a456a7262566b5fc3c7f`
  matched immediately before implementation and again at handoff. Additional
  recovery prose leaves that assignment hash unchanged and is recorded here.
- History's initial full gates passed 225 unit and 145 browser cases, strict
  typechecks, lint, no-mocks and architecture (47 modules). All nine history E2E
  cases passed. The full E2E run was 53/54 because it exposed the preexisting
  WebKit startup race documented above; the coordinator fixed it and reran all
  twelve completion cases successfully before detail completion.
- Detail uses the shared HoleEditor/SessionStatus and one registered isolated
  writer. Drafts autosave; confirmed totals change only on Save correction.
  Cancel removes only its selected draft. Recovery resets editor identity only
  when needed, preserves both versions on conflicts, and reconciles the cursor
  after a successful retry. Selection buttons preserve DOM identity during
  actions; focus moves into the correction and returns to its row after Save or
  Cancel. Opening an unknown card reports its actual failure and permits exit.
- Removal flushes writers, commits persistent Undo, unregisters its editor, then
  navigates. A failed navigation retains readable removed context. Global Undo
  restores an editor even when the URL stays the same. Failed remove, restore
  and dismiss retain recoverable data and show actionable errors in the actual
  application. No route cleanup purges the token.
- Final targeted commands passed: `npm run test:browser -- src/ui/log`
  (**22 native browser cases**, 5 history + 17 detail), `npm run test:e2e --
  e2e/round-detail.spec.ts e2e/round-history.spec.ts` (**24 cases** across
  Chromium phone/desktop and WebKit phone), strict typechecks and full lint.
  No-mocks passed for 94 source files; architecture passed for 50 reachable
  modules. Tests use actual IndexedDB, actual closed connections/reconnection,
  injected asynchronous navigation and independent database connections. They
  cover stale refresh ordering, preserved invalid/failed drafts, corrections,
  simultaneous removal races, every-field restoration and explicit dismissal.
  Rendered native failures prove retry remains in place beside the card/Undo.
- Production E2E covers a complete offline nine-hole round, closing/reopening
  the app, an offline correction draft restart and confirmed correction restart.
  It also verifies two-tab local/saved comparison and explicit reapply, keyboard
  focus after Save/Cancel, and persistent Undo through restart. Initial dismissal
  tests reloaded before purge acknowledgement; they now wait for the durable
  Undo-region disappearance before restarting. Abrupt termination before a
  commit is never represented as completion.
- Visual review found a compact editor wider than its visible table scroller at
  320px/200% text. Container-relative editor width, reduced cell padding, bounded
  stepper columns, stacked narrow actions/GIR and wrapping history headers keep
  controls readable while the scorecard itself can scroll. Independent expanded
  accessibility/layout verification is recorded by the platform reviewer and
  the final whole-project gate includes these refinements.
- At handoff the 13 files in `src/ui/log/*`, `src/app/routes.ts`, and the two
  round-log E2E files have sorted path/NUL/content/NUL SHA-256
  `a715410009a7b7e650d4884ba3ed095c508dba4f54b35d7ac60c1b1545a7fc02`.
  No package dependencies changed. The coordinator owns the final clean-install
  and full regression gate; physical phone installation and interaction checks
  remain explicitly pending and are not replaced by these emulated runs.


## Final cross-screen accessibility and visual acceptance

The permanent `e2e/accessibility.spec.ts` passed **12/12 cases** across Chromium
phone/desktop and WebKit phone. Whole-document axe runs (no disabled rules) cover
light/dark empty history, start, par-four/par-three entry, invalid persisted putts,
turn, nine-hole summary, expanded eighteen-hole summary, populated history,
detail, inline corrections/errors and persistent removed-round Undo. Native
IndexedDB fixtures provide complete scorecards; edits/removal/restoration use the
actual product controls. The enlarged regression emulates 320px/200% text,
high contrast and reduced motion, measures nonoverlapping entry value/button
boxes, verifies keyboard focus via `elementFromPoint`, and scrolls the real
scorecard with arrow keys. The detail case enters **10 strokes**, verifies its
glyphs stay on one line inside the value box, checks all controls and Save/Cancel
within the viewport, and confirms the restored total of 42 strokes after Undo.

Visual review found that a focusable overflow region did not scroll on native
WebKit ArrowRight. The table now handles Left/Right only when the region itself
owns focus, preserving descendant editor keys. The focused kit regression suite
passed **6/6 browser cases**, including descendant Stepper editing without table
scrolling and stable native disabled edit-button identity/rejected activation.

Screenshots also exposed a wide-table inline editor whose score values and plus
buttons were off-screen despite passing axe and document-width assertions. The
new visibility assertion failed against that bundle. The detail owner bounded
the editor to its scroll container, adjusted inline padding, stacked narrow
GIR/actions and allowed the history heading to wrap. Final measurements show a
218px editor, 90px value boxes and 48px buttons at 320px/200%; the two-digit score
and focused Save/Cancel are readable without horizontal panning. Final inspected
artifacts are under `/private/tmp/golf-accessibility-20261015/final/`, notably
`narrow-200-editor-focus.png`, `narrow-200-editor-actions.png`,
`narrow-200-history-full.png`, `narrow-200-removed-undo-full.png`, and the matching
phone-light/phone-dark detail/editor images. These temporary artifacts are local
inspection evidence, not committed release receipts.

Exact targeted commands (Node 24.11.1 on PATH and
`PLAYWRIGHT_BROWSERS_PATH=/private/tmp/golf-scorecard-browsers`):

- `node_modules/.bin/vite build --outDir /private/tmp/golf-accessibility-20261015/build --emptyOutDir` — passed, production PWA emitted.
- `node_modules/.bin/playwright test --config /private/tmp/golf-accessibility-20261015/playwright.config.ts --workers 3` — 12 passed. The temporary config inherits all three project definitions and points preview to the isolated build on port 4175; source tests use the normal repository config in the final gate.
- `node_modules/.bin/vitest run --project browser src/ui/kit/ScorecardTable.test.tsx` — 6 passed in real Chromium.
- `npm run typecheck`, `npm run lint`, `npm run check:no-mocks` — passed; no executable mocks in 94 source files.

The three acceptance/table files have sorted path/NUL/content/NUL SHA-256
`256c2c3b448a251baaf45bfdc8cb396f12b93b35b5fb56cda6d2f6baa4fb8552`. No dependencies changed. Temporary browsers and origins were
closed after capture/testing. The coordinator owns the subsequent clean-install
whole-project gate. Physical-phone installation/standalone checks and unavailable
formal toolkit receipts remain explicit release gaps; browser emulation does not
satisfy those checks.

## Final candidate verification

All twelve planned features have source implementations. The final clean `npm ci` installed 550 packages, audited 551, and reported zero vulnerabilities with normal engine/peer checks. `npm run check` then exited **0** against the unchanged candidate on Node 24.11.1/npm 11.6.2 with `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/golf-scorecard-browsers`:

| Check | Result |
| --- | --- |
| Strict application/test and build-config typechecks | Pass |
| Recommended ESLint rules, zero warnings | Pass |
| Executable no-mocks guard | Pass, 94 files |
| Dependency boundaries, named exports and entry reachability | Pass, 50 production modules |
| Pure domain and tooling unit tests | 225 passed |
| Real IndexedDB, controllers, hooks and UI browser tests | 167 passed |
| Production Chromium phone/desktop and WebKit phone E2E | 81 passed |
| Production PWA build | Pass |

The **473 passing test cases** include the complete offline round/restart/correction flow, native storage failures and conflicts, persistent Undo/Dismiss, nine/eighteen-hole completion, twelve whole-screen accessibility cases, enlarged two-digit scoring, and real two-build multi-tab update/cache-retention tests. The suite has zero configured retries. The complete command output is retained in [2026-10-15-check.log](2026-10-15-check.log).

The [source manifest](2026-10-15-source-manifest.json) binds all 114 application, configuration, test, tooling and public asset files to SHA-256 **`84ceafd7039266da3ca54c4782c72d5be191be521189a72e78967413087ac0a0`**. Its entries were rechecked after the successful suite. The final `dist/` build identity is `7d419135-dbe3-44f0-b7ec-1d5c3102780c` (schema compatibility 1). The coordinator also inspected the final enlarged editor/value/action screenshots and dark history screenshot; measured two-digit values and controls remain visible. Generated feature assignments were revalidated against all twelve full hashes before completion status reconciliation. Semantic spec refinements are documented above; assignment hashes do not encode prose.

Completion status uses direct `manual` evidence referencing this audit, not fabricated orchestrator run receipts. Fifty-nine slices/specs, eleven features and five capabilities are recorded done through the planning store. App-shell slice/spec 4, offline-shell, app-shell and the product remain in progress because physical home-screen installation acceptance has **not** been performed. Course-scorecard remains deferred. The code is implemented and automated checks pass; this is not a claim of physical-device or formal assurance approval. The required remaining acceptance is in [the release runbook](../runbooks/golf-scorecard-release.md).

## Footer theme chooser follow-up

Added System/Light/Dark radio controls to the footer, defaulting to System. An injected theme controller applies the stored selection before app startup, persists it independently of scorecards, synchronizes open tabs through native storage events, and reports storage failures inline while retaining the chosen appearance for the current page. CSS preference overrides preserve increased contrast and use a shared on-accent text token for readable scoring buttons under either device theme.

Targeted validation passed: strict typechecks and production build; lint; architecture (52 reachable modules); no-mocks guard (97 files); 18 shared-control browser cases; 17 detail/application integration browser cases; and 15 Chromium/WebKit theme/accessibility E2E cases. The theme E2E covers saved draft retention, keyboard selection, reload persistence, cross-tab synchronization, system preference changes, increased contrast, 320px/200% text and axe. The rebuilt local preview at port 5173 was inspected in an isolated browser; its dark footer screenshot is `/private/tmp/golf-theme-footer.png`.

This follow-up changes the source and build after the full-suite candidate recorded above. The earlier 114-file source manifest and 473-case full-suite result remain historical evidence for that earlier candidate; the theme follow-up has the targeted evidence listed here. Physical phone release checks remain pending.
