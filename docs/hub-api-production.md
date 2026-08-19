# Hub API production (auth, cost cap, owner sync)

The public Hub **website stays on GitHub Pages**. AWS hosts the API, DynamoDB, S3, Cognito, and cost controls. Routine **deploy** is Hub API then Pages: `npm run deploy:api`, then `npm run publish:hub` / `npm run deploy:hub`. Cognito (`npm run deploy:cognito`) is first-time / identity-stack only.

Browser production identity is a **Cognito session** (username/password). MCP and CLI scripts sign in the same way (`HUB_USERNAME` / `HUB_PASSWORD`). There is no operator API key.

## Pre-deploy secrets

CloudFormation **cannot** put SSM SecureString (`{{resolve:ssm-secure:…}}`) into Lambda environment variables. Store these in **Secrets Manager** (same region as the stack, `us-east-1`) **before** `npm run deploy:api`. Deploy Cognito first (`npm run deploy:cognito`).

```powershell
function New-HubSecret([int]$Length = 40) {
  -join ((1..$Length) | ForEach-Object { Get-Random -InputObject ([char[]]((48..57) + (65..90) + (97..122))) })
}

$invite = New-HubSecret

aws secretsmanager create-secret --name "rayenz-hub/prod/invite-hmac" --secret-string $invite --region us-east-1

Write-Host "HUB_INVITE_SECRET: $invite"
```

Names must match `infra/samconfig.toml` exactly (no leading `/`). Do not use a name that ends with a hyphen plus six characters (`invite-secret` fails — CloudFormation treats `-secret` as a partial ARN). SSM Parameter Store is a different service and does not satisfy this lookup.

If a secret already exists, use `put-secret-value` instead of `create-secret`. Retrieve later with:

```powershell
aws secretsmanager get-secret-value --secret-id rayenz-hub/prod/invite-hmac --region us-east-1 --query SecretString --output text
```


| Store                         | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `rayenz-hub/prod/invite-hmac` | HMAC/AES key for invite tokens (`HUB_INVITE_SECRET`). |


Do **not** put these in git or Pages localStorage. An unused Secrets Manager secret at `rayenz-hub/prod/api-key` (legacy operator key) can be deleted after the next API deploy.

**Not Secrets Manager:** Cognito client secret (the Cognito stack generates it; `deploy:api` reads it via `DescribeUserPoolClient` and does not commit it). Owner password `HUB_OWNER_PASSWORD` and owner email `HUB_OWNER_EMAIL` for `provision-owner-rayenz.ts` — keep the password in a password manager; it becomes the Cognito `Rayenz` password (email is marked verified by admin). Optional `BudgetNotifyEmail` is a SAM parameter, not a secret.

## Cutover order

PowerShell (this repo’s shell): set env with `$env:NAME = 'value'`, not `NAME=value` prefixes. Runner is `npx tsx` (not `tsk`).

1. `npm run deploy:cognito` (explicit; confirm changeset). Creates stack `rayenz-hub-cognito` and enables CloudFormation **termination protection**. Pool and client also have `DeletionPolicy` / `UpdateReplacePolicy: Retain`.
2. `npm run deploy:api` (confirm changeset). Injects pool id, ARN, client id, and client secret from the Cognito stack. Do this **after** Cognito exists.
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
6. `npm run publish:hub` (bakes `HubApiUrl` into the SPA). Sign in as `Rayenz`. Save/reload one settings or deck (SC-001).
7. Confirm AWS Budget alerts (50%, 80%, 95%) and that a 95% notification sets `SYSTEM`/`SPEND_LOCK`.
8. Sign-off SC-001…SC-009.

## Sign-in on Pages

Sign in from the **left nav** (username `Rayenz`). The API URL is baked in at `npm run publish:hub` (from `VITE_HUB_API_URL` / `HUB_API_URL`, or stack output `HubApiUrl`). Tokens stay in localStorage until Sign out. Access tokens last 24 hours; refresh tokens last up to 10 years (Cognito max; existing refresh tokens keep their original lifetime until the next password sign-in after `deploy:cognito`). Settings → Hub API is status, Test connection, and self-serve **change password** (current + new; session stays signed in). Password recovery is admin-only on the Cognito pool. No API URL in the build → client-only, no login.

`HUB_USER_ID` in `infra/env.local.json` / SAM overlays is for local scripts (migration, owner sync). Request identity is always the Cognito JWT `sub`.

## Invites

Settings → Invites (owner only). Create a 7-day single-use link, copy, share out of band. Invitee opens `#/invite/{token}` and chooses username, email, and password. Cognito emails a verification code; they confirm, then sign in with username and password (not email).

The pool requires a verified email on signup and does **not** use email as the username. Identity lives in stack `rayenz-hub-cognito` (`infra/cognito.yaml`), not in `rayenz-hub-api`. If the pool already exists inside `rayenz-hub-api`, the next API deploy will **delete** those Cognito resources unless you import them into `rayenz-hub-cognito` first (or apply `DeletionPolicy: Retain` on the old stack, deploy, then remove). Making `email` required on an already-created pool is immutable — prefer a new pool in the Cognito stack over an in-place schema change.

## Local development

`infra/env.local.json` + gitignored Cognito overlay + SAM local + DynamoDB Local + MinIO: **no Dynamo/S3 AWS bill**. Browser sign-in uses the **live** Cognito pool (username `Rayenz`); data stays on DynamoDB Local / MinIO under `USER::{sub}`.

```powershell
npm run setup:local-cognito   # once; writes infra/env.local.overlay.json
npm run start:api             # merges overlay, then sam local
```

Do not set `AWS_ACCESS_KEY_ID=local` in the PowerShell window that runs SAM or `setup:local-cognito` — that value is only for the one-time MinIO `s3 mb` command. MCP and CLI scripts sign in as `Rayenz` (`HUB_USERNAME` / `HUB_PASSWORD`) so they share the SPA partition (`USER::{sub}`). Do not commit the password.

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
| Health, sign-in, refresh, change password | Glance, swaps glance, suggest generate    |
| Signed-in ordinary CRUD  | Invite create / redeem / register / confirm |
| Owner invite list/revoke | Unauthenticated data routes (already 401) |


Glance and swaps glance are **owner-only** even when the spend lock is off (`403 OWNER_REQUIRED` for invitees). Suggest generate is available to any signed-in user and is still blocked by the spend lock (`403 SPEND_LOCK`).

Month-start EventBridge clears the flag. Verify locally by writing the SYSTEM item, then health/sign-in/CRUD vs glance/register.

## Abuse smoke (not against live prod)

Script rapid `POST /v1/auth/sign-in` against SAM local; expect HTTP 429 after 20 attempts / 15 minutes per IP. Do not flood production.

## Residual public probes

Closed signup, JWT on expensive work, gateway throttle (burst 40 / rate 20), and 95% lock keep organic use plus probes within $100/month when verified in Cost Explorer after cutover.