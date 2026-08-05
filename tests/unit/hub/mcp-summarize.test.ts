import { describe, it, expect } from 'vitest';
import type { DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';
import { listSwapsResolved, summarizeDeck } from '../../../packages/mcp/src/lib/summarize-deck.ts';
import { profileLookupKeys } from '../../../packages/mcp/src/lib/profile-keys.ts';
import { parseSetCodesFromText, slugifySetName } from '../../../packages/mcp/src/lib/scryfall.ts';
import { HUB_MCP_TOOL_NAMES } from '../../../packages/mcp/src/register-tools.ts';

function sampleDeck(): DeckDocument {
  return {
    schemaVersion: 1,
    deckId: 'deck-1',
    name: 'Test Commander',
    format: 'commander',
    archidektId: 99,
    archidektUrl: 'https://archidekt.com/decks/99',
    categories: [
      { name: 'Commander', includedInDeck: true, includedInPrice: true, target: null },
      { name: 'Artifact', includedInDeck: true, includedInPrice: true, target: null },
    ],
    cards: [
      {
        instanceId: 'cmd',
        name: 'Atraxa, Praetors\' Voice',
        quantity: 1,
        primaryCategory: 'Commander',
        categories: ['Commander'],
        stack: null,
        setCode: 'c16',
        collectorNumber: '1',
        scryfallId: null,
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
      {
        instanceId: 'in1',
        name: 'Sol Ring',
        quantity: 1,
        primaryCategory: 'Artifact',
        categories: ['Artifact'],
        stack: null,
        setCode: 'c21',
        collectorNumber: '263',
        scryfallId: null,
        archidektCardId: null,
        foil: false,
        proxy: true,
      },
      {
        instanceId: 'out1',
        name: 'Mind Stone',
        quantity: 1,
        primaryCategory: 'Artifact',
        categories: ['Artifact'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
    ],
    oracle: {
      'print:c16:1': {
        scryfallId: null,
        colourIdentity: ['W', 'U', 'B', 'G'],
        typeLine: 'Legendary Creature — Phyrexian Angel Horror',
        layout: null,
        keywords: null,
        partnerWith: null,
        oracleText: null,
        printedName: null,
        flavorName: null,
        manaValue: 4,
        imageUrl: null,
        colours: null,
        finishes: null,
        updatedAt: null,
      },
    },
    formalSwapEntries: [
      {
        id: 's1',
        inInstanceId: 'in1',
        outInstanceId: 'out1',
        inTargetCategory: 'Artifact',
        sortIndex: 0,
        notes: null,
      },
      {
        id: 's2',
        inInstanceId: null,
        outInstanceId: 'out1',
        inTargetCategory: null,
        sortIndex: 1,
        notes: 'draft',
      },
    ],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
  };
}

describe('mcp summarize + helpers', () => {
  it('registers the expected tool names', () => {
    expect(HUB_MCP_TOOL_NAMES).toContain('hub_list_decks');
    expect(HUB_MCP_TOOL_NAMES).toContain('hub_patch_deck');
    expect(HUB_MCP_TOOL_NAMES).toContain('scryfall_fetch_set_cards');
    expect(HUB_MCP_TOOL_NAMES).toHaveLength(20);
  });

  it('profileLookupKeys tries deckId and archidekt aliases', () => {
    expect(profileLookupKeys({ deckId: 'abc', archidektId: 99 })).toEqual([
      'abc',
      '99',
      'deck-99',
    ]);
  });

  it('summarizeDeck reports commanders, proxies, and swap completeness', () => {
    const summary = summarizeDeck(sampleDeck(), {
      protectedCards: ['Pet Card'],
      profileKey: 'deck-1',
    });
    expect(summary.commanders).toContain("Atraxa, Praetors' Voice");
    expect(summary.colourIdentity).toEqual(['W', 'U', 'B', 'G']);
    expect(summary.ownership).toBe('owned');
    expect(summary.proxyCount).toBe(1);
    expect(summary.formalSwaps.total).toBe(2);
    expect(summary.formalSwaps.complete).toBe(1);
    expect(summary.formalSwaps.incomplete).toBe(1);
    expect(summary.protectedCards).toEqual(['Pet Card']);
  });

  it('listSwapsResolved includes card names', () => {
    const swaps = listSwapsResolved(sampleDeck());
    expect(swaps.formalSwapEntries[0].inName).toBe('Sol Ring');
    expect(swaps.formalSwapEntries[0].outName).toBe('Mind Stone');
  });

  it('parses Wizards Collecting set codes from text', () => {
    expect(slugifySetName('Magic: The Gathering | Marvel Super Heroes')).toBe(
      'marvel-super-heroes',
    );
    const parsed = parseSetCodesFromText(
      'Marvel Super Heroes Set Code: MSH Something Commander Set Code: MSC',
    );
    expect(parsed.map((p) => p.code)).toEqual(['MSH', 'MSC']);
  });
});
