# Glance mana symbols

`{W,U,B,R,G,C}.svg` are the official Magic mana symbols downloaded from Scryfall's
card-symbol SVGs (`https://svgs.scryfall.io/card-symbols/{SYMBOL}.svg`).

They are rendered as the colour-identity pips in the glance title bar
(`loadManaPip` in `packages/api/src/services/glance-render.ts`) and copied into the
Lambda artifact by `scripts/copy-api-lambda-assets.mjs`.

Mana symbols are © Wizards of the Coast; artwork sourced via Scryfall. To refresh,
re-download the same files from the Scryfall card-symbols endpoint.
