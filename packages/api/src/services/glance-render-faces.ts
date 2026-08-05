import type { GlanceCard } from '@rayenz-hub/shared';
import { TEXT_INK_LIGHT } from '@rayenz-hub/shared';
import {
  CARD_CORNER_RATIO,
  drawTextRaster,
  loadSharp,
  sansFontPath,
  truncateName,
  type GlanceImageLoader,
} from './glance-render-assets.js';

async function applyRoundedCorners(
  tile: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
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

/** Mirrors web `.db-badge-proxy` + ProxyIcon (filled sketch card). */
async function drawProxyBadge(
  cardWidth: number,
): Promise<{ input: Buffer; width: number; height: number }> {
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
export async function pushCardFaceComposites(
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
