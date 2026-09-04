import { describe, expect, it } from 'vitest';
import { buildGlanceIncludeSet, syncCardsWithFormalSwaps } from '@rayenz-hub/shared';
import { buildEligibleCommanderDeck } from '../../fixtures/deck-builder/glance-eligible.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

describe('deck-builder glance include-set', () => {
  it('accepts a 100-card eligible commander deck', () => {
    const deck = buildEligibleCommanderDeck();
    const result = buildGlanceIncludeSet(deck);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.quantitySum).toBe(100);
    expect(result.includeSet.commanders).toHaveLength(1);
    expect(result.includeSet.cards.every((c) => !c.isPlaceholder)).toBe(true);
    for (const card of result.includeSet.cards) {
      if (card.imageUrl?.includes('cards.scryfall.io')) {
        expect(card.imageUrl).toContain('/normal/');
      }
    }
  });

  it('pads underfull decks with placeholders to reach 100', () => {
    const result = buildGlanceIncludeSet(commander as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.quantitySum).toBe(100);
    const placeholders = result.includeSet.cards.filter((c) => c.isPlaceholder);
    expect(placeholders.length).toBeGreaterThan(0);
    expect(result.includeSet.nonLands.filter((c) => c.isPlaceholder)).toHaveLength(
      placeholders.length,
    );
    expect(placeholders.every((c) => c.instanceId.startsWith('glance-placeholder:'))).toBe(true);
    const main = result.includeSet.sections.find((s) => s.name === 'Main deck');
    expect(main?.cards.filter((c) => c.isPlaceholder)).toHaveLength(placeholders.length);
  });

  it('puts untargeted primary-category placeholders in To be chosen', () => {
    const base = buildEligibleCommanderDeck();
    const deck = { ...base, cards: base.cards.slice(0, 20) };
    const result = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placeholders = result.includeSet.cards.filter((c) => c.isPlaceholder);
    expect(placeholders).toHaveLength(80);
    const unassigned = result.includeSet.sections.find((s) => s.name === 'To be chosen');
    expect(unassigned?.cards.filter((c) => c.isPlaceholder)).toHaveLength(80);
    for (const section of result.includeSet.sections) {
      if (section.name === 'To be chosen') continue;
      expect(section.cards.some((c) => c.isPlaceholder)).toBe(false);
    }
  });

  it('fills primary-category target deficits before To be chosen', () => {
    const base = buildEligibleCommanderDeck();
    const deck = {
      ...base,
      cards: base.cards.slice(0, 20),
      categories: base.categories.map((c) =>
        c.name === 'Instant' ? { ...c, target: 25 } : c,
      ),
    };
    const result = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const instant = result.includeSet.sections.find((s) => s.name === 'Instant');
    expect(instant?.cards.filter((c) => c.isPlaceholder)).toHaveLength(6);
    expect(instant?.cards).toHaveLength(25);
    const unassigned = result.includeSet.sections.find((s) => s.name === 'To be chosen');
    expect(unassigned?.cards.filter((c) => c.isPlaceholder)).toHaveLength(74);
  });

  it('creates empty targeted categories and parks leftover faces in To be chosen', () => {
    const base = buildEligibleCommanderDeck();
    const forest = base.cards.find((c) => c.instanceId === 'forest-stack')!;
    const deck = {
      ...base,
      cards: [...base.cards.slice(0, 11), { ...forest, quantity: 3 }],
      categories: [
        ...base.categories,
        { name: 'Ramp', includedInDeck: true, includedInPrice: true, target: 5 },
      ],
    };
    const result = buildGlanceIncludeSet(deck, { mode: 'primary_category' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ramp = result.includeSet.sections.find((s) => s.name === 'Ramp');
    expect(ramp?.cards.filter((c) => c.isPlaceholder)).toHaveLength(5);
    const unassigned = result.includeSet.sections.find((s) => s.name === 'To be chosen');
    expect(unassigned?.cards.filter((c) => c.isPlaceholder)).toHaveLength(81);
    const names = result.includeSet.sections.map((s) => s.name);
    expect(names.indexOf('To be chosen')).toBeLessThan(names.indexOf('Land'));
  });

  it('rejects decks whose include-set exceeds 100', () => {
    const base = buildEligibleCommanderDeck();
    const deck = buildEligibleCommanderDeck({
      cards: [
        ...base.cards,
        {
          instanceId: 'extra-1',
          name: 'Extra Card',
          quantity: 1,
          primaryCategory: 'Creature',
          categories: ['Creature'],
          stack: null,
          setCode: 'm12',
          collectorNumber: '998',
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
      ],
    });
    const result = buildGlanceIncludeSet(deck);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('GLANCE_NOT_ELIGIBLE');
    expect(result.message).toMatch(/at most 100/);
  });

  it('excludes maybeboard from the include-set count', () => {
    const base = buildEligibleCommanderDeck();
    const deck = buildEligibleCommanderDeck({
      cards: [
        ...base.cards,
        {
          instanceId: 'maybe-1',
          name: 'Maybe Card',
          quantity: 1,
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          stack: null,
          setCode: 'm12',
          collectorNumber: '999',
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
      ],
      categories: [
        ...(base.categories || []),
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: false },
      ],
    });
    const result = buildGlanceIncludeSet(deck);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.cards.some((c) => c.instanceId === 'maybe-1')).toBe(false);
  });

  it('classifies DFCs by front face only (Creature // Land → main deck, Land // Creature → land)', () => {
    const base = buildEligibleCommanderDeck();
    const cards = base.cards.map((c) => ({ ...c }));
    const front = cards.find((c) => c.instanceId === 'spell-0')!;
    front.name = 'Beast That Roots';
    front.collectorNumber = '900';
    const back = cards.find((c) => c.instanceId === 'spell-1')!;
    back.name = 'Grove That Walks';
    back.collectorNumber = '901';

    const oracleEntry = (typeLine: string) => ({
      scryfallId: null,
      colourIdentity: ['G'],
      colours: ['G'],
      typeLine,
      layout: 'transform',
      keywords: null,
      partnerWith: null,
      oracleText: null,
      printedName: null,
      flavorName: null,
      manaValue: 3,
      imageUrl: null,
      finishes: null,
      updatedAt: null,
    });
    const oracle = {
      ...base.oracle,
      'print:m12:900': oracleEntry('Creature — Beast // Land — Forest'),
      'print:m12:901': oracleEntry('Land — Forest // Creature — Beast'),
    };

    const result = buildGlanceIncludeSet({ ...base, cards, oracle });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const nonLandIds = new Set(result.includeSet.nonLands.map((c) => c.instanceId));
    const landIds = new Set(result.includeSet.lands.map((c) => c.instanceId));
    expect(nonLandIds.has('spell-0')).toBe(true);
    expect(landIds.has('spell-0')).toBe(false);
    expect(landIds.has('spell-1')).toBe(true);
    expect(nonLandIds.has('spell-1')).toBe(false);
  });

  it('stays eligible when swapping one basic from a multi-qty forest stack', () => {
    const base = buildEligibleCommanderDeck();
    const swapIn = {
      instanceId: 'swap-in-basic',
      name: 'Swap In Land',
      quantity: 1,
      primaryCategory: 'Land',
      categories: ['Land'],
      stack: null,
      setCode: 'm12',
      collectorNumber: '998',
      scryfallId: null,
      archidektCardId: null,
      foil: false,
      proxy: false,
    };
    let n = 0;
    const queued = syncCardsWithFormalSwaps(
      {
        ...base,
        cards: [...base.cards, swapIn],
        formalSwapEntries: [
          {
            id: 'swap-basic-1',
            inInstanceId: 'swap-in-basic',
            outInstanceId: 'forest-stack',
            inTargetCategory: 'Land',
            sortIndex: 0,
            notes: null,
          },
        ],
      },
      undefined,
      { nextId: () => `forest-out-${++n}` },
    );
    const forest = queued.cards.find((c) => c.instanceId === 'forest-stack')!;
    expect(forest.quantity).toBe(18);
    expect(queued.formalSwapEntries[0]!.outInstanceId).toBe('forest-out-1');

    const result = buildGlanceIncludeSet(queued);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.quantitySum).toBe(100);
    expect(result.includeSet.cards.some((c) => c.instanceId === 'forest-out-1')).toBe(false);
    expect(result.includeSet.cards.some((c) => c.instanceId === 'swap-in-basic')).toBe(true);
  });

  it('includes same-name reprint In and excludes Out', () => {
    const base = buildEligibleCommanderDeck();
    const cards = base.cards.map((c) =>
      c.instanceId === 'spell-0'
        ? {
            ...c,
            name: 'Sol Ring',
            setCode: 'cma',
            collectorNumber: '1',
            scryfallId: 'sf-sol-old',
          }
        : { ...c },
    );
    const reprintIn = {
      instanceId: 'sol-reprint-in',
      name: 'Sol Ring',
      quantity: 1,
      primaryCategory: 'Instant',
      categories: ['Instant'],
      stack: null,
      setCode: 'sld',
      collectorNumber: '2683',
      scryfallId: 'sf-sol-new',
      archidektCardId: null,
      foil: false,
      proxy: false,
    };
    const deck = {
      ...base,
      cards: [...cards, reprintIn],
      formalSwapEntries: [
        {
          id: 'swap-reprint',
          inInstanceId: 'sol-reprint-in',
          outInstanceId: 'spell-0',
          inTargetCategory: 'Instant',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const result = buildGlanceIncludeSet(deck);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.quantitySum).toBe(100);
    expect(result.includeSet.cards.some((c) => c.instanceId === 'sol-reprint-in')).toBe(true);
    expect(result.includeSet.cards.some((c) => c.instanceId === 'spell-0')).toBe(false);
  });

  it('keeps pathological same-instance In/Out in the include set (In wins)', () => {
    const base = buildEligibleCommanderDeck();
    const cards = base.cards.map((c) =>
      c.instanceId === 'spell-0'
        ? {
            ...c,
            name: 'Sol Ring',
            setCode: 'sld',
            collectorNumber: '2683',
            scryfallId: 'sf-sol-new',
          }
        : { ...c },
    );
    const deck = {
      ...base,
      cards,
      formalSwapEntries: [
        {
          id: 'swap-same',
          inInstanceId: 'spell-0',
          outInstanceId: 'spell-0',
          inTargetCategory: 'Instant',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const result = buildGlanceIncludeSet(deck);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includeSet.quantitySum).toBe(100);
    expect(result.includeSet.cards.some((c) => c.instanceId === 'spell-0')).toBe(true);
  });
});
