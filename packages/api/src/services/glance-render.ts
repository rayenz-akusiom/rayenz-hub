import type { GlanceBackdrop, GlanceCard, GlanceLayoutPlan } from '@rayenz-hub/shared';
import { BACKGROUND, HEADER_HEIGHT, WATERMARK_HEIGHT } from '@rayenz-hub/shared';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchImageBytes, SCRYFALL_USER_AGENT } from './glance-art.js';

type Sharp = typeof import('sharp').default;

/** Matches web `--db-card-radius: calc(width * 0.055)`. */
const CARD_CORNER_RATIO = 0.055;
const TEXT_INK_DARK = '#111827';
const TEXT_INK_LIGHT = '#f8fafc';
const TITLE_FONT_SIZE = 44;
const PIP_SIZE = 40;
const PIP_GAP = 6;
const TITLE_PAD_X = 24;
const SEP_GAP = 14;
const SEP_RULE_W = 3;
const SEP_RULE_H = 36;

let sharpPromise: Promise<Sharp> | null = null;
let fontconfigReady = false;
const fontBase64Cache = new Map<string, string>();

function loadSharp(): Promise<Sharp> {
  if (!sharpPromise) {
    sharpPromise = import('sharp').then((m) => m.default);
  }
  return sharpPromise;
}

function packageRootFromImportMeta(): string | null {
  try {
    const metaUrl = import.meta.url as string | undefined;
    if (!metaUrl) return null;
    return path.resolve(path.dirname(fileURLToPath(metaUrl)), '../..');
  } catch {
    return null;
  }
}

function assetRootCandidates(): string[] {
  return [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
    packageRootFromImportMeta(),
  ].filter(Boolean) as string[];
}

function resolveAssetPath(...parts: string[]): string {
  const candidates = assetRootCandidates().map((root) => path.join(root, ...parts));
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

function ensureFontconfig(): void {
  if (fontconfigReady) return;
  const conf = resolveAssetPath('assets', 'fonts', 'fonts.conf');
  if (existsSync(conf)) {
    process.env.FONTCONFIG_FILE = conf;
  }
  fontconfigReady = true;
}

function resolveFontPath(filename: string): string {
  return resolveAssetPath('assets', 'fonts', filename);
}

function sansFontPath(): string {
  return resolveFontPath('DejaVuSans.ttf');
}

function watermarkFontPath(): string {
  return resolveFontPath('BebasNeue-Regular.ttf');
}

function manaPipPath(letter: string): string {
  const safe = String(letter || 'C').toUpperCase().replace(/[^WUBRGC]/g, '') || 'C';
  return resolveAssetPath('assets', 'mana', `${safe}.svg`);
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type DrawTextOptions = {
  text: string;
  fontPath: string;
  width: number;
  height: number;
  ink?: string;
  fontFamily?: string;
  fontSize?: number;
};

async function drawTextRaster(options: DrawTextOptions): Promise<Buffer> {
  ensureFontconfig();
  const sharp = await loadSharp();
  const ink = options.ink ?? TEXT_INK_DARK;
  const fontSize = options.fontSize ?? Math.max(12, Math.floor(options.height * 0.72));
  const fontPath = options.fontPath;

  if (existsSync(fontPath)) {
    let fontB64 = fontBase64Cache.get(fontPath);
    if (!fontB64) {
      fontB64 = readFileSync(fontPath).toString('base64');
      fontBase64Cache.set(fontPath, fontB64);
    }
    const family = options.fontFamily ?? 'GlanceEmbedded';
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}">` +
      `<defs><style><![CDATA[` +
      `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${fontB64}) format('truetype');}` +
      `]]></style></defs>` +
      `<text x="0" y="${Math.min(options.height - 2, Math.round(fontSize * 0.9))}" ` +
      `font-family="${family}" font-size="${fontSize}" fill="${ink}">` +
      `${escapeXml(options.text)}</text></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  return sharp({
    text: {
      text: `<span foreground="${ink}">${escapeXml(options.text)}</span>`,
      font: options.fontFamily ?? 'DejaVu Sans',
      fontfile: fontPath,
      width: options.width,
      height: options.height,
      align: 'left',
      rgba: true,
    },
  })
    .png()
    .toBuffer();
}

async function applyRoundedCorners(tile: Buffer, width: number, height: number): Promise<Buffer> {
  const sharp = await loadSharp();
  const r = Math.max(1, Math.round(width * CARD_CORNER_RATIO));
  const maskSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/>` +
      `</svg>`,
  );
  const maskPng = await sharp(maskSvg, { density: 72 })
    .resize(width, height)
    .ensureAlpha()
    .png()
    .toBuffer();
  return sharp(tile)
    .resize(width, height)
    .ensureAlpha()
    .composite([{ input: maskPng, blend: 'dest-in' }])
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
    ink: TEXT_INK_LIGHT,
    fontFamily: 'GlanceSans',
  });
  const textTile = await sharp(textRaw)
    .resize(Math.max(1, width - 8), textBoxH, { fit: 'inside' })
    .toBuffer();
  const rect = await sharp({
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
  return applyRoundedCorners(rect, width, height);
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
    const resized = await sharp(Buffer.from(raw))
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();
    return applyRoundedCorners(resized, width, height);
  }
  return drawNamedPlaceholder(card.name, width, height);
}

