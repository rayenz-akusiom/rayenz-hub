#!/usr/bin/env node
console.log(`
Build complete. Next steps:

  1. Commit the publish tree:
       git add rayenz-hub/index.html rayenz-hub/404.html rayenz-hub/.nojekyll rayenz-hub/assets/
       git commit -m "Rebuild Hub SPA bundle for GitHub Pages."

  2. Deploy to production Pages:
       npm run deploy:hub

Live URL: https://rayenz-akusiom.github.io/rayenz-akusiom/
`);
