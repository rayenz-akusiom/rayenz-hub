import { describe, it, expect } from 'vitest';
import {
  canPartner,
  collectCommanderGalleryExtraIds,
  parsePartnerWithName,
  pickCommanderLeaders,
  pickCommanderPair,
  type CardInstance,
} from '@rayenz-hub/shared';

function card(
  over: Partial<CardInstance> & Pick<CardInstance, 'name' | 'instanceId' | 'primaryCategory'>,
): CardInstance {
  return {
    quantity: 1,
    categories: [over.primaryCategory],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    colourIdentity: [],
    typeLine: 'Legendary Creature',
    layout: 'normal',
    keywords: null,
    partnerWith: null,
    archidektCardId: null,
    foil: false,
    ...over,
  };
}

describe('parsePartnerWithName', () => {
  it('extracts the partner name before reminder text', () => {
    expect(
      parsePartnerWithName(
        'Partner with Alena, Kessig Trapper (When this creature enters…)\nReach',
      ),
    ).toBe('Alena, Kessig Trapper');
  });

  it('returns null when absent', () => {
    expect(parsePartnerWithName('Flying\nPartner')).toBeNull();
  });
});

describe('canPartner', () => {
  it('allows two classic Partner cards', () => {
    expect(
      canPartner(
        card({
          instanceId: '1',
          name: 'Ikra Shidiqi, the Usurper',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
        card({
          instanceId: '2',
          name: 'Reyhan, Last of the Abzan',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
      ),
    ).toBe(true);
  });

  it('rejects Partner with a Friends forever card', () => {
    expect(
      canPartner(
        card({
          instanceId: '1',
          name: 'Partner A',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
        card({
          instanceId: '2',
          name: 'Friend B',
          primaryCategory: 'Commander',
          keywords: ['Friends forever'],
        }),
      ),
    ).toBe(false);
  });

  it('allows Partner with when names match', () => {
    expect(
      canPartner(
        card({
          instanceId: '1',
          name: 'Halana, Kessig Ranger',
          primaryCategory: 'Commander',
          keywords: ['Partner with'],
          partnerWith: 'Alena, Kessig Trapper',
        }),
        card({
          instanceId: '2',
          name: 'Alena, Kessig Trapper',
          primaryCategory: 'Commander',
          keywords: ['Partner with'],
          partnerWith: 'Halana, Kessig Ranger',
        }),
      ),
    ).toBe(true);
  });

  it('rejects Partner with when names do not match', () => {
    expect(
      canPartner(
        card({
          instanceId: '1',
          name: 'Halana, Kessig Ranger',
          primaryCategory: 'Commander',
          keywords: ['Partner with'],
          partnerWith: 'Alena, Kessig Trapper',
        }),
        card({
          instanceId: '2',
          name: 'Ikra Shidiqi, the Usurper',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
      ),
    ).toBe(false);
  });

  it('allows Friends forever pairs', () => {
    expect(
      canPartner(
        card({
          instanceId: '1',
          name: 'Eleven, the Mage',
          primaryCategory: 'Commander',
          keywords: ['Friends forever'],
        }),
        card({
          instanceId: '2',
          name: 'Mike, the Dungeon Master',
          primaryCategory: 'Commander',
          keywords: ['Friends forever'],
        }),
      ),
    ).toBe(true);
  });

  it("allows Doctor's companion with a Time Lord Doctor", () => {
    expect(
      canPartner(
        card({
          instanceId: '1',
          name: 'The Tenth Doctor',
          primaryCategory: 'Commander',
          typeLine: 'Legendary Creature — Time Lord Doctor',
          keywords: [],
        }),
        card({
          instanceId: '2',
          name: 'Rose Tyler',
          primaryCategory: 'Commander',
          keywords: ["Doctor's companion"],
        }),
      ),
    ).toBe(true);
  });

  it('allows Choose a Background with a Background enchantment', () => {
    expect(
      canPartner(
        card({
          instanceId: '1',
          name: 'Wilson, Refined Grizzly',
          primaryCategory: 'Commander',
          keywords: ['Choose a Background'],
        }),
        card({
          instanceId: '2',
          name: 'Folk Hero',
          primaryCategory: 'Commander',
          typeLine: 'Legendary Enchantment — Background',
          keywords: [],
        }),
      ),
    ).toBe(true);
  });

  it('does not treat Partner with as classic Partner', () => {
    expect(
      canPartner(
        card({
          instanceId: '1',
          name: 'Halana, Kessig Ranger',
          primaryCategory: 'Commander',
          keywords: ['Partner with'],
          partnerWith: 'Alena, Kessig Trapper',
        }),
        card({
          instanceId: '2',
          name: 'Ikra Shidiqi, the Usurper',
          primaryCategory: 'Commander',
          keywords: ['Partner'],
        }),
      ),
    ).toBe(false);
  });
});

describe('pickCommanderPair', () => {
  it('returns none / single / many among Commander cards only', () => {
    expect(pickCommanderPair([])).toEqual({ status: 'none' });
    expect(
      pickCommanderPair([
        card({ instanceId: '1', name: 'A', primaryCategory: 'Commander', keywords: ['Partner'] }),
      ]).status,
    ).toBe('single');
    expect(
      pickCommanderPair([
        card({ instanceId: '1', name: 'A', primaryCategory: 'Commander' }),
        card({ instanceId: '2', name: 'B', primaryCategory: 'Commander' }),
        card({ instanceId: '3', name: 'C', primaryCategory: 'Commander' }),
      ]).status,
    ).toBe('many');
  });

  it('ignores Lieutenants when pairing commanders', () => {
    const result = pickCommanderPair([
      card({
        instanceId: '1',
        name: 'A',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({
        instanceId: '2',
        name: 'B',
        primaryCategory: 'Lieutenants',
        keywords: ['Partner'],
      }),
    ]);
    expect(result.status).toBe('single');
    expect(result.a?.name).toBe('A');
  });

  it('marks legal, illegal, and unknown two-commander pairs', () => {
    const legal = pickCommanderPair([
      card({
        instanceId: '1',
        name: 'A',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({
        instanceId: '2',
        name: 'B',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
    ]);
    expect(legal.status).toBe('legal');

    const illegal = pickCommanderPair([
      card({
        instanceId: '1',
        name: 'A',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({
        instanceId: '2',
        name: 'B',
        primaryCategory: 'Commander',
        keywords: ['Friends forever'],
      }),
    ]);
    expect(illegal.status).toBe('illegal');

    const unknown = pickCommanderPair([
      card({
        instanceId: '1',
        name: 'A',
        primaryCategory: 'Commander',
        keywords: null,
      }),
      card({
        instanceId: '2',
        name: 'B',
        primaryCategory: 'Commander',
        keywords: null,
      }),
    ]);
    expect(unknown.status).toBe('unknown');
  });

  it('treats same-name commander printings as a single (gallery), not illegal', () => {
    const pair = pickCommanderPair([
      card({
        instanceId: '1',
        name: 'Kytheon, Hero of Akros',
        primaryCategory: 'Commander',
        keywords: [],
      }),
      card({
        instanceId: '2',
        name: 'Kytheon, Hero of Akros',
        primaryCategory: 'Commander',
        keywords: [],
      }),
      card({
        instanceId: '3',
        name: 'Kytheon, Hero of Akros',
        primaryCategory: 'Commander',
        keywords: [],
      }),
    ]);
    expect(pair.status).toBe('single');
    expect(pair.a?.instanceId).toBe('1');
  });

  it('partners across name groups even when one side has a printing gallery', () => {
    const pair = pickCommanderPair([
      card({
        instanceId: '1',
        name: 'Thrasios, Triton Hero',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({
        instanceId: '2',
        name: 'Thrasios, Triton Hero',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
      card({
        instanceId: '3',
        name: 'Tymna the Weaver',
        primaryCategory: 'Commander',
        keywords: ['Partner'],
      }),
    ]);
    expect(pair.status).toBe('legal');
    expect(pair.a?.name).toBe('Thrasios, Triton Hero');
    expect(pair.b?.name).toBe('Tymna the Weaver');
  });
});

describe('pickCommanderLeaders', () => {
  it('builds a gallery with coverInstanceId as primary', () => {
    const leaders = pickCommanderLeaders(
      [
        card({
          instanceId: '1',
          name: 'Kytheon, Hero of Akros',
          primaryCategory: 'Commander',
        }),
        card({
          instanceId: '2',
          name: 'Kytheon, Hero of Akros',
          primaryCategory: 'Commander',
        }),
      ],
      '2',
    );
    expect(leaders.kind).toBe('gallery');
    expect(leaders.primaries[0]?.instanceId).toBe('2');
    expect(leaders.groups[0]?.cards).toHaveLength(2);
  });
});

describe('collectCommanderGalleryExtraIds', () => {
  it('returns non-primary same-name commander instance ids', () => {
    const extras = collectCommanderGalleryExtraIds(
      [
        card({
          instanceId: '1',
          name: 'Kytheon, Hero of Akros',
          primaryCategory: 'Commander',
        }),
        card({
          instanceId: '2',
          name: 'Kytheon, Hero of Akros',
          primaryCategory: 'Commander',
        }),
        card({
          instanceId: '3',
          name: 'Sol Ring',
          primaryCategory: 'Ramp',
        }),
      ],
      '2',
    );
    expect([...extras]).toEqual(['1']);
  });
});