type QuantityBadge = { input: Buffer; width: number; height: number };

/** Mirrors the deck-builder `.db-badge-qty` pill: dark fill, white rule, `×n`. */
async function drawQuantityBadge(qty: number, cardWidth: number): Promise<QuantityBadge> {
  const sharp = await loadSharp();
  const label = `\u00d7${qty}`;
  const height = Math.max(18, Math.round(cardWidth * 0.19));
  const fontSize = Math.max(11, Math.round(height * 0.6));
  const padX = Math.round(fontSize * 0.36);
  // DejaVu Sans advance widths: digits ~0.64em, multiplication sign ~0.84em.
  const textWidth = Math.ceil(fontSize * (0.84 + 0.64 * String(qty).length));
  const width = textWidth + padX * 2;
  const stroke = Math.max(2, Math.round(height * 0.11));
  const radius = Math.round(height / 2);
  const pillSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="${stroke / 2}" y="${stroke / 2}" width="${width - stroke}" height="${height - stroke}" ` +
      `rx="${radius}" ry="${radius}" fill="#0d1117" stroke="#ffffff" stroke-width="${stroke}"/>` +
      `</svg>`,
  );
  const pill = await sharp(pillSvg).png().toBuffer();
  const text = await drawTextRaster({
    text: label,
    fontPath: sansFontPath(),
    width: textWidth,
    height,
    ink: TEXT_INK_LIGHT,
    fontFamily: 'GlanceSans',
    fontSize,
  });
  const input = await sharp(pill)
    .composite([{ input: text, left: padX, top: Math.round(height * 0.17) }])
    .png()
    .toBuffer();
  return { input, width, height };
}

async function loadManaPip(letter: string, size: number): Promise<Buffer> {
  const sharp = await loadSharp();
  const file = manaPipPath(letter);
  if (!existsSync(file)) {
    const fallback =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#cbc2c0" stroke="#111" stroke-width="2"/>` +
      `</svg>`;
    return sharp(Buffer.from(fallback)).png().toBuffer();
  }
  return sharp(file).resize(size, size).png().toBuffer();
}

