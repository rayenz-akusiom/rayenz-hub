import { useState } from 'react';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import {
  MISSING_CARDS_INFO,
  attachTagsToCard,
  buildMissingCardSuggestion,
  loadScryfallTagIndexes,
  missingPoolCards,
  type SetPoolCard,
} from '@rayenz-hub/shared';
import { CardPickerModal, type CardPickerItem } from '../cards/CardPicker';
import { fetchSetPool, readProfileForDeck, tryRestoreSetPool } from '../deck-suggest/data';
import { hydrateSetPoolFromApi, normalizeSetCodesKey } from '../lib/hub-storage';
import { scryfallImageFromId, scryfallImageFromPrinting } from '@rayenz-hub/shared';

function poolCardKey(card: SetPoolCard): string {
  return [card.name, card.set_code || '', card.collector_number || ''].join('|');
}

function poolCardImage(card: SetPoolCard): string {
  if (card.scryfall_id) return scryfallImageFromId(card.scryfall_id) || '';
  if (card.set_code && card.collector_number) {
    return scryfallImageFromPrinting(card.set_code, card.collector_number) || '';
  }
  return '';
}

async function restoreSetPool(codes: string[]): Promise<{ cards: SetPoolCard[] } | null> {
  const normalized = (codes || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  if (!normalized.length) return null;
  const codesKey = normalizeSetCodesKey(normalized);
  const local = tryRestoreSetPool(codesKey);
  if (local?.cards?.length) return local;
  const remote = await hydrateSetPoolFromApi(codesKey);
  if (remote?.cards?.length) return { cards: remote.cards as SetPoolCard[] };
  return fetchSetPool(normalized);
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
  const [poolCards, setPoolCards] = useState<SetPoolCard[]>([]);
  const [poolError, setPoolError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  async function openPicker() {
    setPoolError('');
    try {
      const scope = await restoreSetPool(setCodes);
      const cards = missingPoolCards(scope?.cards || [], {
        deck_id: deck.deck_id || '',
        deck_snapshot: deck.deck_snapshot,
        suggestions: deck.suggestions as Array<{ card?: { name?: string } }>,
      });
      setPoolCards(cards);
      if (!cards.length) {
        setPoolError('No other cards in this set pool for this deck.');
        return;
      }
      setPickerOpen(true);
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : String(err));
    }
  }

  async function pickCard(card: SetPoolCard) {
    let next = card;
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

  const pickerItems: CardPickerItem[] = poolCards.map((card) => ({
    value: poolCardKey(card),
    lines: [card.name, [card.set_code, card.collector_number].filter(Boolean).join(' ')],
    imgSrc: poolCardImage(card) || undefined,
    scryfallId: card.scryfall_id || undefined,
  }));

  const suggestedKeys = new Set(
    ((deck.suggestions || []) as Suggestion[])
      .filter((s) => s.source === 'missing_cards')
      .map((s) => poolCardKey(s.card as SetPoolCard)),
  );

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
        <button type="button" className="dr-btn" onClick={() => void openPicker()}>
          Add cards
        </button>
      </div>
      {poolError ? <p className="dr-missing-cards-error">{poolError}</p> : null}
      {pickerOpen ? (
        <CardPickerModal
          config={{
            title: 'Missing cards from this set',
            items: pickerItems,
            sort: true,
            keepOpen: true,
            selectedValues: [...suggestedKeys],
            onPick: (value) => {
              const card = poolCards.find((c) => poolCardKey(c) === value);
              if (card) void pickCard(card);
            },
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </section>
  );
}
