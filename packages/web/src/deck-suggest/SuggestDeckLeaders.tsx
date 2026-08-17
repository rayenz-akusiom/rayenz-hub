import type { DeckEntry, DeckFormat } from '@rayenz-hub/shared';
import { CardFace } from '../cards/CardFace';
import { FormatBadge } from '../deck-builder/ui/FormatBadge';
import { scryfallImageFromId, scryfallImageFromName, scryfallImageFromPrinting } from '../lib/hub-utils';
import { commanderCardsFromDeck, lieutenantCardsFromDeck, type LeaderSnapshotCard } from './display';

function leaderImageSrc(card: LeaderSnapshotCard): string {
  if (card.scryfall_id) {
    return scryfallImageFromId(card.scryfall_id);
  }
  if (card.set_code && card.collector_number) {
    return scryfallImageFromPrinting(card.set_code, card.collector_number);
  }
  return scryfallImageFromName(card.name);
}

function LeaderFace({ card }: { card: LeaderSnapshotCard }) {
  return (
    <div className="db-card-tile ds-leader-tile" title={card.name} aria-label={card.name}>
      <CardFace src={leaderImageSrc(card)} name={card.name} quantity={card.quantity || 1} />
    </div>
  );
}

function badgeFormat(format: string | undefined): DeckFormat {
  if (format === 'commander' || format === 'cube') return format;
  return 'commander';
}

export function SuggestDeckLeaders({ deck }: { deck: DeckEntry }) {
  const commanders = commanderCardsFromDeck(deck);
  const lieutenants = lieutenantCardsFromDeck(deck);
  const deckName = String(deck.deck_name || deck.deck_id || 'Deck').trim() || 'Deck';
  const format = badgeFormat(deck.format);

  return (
    <div className="db-deck-leaders ds-deck-leaders" role="region" aria-label="Deck leaders">
      <div className="db-deck-leaders-identity">
        <h2 className="db-header-title">
          <FormatBadge format={format} />
          <span>{deckName}</span>
        </h2>
      </div>
      <div className="db-header-row">
        <div className="db-header-slot is-commander">
          <div className="db-header-cat">
            <h3 className="db-header-cat-title">Commander</h3>
            <div className="db-card-grid">
              {commanders.map((c) => (
                <LeaderFace key={c.name} card={c} />
              ))}
            </div>
          </div>
        </div>
        <div className="db-header-slot is-lieutenants">
          <div className="db-header-divider" aria-hidden="true" />
          <div className="db-header-cat ds-lieutenants-col">
            {lieutenants.length ? (
              <>
                <h3 className="db-header-cat-title">Lieutenants</h3>
                <div className="db-card-grid">
                  {lieutenants.map((c) => (
                    <LeaderFace key={c.name} card={c} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
