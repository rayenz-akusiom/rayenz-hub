# AGENTS.md — Rayenz Hub contributor guide for AI agents

This file captures conventions for automated agents working in this repo. Prefer these over inventing new patterns.

## Non-negotiables

- **Do not deploy to AWS** unless the user explicitly asks (`sam deploy`, `npm run deploy:api`, etc.). Local SAM/`start:api` is fine.
- **Do not commit or push** unless the user explicitly asks.
- Prefer **Ask mode** for exploration; switch to Agent only when implementing.
- Keep diffs focused: no drive-by refactors, no unsolicited markdown docs beyond what was requested.

## Repo layout (frontend)

| Path | Role |
|------|------|
| `packages/web/src/` | React + TS Hub SPA (source of truth for UI/logic) |
| `packages/shared/` | Shared pure logic (swap queues, etc.) |
| `packages/api/` | Hub API (Lambda) |
| `rayenz-hub/` | Built static assets + CSS for GitHub Pages subtree deploy |
| `tests/unit/hub/` | Unit tests for Hub modules (happy-dom) |
| `tests/web/` | React Testing Library tests (jsdom) |
| `tests/api/` | API contract/unit tests (node) |
| `tests/e2e/` | Playwright |

## Testing & coverage

### Commands

| Script | Purpose |
|--------|---------|
| `npm run test:unit` | Unit + API tests (default Vitest config) |
| `npm run test:web` | React RTL suite only |
| `npm run test:coverage` | **Gated** web coverage core: ≥80% **branches** (`coverage/web-gate`) |
| `npm run test:coverage:full` | Full `packages/web` report, no threshold (`coverage/web-full`) |
| `npm run test:web:coverage` | RTL-only coverage report (no branch gate) |
| `npm run test:unit -- --coverage` | Unit/API coverage under `coverage/unit` |

Reports land under `coverage/` (gitignored). Gate → `coverage/web-gate/`; full → `coverage/web-full/`. Do **not** run multiple `vitest --coverage` processes against the same `reportsDirectory` (Windows `ENOENT` races).

### What we measure

- **Provider:** `@vitest/coverage-v8` (pin to the same major/minor as `vitest`).
- **Primary gate (`test:coverage`):** **branch** coverage ≥ **80%** on the **coverage core** in `vitest.coverage.config.ts`.
- **Full report (`test:coverage:full`):** all of `packages/web/src` with `all: true`, no threshold — find gaps outside the gate.
- Statements/lines/functions are reported for visibility but are not the CI gate.
- **`coverage.all: false` on the gate:** only imported files count (after excludes). Prefer testing hub chrome with **mocked** heavy child apps.
- **Gate excludes:** bootstraps (`main.tsx`, `types.ts`, `index.ts`); presentational shells (`*App.tsx`, pages, browse/modals/dialogs, OR/DR/DS React surfaces, DailiesApp, cards UI); **coverage backlog** still exercised by tests but not gated: `mtg/archidekt-export.ts`, `mtg/order-reconcile-export.ts`, `mtg/profile-sync.ts`, `dailies/itemdb.ts`, `deck-suggest/generation.ts`.
- **Gate includes:** hub chrome, API client, lib, deck-builder/suggest/review/reconcile **logic**, dailies settings/timed/wishing-well, etc.
### Where to put tests

| Kind | Location | Environment |
|------|----------|-------------|
| Pure logic / stores / API client | `tests/unit/hub/*.test.ts` | happy-dom |
| React components / hooks | `tests/web/*.test.tsx` (or `tests/unit/hub/*.test.tsx` if already there) | jsdom for `tests/web` |
| Do not mix API Lambda tests into web coverage | `tests/api/` stays on default config | node |

Coverage config uses **happy-dom** by default and **jsdom** for `tests/web/**` via `environmentMatchGlobs`.

### Best practices (do)

1. **Test behavior at module boundaries** — exportable functions, hooks, and components; avoid asserting implementation trivia.
2. **Prefer branch-oriented cases** — empty/null input, unknown routes, 401/404/HTML API bodies, quota/localStorage failures, dual-mode API on/off.
3. **Mock fetch with `.text()`** — `HubApiClient.clientApiFetch` reads `res.text()` then parses JSON. Mocks that only stub `.json()` will break:
   ```ts
   function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
     const status = init.status ?? 200;
     const ok = init.ok ?? (status >= 200 && status < 300);
     const text = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
     return { status, ok, text: async () => text };
   }
   ```
4. **Mock heavy children when testing shells** — e.g. `HubShell` should mock `DeckBuilderApp` / `OrderReconcileApp` / etc. so coverage stays focused and tests stay fast.
5. **Reset storage and hub globals** between tests — use `resetHubModules`, `resetHubGlobalsInstalled`, `installHubGlobals` from existing helpers.
6. **Extend existing suites** before adding parallel files for the same module.
7. **RTL:** query by role/label; use `user-event` for clicks; assert visible outcomes.
8. **Keep fixtures small** — reuse `tests/fixtures/` slices; do not snapshot entire Scryfall dumps into unit tests.

### Best practices (don't)

1. **Don't** chase 100% statements on presentational JSX — cover important branches; leave chrome to light smoke + e2e.
2. **Don't** use `istanbul ignore` / coverage ignores to hide real logic; only for truly unreachable defensive guards, and comment why.
3. **Don't** redefine `window.location.hostname` under jsdom without a stubbed `location` object — prefer happy-dom for those tests or `vi.stubGlobal` carefully.
4. **Don't** point Hub API URL at the Vite origin in tests or docs — `assertApiNotPageOrigin` rejects that class of misconfig.
5. **Don't** add Playwright cases for pure function coverage — e2e is for navigation/flows.

### Raising coverage when the gate fails

1. Open `coverage/web-gate/index.html` (or `test:coverage:full` → `coverage/web-full/`) and sort by **missed branches**.
2. Prioritize todo themes: deck-builder formal swaps, Suggest rules/guards, Order Reconcile assign/reconcile, dual-mode `HubStorage` / `HubApiClient`, then the **coverage backlog** exports/itemdb/generation.
3. Add unit cases for missed conditionals; re-run `npm run test:coverage`.
4. If a large `.tsx` app is pulled in transitively at 0%, stop importing it — mock it from the parent under test.

### Config files

| File | Role |
|------|------|
| `vitest.config.js` | Default unit + API |
| `vitest.web.config.ts` | React RTL only |
| `vitest.coverage.config.ts` | Combined unit+web **gated** coverage + 80% branch threshold |
| `vitest.coverage.full.config.ts` | Full packages/web report (no threshold) |

## Dual-mode storage / API client

- Local-first with optional Hub API sync when `rayenz-hub-api-url` + `rayenz-hub-api-key` are set.
- Tests should cover **both** API-off and API-on paths for persistence helpers.
- After changing `hub-api-client.ts` response handling, update **all** fetch mocks (`.text()`).

## TypeScript / React

- New Hub UI lives under `packages/web/src/`; do not add new vanilla IIFEs under `rayenz-hub/apps/`.
- Match existing import style (`.ts` extensions in some unit tests are intentional for Node resolution).

## Ideas backlog

Product/dev ideas live in the user's `IDEAS.md` (ideas-todo-list skill). The **Web/React coverage tracking** item is the product intent behind `test:coverage`; update that item when finishing a coverage push.
