# Rayenz Hub

Monorepo for [Rayenz Hub](https://rayenz-akusiom.github.io/rayenz-akusiom/) (Dailies, Deck Suggest, Order Reconcile), Neopets Tampermonkey userscripts, and the hub test harness.

## Layout

| Path | Purpose |
|------|---------|
| `packages/web/` | React Hub SPA source (edit here) |
| `rayenz-hub/` | Built static assets + shared CSS for GitHub Pages subtree deploy |
| `monkey-scripts/` | Neopets userscripts — edit and push here |
| `tests/` | Hub test harness (Vitest + Playwright) |

Production hub is deployed separately to [rayenz-akusiom.github.io/rayenz-akusiom](https://rayenz-akusiom.github.io/rayenz-akusiom/) via `git subtree push`.

## Clone

```bash
git clone https://github.com/rayenz-akusiom/rayenz-hub.git
```

## Publishing

**Userscripts** — commit and push to `rayenz-hub` `main`. No GitHub Pages deploy.

**Hub (Dailies / Deck Suggest / Order Reconcile)** — React SPA on GitHub Pages plus Hub API on AWS. Routine deploy is API then Pages:

```bash
# Full production deploy: API, then Pages publish + Pages deploy
npm run deploy

# Pages-only deploy: rebuild SPA, create a scoped Pages publish commit if needed, then subtree-push Pages
npm run deploy:pages
```

`npm run deploy` expands to `deploy:api` then `deploy:pages`. `npm run deploy:pages` rebuilds `rayenz-hub/`, stages only the publish tree, creates a Pages-only commit when the generated output changed, and then runs `deploy:hub`. The final subtree push sends the committed `rayenz-hub/` tree to the [rayenz-akusiom](https://github.com/rayenz-akusiom/rayenz-akusiom) repo `main` branch (GitHub Pages). Hub API details: [docs/hub-api-production.md](docs/hub-api-production.md).

Canonical URL: [https://rayenz-akusiom.github.io/rayenz-akusiom/](https://rayenz-akusiom.github.io/rayenz-akusiom/) (hash routes like `#/dailies`). Legacy `/apps/...` paths redirect into those hashes via `404.html`.

To pull rare upstream edits from production into dev:

```bash
git subtree pull --prefix=rayenz-hub hub-prod main --squash
```

See [rayenz-hub/README.md](rayenz-hub/README.md) for Deck Suggest review/export workflow (paths inside that doc still refer to the production repo layout).