async function drawHeaderStrip(
  canvasWidth: number,
  deckName: string | null,
  titlePips: string[],
): Promise<Buffer> {
  const sharp = await loadSharp();
  const strip = await sharp({
    create: {
      width: canvasWidth,
      height: HEADER_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.35 },
    },
  })
    .png()
    .toBuffer();

  const overlays: import('sharp').OverlayOptions[] = [];
  let cursorX = TITLE_PAD_X;
  const pipTop = Math.round((HEADER_HEIGHT - PIP_SIZE) / 2);

  for (const pip of titlePips) {
    const tile = await loadManaPip(pip, PIP_SIZE);
    overlays.push({ input: tile, left: cursorX, top: pipTop });
    cursorX += PIP_SIZE + PIP_GAP;
  }

  if (titlePips.length) {
    cursorX -= PIP_GAP;
    cursorX += SEP_GAP;
    const rule = await sharp({
      create: {
        width: SEP_RULE_W,
        height: SEP_RULE_H,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0.85 },
      },
    })
      .png()
      .toBuffer();
    overlays.push({
      input: rule,
      left: cursorX,
      top: Math.round((HEADER_HEIGHT - SEP_RULE_H) / 2),
    });
    cursorX += SEP_RULE_W + SEP_GAP;
  }

  const name = String(deckName || 'Deck').trim() || 'Deck';
  const title = await drawTextRaster({
    text: name,
    fontPath: sansFontPath(),
    width: Math.max(200, canvasWidth - cursorX - TITLE_PAD_X),
    height: 56,
    ink: TEXT_INK_LIGHT,
    fontFamily: 'GlanceSans',
    fontSize: TITLE_FONT_SIZE,
  });
  overlays.push({
    input: title,
    left: cursorX,
    top: Math.round((HEADER_HEIGHT - 56) / 2),
  });

  return sharp(strip).composite(overlays).png().toBuffer();
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

  ensureFontconfig();
  const fontPath = watermarkFontPath();
  let fontB64 = fontBase64Cache.get(fontPath);
  if (!fontB64 && existsSync(fontPath)) {
    fontB64 = readFileSync(fontPath).toString('base64');
    fontBase64Cache.set(fontPath, fontB64);
  }
  const family = 'GlanceWatermark';
  const textSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${WATERMARK_HEIGHT}">` +
    (fontB64
      ? `<defs><style><![CDATA[@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${fontB64}) format('truetype');}]]></style></defs>`
      : '') +
    `<text x="${canvasWidth - TITLE_PAD_X}" y="36" text-anchor="end" ` +
    `font-family="${family}" font-size="32" fill="${TEXT_INK_LIGHT}">Rayenz</text></svg>`;
  const text = await sharp(Buffer.from(textSvg)).png().toBuffer();
  return sharp(strip).composite([{ input: text, left: 0, top: 0 }]).png().toBuffer();
}

async function drawLabel(text: string): Promise<Buffer> {
  return drawTextRaster({
    text,
    fontPath: sansFontPath(),
    width: 400,
    height: 28,
    ink: TEXT_INK_DARK,
    fontFamily: 'GlanceSans',
    fontSize: 18,
  });
}

async function drawBackdrop(backdrop: GlanceBackdrop): Promise<Buffer> {
  const sharp = await loadSharp();
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${backdrop.width}" height="${backdrop.height}">` +
      `<rect x="0" y="0" width="${backdrop.width}" height="${backdrop.height}" ` +
      `rx="${backdrop.radius}" ry="${backdrop.radius}" fill="rgba(255,255,255,0.55)"/>` +
      `</svg>`,
  );
  return sharp(svg).png().toBuffer();
}

export type RenderGlanceOptions = {
  imageLoader?: GlanceImageLoader;
};

export async function renderGlancePng(
  plan: GlanceLayoutPlan,
  options: RenderGlanceOptions = {},
): Promise<Uint8Array> {
  ensureFontconfig();
  const sharp = await loadSharp();
  const loader = options.imageLoader ?? defaultImageLoader;
  const composites: import('sharp').OverlayOptions[] = [];

  for (const backdrop of plan.backdrops || []) {
    const tile = await drawBackdrop(backdrop);
    composites.push({ input: tile, left: backdrop.x, top: backdrop.y });
  }

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
      const inset = Math.max(2, Math.round(placement.width * 0.03));
      composites.push({
        input: badge.input,
        left: placement.x + placement.width - badge.width - inset,
        top: placement.y + inset,
      });
    }
  }

  const header = await drawHeaderStrip(plan.canvasWidth, plan.deckName, plan.titlePips || []);
  composites.push({ input: header, left: 0, top: 0 });

  const watermark = await drawWatermark(plan.canvasWidth);
  composites.push({
    input: watermark,
    left: 0,
    top: plan.canvasHeight - WATERMARK_HEIGHT,
  });

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
