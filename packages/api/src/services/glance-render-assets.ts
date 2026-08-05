import type { GlanceCard } from '@rayenz-hub/shared';
import { TEXT_INK_DARK } from '@rayenz-hub/shared';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchImageBytes } from './glance-art.js';

export type Sharp = typeof import('sharp').default;

/** Matches web `--db-card-radius: calc(width * 0.055)`. */
export const CARD_CORNER_RATIO = 0.055;
export const TITLE_FONT_SIZE = 44;
export const TITLE_PAD_X = 24;
export const SECTION_LABEL_HEIGHT = 32;
export const SECTION_BAND_RADIUS = 8;

let sharpPromise: Promise<Sharp> | null = null;
let fontconfigReady = false;
const fontBase64Cache = new Map<string, string>();

export function loadSharp(): Promise<Sharp> {
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

export function resolveAssetPath(...parts: string[]): string {
  const candidates = assetRootCandidates().map((root) => path.join(root, ...parts));
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export function ensureFontconfig(): void {
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

export function sansFontPath(): string {
  return resolveFontPath('DejaVuSans.ttf');
}

export function watermarkFontPath(): string {
  return resolveFontPath('BebasNeue-Regular.ttf');
}

export function manaPipPath(letter: string): string {
  const safe = String(letter || 'C').toUpperCase().replace(/[^WUBRGC]/g, '') || 'C';
  return resolveAssetPath('assets', 'mana', `${safe}.svg`);
}

export type GlanceImageLoader = (
  url: string,
  card?: Pick<GlanceCard, 'instanceId' | 'name'>,
) => Promise<Uint8Array | null>;

export async function defaultImageLoader(
  url: string,
  _card?: Pick<GlanceCard, 'instanceId' | 'name'>,
): Promise<Uint8Array | null> {
  return fetchImageBytes(url, fetch);
}

export function truncateName(name: string, maxLen: number): string {
  const trimmed = String(name || '').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxLen - 1))}…`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type DrawTextOptions = {
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

export async function drawTextRaster(options: DrawTextOptions): Promise<Buffer> {
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

/** Cached base64 of the watermark TTF for SVG @font-face embeds. */
export function watermarkFontBase64(): string | null {
  const fontPath = watermarkFontPath();
  let fontB64 = fontBase64Cache.get(fontPath);
  if (!fontB64 && existsSync(fontPath)) {
    fontB64 = readFileSync(fontPath).toString('base64');
    fontBase64Cache.set(fontPath, fontB64);
  }
  return fontB64 ?? null;
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

export function pngEncodeOptions(fastPng?: boolean) {
  return fastPng ? FAST_PNG : PROD_PNG;
}
