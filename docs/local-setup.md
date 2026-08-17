# Local setup and testing — Hub Backend Platform

**Feature**: `002-hub-backend-platform`  
**Monorepo root**: `../rayenz-hub/`

This guide is the day-to-day workflow for running tests and local integration. For deploy, entity catalog, and AWS topics, see [quickstart.md](./quickstart.md).

---

## 1. One-time setup

From the monorepo root:

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm install
```

For **Playwright e2e** (one-time):

```powershell
npm run test:e2e:install
```

For **live HTTP API** testing you also need:


| Tool            | Purpose                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Docker**      | DynamoDB Local; MinIO (S3 for profiles / large set pools)                                                                                    |
| **AWS SAM CLI** | `sam local start-api` — [install guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) |


## Glance image generation

`POST /v1/decks/{deckId}/glance` is **API-only** (Commander decks, at most 100 cards after swaps; underfull decks pad with dashed “+” placeholders). The Hub SPA calls it from Commander Builder when `rayenz-hub-api-url` / `rayenz-hub-api-key` are configured. Swaps glance is `POST /v1/swaps/glance` (multi-page densify layout).

- **Layout strategies**: [glance-layout.md](./glance-layout.md) — deck packing regions, swap pack modes, densify ladder
- **Art resolution**: Lambda resolves Scryfall CDN URLs server-side (`User-Agent` required). Decks without `scryfallId` use batched `/cards/collection` lookup before compositing.
- **Cache**: Private S3 prefix `glance-cache/{GLANCE_GENERATION_VERSION}/{fingerprint}.png` (MinIO when using SAM local). Bump generation version to invalidate stale PNGs.
- **Tests**: `npx vitest run tests/unit/hub/deck-builder-glance-*.test.ts tests/api/deck-glance.test.ts tests/unit/hub/swap-glance.test.ts tests/api/swaps-glance.test.ts`

Client-only GitHub Pages deploy: glance control stays disabled without API; other Commander Builder flows unchanged.

---


## 2. Fast path — automated tests (no Docker / SAM)

Run this after most code changes. **No running API server required.**


| Command             | What it exercises                                                    |
| ------------------- | -------------------------------------------------------------------- |
| `npm run test:api`  | API handlers + Inversify container (~21 tests) — in-memory Dynamo/S3 |
| `npm run test:unit` | Vanilla Hub apps (~276 tests) — happy-dom, no HTTP server            |
| `npm run test:web`  | React dailies settings page — RTL smoke test                         |
| `npm test`          | Unit tests, then Playwright e2e                                      |


`npm run test:api` calls handlers directly via `createTestServices()` / `createMemoryStores()` in `tests/api/helpers/test-services.ts`. It does **not** need `sam local` or Docker.

**Typical pre-push check:**

```powershell
npm run test:api
npm run test:unit
npm run test:web
```

---



## 2b. Local development dashboard (recommended)

Instead of four terminals, run a control panel that can start/stop/restart DynamoDB, MinIO, SAM API, and Vite. The panel itself is on localhost; Vite and SAM bind on the LAN so phones/tablets can reach them.

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm run dev:dashboard
```

