import type {
  GlanceBackdrop,
  GlanceChromeTheme,
  GlanceLabel,
  GlanceLayoutPlan,
} from '@rayenz-hub/shared';
import {
  GLANCE_HEADER_HEIGHT,
  GLANCE_WATERMARK_HEIGHT,
  resolveGlanceChromeTheme,
  sharpBackgroundFromBarFill,
  TEXT_INK_DARK,
} from '@rayenz-hub/shared';
import { existsSync } from 'node:fs';
import {
  defaultImageLoader,
  drawTextRaster,
  ensureFontconfig,
  loadSharp,
  manaPipPath,
  pngEncodeOptions,
  sansFontPath,
  TITLE_FONT_SIZE,
  TITLE_PAD_X,
  type RenderGlanceOptions,
} from './glance-render-assets.js';
import { pushCardFaceComposites } from './glance-render-faces.js';
import { drawFrostedSectionLabel } from './glance-render-labels.js';
import { drawWatermarkBar } from './glance-render-watermark.js';

const PIP_SIZE = 40;
const PIP_GAP = 6;
const SEP_GAP = 14;
const SEP_RULE_W = 3;
const SEP_RULE_H = 36;

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
      height: GLANCE_HEADER_HEIGHT,
      channels: 4,
      background: sharpBackgroundFromBarFill(theme.headerFill),
    },
  })
    .png()
    .toBuffer();

  const overlays: import('sharp').OverlayOptions[] = [];
  let cursorX = TITLE_PAD_X;
  const pipTop = Math.round((GLANCE_HEADER_HEIGHT - PIP_SIZE) / 2);
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
      top: Math.round((GLANCE_HEADER_HEIGHT - SEP_RULE_H) / 2),
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
    top: Math.round((GLANCE_HEADER_HEIGHT - 56) / 2),
  });

  return sharp(strip).composite(overlays).png().toBuffer();
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

  const watermark = await drawWatermarkBar({
    canvasWidth: plan.canvasWidth,
    barFill: sharpBackgroundFromBarFill(theme.footerFill),
    footerInk: theme.footerInk,
  });
  composites.push({
    input: watermark,
    left: 0,
    top: plan.canvasHeight - GLANCE_WATERMARK_HEIGHT,
  });

  const base = await createGlanceCanvasBackground(plan.canvasWidth, plan.canvasHeight, theme);
  const png = await sharp(base)
    .composite(composites)
    .png(pngEncodeOptions(options.fastPng))
    .toBuffer();

  return new Uint8Array(png);
}
