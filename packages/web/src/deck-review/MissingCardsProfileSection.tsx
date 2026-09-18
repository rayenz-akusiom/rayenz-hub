import { useState } from 'react';
import type {
  DeckDocument,
  DeckEntry,
  DeckFormat,
  PrintingFields,
  Suggestion,
} from '@rayenz-hub/shared';
import {
  MISSING_CARDS_INFO,
  attachTagsToCard,
  buildInSetQuery,
  buildMissingCardSuggestion,
  emptyCardOracle,
  loadScryfallTagIndexes,
  normalizeColourIdentity,
  oracleKey,
  type SetPoolCard,
} from '@rayenz-hub/shared';
import { ScryfallSearchModal } from '../deck-builder/scryfall/ScryfallSearchModal';
import { resolveLibraryDocument } from '../deck-builder/store/library-sync';
import { readProfileForDeck } from '../deck-suggest/data';

function printingToSetPoolCard(printing: PrintingFields): SetPoolCard {
  return {
    name: printing.name,
    set_code: printing.setCode || undefined,
    collector_number: printing.collectorNumber || undefined,
    scryfall_id: printing.scryfallId || null,
    mana_cost: printing.manaCost || '',
    cmc: printing.manaValue != null ? printing.manaValue : 0,
    type_line: printing.typeLine || '',
    oracle_text: printing.oracleText || '',
    keywords: printing.keywords || [],
    color_identity: [...(printing.colourIdentity || [])],
  };
}

/** Build a search deck from the review snapshot when the library doc is unavailable. */
export function deckDocumentFromReviewEntry(entry: DeckEntry): DeckDocument {
  const now = new Date().toISOString();
  const format = (entry.format as DeckFormat) || 'commander';
  const cards: DeckDocument['cards'] = [];
  const oracle: DeckDocument['oracle'] = {};

  for (const snap of entry.deck_snapshot?.cards || []) {
    const name = String(snap.name || '').trim();
    if (!name) continue;
    const instanceId = `review-${cards.length + 1}`;
    const primary =
      String(snap.primary_category || (snap.categories && snap.categories[0]) || 'Other').trim() ||
      'Other';
    const categories =
      Array.isArray(snap.categories) && snap.categories.length
        ? snap.categories.map(String)
        : [primary];
    const setCode = snap.set_code != null ? String(snap.set_code) : null;
    const collectorNumber =
      snap.collector_number != null ? String(snap.collector_number) : null;
    const scryfallId = snap.scryfall_id != null ? String(snap.scryfall_id) : null;
    const card = {
      instanceId,
      name,
      quantity: 1,
      ownedQuantity: 0,
      inDeckQuantity: 0,
      primaryCategory: primary,
      categories,
      stack: null,
      setCode,
      collectorNumber,
      scryfallId,
      archidektCardId: null,
      foil: false,
      proxy: false,
      collectionSource: 'manual' as const,
      collectionIgnored: false,
    };
    cards.push(card);
    const ci = normalizeColourIdentity(
      Array.isArray(snap.color_identity) ? snap.color_identity.map(String) : [],
    );
    oracle[oracleKey(card)] = emptyCardOracle({
      scryfallId,
      colourIdentity: ci,
      typeLine: snap.type_line != null ? String(snap.type_line) : null,
    });
  }

  return {
    schemaVersion: 1,
    deckId: String(entry.deck_id || 'review-deck'),
    name: String(entry.deck_name || 'Deck'),
    description: '',
    format,
    ownership: 'owned',
    visibility: 'public',
    archidektId: null,
    archidektUrl: entry.archidekt_url != null ? String(entry.archidekt_url) : null,
    categories: [],
    cards,
    oracle,
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    collectionTemplate: null,
    collectionSearch: null,
    representativeCard: null,
    autoAdjustBasics: false,
  };
}

export function MissingCardsProfileSection({
  deck,
  setCodes,
  onAddSuggestion,
  onStatus,
}: {
  deck: DeckEntry;
  setCodes: string[];
  onAddSuggestion: (suggestion: Suggestion) => void;
  onStatus?: (message: string) => void;
}) {
  const lockedBase = buildInSetQuery(setCodes);
  const [searchDeck, setSearchDeck] = useState<DeckDocument | null>(null);
  const [openError, setOpenError] = useState('');

  if (!lockedBase) return null;

  async function openSearch() {
    setOpenError('');
    const deckId = String(deck.deck_id || '');
    try {
      const fromLibrary = deckId ? await resolveLibraryDocument(deckId) : null;
      setSearchDeck(fromLibrary || deckDocumentFromReviewEntry(deck));
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addPrinting(printing: PrintingFields) {
    let next = printingToSetPoolCard(printing);
    if (!(next.oracle_tags && next.oracle_tags.length) || !(next.art_tags && next.art_tags.length)) {
      const indexes = await loadScryfallTagIndexes();
      if (indexes) next = attachTagsToCard(next, indexes);
    }
    try {
      const profile = await readProfileForDeck(deck.deck_id || '');
      const suggestion = buildMissingCardSuggestion(next, profile, {
        deckId: deck.deck_id || '',
      });
      onAddSuggestion(suggestion);
      onStatus?.(`Added ${next.name} as a suggestion.`);
    } catch (err) {
      onStatus?.(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="dr-missing-cards" aria-label="Missing cards">
      <div className="dr-missing-cards-heading">
        <h3 className="dr-missing-cards-title">Any cards missing? Add them here...</h3>
        <span
          className="dr-missing-cards-info"
          title={MISSING_CARDS_INFO}
          aria-label={MISSING_CARDS_INFO}
        >
          i
        </span>
      </div>
      <div className="dr-missing-cards-actions">
        <button type="button" className="dr-btn" onClick={() => void openSearch()}>
          Add cards
        </button>
      </div>
      {openError ? <p className="dr-missing-cards-error">{openError}</p> : null}
      {searchDeck ? (
        <ScryfallSearchModal
          deck={searchDeck}
          lockedBaseQuery={lockedBase}
          title="Missing cards from this set"
          confirmLabel="Add as suggestion"
          printingTitle={(name) => `Add suggestion — ${name}`}
          defaultCategory="Maybeboard"
          onClose={() => setSearchDeck(null)}
          onAdd={(printing) => {
            void addPrinting(printing);
          }}
        />
      ) : null}
    </section>
  );
}