Open [http://127.0.0.1:5050](http://127.0.0.1:5050). The **Device access (LAN)** panel shows Hub Web / Hub API URLs (with copy) and an iPad `localStorage` snippet when the API is running. On the device, prefer **Settings → Hub API** in the Hub SPA. The tool lives under `tools/dev-dashboard/` (not part of the Hub SPA or SAM deployables).

CLI equivalents (same named Docker containers the dashboard uses):

```powershell
npm run start:dynamodb:persist
npm run start:minio:persist
npm run stop:dynamodb
npm run stop:minio
node tools/dev-dashboard/cli.mjs status
```

One-time setup (`init:local-db`, MinIO bucket) is still required — see below. For phone/iPad testing details, see [mobile-local-testing.md](./mobile-local-testing.md).

---



## 2c. Hub MTG MCP (Cursor agents / skills)

Stdio MCP server for MTG deck/profile/swap tools. **Hub is source of truth**; Archidekt is export/mirror only. Package: [`packages/mcp`](../packages/mcp/README.md).

With the API up (`npm run start:api` or the dashboard):

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
$env:HUB_API_URL = "http://127.0.0.1:3000"
$env:HUB_API_KEY = "test-api-key-local"
npm run start:mcp
```

Cursor MCP config (stdio; cwd = monorepo root):

```json
{
  "mcpServers": {
    "rayenz-hub": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/DeepStorage/Documents/Workspaces/Hub/rayenz-hub/packages/mcp/src/index.ts"
      ],
      "cwd": "C:/DeepStorage/Documents/Workspaces/Hub/rayenz-hub",
      "env": {
        "HUB_API_URL": "http://127.0.0.1:3000",
        "HUB_API_KEY": "test-api-key-local"
      }
    }
  }
}
```

Absolute path to `index.ts` is required: Cursor may resolve relative paths from the Hub workspace root (`Hub/packages/...`) rather than `rayenz-hub/`.

A project copy lives at [`.cursor/mcp.json`](../../.cursor/mcp.json) (workspace Hub root). MTG skills (`mtg-deck-profile-builder`, `mtg-deck-set-updates`, `mtg-buy-trade-list`) call this server via `GetMcpTools` / `CallMcpTool`.

---



## 3. Full stack — local API (SAM + Docker)

Use when you want a real HTTP server at `http://127.0.0.1:3000` (manual curls, browser + `hub-api-client`). Prefer [§2b](#2b-local-development-dashboard-recommended) when you want one UI for the whole stack.

### Terminal 1 — DynamoDB Local

**Preferred** — persistent named container + volume (tables survive container restarts):

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm run start:dynamodb:persist
```

Starts (or reuses) Docker container `rayenz-hub-dynamodb` in the background. Stop with `npm run stop:dynamodb`.

**Ephemeral alternative** (in-memory; data lost on stop):

```powershell
docker run -p 8000:8000 amazon/dynamodb-local
```

**One-time table create** — run once for a new/empty volume, or after every ephemeral restart:

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm run init:local-db
```

Creates `HubTable` (PK/SK). Without this, settings/reviews return 500: `ResourceNotFoundException`. With `start:dynamodb:persist`, you only need this again if you wipe the Docker volume `rayenz-hub-dynamodb`.

If the container logs `unable to open database file` (SQLite), stop it, wipe the volume, and start again:

```powershell
docker volume rm rayenz-hub-dynamodb
npm run start:dynamodb:persist
npm run init:local-db
```

### Terminal 2 — MinIO (S3)

Required for deck JSON blobs, profile YAML, and large set-pool objects. Credentials must match the API client (`local` / `localpass1`).

