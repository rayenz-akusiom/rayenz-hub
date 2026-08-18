# @rayenz-hub/mcp

Stdio [MCP](https://modelcontextprotocol.io/) server for Rayenz Hub MTG data. Agents (Cursor skills) call tools against the Hub API — **Hub is source of truth**; Archidekt export text is mirror-only.

## Prerequisites

1. Hub API running locally (or deployed). MCP signs in with a Cognito username/password.
2. From monorepo root:

```powershell
cd C:\DeepStorage\Documents\Workspaces\Hub\rayenz-hub
npm install
npm run start:api   # or use the local development dashboard
```

Local defaults (see `infra/env.local.json`; `HUB_USER_ID` is overridden to the Rayenz Cognito `sub` by `npm run setup:local-cognito`):

| Env | Example |
|-----|---------|
| `HUB_API_URL` | `http://127.0.0.1:3000` |
| `HUB_USERNAME` | `Rayenz` |
| `HUB_PASSWORD` | (Cognito password; do not commit) |

## Run

```powershell
$env:HUB_API_URL = "http://127.0.0.1:3000"
$env:HUB_USERNAME = "Rayenz"
$env:HUB_PASSWORD = "<cognito-password>"
npm run start:mcp
```

Or: `npm run dev:mcp`

Logs go to **stderr** only (stdout is the MCP JSON-RPC channel).

## Cursor MCP config

Add a stdio server (Cursor Settings → MCP, or your user/project `mcp.json`). Put `HUB_PASSWORD` in the local Cursor MCP env — do not commit it:

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
        "HUB_USERNAME": "Rayenz"
      }
    }
  }
}
```

Use an **absolute path** to `index.ts`. Cursor may spawn with the Hub workspace root as cwd and ignore a relative `packages/mcp/...` path (looks under `Hub/packages/` instead of `Hub/rayenz-hub/packages/`).

After connecting, agents should `GetMcpTools` on server `rayenz-hub`, then `CallMcpTool`.

## Tools (v1)

| Tool | Purpose |
|------|---------|
| `hub_list_decks` / `hub_get_deck` / `hub_put_deck` / `hub_patch_deck` / `hub_delete_deck` | Deck library CRUD (`hub_patch_deck` for card/queue deltas). Summaries include `ownership` (`owned` \| `theory`). |
| `hub_list_profiles` / `hub_get_profile` / `hub_put_profile` / `hub_resolve_profile` | Deck profiles |
| `hub_summarize_deck` / `hub_list_swaps` | Agent-friendly deck + swap views (`ownership` on summarize/list_swaps) |
| `hub_aggregate_wants` / `hub_export_wants_text` | Buy/acquire lists from formal queues (**skips Theory decks**) |
| `hub_export_archidekt_import` | Archidekt paste text (mirror only) |
| `hub_get_set_pool` / `hub_put_set_pool` | Cached set spoilers |
| `hub_get_review_progress` / `hub_put_review_progress` | Suggest review progress |
| `scryfall_resolve_sets` / `scryfall_fetch_set_cards` | Set family resolve + card fetch |

Out of scope: Dailies, live Archidekt API, glance PNGs.

## Inspector

```powershell
$env:HUB_API_URL = "http://127.0.0.1:3000"
$env:HUB_USERNAME = "Rayenz"
$env:HUB_PASSWORD = "<cognito-password>"
npx @modelcontextprotocol/inspector npx tsx packages/mcp/src/index.ts
```
