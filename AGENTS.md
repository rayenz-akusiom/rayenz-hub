# AGENTS.md — Rayenz Hub contributor guide for AI agents

This file is a short always-on map. Prefer these conventions over inventing new patterns; details live in scoped Cursor rules (see index below).

## Non-negotiables

- **Deploy** = Hub API then GitHub Pages — see [`.cursor/rules/deploy.mdc`](.cursor/rules/deploy.mdc). Cognito and other AWS mutations stay named. Local SAM/`start:api` is fine.
- Production Hub **browser** identity is a Cognito session (sign in from the left nav). MCP and CLI scripts sign in with `HUB_USERNAME` / `HUB_PASSWORD` (do not commit the password). See `docs/hub-api-production.md`.
- **Do not commit or push** unless the user explicitly asks.
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

## Dual-mode storage / API client

- **MTG settings / review progress / set pools:** Hub API (DynamoDB) is required to persist; in-memory only within the tab when API is off (no durable localStorage). Order-reconcile session progress is memory-only (no API endpoint yet).
- **Dailies (Neopets):** still localStorage-first with optional Hub API sync when the user is signed in (and the API URL is present).
- **Decks / swap queues:** Hub API is the signed-in system of record. IndexedDB holds the unsigned sandbox library (30-day TTL) plus short-lived account crash buffers that drop after a successful sync (`saveDualMode`).
- The Hub API URL is baked at Pages publish (`VITE_HUB_API_URL`); Vite dev uses `http://<page-hostname>:3000`. UI prefs (route, card size, etc.) stay in localStorage. Session tokens stay in localStorage until Sign out; Cognito refresh tokens last up to 10 years.
- Tests should cover API-off and API-on paths for persistence helpers.
- After changing `hub-api-client.ts` response handling, update **all** fetch mocks (`.text()`).

## TypeScript / React

- New Hub UI lives under `packages/web/src/`; do not add new vanilla IIFEs under `rayenz-hub/apps/`.
- Match existing import style (`.ts` extensions in some unit tests are intentional for Node resolution).

## Pointers

- **Testing & coverage:** [`.cursor/rules/testing-coverage.mdc`](.cursor/rules/testing-coverage.mdc)
- **Glance (deck + swaps):** [`.cursor/rules/glance.mdc`](.cursor/rules/glance.mdc), packing algorithms in [`docs/glance-layout.md`](docs/glance-layout.md)
- **SPA chrome / UX:** [`.cursor/rules/hub-spa-chrome.mdc`](.cursor/rules/hub-spa-chrome.mdc); sticky / progress: [`hub-sticky-header.mdc`](.cursor/rules/hub-sticky-header.mdc), [`hub-progress-bar.mdc`](.cursor/rules/hub-progress-bar.mdc)
- **Ideas backlog:** user's `IDEAS.md` (ideas-todo-list skill). The **Web/React coverage tracking** item is the product intent behind `test:coverage`; update that item when finishing a coverage push.

## Cursor rules index

| Rule | When |
|------|------|
| [`deploy.mdc`](.cursor/rules/deploy.mdc) | Always (deploy / ship / push to prod) |
| [`testing-coverage.mdc`](.cursor/rules/testing-coverage.mdc) | Tests, vitest configs, SPA source |
| [`hub-spa-chrome.mdc`](.cursor/rules/hub-spa-chrome.mdc) | Hub SPA chrome / web tests |
| [`hub-sticky-header.mdc`](.cursor/rules/hub-sticky-header.mdc) | Sticky header work |
| [`hub-progress-bar.mdc`](.cursor/rules/hub-progress-bar.mdc) | HubProgress / status overrides |
| [`glance.mdc`](.cursor/rules/glance.mdc) | Deck + swap Glance |
| [`api-ioc.mdc`](.cursor/rules/api-ioc.mdc) | `packages/api` Inversify |
| [`deck-builder-commanders.mdc`](.cursor/rules/deck-builder-commanders.mdc) | Commander / lieutenant roles |
| [`deck-builder-card-images.mdc`](.cursor/rules/deck-builder-card-images.mdc) | Scryfall card images |
| [`greasemonkey-versioning.mdc`](.cursor/rules/greasemonkey-versioning.mdc) | `monkey-scripts` `@version` |