**Preferred** — persistent named container + volume (objects survive container restarts):

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm run start:minio:persist
```

Starts (or reuses) Docker container `rayenz-hub-minio` in the background. Stop with `npm run stop:minio`. Uses Docker volume `rayenz-hub-minio` mounted at `/data`. If you start MinIO **without** that volume (ephemeral/`docker run` with a fresh anonymous mount), DynamoDB can still list decks while `GET /v1/decks/:id` returns **500** (`NoSuchBucket`) because the API looks for bucket `rayenz-hub-data-local` on an empty store.

**Ephemeral alternative** (data lost when the container is removed):

```powershell
docker run -p 9000:9000 -e MINIO_ROOT_USER=local -e MINIO_ROOT_PASSWORD=localpass1 minio/minio server /data
```

**One-time:** create the bucket on a new/empty volume (MinIO does not auto-create it). Skip if `rayenz-hub-minio` already has `rayenz-hub-data-local`:

```powershell
$env:AWS_ACCESS_KEY_ID = "local"
$env:AWS_SECRET_ACCESS_KEY = "localpass1"
aws --endpoint-url http://127.0.0.1:9000 s3 mb s3://rayenz-hub-data-local
Remove-Item Env:AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
```

Without AWS CLI, create the bucket from the monorepo with the SDK (same credentials/endpoint as above), or use MinIO Console if you expose it.

**Dummy keys (`local` / `localpass1`)** are a MinIO username/password, not your AWS login. The snippet above sets them on the *current PowerShell window* so `aws --endpoint-url … s3 mb` can talk to MinIO. You only need to clear them if you still see them in *this same window*:

```powershell
Get-ChildItem Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
```

A new PowerShell window does not inherit them. `setup:local-cognito` and `start:api` need your real AWS profile (SSO/`aws configure`) so they can call live Cognito. DynamoDB Local and MinIO still use in-code dummy credentials when endpoints are set — you do not set `AWS_ACCESS_KEY_ID=local` for those.


### Terminal 3 — API

One-time: pull live Cognito pool/client/secret and the Rayenz `sub` into a **gitignored** overlay (do not commit the client secret):

```powershell
npm run setup:local-cognito
```

Writes `infra/env.local.overlay.json`. Re-run after rotating the app client or re-provisioning Rayenz.

If local decks still live under `USER::rayenz-local` (or `USER::default`), copy them onto that `sub` once:

```powershell
$env:DYNAMODB_ENDPOINT = 'http://127.0.0.1:8000'
$env:S3_ENDPOINT = 'http://127.0.0.1:9000'
$env:HUB_MIGRATE_SOURCE_USER_ID = 'rayenz-local'
npx tsx scripts/migrate-user-partition.ts --dry-run
npx tsx scripts/migrate-user-partition.ts --execute --target-sub <rayenzSub>
```

Then start the API:

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm run start:api
```

Equivalent to:

```powershell
npm run build:api
node scripts/merge-local-env.mjs
node scripts/start-local-api.mjs
```

`start:api` merges committed [`infra/env.local.json`](../infra/env.local.json) with the overlay (overlay wins) and **exits** if the overlay is missing. `sam build --build-in-source` runs first. Without the build, SAM mounts raw TypeScript and health returns 500 (`Cannot find module 'handler'`). Re-run `npm run start:api` (or `npm run build:api`) after API source changes. `start-local-api.mjs` passes an absolute `--config-file` because SAM resolves that flag relative to `.aws-sam/build/template.yaml`, so `infra/samconfig.toml` would be looked up in the wrong folder.

Do **not** leave `AWS_ACCESS_KEY_ID=local` set in the PowerShell window that runs SAM (that value is only for the one-time MinIO `s3 mb` command). `setup:local-cognito` exits with instructions if it sees that dummy. The Lambda uses your default AWS profile for Cognito (`cognito-idp:InitiateAuth`; `AdminGetUser` / list pools for the setup script).

Committed [`infra/env.local.json`](../infra/env.local.json) defaults (overlay overrides `HUB_USER_ID` to the Cognito `sub`):


| Variable            | Value                              |
| ------------------- | ---------------------------------- |
| `HUB_API_KEY`       | `test-api-key-local`               |
| `HUB_USER_ID`       | `rayenz-local` (fallback)          |
| `DYNAMODB_ENDPOINT` | `http://host.docker.internal:8000` |
| `S3_ENDPOINT`       | `http://host.docker.internal:9000` |


`host.docker.internal` lets the SAM Lambda container reach services on the Windows host. SAM local adds CORS headers when `DYNAMODB_ENDPOINT` is set so the Vite app (`:5173`) can call `:3000`.

### Smoke tests

```powershell
# Public
curl http://127.0.0.1:3000/v1/health

# Protected
$headers = @{ Authorization = "Bearer test-api-key-local" }
Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:3000/v1/settings/dailies" `
  -Headers $headers -ContentType "application/json" `
  -Body '{"payload":{"wishlists":[]}}'

Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/v1/settings/dailies" -Headers $headers
```



### Build-only (no server)

```powershell
npm run build:api
```

---



## 4. Static Hub in the browser + API

Serve `rayenz-hub/rayenz-hub/` over **HTTP** (not `file://`). Options:

- VS Code Live Server
- `npx serve rayenz-hub/rayenz-hub`
- Playwright static server (used by `npm run test:e2e`)

