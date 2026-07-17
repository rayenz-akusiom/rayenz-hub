# Hub Refactor Roadmap

Last updated: 2026-07-16

Incremental refactors using the **ItemDB v2 pattern**: normalize once at fetch/save, store a compact typed cache, pick at read with a trivial loop, reject legacy formats, log chosen objects for debugging.

**Scope policy:** Neopets / Dailies first. MTG Hub refactors are documented below but **deferred** until this track is complete.

Related plans (Cursor):

- ItemDB cache trim (implemented): `.cursor/plans/itemdb_cache_trim_10b2caaf.plan.md`
- Similar-refactor audit (MTG + follow-ups): `.cursor/plans/similar_refactor_audit_36111004.plan.md`

---

## Refactor checklist

Use when evaluating any workflow:

1. Is raw external data stored or re-fetched repeatedly? → Normalize once; cache compact shape with `formatVersion`.
2. Is pick/eligibility done by joining 2+ structures at read time? → Bake eligibility into cached list; read = first index (+ skip list).
3. Is the same derivation duplicated across files? → Extract to `shared/` with one normalized output type.
4. Is legacy format still accepted? → Explicit invalidation rather than dual-path reads.
5. Is debugging painful? → Log the chosen normalized object on every decision.

---

## Phase 1 — Neopets / Dailies (complete)

Phase 1 data refactors are done. **Dailies UI/domain live in React/TypeScript** under `packages/web` (SPA route `#/dailies`), with schemas in `packages/shared`.

### 1.1 ItemDB wishlist picker — v2 cache (done)

**Files (legacy vanilla removed):** now `packages/web/src/dailies/itemdb.ts`, `tests/unit/hub/dailies-itemdb.test.js`

- [x] v2 cache: `{ formatVersion: 2, items: WishlistItem[] }` with normalize-on-save
- [x] Legacy v1 cache invalidation
- [x] One network fetch per visit; 429 backoff; cache fallback
- [x] Description trim only on quota failure
- [x] `chosen item` console logging

**Remaining (optional polish):**

- [x] **ItemDB read-path cleanup** — render `WishlistItem` directly; colocate `localSkipIds` in v2 cache payload instead of separate `rayenz-itemdb-local-hidden` key
- [x] **Deploy** — commit, push, `npm run deploy:hub` when satisfied in production

### 1.2 Wishing Well automation — normalized state (done)

**Files:** `packages/web/src/dailies/wishing-well.ts`, `automations.ts`

- [x] Single `rayenz-wishing-well-state` doc with legacy key migration
- [x] `evaluateWishingPost` centralizes success/failure
- [x] State logging on each outcome via `recordWishingOutcome`
- [x] Unit tests in `dailies-wishing-well.test.js`

### 1.3 Wishlist settings — normalize-on-save (done)

**File:** `packages/web/src/dailies/settings.ts` (+ React settings page)

- [x] `saveSettings` normalizes wishlists; `getWishlists` reads stored shape (lazy normalize for legacy entries)

### 1.4 React migration (done)

- [x] Vite SPA entry (`packages/web` → `rayenz-hub/index.html`)
- [x] Domain ports under `packages/web/src/dailies/`
- [x] React `DailiesApp` (wishlists, alerts, sidebar, grid, automations)
- [x] Vanilla `apps/dailies/` loaders removed

### 1.5 Out of scope historically

- timed / links / Coconut Shy — now TypeScript modules under `packages/web/src/dailies/`

---

## Phase 2 — MTG Hub (complete)

Phase 1 complete. Full audit: `.cursor/plans/similar_refactor_audit_36111004.plan.md`.

### P0 — Small deduplication wins (done 2026-07-11)

| ID | Task | Files | Status |
|----|------|-------|--------|
| mtg-1 | Unify `deriveSwapQueue` | `shared/swap-queue.js`, `order-reconcile-export.js` | done |
| mtg-2 | Shared Scryfall `fetchPrintings` cache | `dr-data.js`, `or-data.js`, `shared/scryfall-cache.js` | done |

### P1 — Medium

| ID | Task | Files | Status |
|----|------|-------|--------|
| mtg-3 | Shared `buildCutCandidates` | `shared/cut-candidates.js`, `dr-pickers.js`, `or-reconcile.js` | done |
| mtg-4 | Order Reconcile precomputed assignment index | `or-assign.js`, `or-data.js` | done |

### P2 — Larger pipelines

| ID | Task | Files | Status |
|----|------|-------|--------|
| mtg-5 | Deck Suggest precomputed eligibility / candidate pools | `ds-data.js`, `ds-rules*.js` | done |
| mtg-6 | Deck Review normalized suggestion bundle at export | `ds-export.js`, `deck-review.js`, `dr-data.js` | done |

---

## Phase 3 — Hub React SPA (done 2026-07-16)

- [x] Single Vite SPA (`HubShell` + hash router) builds into `rayenz-hub/`
- [x] Dailies, Settings, Deck Builder, Neopets More mount in-tree (no iframes)
- [x] Shared card kit (`packages/web/src/cards/`) + React `HubCardPicker` bridge
- [x] Deck Review / Deck Suggest / Order Reconcile React route hosts (`VanillaMtgApp`) with shared CardPicker; domain UI still vanilla JS under `rayenz-hub/apps/` pending full JSX rewrite
- [x] Vanilla hub `router.js` + iframe loaders removed

**Follow-up:** Rewrite DR / DS / OR render layers to JSX; port `HubStorage` / `HubApiClient` fully to TypeScript.

---

## Completed

| Date | Item |
|------|------|
| 2026-07-16 | Hub React SPA: shell, card kit, Neopets More; MTG apps React-hosted |
| 2026-07-12 | MTG P2 mtg-6: shared `suggestions-bundle.js` for export/load normalization |
| 2026-07-12 | MTG P2 mtg-5: Deck Suggest precomputed set pool index + deck rule context |
| 2026-07-12 | MTG P1 mtg-4: Order Reconcile precomputed assignment index (`buildAssignmentIndex`) |
| 2026-07-12 | MTG P1 mtg-3: shared `buildCutCandidates` in `shared/cut-candidates.js` |
| 2026-07-11 | MTG P0: unified `deriveSwapQueue` (ORE → SwapQueue); shared `scryfall-cache.js` |
| 2026-07-05 | ItemDB v2 normalized cache + simplified pick path |
