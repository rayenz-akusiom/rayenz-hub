# Rayenz Hub tests

Automated tests for the [rayenz-hub](../rayenz-hub/) hub live in this folder at the **monorepo root** ([rayenz-akusiom/rayenz-hub](https://github.com/rayenz-akusiom/rayenz-hub)), not inside the hub source tree. Test files must never be added under `rayenz-hub/`.

## Prerequisites

- Node.js 18+
- `npm install` from the repo root

## Commands

| Command | Description |
|---------|-------------|
| `npm run test:unit` | Vitest + happy-dom (fast in-process DOM tests) |
| `npm run test:unit:watch` | Vitest watch mode |
| `npm run test:web` | Vitest React component tests |
| `npm run test:e2e` | Playwright browser tests |
| `npm run test:e2e:install` | Install Chromium for Playwright (one-time) |
| `npm test` | Run unit tests, then e2e |

## Layout

```
tests/
  fixtures/
    suggestions/              # Trimmed suggestion JSON for regression tests
  scripts/
    extract-suggestion-fixture.mjs
  unit/
    helpers/
      hubHarness.ts         # DOM reset / fixture paths for hub tests
      fixtureLoader.ts      # Reads tests/fixtures/suggestions/*.json
    hub/                    # Hub app tests (.ts / .tsx)
  e2e/
    static-server.mjs       # Serves rayenz-hub/ over HTTP
    hub-navigation.spec.ts  # Real-browser navigation regression
```

Unit tests import TypeScript modules from `packages/web` and `packages/shared` directly.

## MSH suggestion fixtures

Completed set-update JSON is archived under `tests/fixtures/suggestions/` (currently `msh-2026-06-21.json`) instead of shipping a multi-MB `latest.json` in the hub tree. Deck Review falls back to file upload when `data/suggestions/latest.json` is absent.

To slice decks from a source suggestions file for a future set:

```bash
npm run extract:suggestion-fixture -- \
  --decks baird,god-bane,ashes-of-love-irl,big-ol-borbs-landscaping-irl \
  --input path/to/MSH-YYYY-MM-DD.json \
  --output tests/fixtures/suggestions/msh-YYYY-MM-DD.json
```

`tests/unit/hub/deck-review-msh.test.ts` exercises swap-queue, staleness, reconciliation, filtering, and Archidekt export against these fixtures.

## Future: userscripts

`tests/unit/userscripts/` is reserved for tests of `monkey-scripts/*.user.js` (e.g. training school completion parsing). A future helper can stub `GM_*`, jQuery, and `fetch` without touching the hub source tree.
