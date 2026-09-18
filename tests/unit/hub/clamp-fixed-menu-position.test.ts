import { describe, expect, it } from 'vitest';
import { clampFixedMenuPosition } from '../../../packages/web/src/ui/clampFixedMenuPosition';

describe('clampFixedMenuPosition', () => {
  it('shifts up and left near the bottom-right when there is room', () => {
    expect(clampFixedMenuPosition(900, 700, 200, 300, 1000, 800, 8)).toEqual({
      left: 792,
      top: 492,
    });
  });

  it('keeps near top-left at the margin', () => {
    expect(clampFixedMenuPosition(2, 3, 180, 120, 1000, 800, 8)).toEqual({
      left: 8,
      top: 8,
    });
  });

  it('pins to margin when the menu is larger than the viewport', () => {
    expect(clampFixedMenuPosition(50, 50, 1200, 900, 800, 600, 8)).toEqual({
      left: 8,
      top: 8,
    });
  });

  it('leaves room for the menu when the click is mid-viewport', () => {
    expect(clampFixedMenuPosition(100, 100, 200, 250, 1000, 800, 8)).toEqual({
      left: 100,
      top: 100,
    });
  });
});
