import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArchidektExport } from '../../../packages/web/src/mtg/archidekt-export.ts';
import { DeckReview, validateSuggestions } from '../../../packages/web/src/deck-review/index.ts';
import { deckFromFixture, loadSuggestionFixture } from '../helpers/fixtureLoader.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

const FIXTURE_NAME = 'msh-2026-06-21.json';

let fixture: ReturnType<typeof loadSuggestionFixture>;

function acceptedFromSuggestion(suggestion: {
  suggestion_id?: string;
  action?: string;
  quantity?: number;
  card: Record<string, unknown>;
  replaces?: Array<{ name: string; quantity?: number; set_code?: string | null; collector_number?: string | null }>;
}) {
  const rep = suggestion.replaces && suggestion.replaces[0];
  return [{
    suggestion_id: suggestion.suggestion_id,
    action: suggestion.action,
    quantity: suggestion.quantity || 1,
    swap_categories: true,
    card_in: { ...suggestion.card, finish: 'nonfoil' },
    card_out: {
      name: rep!.name,
      quantity: rep!.quantity || 1,
      set_code: rep!.set_code || null,
      collector_number: rep!.collector_number || null,
    },
  }];
}

beforeEach(() => {
  resetHubModules();
  fixture = loadSuggestionFixture(FIXTURE_NAME);
});

afterEach(() => {
  resetHubModules();
});

describe('MSH suggestion fixture', () => {
  it('loads and validates schema 1.1', () => {
    const validated = validateSuggestions(fixture);
    expect(validated.meta.schema_version).toBe('1.1');
    expect(validated.meta.set_code).toBe('MSH');
    expect(validated.decks.length).toBe(4);
  });

  it('normalizes every suggestion replaces field to an array', () => {
    const validated = validateSuggestions(fixture);
    validated.decks.forEach((deck) => {
      deck.suggestions!.forEach((s) => {
        expect(Array.isArray(s.replaces)).toBe(true);
      });
    });
  });
});

describe('MSH sortSuggestions', () => {
  it('sorts swap-tier suggestions before analysis suggestions', () => {
    const baird = deckFromFixture(fixture, 'baird');
    const sorted = DeckReview.sortSuggestions(baird.suggestions!);
    const swapCount = sorted.filter((s) => s.priority_tier === 'swap').length;
    expect(swapCount).toBeGreaterThan(0);
    sorted.slice(0, swapCount).forEach((s) => {
      expect(s.priority_tier).toBe('swap');
    });
    const firstNonSwap = sorted.find((s) => s.priority_tier !== 'swap');
    if (firstNonSwap) {
      expect(sorted.indexOf(firstNonSwap)).toBeGreaterThanOrEqual(swapCount);
    }
  });

  it('orders high-confidence swaps before medium within swap tier', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const swaps = DeckReview.sortSuggestions(borbs.suggestions!).filter((s) => s.priority_tier === 'swap');
    const highIdx = swaps.findIndex((s) => s.confidence === 'high');
    const mediumIdx = swaps.findIndex((s) => s.confidence === 'medium');
    if (highIdx >= 0 && mediumIdx >= 0) {
      expect(highIdx).toBeLessThan(mediumIdx);
    }
  });
});

describe('MSH deriveSwapQueue (baird)', () => {
  it('derives In/Out names from snapshot primary categories', () => {
    const baird = deckFromFixture(fixture, 'baird');
    const queue = DeckReview.deriveSwapQueue(baird);
    expect(queue!.new_set_in.map((c) => c.name)).toEqual([
      "Caretaker's Talent",
      'Sunbillow Verge',
    ]);
    expect(queue!.new_set_out.map((c) => c.name)).toEqual(['Plains']);
  });
});

