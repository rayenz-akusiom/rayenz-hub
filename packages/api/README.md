# @rayenz-hub/api

Hub API Lambda package.

Production browser auth is Cognito JWT (`Authorization: Bearer <access token>`). Cognito is stack `rayenz-hub-cognito` (`infra/cognito.yaml`, termination protection on). Local SAM sign-in uses that live pool via `npm run setup:local-cognito`. MCP may use `HUB_API_KEY` mapped to `HUB_USER_ID` (Rayenz `sub` after the overlay). See `docs/hub-api-production.md`.

## Glance image generation

`POST /v1/decks/{deckId}/glance` composites PNGs with [`sharp`](https://sharp.pixelplumbing.com/) (native linux-x64 bindings).

### Packaging (required)

SAM `Metadata.BuildMethod: esbuild` bundles the handler. **`sharp` must stay external** — bundling it crashes Lambda init (`createRequire` / native bindings), which surfaces in the browser as CORS failures on *all* routes (500 responses without CORS headers).

`infra/template.yaml` lists `sharp` under `BuildProperties.External`. After `sam build`, `scripts/copy-api-lambda-assets.mjs` (via `npm run build:api`):

1. Installs **linux-x64** `sharp` into `.aws-sam/build/HubApiFunction/` (needed for SAM local Docker / Lambda even when the host is Windows)
2. Copies `assets/fonts/` for the Rayenz watermark

Local unit/API tests mock Scryfall fetches via injectable `imageLoader` in `glance-render.ts` and do not require the Lambda artifact.

### Card art resolution

Before compositing, `deck-glance.ts` calls `enrichGlancePlanArt` + `prefetchGlanceImages` (`glance-art.ts`):

- Sends a **`User-Agent`** on all Scryfall HTTP requests (required by Scryfall; missing it caused failed fetches / red placeholder tiles).
- Prefers **`cards.scryfall.io` CDN** URLs over `api.scryfall.com` image redirects.
- Batches **`/cards/collection`** for printings missing `scryfallId`.
- Falls back to **named neutral placeholders** when art is still unavailable (coordinates unchanged).

Layout version **`glance-gen-9`** bumps the S3 cache prefix (underfull decks pad with dashed “+” placeholders, selectable lieutenant highlights, CardFace-style `×n` qty badges, official Scryfall mana pips + vertical-rule title separator, content margins vs header/footer, main deck wraps under the role block, front-face-only land detection, fixed title-peek stacking with balanced columns); regenerate after deploy to drop older cached PNGs.
