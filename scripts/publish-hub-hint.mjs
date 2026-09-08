#!/usr/bin/env node
console.log(`
Build complete. Next steps:

  1. Deploy to production Pages:
       npm run deploy:pages

     This rebuilds the publish tree, creates a scoped Pages-only commit when
     needed, and then subtree-pushes GitHub Pages.

Live URL: https://rayenz-akusiom.github.io/rayenz-akusiom/
`);
