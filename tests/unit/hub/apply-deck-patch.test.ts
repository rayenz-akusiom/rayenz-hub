import { describe, expect, it } from 'vitest';
import {
  applyDeckPatch,
  DeckDocumentSchema,
  DeckPatchApplyError,
  type DeckDocument,
} from '../../../packages/shared/src/index.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

function baseDeck(): DeckDocument {
  return DeckDocumentSchema.parse(commander);
}

describe('applyDeckPatch', () => {
  it('rejects empty patch', () => {
    expect(() => applyDeckPatch(baseDeck(), {})).toThrow(DeckPatchApplyError);
    try {
      applyDeckPatch(baseDeck(), { expectedUpdatedAt: baseDeck().updatedAt });
    } catch (e) {
      expect(e).toBeInstanceOf(DeckPatchApplyError);
      expect((e as DeckPatchApplyError).code).toBe('EMPTY_PATCH');
    }
  });

  it('rejects expectedUpdatedAt conflict', () => {
    try {
      applyDeckPatch(baseDeck(), {
        expectedUpdatedAt: '1999-01-01T00:00:00.000Z',
        name: 'X',
      });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckPatchApplyError);
      expect((e as DeckPatchApplyError).code).toBe('CONFLICT');
    }
  });

  it('adds, updates, and removes cards', () => {
    const deck = baseDeck();
    const next = applyDeckPatch(deck, {
      expectedUpdatedAt: deck.updatedAt,
      cardOps: [
        {
          op: 'add',
          card: {
            name: 'Sol Ring',
            primaryCategory: 'Artifact',
            categories: ['Artifact'],
            instanceId: 'c-sol',
          },
        },
        {
          op: 'update',
          instanceId: 'c1',
          patch: { primaryCategory: 'Ramp', foil: true },
        },
        { op: 'remove', instanceId: 'c3' },
      ],
    });

    expect(next.cards.find((c) => c.instanceId === 'c-sol')?.name).toBe('Sol Ring');
    expect(next.cards.find((c) => c.instanceId === 'c1')?.primaryCategory).toBe('Ramp');
    expect(next.cards.find((c) => c.instanceId === 'c1')?.foil).toBe(true);
    expect(next.cards.find((c) => c.instanceId === 'c3')).toBeUndefined();
    expect(next.categories.some((c) => c.name === 'Artifact')).toBe(true);
    expect(next.categories.some((c) => c.name === 'Ramp')).toBe(true);
    expect(next.updatedAt).not.toBe(deck.updatedAt);
  });

  it('throws on unknown card instanceId', () => {
    try {
      applyDeckPatch(baseDeck(), {
        cardOps: [{ op: 'remove', instanceId: 'nope' }],
      });
      expect.fail('should throw');
    } catch (e) {
      expect((e as DeckPatchApplyError).code).toBe('UNKNOWN_INSTANCE');
    }
  });

  it('applies formal swap and looking-for ops', () => {
    const deck = baseDeck();
    const withSwap = applyDeckPatch(deck, {
      formalSwapOps: [
        {
          op: 'add',
          entry: {
            id: 'swap-1',
            outInstanceId: 'c1',
            inInstanceId: null,
            inTargetCategory: null,
            sortIndex: 0,
          },
        },
      ],
    });
    expect(withSwap.formalSwapEntries).toHaveLength(1);
    expect(withSwap.formalSwapEntries[0]!.outInstanceId).toBe('c1');
    expect(withSwap.cards.find((c) => c.instanceId === 'c1')?.primaryCategory).toBe('Queued Out');

    const updated = applyDeckPatch(withSwap, {
      formalSwapOps: [
        {
          op: 'update',
          id: 'swap-1',
          patch: { notes: 'cut for set' },
        },
      ],
      lookingForOps: [
        {
          op: 'add',
          entry: {
            id: 'lf-1',
            instanceId: 'c2',
            sortIndex: 0,
          },
        },
      ],
    });
    expect(updated.formalSwapEntries[0]!.notes).toBe('cut for set');
    expect(updated.lookingForEntries.some((e) => e.id === 'lf-1' && e.instanceId === 'c2')).toBe(
      true,
    );

    const cleared = applyDeckPatch(updated, {
      formalSwapOps: [{ op: 'remove', id: 'swap-1' }],
      lookingForOps: [{ op: 'remove', id: 'lf-1' }],
    });
    expect(cleared.formalSwapEntries).toHaveLength(0);
    expect(cleared.lookingForEntries.some((e) => e.id === 'lf-1')).toBe(false);
  });

  it('throws on unknown swap / looking-for ids', () => {
    try {
      applyDeckPatch(baseDeck(), {
        formalSwapOps: [{ op: 'remove', id: 'missing-swap' }],
      });
      expect.fail('should throw');
    } catch (e) {
      expect((e as DeckPatchApplyError).code).toBe('UNKNOWN_SWAP_ENTRY');
    }

    try {
      applyDeckPatch(baseDeck(), {
        lookingForOps: [{ op: 'remove', id: 'missing-lf' }],
      });
      expect.fail('should throw');
    } catch (e) {
      expect((e as DeckPatchApplyError).code).toBe('UNKNOWN_LOOKING_FOR');
    }
  });

  it('merges scalar meta and oracle keys', () => {
    const deck = baseDeck();
    const next = applyDeckPatch(deck, {
      name: 'Renamed Fixture',
      coverInstanceId: 'c1',
      oracle: {
        'name:Sol Ring': {
          scryfallId: null,
          colourIdentity: [],
          typeLine: 'Artifact',
          layout: null,
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 1,
          imageUrl: null,
          colours: null,
          finishes: null,
          updatedAt: null,
        },
      },
    });
    expect(next.name).toBe('Renamed Fixture');
    expect(next.coverInstanceId).toBe('c1');
    expect(next.oracle['name:Sol Ring']?.typeLine).toBe('Artifact');
  });
});
