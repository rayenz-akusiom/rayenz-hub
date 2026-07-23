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

function assetRootCandidates(): string[] {
  return [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  ].filter(Boolean) as string[];
}

function resolveFontPath(filename: string): string {
  const candidates = assetRootCandidates().map((root) =>
    path.join(root, 'assets/fonts', filename),
  );
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

function sansFontPath(): string {
  return resolveFontPath('DejaVuSans.ttf');
}

function watermarkFontPath(): string {
  return resolveFontPath('BebasNeue-Regular.ttf');
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

function truncateName(name: string, maxLen: number): string {
  const trimmed = String(name || '').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxLen - 1))}…`;
}

type DrawTextOptions = {
  text: string;
  fontPath: string;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
};

async function drawTextRaster(options: DrawTextOptions): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp({
    text: {
      text: options.text,
      font: options.fontPath,
      width: options.width,
      height: options.height,
      align: 'left',
      rgba: true,
    },
  })
    .png()
    .toBuffer();
}

async function drawNamedPlaceholder(
  name: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = await loadSharp();
  const label = truncateName(name, Math.max(8, Math.floor(width / 7)));
  const textBoxH = Math.max(16, Math.floor(height * 0.28));
  const textRaw = await drawTextRaster({
    text: label,
    fontPath: sansFontPath(),
    width: Math.max(40, width - 8),
    height: textBoxH,
  });
  const textTile = await sharp(textRaw)
    .resize(Math.max(1, width - 8), textBoxH, { fit: 'inside' })
    .toBuffer();
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 42, g: 42, b: 54, alpha: 1 },
    },
  })
    .composite([{ input: textTile, left: 4, top: Math.floor((height - textBoxH) / 2) }])
    .png()
    .toBuffer();
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
      .jpeg({ quality: 85 })
      .toBuffer();
  }
  return drawNamedPlaceholder(card.name, width, height);
}

async function drawQuantityBadge(qty: number, width: number): Promise<Buffer> {
  const sharp = await loadSharp();
  const size = Math.max(18, Math.round(width * 0.22));
  const bg = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.72 },
    },
  })
    .png()
    .toBuffer();
  const text = await drawTextRaster({
    text: String(qty),
    fontPath: sansFontPath(),
    width: size,
    height: size,
    fontSize: Math.round(size * 0.45),
    fontWeight: 'bold',
  });
  return sharp(bg).composite([{ input: text, left: 0, top: 0 }]).png().toBuffer();
}

async function drawWatermark(canvasWidth: number): Promise<Buffer> {
  const sharp = await loadSharp();
  const strip = await sharp({
    create: {
      width: canvasWidth,
      height: WATERMARK_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.35 },
    },
  })
    .png()
    .toBuffer();
  const text = await drawTextRaster({
    text: 'Rayenz',
    fontPath: watermarkFontPath(),
    width: 400,
    height: 40,
    fontSize: 32,
  });
  const left = Math.max(0, Math.floor((canvasWidth - 400) / 2));
  return sharp(strip).composite([{ input: text, left, top: 4 }]).png().toBuffer();
}

async function drawLabel(text: string): Promise<Buffer> {
  return drawTextRaster({
    text,
    fontPath: sansFontPath(),
    width: 800,
    height: 28,
    fontSize: 18,
    fontWeight: 'bold',
  });
}

async function drawDeckTitle(deckName: string): Promise<Buffer> {
  return drawTextRaster({
    text: deckName,
    fontPath: sansFontPath(),
    width: 800,
    height: 40,
    fontSize: 24,
    fontWeight: 'bold',
  });
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

  for (const label of plan.labels) {
    const tile = await drawLabel(label.text);
    composites.push({
      input: tile,
      left: label.x,
      top: label.y,
    });
  }

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

  const watermark = await drawWatermark(plan.canvasWidth);
  composites.push({
    input: watermark,
    left: 0,
    top: plan.canvasHeight - WATERMARK_HEIGHT,
  });

  if (plan.deckName) {
    const title = await drawDeckTitle(plan.deckName);
    composites.push({ input: title, left: 24, top: 12 });
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
    .png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true })
    .toBuffer();

  return new Uint8Array(png);
}

/** @deprecated tests may stub loaders; valid 1×1 PNG for resize-safe stubs. */
export const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export { SCRYFALL_USER_AGENT };
