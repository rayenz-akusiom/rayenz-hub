import { describe, expect, it } from 'vitest';
import {
  contrastInk,
  GLANCE_SKY_BLUE,
  resolveGlanceChromeTheme,
  TEXT_INK_DARK,
  TEXT_INK_LIGHT,
} from '@rayenz-hub/shared';

describe('glance chrome theme', () => {
  it('keeps sky-blue chrome for Cube format', () => {
    const theme = resolveGlanceChromeTheme(['W', 'U'], { format: 'cube' });
    expect(theme.background).toEqual({ kind: 'solid', hex: GLANCE_SKY_BLUE });
    expect(theme.headerFill).toEqual({
      kind: 'translucent',
      r: 0,
      g: 0,
      b: 0,
      alpha: 0.35,
    });
    expect(theme.footerFill).toEqual(theme.headerFill);
    expect(theme.headerInk).toBe(TEXT_INK_LIGHT);
  });

  it.each([
    { pips: ['C'], header: '#8B939E', background: '#C5CBD3' },
    { pips: ['U'], header: '#0A4A7A', background: '#9BC4DC' },
    { pips: ['W'], header: '#A89B6E', background: '#EDE6C8' },
    { pips: ['W', 'U', 'B', 'G'], header: '#B8860B', background: '#E8D48B' },
  ])('maps $pips to solid chrome $header / $background', ({ pips, header, background }) => {
    const theme = resolveGlanceChromeTheme(pips);
    expect(theme.headerFill).toEqual({ kind: 'solid', hex: header });
    expect(theme.footerFill).toEqual(theme.headerFill);
    expect(theme.background).toEqual({ kind: 'solid', hex: background });
  });

  it('splits dual colours across header, footer, and soft-blend background', () => {
    const theme = resolveGlanceChromeTheme(['W', 'U']);
    expect(theme.headerFill).toEqual({ kind: 'solid', hex: '#A89B6E' });
    expect(theme.footerFill).toEqual({ kind: 'solid', hex: '#0A4A7A' });
    expect(theme.background).toEqual({
      kind: 'softBlend',
      leftHex: '#EDE6C8',
      rightHex: '#9BC4DC',
    });
    // Darker cream/tan bar still prefers light ink for title readability.
    expect(theme.headerInk).toBe(TEXT_INK_LIGHT);
    expect(theme.footerInk).toBe(TEXT_INK_LIGHT);
  });

  it('picks light vs dark ink from fill luminance', () => {
    expect(contrastInk('#0A4A7A')).toBe(TEXT_INK_LIGHT);
    expect(contrastInk('#EDE6C8')).toBe(TEXT_INK_DARK);
  });
});
