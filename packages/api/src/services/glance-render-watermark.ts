import { GLANCE_WATERMARK_HEIGHT } from '@rayenz-hub/shared';
import {
  ensureFontconfig,
  escapeXml,
  loadSharp,
  TITLE_PAD_X,
  watermarkFontBase64,
} from './glance-render-assets.js';

export type WatermarkBarOptions = {
  canvasWidth: number;
  /** Sharp create background (hex string or rgba). */
  barFill: string | { r: number; g: number; b: number; alpha: number };
  footerInk: string;
  /** Optional left-aligned footer text (e.g. set codes). */
  leftText?: string;
  leftFontSize?: number;
};

/**
 * Shared footer bar: strip with optional left text and Rayenz on the right.
 * Pixel-identical to the previous deck/swap watermark paths when called with their fills/inks.
 */
export async function drawWatermarkBar(options: WatermarkBarOptions): Promise<Buffer> {
  const sharp = await loadSharp();
  const strip = await sharp({
    create: {
      width: options.canvasWidth,
      height: GLANCE_WATERMARK_HEIGHT,
      channels: 4,
      background: options.barFill,
    },
  })
    .png()
    .toBuffer();

  ensureFontconfig();
  const fontB64 = watermarkFontBase64();
  const family = 'GlanceWatermark';
  const leftText = String(options.leftText || '').trim();
  const leftFontSize = options.leftFontSize ?? 28;
  const textSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.canvasWidth}" height="${GLANCE_WATERMARK_HEIGHT}">` +
    (fontB64
      ? `<defs><style><![CDATA[@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${fontB64}) format('truetype');}]]></style></defs>`
      : '') +
    (leftText
      ? `<text x="${TITLE_PAD_X}" y="36" text-anchor="start" ` +
        `font-family="${family}" font-size="${leftFontSize}" fill="${options.footerInk}">${escapeXml(leftText)}</text>`
      : '') +
    `<text x="${options.canvasWidth - TITLE_PAD_X}" y="36" text-anchor="end" ` +
    `font-family="${family}" font-size="32" fill="${options.footerInk}">Rayenz</text></svg>`;
  const text = await sharp(Buffer.from(textSvg)).png().toBuffer();
  return sharp(strip).composite([{ input: text, left: 0, top: 0 }]).png().toBuffer();
}

/** Swap-glance default translucent black footer fill. */
export const SWAP_WATERMARK_FILL = { r: 0, g: 0, b: 0, alpha: 0.35 } as const;

export function swapWatermarkLeftText(filterSetCodes: string[]): string {
  return (filterSetCodes || [])
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean)
    .join(', ');
}
