import { describe, expect, it } from 'vitest';
import {
  clampDeckDescription,
  DECK_DESCRIPTION_MAX_BYTES,
  DeckDescriptionSchema,
  DeckDocumentSchema,
  headerRemainderMode,
  sanitizeDeckDescription,
  utf8ByteLength,
} from '../../../packages/shared/src/index.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('deck description helpers', () => {
  it('strips NUL and C0 controls except tab and newlines', () => {
    expect(sanitizeDeckDescription('ok\x00\x01\tkeep\nme\r')).toBe('ok\tkeep\nme\r');
    expect(sanitizeDeckDescription('bell\x07del\x7f')).toBe('belldel');
  });

  it('clamps to the Dynamo-item byte cap without splitting UTF-8', () => {
    const tooBig = 'a'.repeat(DECK_DESCRIPTION_MAX_BYTES + 8);
    const clamped = clampDeckDescription(tooBig);
    expect(utf8ByteLength(clamped)).toBe(DECK_DESCRIPTION_MAX_BYTES);
    expect(clamped.startsWith('aaa')).toBe(true);

    const emoji = '🙂'.repeat(Math.floor(DECK_DESCRIPTION_MAX_BYTES / 4) + 2);
    const clampedEmoji = clampDeckDescription(emoji);
    expect(utf8ByteLength(clampedEmoji)).toBeLessThanOrEqual(DECK_DESCRIPTION_MAX_BYTES);
    expect(clampedEmoji.includes('\uFFFD')).toBe(false);
  });

  it('defaults missing description to empty and rejects oversize', () => {
    const parsed = DeckDocumentSchema.parse(commander);
    expect(parsed.description).toBe('');
    expect(DeckDescriptionSchema.safeParse('a'.repeat(DECK_DESCRIPTION_MAX_BYTES + 1)).success).toBe(
      false,
    );
    expect(DeckDescriptionSchema.parse('hi\x00there')).toBe('hithere');
  });
});

describe('headerRemainderMode', () => {
  it('fills with description when there are no leader cards', () => {
    expect(
      headerRemainderMode({ leftoverPx: 1000, leaderCardCount: 0, cardWidthPx: 213 }),
    ).toBe('description');
  });

  it('splits when leftover after cards is at least half and 12rem', () => {
    expect(
      headerRemainderMode({ leftoverPx: 1000, leaderCardCount: 2, cardWidthPx: 213 }),
    ).toBe('split');
  });

  it('uses tabs when lieutenants occupy more than half the leftover', () => {
    expect(
      headerRemainderMode({ leftoverPx: 1000, leaderCardCount: 3, cardWidthPx: 213 }),
    ).toBe('tabs');
  });

  it('prefers split while leftover is unmeasured', () => {
    expect(
      headerRemainderMode({ leftoverPx: 0, leaderCardCount: 2, cardWidthPx: 213 }),
    ).toBe('split');
  });

  it('uses tabs when leftover is too narrow for the min description column', () => {
    expect(
      headerRemainderMode({
        leftoverPx: 300,
        leaderCardCount: 1,
        cardWidthPx: 213,
        minDescriptionPx: 192,
      }),
    ).toBe('tabs');
  });
});
