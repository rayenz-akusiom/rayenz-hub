import { describe, it, expect } from 'vitest';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import {
  addOrBumpBasicPrinting,
  basicLandTypesForPanel,
  changeCardPrintingMerging,
  defaultBasicLandCategory,
  listBasicLandStacks,
  setCardQuantity,
  type DeckDocument,
  type PrintingFields,
} from '../../../packages/shared/src/index.ts';

function forestPrinting(overrides: Partial<PrintingFields> = {}): PrintingFields {
  return {
    name: 'Forest',
    scryfallId: 'sf-forest-m12',
    setCode: 'm12',
    collectorNumber: '246',
    typeLine: 'Basic Land — Forest',
    colourIdentity: ['G'],
    layout: 'normal',
    foil: false,
    printedName: null,
    flavorName: null,
    manaValue: 0,
    finishes: ['nonfoil', 'foil'],
    ...overrides,
  };
}

function withBasics(extra: DeckDocument['cards'] = []): DeckDocument {
  const base = commander as DeckDocument;
  return {
    ...base,
    cards: [
      ...base.cards.filter((c) => c.name !== 'Forest'),
      {
        instanceId: 'f-m12',
        name: 'Forest',
        quantity: 4,
        primaryCategory: 'Land',
        categories: ['Land'],
        stack: null,
        setCode: 'm12',
        collectorNumber: '246',
        scryfallId: 'sf-forest-m12',
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
      ...extra,
    ],
  };
}

describe('listBasicLandStacks', () => {
  it('returns basics and skips swap / seeking categories', () => {
    const doc = withBasics([
      {
        instanceId: 'f-out',
        name: 'Forest',
        quantity: 2,
        primaryCategory: 'Queued Out',
        categories: ['Queued Out', 'Land'],
        stack: null,
        setCode: 'neo',
        collectorNumber: '1',
        scryfallId: 'sf-out',
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
      {
        instanceId: 'f-seek',
        name: 'Forest',
        quantity: 1,
        primaryCategory: 'Seeking',
        categories: ['Seeking'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
    ]);
    const stacks = listBasicLandStacks(doc);
    expect(stacks.map((c) => c.instanceId)).toEqual(['f-m12']);
  });
});

describe('setCardQuantity', () => {
  it('updates quantity and removes at zero', () => {
    const doc = withBasics();
    const bumped = setCardQuantity(doc, 'f-m12', 7);
    expect(bumped.cards.find((c) => c.instanceId === 'f-m12')?.quantity).toBe(7);

    const removed = setCardQuantity(bumped, 'f-m12', 0);
    expect(removed.cards.find((c) => c.instanceId === 'f-m12')).toBeUndefined();
  });
});

describe('addOrBumpBasicPrinting', () => {
  it('bumps matching stack and adds distinct printings', () => {
    const doc = withBasics();
    const bumped = addOrBumpBasicPrinting(doc, forestPrinting(), { quantity: 2 });
    expect(bumped.cards.find((c) => c.instanceId === 'f-m12')?.quantity).toBe(6);

    const other = addOrBumpBasicPrinting(
      bumped,
      forestPrinting({
        scryfallId: 'sf-forest-unf',
        setCode: 'unf',
        collectorNumber: '262',
      }),
      { quantity: 3 },
    );
    const stacks = listBasicLandStacks(other).filter((c) => c.name === 'Forest');
    expect(stacks).toHaveLength(2);
    expect(stacks.find((c) => c.setCode === 'unf')?.quantity).toBe(3);
  });

  it('treats foil and proxy as distinct stacks', () => {
    const doc = withBasics();
    const foil = addOrBumpBasicPrinting(doc, forestPrinting({ foil: true }), { quantity: 2 });
    expect(listBasicLandStacks(foil).filter((c) => c.name === 'Forest')).toHaveLength(2);

    const proxy = addOrBumpBasicPrinting(foil, forestPrinting(), { quantity: 1, proxy: true });
    expect(listBasicLandStacks(proxy).filter((c) => c.name === 'Forest')).toHaveLength(3);
  });

  it('uses Land category by default when present', () => {
    const base = commander as DeckDocument;
    const empty: DeckDocument = {
      ...base,
      cards: base.cards.filter((c) => !isBasicName(c.name)),
    };
    const next = addOrBumpBasicPrinting(empty, forestPrinting(), { quantity: 5 });
    const stack = next.cards.find((c) => c.name === 'Forest');
    expect(stack?.primaryCategory).toBe('Land');
    expect(stack?.quantity).toBe(5);
    expect(defaultBasicLandCategory(empty)).toBe('Land');
  });
});

describe('changeCardPrintingMerging', () => {
  it('merges into an existing matching stack', () => {
    const doc = withBasics([
      {
        instanceId: 'f-unf',
        name: 'Forest',
        quantity: 3,
        primaryCategory: 'Land',
        categories: ['Land'],
        stack: null,
        setCode: 'unf',
        collectorNumber: '262',
        scryfallId: 'sf-forest-unf',
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
    ]);
    const merged = changeCardPrintingMerging(doc, 'f-unf', forestPrinting());
    expect(merged.cards.find((c) => c.instanceId === 'f-unf')).toBeUndefined();
    expect(merged.cards.find((c) => c.instanceId === 'f-m12')?.quantity).toBe(7);
  });
});

describe('basicLandTypesForPanel', () => {
  it('includes present types and core WUBRG when CI unknown', () => {
    const doc = withBasics();
    const types = basicLandTypesForPanel(doc);
    expect(types).toContain('Forest');
    expect(types).toContain('Plains');
    expect(types).not.toContain('Snow-Covered Forest');
  });
});

function isBasicName(name: string): boolean {
  return /^(snow-covered\s+)?(plains|island|swamp|mountain|forest|wastes)$/i.test(name);
}