Configure the client in the Hub SPA under **Settings → Hub API** (`#/settings/hub-api`): API URL `http://127.0.0.1:3000`, **Sign in as Rayenz** (live Cognito). Do **not** paste the operator key into the SPA for normal local work — that key is for MCP/curl and maps to the same Cognito `sub` once the overlay is in place.

DevTools equivalent (URL only):

```javascript
localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
```

Try:


| Route                | Behavior                                   |
| -------------------- | ------------------------------------------ |
| `#/dailies`          | Settings pull/push via `hub-api-client` |
| `#/settings` | Hub Settings shell (tabs: Hub API, Dailies, Deck Suggest, Order Reconcile) |
| `#/settings/hub-api` | API base URL and key (device localStorage) |
| `#/settings/dailies` | Deep-link to Dailies settings tab |
| `#/deck-suggest`     | Suggest + review (legacy `#/deck-review` redirects here) |


Disable API mode (Hub falls back to `localStorage` only) via **Clear** on the Hub API settings tab, or:

```javascript
localStorage.removeItem('rayenz-hub-api-url');
localStorage.removeItem('rayenz-hub-api-key');
```

---



## 5. React Hub SPA

```powershell
npm run dev:web      # Vite dev server — packages/web (serves SPA + rayenz-hub static assets)
npm run build:web    # Build SPA into rayenz-hub/ (index.html + assets/); emptyOutDir is false
```

The Hub is a single React SPA (`packages/web`). All hash routes (`#/dailies`, `#/deck-builder`, `#/deck-suggest`, `#/order-reconcile`, `#/settings…`, etc.) render in-tree as React/TypeScript apps. Shared CSS lives under `rayenz-hub/shared/`. Legacy `#/deck-review` redirects to `#/deck-suggest`.

**Always run `npm run build:web` before `deploy:hub`** so `rayenz-hub/index.html` points at the current SPA bundle.

To test the SPA (and optional local API) from a phone on your LAN, see [mobile-local-testing.md](./mobile-local-testing.md).

---



## 6. Playwright e2e

```powershell
npm run test:e2e
```

Runs Chromium against the real static server (e.g. dailies re-init after navigation). Requires `npm run test:e2e:install` once.

See also `[tests/README.md](../../rayenz-hub/tests/README.md)`.

---



## 7. Deployed API contract tests (optional)

Only when a live AWS endpoint exists:

```powershell
$env:HUB_API_URL = "https://<api-id>.execute-api.us-east-1.amazonaws.com"
$env:HUB_API_KEY = "<key-from-ssm>"
npm run test:api:deployed
```

Skips automatically when `HUB_API_URL` / `HUB_API_KEY` are unset.

---



## Daily workflow

```text
Edit code
  → npm run test:api
  → npm run test:unit
  → npm run test:web   (if packages/web changed)

Need real HTTP?
  → npm run setup:local-cognito   (once; gitignored Cognito overlay)
  → Docker (DynamoDB persist + MinIO persist)
  → npm run start:api
  → Vite Hub + Sign in as Rayenz (no operator key in the SPA)
```


| Layer                | Local command                | Needs Docker/SAM? |
| -------------------- | ---------------------------- | ----------------- |
| API unit/integration | `npm run test:api`           | No                |
| Vanilla Hub          | `npm run test:unit`          | No                |
| React shell          | `npm run test:web`           | No                |
| Live REST API        | `npm run start:api`          | Yes               |
| Browser + API        | Vite + Sign in as Rayenz     | Yes (for API)     |
| Production contract  | `npm run test:api:deployed`  | AWS endpoint      |


---



## Related docs

- [mobile-local-testing.md](./mobile-local-testing.md) — phone/iPad via LAN (dashboard Device access panel; Vite/SAM bind LAN by default)
- [quickstart.md](./quickstart.md) — prerequisites, deploy, free-tier, migration
- [hub-api-production.md](./hub-api-production.md) — Cognito, local overlay, owner sync
- [../tests/README.md](../tests/README.md) — test layout and fixtures

