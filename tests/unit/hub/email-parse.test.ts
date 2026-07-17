import { describe, expect, it } from 'vitest';
import { OrderEmailParse } from '../../../packages/web/src/mtg/email-parse.ts';

describe('OrderEmailParse.parseCardLine', () => {
  it('parses quantity-prefixed lines with set and collector number', () => {
    expect(OrderEmailParse.parseCardLine('2x Sol Ring (cmm) 1')).toMatchObject({
      name: 'Sol Ring',
      quantity: 2,
      set_code: 'cmm',
      collector_number: '1',
    });
  });

  it('parses a leading-quantity line without the x separator', () => {
    expect(OrderEmailParse.parseCardLine('3 Llanowar Elves')).toMatchObject({
      name: 'Llanowar Elves',
      quantity: 3,
    });
  });

  it('defaults quantity to 1 for a bare name', () => {
    expect(OrderEmailParse.parseCardLine('Mana Crypt')).toMatchObject({
      name: 'Mana Crypt',
      quantity: 1,
    });
  });

  it('extracts a standalone foil keyword and strips it from the name', () => {
    const parsed = OrderEmailParse.parseCardLine('1x Sol Ring foil');
    expect(parsed!.finish).toBe('foil');
    expect(parsed!.name).toBe('Sol Ring');
  });

  it('parses set-only printings', () => {
    expect(OrderEmailParse.parseCardLine('1x Sol Ring (cmm)')).toMatchObject({
      name: 'Sol Ring',
      set_code: 'cmm',
      collector_number: null,
    });
  });

  it('ignores comments, blanks, and totals', () => {
    expect(OrderEmailParse.parseCardLine('')).toBe(null);
    expect(OrderEmailParse.parseCardLine('# a comment')).toBe(null);
    expect(OrderEmailParse.parseCardLine('Total: $20')).toBe(null);
  });
});

describe('OrderEmailParse.parseCardList', () => {
  it('parses multiple lines and assigns ids', () => {
    const result = OrderEmailParse.parseCardList('2x Sol Ring (cmm) 1\n1 Llanowar Elves');
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].id).toBe('acq-0');
    expect(result.cards[1].id).toBe('acq-1');
  });
});

describe('OrderEmailParse.parseOrderEmail', () => {
  it('keeps likely card lines and skips prose', () => {
    const email = [
      'Hello, thanks for your order!',
      '2x Sol Ring (cmm) 1',
      'Shipping: $5',
      '1x Mana Crypt (2xm) 270',
    ].join('\n');
    const result = OrderEmailParse.parseOrderEmail(email);
    expect(result.cards.map((c) => c.name)).toEqual(['Sol Ring', 'Mana Crypt']);
    expect(result.skippedNonCardLines.length).toBeGreaterThan(0);
  });
});

describe('OrderEmailParse.mergeAcquiredCards', () => {
  it('merges duplicate cards by name/set/collector/finish and sums quantity', () => {
    const merged = OrderEmailParse.mergeAcquiredCards([
      { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: null, quantity: 1 },
      { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: null, quantity: 2 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
  });

  it('keeps different finishes separate', () => {
    const merged = OrderEmailParse.mergeAcquiredCards([
      { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: null, quantity: 1 },
      { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'foil', quantity: 1 },
    ]);
    expect(merged).toHaveLength(2);
  });
});
