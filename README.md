# Rayenz Hub

Monorepo for [Rayenz Hub](https://rayenz-akusiom.github.io/rayenz-akusiom/) (Dailies, Deck Review, Order Reconcile), Neopets Tampermonkey userscripts, and the hub test harness.

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

**Hub (Dailies / Deck Review / Order Reconcile)** — React SPA on GitHub Pages plus Hub API on AWS. Routine deploy is API then Pages:

```bash
# 0. Hub API (skip if API/Lambda did not change)
npm run deploy:api

# 1. Edit packages/web/, then build into rayenz-hub/ (bakes HubApiUrl)
npm run publish:hub

# 2. Commit the publish tree
git add rayenz-hub/index.html rayenz-hub/404.html rayenz-hub/.nojekyll rayenz-hub/assets/
git commit -m "Rebuild Hub SPA bundle for GitHub Pages."

# 3. Subtree-push to production Pages
npm run deploy:hub
```

This pushes `rayenz-hub/` to the [rayenz-akusiom](https://github.com/rayenz-akusiom/rayenz-akusiom) repo `main` branch (GitHub Pages). Hub API details: [docs/hub-api-production.md](docs/hub-api-production.md).

Canonical URL: [https://rayenz-akusiom.github.io/rayenz-akusiom/](https://rayenz-akusiom.github.io/rayenz-akusiom/) (hash routes like `#/dailies`). Legacy `/apps/...` paths redirect into those hashes via `404.html`.

To pull rare upstream edits from production into dev:

```bash
git subtree pull --prefix=rayenz-hub hub-prod main --squash
```

See [rayenz-hub/README.md](rayenz-hub/README.md) for Deck Review enrich workflow (paths inside that doc still refer to the production repo layout).
