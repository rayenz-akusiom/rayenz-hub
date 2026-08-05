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

  it('uses silver for colourless (C)', () => {
    const theme = resolveGlanceChromeTheme(['C']);
    expect(theme.headerFill).toEqual({ kind: 'solid', hex: '#8B939E' });
    expect(theme.footerFill).toEqual(theme.headerFill);
    expect(theme.background).toEqual({ kind: 'solid', hex: '#C5CBD3' });
  });

  it('uses the same darker shade for mono header and footer', () => {
    const theme = resolveGlanceChromeTheme(['U']);
    expect(theme.headerFill).toEqual(theme.footerFill);
    expect(theme.headerFill.kind).toBe('solid');
    if (theme.headerFill.kind !== 'solid') return;
    expect(theme.headerFill.hex).toBe('#0A4A7A');
    expect(theme.background).toEqual({ kind: 'solid', hex: '#9BC4DC' });
  });

  it('maps white to cream/tan bars (not pure white)', () => {
    const theme = resolveGlanceChromeTheme(['W']);
    expect(theme.headerFill.kind).toBe('solid');
    if (theme.headerFill.kind !== 'solid') return;
    expect(theme.headerFill.hex.toLowerCase()).not.toBe('#ffffff');
    expect(theme.headerFill.hex.toLowerCase()).not.toBe('#fff');
    expect(theme.headerFill.hex).toBe('#A89B6E');
    expect(theme.background.kind).toBe('solid');
    if (theme.background.kind !== 'solid') return;
    expect(theme.background.hex).toBe('#EDE6C8');
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

  it('uses gold for all chrome when identity is 3+', () => {
    const theme = resolveGlanceChromeTheme(['W', 'U', 'B', 'G']);
    expect(theme.headerFill).toEqual({ kind: 'solid', hex: '#B8860B' });
    expect(theme.footerFill).toEqual(theme.headerFill);
    expect(theme.background).toEqual({ kind: 'solid', hex: '#E8D48B' });
  });

  it('picks light vs dark ink from fill luminance', () => {
    expect(contrastInk('#0A4A7A')).toBe(TEXT_INK_LIGHT);
    expect(contrastInk('#EDE6C8')).toBe(TEXT_INK_DARK);
  });
});
