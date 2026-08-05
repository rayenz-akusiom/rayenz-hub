import type {
  GlanceBackdrop,
  GlanceCard,
  GlanceChromeTheme,
  GlanceLabel,
  GlanceLayoutPlan,
  SwapGlanceLayoutPlan,
} from '@rayenz-hub/shared';
import {
  HEADER_HEIGHT,
  resolveGlanceChromeTheme,
  sharpBackgroundFromBarFill,
  SWAP_GLANCE_BACKGROUND,
  SWAP_GLANCE_TITLE_HEIGHT,
  SWAP_GLANCE_WATERMARK_HEIGHT,
  TEXT_INK_DARK,
  TEXT_INK_LIGHT,
  WATERMARK_HEIGHT,
} from '@rayenz-hub/shared';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchImageBytes, SCRYFALL_USER_AGENT } from './glance-art.js';

type Sharp = typeof import('sharp').default;

/** Matches web `--db-card-radius: calc(width * 0.055)`. */
const CARD_CORNER_RATIO = 0.055;
const TITLE_FONT_SIZE = 44;
const PIP_SIZE = 40;
const PIP_GAP = 6;
const TITLE_PAD_X = 24;
const SEP_GAP = 14;
const SEP_RULE_W = 3;
const SEP_RULE_H = 36;
const SECTION_LABEL_HEIGHT = 32;
const SECTION_BAND_RADIUS = 8;

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
  align?: 'left' | 'center';
  /** Vertical alignment within the text box. Default top (baseline near top). */
  vAlign?: 'top' | 'middle';
};

