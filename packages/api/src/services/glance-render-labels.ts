import {
  drawTextRaster,
  loadSharp,
  sansFontPath,
  SECTION_BAND_RADIUS,
  SECTION_LABEL_HEIGHT,
  truncateName,
} from './glance-render-assets.js';

export async function drawFrostedSectionLabel(
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
