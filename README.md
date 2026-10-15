# Golf Scorecard

An offline scorecard for one golfer: record par, strokes, putts and fairway results; automatically calculate GIR and totals; finish at nine or eighteen; review and correct past rounds.

## Development

Use the Node version in `.nvmrc` (`nvm use`), then:

```sh
npm ci
npm run setup:browsers
npm run dev
```

Choose System, Light or Dark in the footer. The app remembers your theme on this browser and keeps open tabs in sync; System follows your device’s appearance.

The application has no account, API or cloud sync. Rounds, partial drafts, remembered pars and pending undo are stored in IndexedDB on this browser. A fresh visit requires a connection; wait for the offline-ready status before going offline. Clearing browser storage removes the local records.

## Validation

```sh
npm run check
```

This runs strict type checking, lint, the executable mocking guard, dependency/export/reachability checks, unit tests, real-browser tests and end-to-end tests against a production build. Browser installation is an explicit setup step, never part of test execution. `PLAYWRIGHT_BROWSERS_PATH` can override the default temporary browser installation directory. The e2e projects cover Chromium phone/desktop and WebKit phone.

`npm run build` creates `dist/`; `npm run preview` serves that build locally. Production hosting must serve `dist/` at the origin root over HTTPS. Use the built preview to exercise offline behavior; the development server does not install the production service worker. The service worker caches the application assets; the manifest uses local icons and the UI uses system fonts.

## Structure

- `src/domain`: pure scoring, validation, round lifecycle and the injectable source of suggested par.
- `src/storage`: validated, revision-checked IndexedDB transactions, bounded drafts and explicit persistent undo.
- `src/app`: composition, shared session/undo controllers, routing and offline lifecycle.
- `src/ui`: accessible controls and round entry/history screens.
- `_tkr_kit`: approved product and implementation contracts; course lookup remains deferred.

See [implementation evidence](docs/runbooks/implementation-evidence.md) and [physical-phone release checks](docs/runbooks/golf-scorecard-release.md). Source completion and automated checks do not substitute for those device checks.