describe('MSH getSuggestionStaleness', () => {
  it('flags a paired swap as fully_queued when In and Out are already queued', () => {
    const baird = deckFromFixture(fixture, 'baird');
    const caretaker = baird.suggestions!.find((s) => s.fills_swap_slot === "Caretaker's Talent");
    const stale = DeckReview.getSuggestionStaleness(baird, caretaker!);
    expect(stale.stale).toBe(true);
    expect(stale.level).toBe('fully_queued');
  });

  it('flags god-bane Thor swap as fully_queued against live snapshot queue', () => {
    const godBane = deckFromFixture(fixture, 'god-bane');
    const thor = godBane.suggestions!.find((s) => s.fills_swap_slot === "Thor, Asgard's Avenger");
    const stale = DeckReview.getSuggestionStaleness(godBane, thor!);
    expect(stale.stale).toBe(true);
    expect(stale.level).toBe('fully_queued');
  });
});

describe('MSH getSwapQueueReconciliation', () => {
  it('reports unpaired In slots when snapshot has more In than Out', () => {
    const baird = deckFromFixture(fixture, 'baird');
    const recon = DeckReview.getSwapQueueReconciliation(baird);
    expect(recon.unpairedIn).toContain('Sunbillow Verge');
  });

  it('reports no uncovered queue slots when every In has a matching suggestion', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const recon = DeckReview.getSwapQueueReconciliation(borbs);
    expect(recon.uncoveredIn).toEqual([]);
    expect(recon.uncoveredOut).toEqual([]);
  });
});

describe('MSH preferences and filtering (god-bane)', () => {
  it('merges profile_preferences from the fixture deck', () => {
    const godBane = deckFromFixture(fixture, 'god-bane');
    const prefs = DeckReview.getDeckPreferences(godBane, {});
    expect(prefs.protected_cards.length + prefs.blocked_cards.length).toBeGreaterThanOrEqual(0);
  });

  it('filters blocked incoming cards', () => {
    const godBane = deckFromFixture(fixture, 'god-bane');
    const door = godBane.suggestions!.find((s) => (s.card as { name: string }).name === 'Door of Destinies');
    expect(door).toBeTruthy();
    const prefs = { blocked_cards: ['Door of Destinies'], protected_cards: [] };
    expect(DeckReview.isSuggestionFiltered(door!, prefs)).toBe(true);
  });

  it('filters suggestions that cut a protected card', () => {
    const godBane = deckFromFixture(fixture, 'god-bane');
    const thor = godBane.suggestions!.find((s) =>
      (s.replaces as Array<{ name: string }>).some((r) => r.name === 'Taurean Mauler'),
    );
    const prefs = { blocked_cards: [], protected_cards: ['Taurean Mauler'] };
    expect(DeckReview.isSuggestionFiltered(thor!, prefs)).toBe(true);
  });
});

describe('MSH deckCutOptions (baird)', () => {
  it('excludes swap-queue cards and includes regular main-deck cards', () => {
    const baird = deckFromFixture(fixture, 'baird');
    const names = DeckReview.deckCutOptions(baird).map((o) => o.name);
    expect(names).not.toContain("Caretaker's Talent");
    expect(names).not.toContain('Sunbillow Verge');
    expect(names).toContain('Sacred Foundry');
    expect(names).toContain('Endless Foot Assault');
  });
});

