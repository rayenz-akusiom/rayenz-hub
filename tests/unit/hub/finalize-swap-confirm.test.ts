import { describe, expect, it } from 'vitest';
import { finalizeSwapConfirmMessage } from '../../../packages/web/src/deck-builder/swaps/FinalizeSwapConfirm.tsx';

describe('finalizeSwapConfirmMessage', () => {
  it('includes Out, In, and category when set', () => {
    expect(finalizeSwapConfirmMessage('Cut Card', 'Sol Ring', 'Other')).toBe(
      'Remove “Cut Card” from the deck and keep “Sol Ring” in Other?',
    );
  });

  it('omits category when empty', () => {
    expect(finalizeSwapConfirmMessage('Cut Card', 'Sol Ring', null)).toBe(
      'Remove “Cut Card” from the deck and keep “Sol Ring”?',
    );
  });

  it('falls back to Out/In labels when names are blank', () => {
    expect(finalizeSwapConfirmMessage('  ', '', 'Ramp')).toBe(
      'Remove “Out” from the deck and keep “In” in Ramp?',
    );
  });
});
