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


Optional: create `../rayenz-hub/.env.local` (gitignored) for env vars outside SAM injection. SAM local uses `[infra/env.local.json](../../rayenz-hub/infra/env.local.json)` by default.

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



## 3. Full stack — local API (SAM + Docker)

Use when you want a real HTTP server at `http://127.0.0.1:3000` (manual curls, browser + `hub-api-client`).

### Terminal 1 — DynamoDB Local

```powershell
docker run -p 8000:8000 amazon/dynamodb-local
```

**One-time after each DynamoDB Local restart** (in-memory; tables do not persist):

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm run init:local-db
```

Creates `HubTable` (PK/SK). Without this, settings/reviews return 500: `ResourceNotFoundException`.

### Terminal 2 — MinIO (S3)

Required for profile YAML and large set-pool blobs. Credentials must match the API client (`local` / `localpass1`).

```powershell
docker run -p 9000:9000 -e MINIO_ROOT_USER=local -e MINIO_ROOT_PASSWORD=localpass1 minio/minio server /data
```

**One-time:** create the bucket (MinIO does not auto-create it):

```powershell
$env:AWS_ACCESS_KEY_ID = "local"
$env:AWS_SECRET_ACCESS_KEY = "localpass1"
aws --endpoint-url http://127.0.0.1:9000 s3 mb s3://rayenz-hub-data-local
```



### Terminal 3 — API

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm run start:api
```

Equivalent to:

```powershell
npm run build:api
sam local start-api --template .aws-sam/build/template.yaml --env-vars infra/env.local.json --port 3000
```

`npm run start:api` runs `sam build --build-in-source` first. Without the build, SAM mounts raw TypeScript and health returns 500 (`Cannot find module 'handler'`). Re-run `npm run start:api` (or `npm run build:api`) after API source changes.

`[infra/env.local.json](../../rayenz-hub/infra/env.local.json)` defaults:


| Variable            | Value                              |
| ------------------- | ---------------------------------- |
| `HUB_API_KEY`       | `test-api-key-local`               |
| `HUB_USER_ID`       | `default`                          |
| `DYNAMODB_ENDPOINT` | `http://host.docker.internal:8000` |
| `S3_ENDPOINT`       | `http://host.docker.internal:9000` |


`host.docker.internal` lets the SAM Lambda container reach services on the Windows host.

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

Configure the client in DevTools:

```javascript
localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
localStorage.setItem('rayenz-hub-api-key', 'test-api-key-local');
```

Try:


| Route                | Behavior                                   |
| -------------------- | ------------------------------------------ |
| `#/dailies`          | Settings pull/push via `hub-api-client.js` |
| `#/settings` | Hub Settings shell (tabs: Dailies, Deck Suggest, Order Reconcile) |
| `#/settings/dailies` | Deep-link to Dailies settings tab |
| `#/deck-review`      | Profile reads from API when configured     |


Disable API mode (Hub falls back to `localStorage` only):

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

The Hub is a single React SPA (`packages/web`). All hash routes (`#/dailies`, `#/deck-builder`, `#/deck-review`, `#/deck-suggest`, `#/order-reconcile`, `#/settings…`, etc.) render in-tree as React/TypeScript apps. Shared CSS lives under `rayenz-hub/shared/`.

**Always run `npm run build:web` before `deploy:hub`** so `rayenz-hub/index.html` points at the current SPA bundle.

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
  → Docker (DynamoDB + MinIO)
  → npm run start:api
  → Static Hub + localStorage API keys
```


| Layer                | Local command                | Needs Docker/SAM? |
| -------------------- | ---------------------------- | ----------------- |
| API unit/integration | `npm run test:api`           | No                |
| Vanilla Hub          | `npm run test:unit`          | No                |
| React shell          | `npm run test:web`           | No                |
| Live REST API        | `npm run start:api`          | Yes               |
| Browser + API        | Static server + localStorage | Yes (for API)     |
| Production contract  | `npm run test:api:deployed`  | AWS endpoint      |


---



## Related docs

- [quickstart.md](./quickstart.md) — prerequisites, deploy, free-tier, migration
- [../../rayenz-hub/rayenz-hub/docs/hub-api-production.md](../../rayenz-hub/rayenz-hub/docs/hub-api-production.md) — production `localStorage` keys
- [../../rayenz-hub/tests/README.md](../../rayenz-hub/tests/README.md) — test layout and fixtures

