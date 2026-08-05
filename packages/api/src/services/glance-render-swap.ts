import type { SwapGlanceLayoutPlan } from '@rayenz-hub/shared';
import {
  GLANCE_HEADER_HEIGHT,
  GLANCE_PLATE_BACKGROUND,
  GLANCE_WATERMARK_HEIGHT,
  TEXT_INK_DARK,
  TEXT_INK_LIGHT,
} from '@rayenz-hub/shared';
import {
  defaultImageLoader,
  drawTextRaster,
  ensureFontconfig,
  loadSharp,
  pngEncodeOptions,
  sansFontPath,
  TITLE_FONT_SIZE,
  type RenderGlanceOptions,
} from './glance-render-assets.js';
import { drawFrostedSectionLabel } from './glance-render-labels.js';
import { pushCardFaceComposites } from './glance-render-faces.js';
import {
  drawWatermarkBar,
  SWAP_WATERMARK_FILL,
  swapWatermarkLeftText,
} from './glance-render-watermark.js';

async function drawPairConnector(width: number, height: number): Promise<Buffer> {
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
      height: GLANCE_HEADER_HEIGHT,
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

  const watermark = await drawWatermarkBar({
    canvasWidth: plan.canvasWidth,
    barFill: SWAP_WATERMARK_FILL,
    footerInk: TEXT_INK_LIGHT,
    leftText: swapWatermarkLeftText(plan.filterSetCodes || []),
    leftFontSize: 28,
  });
  composites.push({
    input: watermark,
    left: 0,
    top: plan.canvasHeight - GLANCE_WATERMARK_HEIGHT,
  });

  const png = await sharp({
    create: {
      width: plan.canvasWidth,
      height: plan.canvasHeight,
      channels: 3,
      background: GLANCE_PLATE_BACKGROUND,
    },
  })
    .composite(composites)
    .png(pngEncodeOptions(options.fastPng))
    .toBuffer();

  return new Uint8Array(png);
}
