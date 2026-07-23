import type { GlanceCard, GlanceLayoutPlan } from '@rayenz-hub/shared';
import { BACKGROUND, WATERMARK_HEIGHT } from '@rayenz-hub/shared';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchImageBytes, SCRYFALL_USER_AGENT } from './glance-art.js';

type Sharp = typeof import('sharp').default;

let sharpPromise: Promise<Sharp> | null = null;

function loadSharp(): Promise<Sharp> {
  if (!sharpPromise) {
    sharpPromise = import('sharp').then((m) => m.default);
  }
  return sharpPromise;
}

function watermarkFontPath(): string {
  const candidates = [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  ]
    .filter(Boolean)
    .map((root) => path.join(root as string, 'assets/fonts/BebasNeue-Regular.ttf'));
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export type GlanceImageLoader = (
  url: string,
  card?: Pick<GlanceCard, 'instanceId' | 'name'>,
) => Promise<Uint8Array | null>;

async function defaultImageLoader(
  url: string,
  _card?: Pick<GlanceCard, 'instanceId' | 'name'>,
): Promise<Uint8Array | null> {
  return fetchImageBytes(url, fetch);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateName(name: string, maxLen: number): string {
  const trimmed = String(name || '').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxLen - 1))}…`;
}

async function drawNamedPlaceholder(
  name: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = await loadSharp();
  const label = truncateName(name, Math.max(8, Math.floor(width / 7)));
  const fontSize = Math.max(10, Math.min(14, Math.floor(width / 7)));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" rx="6" ry="6" fill="#2a2a36" stroke="#4a4a58" stroke-width="2"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#d8d8e4" font-size="${fontSize}" font-family="sans-serif">${escapeXml(label)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function loadTile(
  card: GlanceCard,
  width: number,
  height: number,
  loader: GlanceImageLoader,
): Promise<Buffer> {
  const sharp = await loadSharp();
  const url = card.imageUrl;
  const raw = url ? await loader(url, card) : null;
  if (raw) {
    return sharp(Buffer.from(raw))
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();
  }
  return drawNamedPlaceholder(card.name, width, height);
}

async function drawQuantityBadge(qty: number, width: number): Promise<Buffer> {
  const sharp = await loadSharp();
  const size = Math.max(18, Math.round(width * 0.22));
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="rgba(0,0,0,0.72)"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="${Math.round(size * 0.45)}" font-family="sans-serif" font-weight="700">${qty}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function drawWatermark(): Promise<Buffer> {
  const sharp = await loadSharp();
  const svg = `<svg width="1920" height="${WATERMARK_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="rgba(0,0,0,0.35)"/>
    <text x="960" y="34" text-anchor="middle" fill="rgba(255,255,255,0.82)" font-size="28" font-family="Bebas Neue">Rayenz</text>
  </svg>`;
  try {
    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    return sharp({
      text: {
        text: 'Rayenz',
        font: watermarkFontPath(),
        rgba: true,
        width: 400,
        height: 40,
      },
    })
      .extend({
        top: 4,
        bottom: 4,
        left: 760,
        right: 760,
        background: { r: 0, g: 0, b: 0, alpha: 0.35 },
      })
      .png()
      .toBuffer();
  }
}

export type RenderGlanceOptions = {
  imageLoader?: GlanceImageLoader;
};

export async function renderGlancePng(
  plan: GlanceLayoutPlan,
  options: RenderGlanceOptions = {},
): Promise<Uint8Array> {
  const sharp = await loadSharp();
  const loader = options.imageLoader ?? defaultImageLoader;
  const composites: import('sharp').OverlayOptions[] = [];

  for (const placement of plan.placements) {
    const tile = await loadTile(placement.card, placement.width, placement.height, loader);
    composites.push({
      input: tile,
      left: placement.x,
      top: placement.y,
    });

    if (placement.showQuantity) {
      const badge = await drawQuantityBadge(placement.card.quantity, placement.width);
      composites.push({
        input: badge,
        left: placement.x + placement.width - Math.round(placement.width * 0.22),
        top: placement.y + placement.height - Math.round(placement.width * 0.22),
      });
    }
  }

  const watermark = await drawWatermark();
  composites.push({
    input: watermark,
    left: 0,
    top: plan.canvasHeight - WATERMARK_HEIGHT,
  });

  if (plan.deckName) {
    const titleSvg = `<svg width="800" height="40" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="28" fill="#f2f2f2" font-size="24" font-family="sans-serif" font-weight="600">${escapeXml(plan.deckName)}</text>
    </svg>`;
    composites.push({ input: Buffer.from(titleSvg), left: 24, top: 12 });
  }

  const png = await sharp({
    create: {
      width: plan.canvasWidth,
      height: plan.canvasHeight,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return new Uint8Array(png);
}

/** @deprecated tests may stub loaders; valid 1×1 PNG for resize-safe stubs. */
export const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export { SCRYFALL_USER_AGENT };