async function drawTextRaster(options: DrawTextOptions): Promise<Buffer> {
  ensureFontconfig();
  const sharp = await loadSharp();
  const ink = options.ink ?? TEXT_INK_DARK;
  const fontSize = options.fontSize ?? Math.max(12, Math.floor(options.height * 0.72));
  const fontPath = options.fontPath;
  const align = options.align ?? 'left';
  const vAlign = options.vAlign ?? 'top';
  const textX = align === 'center' ? Math.round(options.width / 2) : 0;
  const textAnchor = align === 'center' ? 'middle' : 'start';
  const textY =
    vAlign === 'middle'
      ? Math.round(options.height / 2)
      : Math.min(options.height - 2, Math.round(fontSize * 0.9));
  const dominantBaseline = vAlign === 'middle' ? ' dominant-baseline="central"' : '';

  if (existsSync(fontPath)) {
    let fontB64 = fontBase64Cache.get(fontPath);
    if (!fontB64) {
      fontB64 = readFileSync(fontPath).toString('base64');
      fontBase64Cache.set(fontPath, fontB64);
    }
    const family = options.fontFamily ?? 'GlanceEmbedded';
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" overflow="hidden">` +
      `<defs><style><![CDATA[` +
      `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${fontB64}) format('truetype');}` +
      `]]></style></defs>` +
      `<text x="${textX}" y="${textY}" ` +
      `text-anchor="${textAnchor}"${dominantBaseline} ` +
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
      align: align === 'center' ? 'center' : 'left',
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

/**
 * Mirrors web `.db-card-placeholder`: muted fill, dashed border, centered "+".
 * Fixed RGB approx of color-mix(muted #5c6770 / #888, surface #fff).
 */
async function drawEmptySlotPlaceholder(width: number, height: number): Promise<Buffer> {
  const sharp = await loadSharp();
  const r = Math.max(1, Math.round(width * CARD_CORNER_RATIO));
  const stroke = Math.max(2, Math.round(width * (2 / 213)));
  const fontSize = Math.max(12, Math.round(width * 0.32));
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="${stroke / 2}" y="${stroke / 2}" width="${width - stroke}" height="${height - stroke}" ` +
      `rx="${r}" ry="${r}" fill="#c5cacf" stroke="#757e86" stroke-width="${stroke}" ` +
      `stroke-dasharray="${Math.max(4, Math.round(stroke * 2.5))} ${Math.max(3, Math.round(stroke * 1.8))}"/>` +
      `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="600" fill="#6b747c">+</text>` +
      `</svg>`,
  );
  return sharp(svg, { density: 72 }).resize(width, height).ensureAlpha().png().toBuffer();
}

async function loadTile(
  card: GlanceCard,
  width: number,
  height: number,
  loader: GlanceImageLoader,
): Promise<Buffer> {
  if (card.isPlaceholder) {
    return drawEmptySlotPlaceholder(width, height);
  }
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

/** Compact barely-rounded qty chip: muted slate, soft silver border, `×n` (capped at 99). */
async function drawQuantityBadge(qty: number, cardWidth: number): Promise<QuantityBadge> {
  const sharp = await loadSharp();
  const displayQty = Math.min(99, Math.max(0, Math.floor(Number(qty) || 0)));
  const digits = String(displayQty);
  const label = `\u00d7${digits}`;
  const height = Math.max(14, Math.round(cardWidth * 0.11));
  const fontSize = Math.max(10, Math.round(height * 0.62));
  const padX = Math.round(fontSize * 0.28);
  // DejaVu Sans advance widths: digits ~0.64em, multiplication sign ~0.84em.
  const textWidth = Math.ceil(fontSize * (0.84 + 0.64 * digits.length));
  const width = textWidth + padX * 2;
  const stroke = 1;
  const radius = 3;
  const chipSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="${stroke / 2}" y="${stroke / 2}" width="${width - stroke}" height="${height - stroke}" ` +
      `rx="${radius}" ry="${radius}" fill="#3f4550" stroke="#c8ced6" stroke-width="${stroke}"/>` +
      `</svg>`,
  );
  const chip = await sharp(chipSvg).png().toBuffer();
  const text = await drawTextRaster({
    text: label,
    fontPath: sansFontPath(),
    width: textWidth,
    height,
    ink: '#f1f5f9',
    fontFamily: 'GlanceSans',
    fontSize,
  });
  const input = await sharp(chip)
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
  theme: GlanceChromeTheme,
): Promise<Buffer> {
  const sharp = await loadSharp();
  const strip = await sharp({
    create: {
      width: canvasWidth,
      height: HEADER_HEIGHT,
      channels: 4,
      background: sharpBackgroundFromBarFill(theme.headerFill),
    },
  })
    .png()
    .toBuffer();

  const overlays: import('sharp').OverlayOptions[] = [];
  let cursorX = TITLE_PAD_X;
  const pipTop = Math.round((HEADER_HEIGHT - PIP_SIZE) / 2);
  const ink = theme.headerInk;
  const ruleRgb =
    ink === TEXT_INK_DARK
      ? { r: 17, g: 24, b: 39, alpha: 0.85 }
      : { r: 255, g: 255, b: 255, alpha: 0.85 };

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
        background: ruleRgb,
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
    ink,
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

async function drawWatermark(canvasWidth: number, theme: GlanceChromeTheme): Promise<Buffer> {
  const sharp = await loadSharp();
  const strip = await sharp({
    create: {
      width: canvasWidth,
      height: WATERMARK_HEIGHT,
      channels: 4,
      background: sharpBackgroundFromBarFill(theme.footerFill),
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
    `font-family="${family}" font-size="32" fill="${theme.footerInk}">Rayenz</text></svg>`;
  const text = await sharp(Buffer.from(textSvg)).png().toBuffer();
  return sharp(strip).composite([{ input: text, left: 0, top: 0 }]).png().toBuffer();
}

/** Swap-glance footer: optional set codes on the left, Rayenz on the right. */
async function drawSwapWatermark(
  canvasWidth: number,
  filterSetCodes: string[],
): Promise<Buffer> {
  const sharp = await loadSharp();
  const strip = await sharp({
    create: {
      width: canvasWidth,
      height: SWAP_GLANCE_WATERMARK_HEIGHT,
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
  const codes = (filterSetCodes || [])
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean);
  const leftText = codes.length ? codes.join(', ') : '';
  const textSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${SWAP_GLANCE_WATERMARK_HEIGHT}">` +
    (fontB64
      ? `<defs><style><![CDATA[@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${fontB64}) format('truetype');}]]></style></defs>`
      : '') +
    (leftText
      ? `<text x="${TITLE_PAD_X}" y="36" text-anchor="start" ` +
        `font-family="${family}" font-size="28" fill="${TEXT_INK_LIGHT}">${escapeXml(leftText)}</text>`
      : '') +
    `<text x="${canvasWidth - TITLE_PAD_X}" y="36" text-anchor="end" ` +
    `font-family="${family}" font-size="32" fill="${TEXT_INK_LIGHT}">Rayenz</text></svg>`;
  const text = await sharp(Buffer.from(textSvg)).png().toBuffer();
  return sharp(strip).composite([{ input: text, left: 0, top: 0 }]).png().toBuffer();
}

/** Mirrors web `.db-badge-proxy` + ProxyIcon (filled sketch card). */
async function drawProxyBadge(cardWidth: number): Promise<{ input: Buffer; width: number; height: number }> {
  const sharp = await loadSharp();
  const height = Math.max(18, Math.round(cardWidth * 0.19));
  const width = height;
  const pad = Math.max(2, Math.round(height * 0.18));
  const icon = height - pad * 2;
  const iconX = pad;
  const iconY = pad;
  // Scale ProxyIcon 16×16 viewBox into icon box
  const s = icon / 16;
  const badgeSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#6b7280"/>` +
      `<stop offset="45%" stop-color="#d1d5db"/>` +
      `<stop offset="100%" stop-color="#4b5563"/>` +
      `</linearGradient></defs>` +
      `<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.round(height * 0.22)}" fill="url(#pg)"/>` +
      `<g transform="translate(${iconX},${iconY}) scale(${s})" fill="none" stroke="#111827">` +
      `<rect x="3.25" y="1.75" width="9.5" height="12.5" rx="1.2" fill="#111827" fill-opacity="0.18" ` +
      `stroke-width="1.15" stroke-dasharray="2.2 1.4"/>` +
      `<path stroke-width="1" stroke-linecap="round" opacity="0.7" d="M5.5 5.2h5M5.5 7.5h3.8M5.5 9.8h4.2"/>` +
      `<path stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" d="M11.2 11.6 12.6 13.4l1.1-.35"/>` +
      `</g></svg>`,
  );
  const input = await sharp(badgeSvg).png().toBuffer();
  return { input, width, height };
}

async function drawPairConnector(
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = await loadSharp();
  const arrowW = Math.max(14, Math.min(width - 4, Math.round(width * 0.7)));
  const arrowH = Math.max(10, Math.round(Math.min(height * 0.12, arrowW * 0.55)));
  const cx = width / 2;
  const cy = height / 2;
  const left = cx - arrowW / 2;
  const right = cx + arrowW / 2;
  const tip = Math.max(6, Math.round(arrowH * 0.55));
  const stroke = Math.max(2, Math.round(arrowH * 0.28));
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<line x1="${left}" y1="${cy}" x2="${right - tip * 0.35}" y2="${cy}" ` +
      `stroke="${TEXT_INK_DARK}" stroke-width="${stroke}" stroke-linecap="round"/>` +
      `<polygon points="${right},${cy} ${right - tip},${cy - tip * 0.65} ${right - tip},${cy + tip * 0.65}" ` +
      `fill="${TEXT_INK_DARK}"/>` +
      `</svg>`,
  );
  return sharp(svg).png().toBuffer();
}

async function drawFrostedSectionLabel(
  text: string,
  width: number,
  bandFill: string,
  bandInk: string,
  fontSize = 20,
): Promise<Buffer> {
  const sharp = await loadSharp();
  const boxW = Math.max(40, width);
  const boxH = SECTION_LABEL_HEIGHT;
  const maxChars = Math.max(8, Math.floor((boxW - 16) / (fontSize * 0.55)));
  const label = truncateName(text, maxChars);
  const textTile = await drawTextRaster({
    text: label,
    fontPath: sansFontPath(),
    width: boxW,
    height: boxH,
    ink: bandInk,
    fontFamily: 'GlanceSans',
    fontSize,
    align: 'center',
    vAlign: 'middle',
  });
  const bandSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}">` +
      `<rect x="0" y="0" width="${boxW}" height="${boxH}" ` +
      `rx="${SECTION_BAND_RADIUS}" ry="${SECTION_BAND_RADIUS}" fill="${bandFill}"/>` +
      `</svg>`,
  );
  const band = await sharp(bandSvg).png().toBuffer();
  return sharp(band)
    .composite([{ input: textTile, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function drawLabel(label: GlanceLabel, theme: GlanceChromeTheme): Promise<Buffer> {
  if (label.role === 'section' && label.width != null) {
    return drawFrostedSectionLabel(
      label.text,
      label.width,
      theme.sectionBandFill,
      theme.sectionBandInk,
      20,
    );
  }
  return drawTextRaster({
    text: label.text,
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

async function createGlanceCanvasBackground(
  width: number,
  height: number,
  theme: GlanceChromeTheme,
): Promise<Buffer> {
  const sharp = await loadSharp();
  if (theme.background.kind === 'softBlend') {
    const { leftHex, rightHex } = theme.background;
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<defs><linearGradient id="ci" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="${leftHex}"/>` +
        `<stop offset="38%" stop-color="${leftHex}"/>` +
        `<stop offset="62%" stop-color="${rightHex}"/>` +
        `<stop offset="100%" stop-color="${rightHex}"/>` +
        `</linearGradient></defs>` +
        `<rect width="${width}" height="${height}" fill="url(#ci)"/>` +
        `</svg>`,
    );
    return sharp(svg).png().toBuffer();
  }
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: theme.background.hex,
    },
  })
    .png()
    .toBuffer();
}

export type RenderGlanceOptions = {
  imageLoader?: GlanceImageLoader;
  /**
   * Low-effort PNG encode for unit/API tests. Production keeps max quality.
   * Does not change pixels for a given composite tree — only encode speed/size.
   */
  fastPng?: boolean;
};

const PROD_PNG = { compressionLevel: 9, effort: 10, adaptiveFiltering: true } as const;
const FAST_PNG = { compressionLevel: 1, effort: 1, adaptiveFiltering: false } as const;

function pngEncodeOptions(fastPng?: boolean) {
  return fastPng ? FAST_PNG : PROD_PNG;
}

type FacePlacement = {
  card: GlanceCard;
  x: number;
  y: number;
  width: number;
  height: number;
  showQuantity?: boolean;
  showProxy?: boolean;
};

/** Composite card face tile plus optional quantity / proxy badges. */
async function pushCardFaceComposites(
  composites: import('sharp').OverlayOptions[],
  placement: FacePlacement,
  loader: GlanceImageLoader,
): Promise<void> {
  const tile = await loadTile(placement.card, placement.width, placement.height, loader);
  composites.push({
    input: tile,
    left: placement.x,
    top: placement.y,
  });

  const inset = Math.max(2, Math.round(placement.width * 0.03));

  if (placement.showQuantity) {
    const badge = await drawQuantityBadge(placement.card.quantity, placement.width);
    composites.push({
      input: badge.input,
      left: placement.x + placement.width - badge.width - inset,
      top: placement.y + inset,
    });
  }

  if (placement.showProxy) {
    const badge = await drawProxyBadge(placement.width);
    composites.push({
      input: badge.input,
      left: placement.x + inset,
      top: placement.y + placement.height - badge.height - inset,
    });
  }
}

export async function renderGlancePng(
  plan: GlanceLayoutPlan,
  options: RenderGlanceOptions = {},
): Promise<Uint8Array> {
  ensureFontconfig();
  const sharp = await loadSharp();
  const loader = options.imageLoader ?? defaultImageLoader;
  const theme = resolveGlanceChromeTheme(plan.titlePips || []);
  const composites: import('sharp').OverlayOptions[] = [];

  for (const backdrop of plan.backdrops || []) {
    const tile = await drawBackdrop(backdrop);
    composites.push({ input: tile, left: backdrop.x, top: backdrop.y });
  }

  for (const label of plan.labels) {
    const tile = await drawLabel(label, theme);
    composites.push({
      input: tile,
      left: label.x,
      top: label.y,
    });
  }

  for (const placement of plan.placements) {
    await pushCardFaceComposites(composites, placement, loader);
  }

  const header = await drawHeaderStrip(
    plan.canvasWidth,
    plan.deckName,
    plan.titlePips || [],
    theme,
  );
  composites.push({ input: header, left: 0, top: 0 });

  const watermark = await drawWatermark(plan.canvasWidth, theme);
  composites.push({
    input: watermark,
    left: 0,
    top: plan.canvasHeight - WATERMARK_HEIGHT,
  });

  const base = await createGlanceCanvasBackground(plan.canvasWidth, plan.canvasHeight, theme);
  const png = await sharp(base)
    .composite(composites)
    .png(pngEncodeOptions(options.fastPng))
    .toBuffer();

  return new Uint8Array(png);
}

async function drawSwapGlanceLabel(
  text: string,
  role: 'title' | 'section' | 'more',
  maxWidth: number,
): Promise<Buffer> {
  if (role === 'title') {
    return drawTextRaster({
      text,
      fontPath: sansFontPath(),
      width: Math.max(200, maxWidth),
      height: 56,
      ink: TEXT_INK_LIGHT,
      fontFamily: 'GlanceSans',
      fontSize: TITLE_FONT_SIZE,
    });
  }
  if (role === 'section') {
    return drawFrostedSectionLabel(
      text,
      Math.max(40, maxWidth),
      'rgba(255,255,255,0.72)',
      TEXT_INK_DARK,
      22,
    );
  }
  return drawTextRaster({
    text,
    fontPath: sansFontPath(),
    width: Math.max(40, maxWidth),
    height: 22,
    ink: TEXT_INK_DARK,
    fontFamily: 'GlanceSans',
    fontSize: 16,
  });
}

async function drawSwapTitleStrip(canvasWidth: number): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp({
    create: {
      width: canvasWidth,
      height: SWAP_GLANCE_TITLE_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.35 },
    },
  })
    .png()
    .toBuffer();
}

/** Render a multi-deck swaps-at-a-glance plate. */
export async function renderSwapGlancePng(
  plan: SwapGlanceLayoutPlan,
  options: RenderGlanceOptions = {},
): Promise<Uint8Array> {
  ensureFontconfig();
  const sharp = await loadSharp();
  const loader = options.imageLoader ?? defaultImageLoader;
  const composites: import('sharp').OverlayOptions[] = [];

  const titleStrip = await drawSwapTitleStrip(plan.canvasWidth);
  composites.push({ input: titleStrip, left: 0, top: 0 });

  for (const label of plan.labels) {
    const maxWidth =
      label.maxWidth ??
      (label.role === 'title'
        ? plan.canvasWidth - label.x - 24
        : plan.canvasWidth - label.x - 24);
    const tile = await drawSwapGlanceLabel(label.text, label.role, maxWidth);
    composites.push({
      input: tile,
      left: label.x,
      top: label.y,
    });
  }

  for (const connector of plan.connectors || []) {
    const arrow = await drawPairConnector(connector.width, connector.height);
    composites.push({
      input: arrow,
      left: connector.x,
      top: connector.y,
    });
  }

  for (const placement of plan.placements) {
    await pushCardFaceComposites(composites, placement, loader);
  }

  const watermark = await drawSwapWatermark(plan.canvasWidth, plan.filterSetCodes || []);
  composites.push({
    input: watermark,
    left: 0,
    top: plan.canvasHeight - SWAP_GLANCE_WATERMARK_HEIGHT,
  });

  const png = await sharp({
    create: {
      width: plan.canvasWidth,
      height: plan.canvasHeight,
      channels: 3,
      background: SWAP_GLANCE_BACKGROUND,
    },
  })
    .composite(composites)
    .png(pngEncodeOptions(options.fastPng))
    .toBuffer();

  return new Uint8Array(png);
}

/** @deprecated tests may stub loaders; valid 1×1 PNG for resize-safe stubs. */
export const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export { SCRYFALL_USER_AGENT };
