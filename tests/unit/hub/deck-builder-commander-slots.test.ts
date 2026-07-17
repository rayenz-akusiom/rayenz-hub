import { describe, it, expect } from 'vitest';
import { placeCardInCommanderSlot, type CardInstance } from '@rayenz-hub/shared';

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

describe('placeCardInCommanderSlot', () => {
  it('places into an empty commander list', () => {
    const cards = [
      card({ instanceId: 'r', name: 'Ramp', primaryCategory: 'Ramp' }),
      card({ instanceId: 'c', name: 'Cmd', primaryCategory: 'Ramp' }),
    ];
    const next = placeCardInCommanderSlot(cards, 'c', 0);
    expect(next.map((c) => c.instanceId)).toEqual(['r', 'c']);
    expect(next.find((c) => c.instanceId === 'c')?.primaryCategory).toBe('Commander');
  });

  it('adds to slot 1 beside an existing commander', () => {
    const cards = [
      card({ instanceId: 'a', name: 'A', primaryCategory: 'Commander' }),
      card({ instanceId: 'b', name: 'B', primaryCategory: 'Ramp' }),
    ];
    const next = placeCardInCommanderSlot(cards, 'b', 1);
    const commanders = next.filter((c) => c.primaryCategory === 'Commander');
    expect(commanders.map((c) => c.instanceId)).toEqual(['a', 'b']);
  });

  it('displaces the sole commander to slot 1 when dropping onto slot 0', () => {
    const cards = [
      card({ instanceId: 'a', name: 'A', primaryCategory: 'Commander' }),
      card({ instanceId: 'b', name: 'B', primaryCategory: 'Ramp' }),
    ];
    const next = placeCardInCommanderSlot(cards, 'b', 0);
    const commanders = next.filter((c) => c.primaryCategory === 'Commander');
    expect(commanders.map((c) => c.instanceId)).toEqual(['b', 'a']);
  });

  it('swaps two commanders when dropping one onto the other slot', () => {
    const cards = [
      card({ instanceId: 'a', name: 'A', primaryCategory: 'Commander' }),
      card({ instanceId: 'b', name: 'B', primaryCategory: 'Commander' }),
      card({ instanceId: 'r', name: 'Ramp', primaryCategory: 'Ramp' }),
    ];
    const next = placeCardInCommanderSlot(cards, 'b', 0);
    const commanders = next.filter((c) => c.primaryCategory === 'Commander');
    expect(commanders.map((c) => c.instanceId)).toEqual(['b', 'a']);
    expect(next.map((c) => c.instanceId)).toEqual(['b', 'a', 'r']);
  });

  it('preserves non-commander order around the commander block', () => {
    const cards = [
      card({ instanceId: 'x', name: 'X', primaryCategory: 'Ramp' }),
      card({ instanceId: 'a', name: 'A', primaryCategory: 'Commander' }),
      card({ instanceId: 'y', name: 'Y', primaryCategory: 'Land' }),
    ];
    const next = placeCardInCommanderSlot(cards, 'y', 1);
    expect(next.map((c) => `${c.instanceId}:${c.primaryCategory}`)).toEqual([
      'x:Ramp',
      'a:Commander',
      'y:Commander',
    ]);
  });
});
