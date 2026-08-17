# Hub API production (auth, cost cap, owner sync)

The public Hub **website stays on GitHub Pages**. AWS hosts the API, DynamoDB, S3, Cognito, and cost controls. Bare “deploy” still means Pages (`npm run deploy:hub`). AWS is `npm run deploy:cognito` then `npm run deploy:api`.

Browser production identity is a **Cognito session** (username/password). Do **not** paste a shared production API key into Pages localStorage as the user identity. A local operator key remains valid for SAM local / MCP (`HUB_API_KEY` → `HUB_USER_ID` = Rayenz Cognito `sub`).

## Pre-deploy secrets

CloudFormation **cannot** put SSM SecureString (`{{resolve:ssm-secure:…}}`) into Lambda environment variables. Store these in **Secrets Manager** (same region as the stack, `us-east-1`) **before** `npm run deploy:api`. Deploy Cognito first (`npm run deploy:cognito`).

```powershell
function New-HubSecret([int]$Length = 40) {
  -join ((1..$Length) | ForEach-Object { Get-Random -InputObject ([char[]]((48..57) + (65..90) + (97..122))) })
}

$apiKey = New-HubSecret
$invite = New-HubSecret

aws secretsmanager create-secret --name "rayenz-hub/prod/api-key" --secret-string $apiKey --region us-east-1
aws secretsmanager create-secret --name "rayenz-hub/prod/invite-hmac" --secret-string $invite --region us-east-1

Write-Host "HUB_API_KEY (operator/MCP only; not Pages): $apiKey"
Write-Host "HUB_INVITE_SECRET: $invite"
```

Names must match `infra/samconfig.toml` exactly (no leading `/`). Do not use a name that ends with a hyphen plus six characters (`invite-secret` fails — CloudFormation treats `-secret` as a partial ARN). SSM Parameter Store is a different service and does not satisfy this lookup.

If a secret already exists, use `put-secret-value` instead of `create-secret`. Retrieve later with:

```powershell
aws secretsmanager get-secret-value --secret-id rayenz-hub/prod/api-key --region us-east-1 --query SecretString --output text
aws secretsmanager get-secret-value --secret-id rayenz-hub/prod/invite-hmac --region us-east-1 --query SecretString --output text
```


| Store                         | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `rayenz-hub/prod/api-key`     | Operator Bearer key (`HUB_API_KEY` → `HUB_USER_ID`). Not the Pages login.           |
| `rayenz-hub/prod/invite-hmac` | HMAC/AES key for invite tokens (`HUB_INVITE_SECRET`). Must differ from the API key. |


Do **not** put these in git or Pages localStorage. An SSM SecureString at `/rayenz-hub/prod/api-key` is unused by the stack; you can delete it.

**Not Secrets Manager:** Cognito client secret (the Cognito stack generates it; `deploy:api` reads it via `DescribeUserPoolClient` and does not commit it). Owner password `HUB_OWNER_PASSWORD` and owner email `HUB_OWNER_EMAIL` for `provision-owner-rayenz.ts` — keep the password in a password manager; it becomes the Cognito `Rayenz` password (email is marked verified by admin). Optional `BudgetNotifyEmail` is a SAM parameter, not a secret.

## Cutover order

PowerShell (this repo’s shell): set env with `$env:NAME = 'value'`, not `NAME=value` prefixes. Runner is `npx tsx` (not `tsk`).

1. `npm run deploy:cognito` (explicit; confirm changeset). Creates stack `rayenz-hub-cognito` and enables CloudFormation **termination protection**. Pool and client also have `DeletionPolicy` / `UpdateReplacePolicy: Retain`.
2. `npm run deploy:api` (explicit; confirm changeset). Injects pool id, ARN, client id, and client secret from the Cognito stack. Do this **after** Cognito exists.
3. Provision Cognito owner (prints `sub=` — keep that value):

```powershell
$env:HUB_OWNER_PASSWORD = '<password>'
$env:HUB_OWNER_EMAIL = '<owner-email>'
$env:COGNITO_USER_POOL_ID = '<from rayenz-hub-cognito outputs>'
$env:COGNITO_CLIENT_ID = '<from rayenz-hub-cognito outputs>'
npx tsx scripts/provision-owner-rayenz.ts
```

4. Migrate the **local** `USER::default` library onto that `sub` (DynamoDB Local still holds the decks). A dry-run with no `DYNAMODB_ENDPOINT` hits empty **production** `HubTable` and reports 0 items — that is expected right after deploy.

Do **not** set `$env:AWS_ACCESS_KEY_ID = 'local'` in this session. That dummy key is for DynamoDB Local only (the script already injects it). If it is set, `--execute` will send it to real AWS S3 and fail with `InvalidAccessKeyId`.