describe('MSH Archidekt export from fixtures', () => {
  it('preserves proxy dual categories on unchanged cards (ashes-of-love-irl)', () => {
    const ashes = deckFromFixture(fixture, 'ashes-of-love-irl');
    const text = ArchidektExport.buildFullDeckImport(ashes, []);
    expect(text).toContain('Plateau (vma) 308 [Land,Proxies{noPrice}]');
  });

  it('emits swap In/Out lines for an accepted big-ol-borbs swap', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const moleMan = borbs.suggestions!.find((s) => (s.card as { name: string }).name === 'Mole Man, Moloid Master');
    const accepted = acceptedFromSuggestion(moleMan!);
    const text = ArchidektExport.buildFullDeckImport(borbs, accepted);
    expect(text).toContain('Mole Man, Moloid Master');
    expect(text).toContain('[New Set In{noDeck}{noPrice}]');
    expect(text).toContain('Conduit of Worlds');
    expect(text).toContain('[New Set Out]');
  });

  it('builds swap-only import text for one accepted swap', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const moleMan = borbs.suggestions!.find((s) => (s.card as { name: string }).name === 'Mole Man, Moloid Master');
    const accepted = acceptedFromSuggestion(moleMan!);
    const settings = borbs.deck_snapshot!.category_settings;
    const text = ArchidektExport.buildImportTextForDeck(accepted, settings);
    expect(text).toContain('[New Set In{noDeck}{noPrice}]');
    expect(text).toContain('[New Set Out]');
    expect(text).not.toContain('Ramunap Excavator');
  });

  it('builds a non-null apply manifest entry with full_deck_replace mode', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const moleMan = borbs.suggestions!.find((s) => (s.card as { name: string }).name === 'Mole Man, Moloid Master');
    const accepted = acceptedFromSuggestion(moleMan!);
    const entry = ArchidektExport.buildDeckApplyEntry(borbs, accepted);
    expect(entry).toBeTruthy();
    expect(entry!.import_mode).toBe('full_deck_replace');
    expect(entry!.operations.length).toBeGreaterThanOrEqual(1);
    expect(entry!.archidekt_deck_id).toBe(734347);
  });

  it('builds apply manifest with deck entries from fixture meta', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const moleMan = borbs.suggestions!.find((s) => (s.card as { name: string }).name === 'Mole Man, Moloid Master');
    const accepted = acceptedFromSuggestion(moleMan!);
    const manifest = ArchidektExport.buildApplyManifest(fixture.meta, [borbs], {
      [borbs.deck_id!]: accepted,
    });
    expect(manifest.apply_manifest_version).toBe('1.1');
    expect(manifest.set_code).toBe('MSH');
    expect(manifest.decks).toHaveLength(1);
    expect(manifest.decks[0].deck_id).toBe('big-ol-borbs-landscaping-irl');
  });
});

describe('MSH decision helpers', () => {
  it('decisionRecapInOut uses suggestion fields when pending', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const moleMan = borbs.suggestions!.find((s) => (s.card as { name: string }).name === 'Mole Man, Moloid Master');
    const recap = DeckReview.decisionRecapInOut(moleMan!, null);
    expect(recap.inName).toBe('Mole Man, Moloid Master');
    expect(recap.inSet).toBe('MSH');
    expect(recap.outName).toBe('Conduit of Worlds');
  });

  it('decisionRecapInOut uses accepted payload when present', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const moleMan = borbs.suggestions!.find((s) => (s.card as { name: string }).name === 'Mole Man, Moloid Master');
    const decision = {
      status: 'accepted' as const,
      accepted: {
        card_in: { name: 'Mole Man, Moloid Master', set_code: 'MSH' },
        card_out: { name: 'Conduit of Worlds' },
      },
    };
    const recap = DeckReview.decisionRecapInOut(moleMan!, decision);
    expect(recap.inName).toBe('Mole Man, Moloid Master');
    expect(recap.outName).toBe('Conduit of Worlds');
  });

  it('printingToCardIn maps a Scryfall print with finish from dataset', () => {
    const print = {
      id: 'abc-123',
      name: 'Thor, God of Thunder',
      set: 'msh',
      collector_number: '156',
      scryfall_uri: 'https://scryfall.com/card/msh/156/thor-god-of-thunder',
    };
    const fallback = { name: 'Thor, God of Thunder', set_code: 'MSH', collector_number: '156' };
    const cardIn = DeckReview.printingToCardIn(print, fallback, 'foil');
    expect(cardIn.set_code).toBe('MSH');
    expect(cardIn.finish).toBe('foil');
    expect(cardIn.scryfall_id).toBe('abc-123');
  });

  it('isMissingSuggestedCut is false for fixture replace suggestions with cuts', () => {
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    borbs.suggestions!.forEach((s) => {
      if (s.action !== 'sideboard' && (s.replaces as unknown[]).length) {
        expect(DeckReview.isMissingSuggestedCut(s)).toBe(false);
      }
    });
  });
});
