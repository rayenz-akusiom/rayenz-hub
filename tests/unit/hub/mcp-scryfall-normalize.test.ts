import { describe, expect, it } from 'vitest';
import { analyzableOracleText } from '../../../packages/mcp/src/lib/scryfall.js';

describe('analyzableOracleText', () => {
  it('merges adventure face text when top-level oracle_text is empty', () => {
    const text = analyzableOracleText({
      oracle_text: '',
      card_faces: [
        { oracle_text: 'Lifelink' },
        {
          oracle_text:
            'Target artifact or creature you control gains hexproof and indestructible until end of turn.',
        },
      ],
    });
    expect(text).toContain('Lifelink');
    expect(text).toContain('hexproof');
    expect(text).toContain('indestructible');
  });

  it('keeps top-level text when faces are absent', () => {
    expect(analyzableOracleText({ oracle_text: 'Flying' })).toBe('Flying');
  });

  it('appends face text not already present on top-level', () => {
    const text = analyzableOracleText({
      oracle_text: 'Creatures you control get +1/+1.',
      card_faces: [
        { oracle_text: 'Creatures you control get +1/+1.\nAt the beginning of your end step, draw a card.' },
        { oracle_text: 'Search your library for a legendary creature card, reveal it, put it into your hand, then shuffle.' },
      ],
    });
    expect(text).toContain('draw a card');
    expect(text).toContain('legendary creature');
  });
});