```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
Remove-Item Env:AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
$env:DYNAMODB_ENDPOINT = 'http://127.0.0.1:8000'
$env:S3_ENDPOINT = 'http://127.0.0.1:9000'
npx tsx scripts/migrate-user-partition.ts --dry-run
npx tsx scripts/migrate-user-partition.ts --execute --target-sub <rayenzSub>
# verify local USER::{sub} looks right, then:
npx tsx scripts/migrate-user-partition.ts --execute --target-sub <rayenzSub> --delete-bootstrap
```

Optional: `$env:HUB_MIGRATE_SOURCE_USER_ID = 'rayenz-local'` if local writes already used that id instead of `default`.

5. Set local `HUB_USER_ID` / `infra/env.local.json` to that `sub` (not a permanent bootstrap partition). Then mirror local → prod (`Owner sync` below).
6. Point Pages Hub at the execute-api URL. Sign in as `Rayenz`. Save/reload one settings or deck (SC-001).
7. Confirm AWS Budget alerts (50%, 80%, 95%) and that a 95% notification sets `SYSTEM`/`SPEND_LOCK`.
8. Sign-off SC-001…SC-009.

## Sign-in on Pages

Settings → Hub API: set API base URL → **Sign in** (username `Rayenz`). Tokens stay in sessionStorage. Sign out clears them. No API URL → client-only, no login.

## Invites

Settings → Invites (owner only). Create a 7-day single-use link, copy, share out of band. Invitee opens `#/invite/{token}` and chooses username, email, and password. Cognito emails a verification code; they confirm, then sign in with username and password (not email).

The pool requires a verified email on signup and does **not** use email as the username. Identity lives in stack `rayenz-hub-cognito` (`infra/cognito.yaml`), not in `rayenz-hub-api`. If the pool already exists inside `rayenz-hub-api`, the next API deploy will **delete** those Cognito resources unless you import them into `rayenz-hub-cognito` first (or apply `DeletionPolicy: Retain` on the old stack, deploy, then remove). Making `email` required on an already-created pool is immutable — prefer a new pool in the Cognito stack over an in-place schema change.

## Local development

`infra/env.local.json` + gitignored Cognito overlay + SAM local + DynamoDB Local + MinIO: **no Dynamo/S3 AWS bill**. Browser sign-in uses the **live** Cognito pool (username `Rayenz`); data stays on DynamoDB Local / MinIO under `USER::{sub}`.

```powershell
npm run setup:local-cognito   # once; writes infra/env.local.overlay.json
npm run start:api             # merges overlay, then sam local
```

Do not set `AWS_ACCESS_KEY_ID=local` in the PowerShell window that runs SAM or `setup:local-cognito` — that value is only for the one-time MinIO `s3 mb` command. Operator Bearer key (`test-api-key-local`) still maps to `HUB_USER_ID` from the overlay (the Rayenz `sub`), so MCP and the signed-in SPA share one partition. MCP: `HUB_API_URL` + `HUB_API_KEY` against **local** only — never a global production secret that maps every caller to one user.

## Owner sync (local → production)

Mirror/replace Rayenz partition after local work:

```powershell
$env:HUB_OWNER_SUB = '<rayenz-sub>'
$env:DYNAMODB_ENDPOINT = 'http://127.0.0.1:8000'
$env:S3_ENDPOINT = 'http://127.0.0.1:9000'
npx tsx scripts/sync-owner-local-to-prod.ts --dry-run
npx tsx scripts/sync-owner-local-to-prod.ts --execute --confirm REPLACE_PRODUCTION
```

Dry-run performs zero production writes. Re-run execute after a partial failure (idempotent replace). Optional `--skip-glance-cache`.

## Cost lock-down C ($100/month)

AWS Budgets notify at 50% and 80%. At **95%** SNS invokes `SpendLockFunction`, which sets `PK=SYSTEM SK=SPEND_LOCK active=true`.


| Allowed under lock       | Blocked under lock                        |
| ------------------------ | ----------------------------------------- |
| Health, sign-in, refresh | Glance, swaps glance, suggest generate    |
| Signed-in ordinary CRUD  | Invite redeem / register / confirm        |
| Owner invite list/revoke | Unauthenticated data routes (already 401) |


Month-start EventBridge clears the flag. Verify locally by writing the SYSTEM item, then health/sign-in/CRUD vs glance/register.

## Abuse smoke (not against live prod)

Script rapid `POST /v1/auth/sign-in` against SAM local; expect HTTP 429 after 20 attempts / 15 minutes per IP. Do not flood production.

## Residual public probes

Closed signup, JWT on expensive work, gateway throttle (burst 40 / rate 20), and 95% lock keep organic use plus probes within $100/month when verified in Cost Explorer after cutover.