import { useCallback, useMemo, useState } from 'react';
import {
  deckSize,
  defaultBrowseView,
  incompleteEntryCount,
  moveCardCategory,
  totalCardQuantity,
  type BrowseView,
  type CardInstance,
  type CardLayout,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { CategoryBrowse } from './CategoryBrowse';
import { ColourIdentityBrowse } from './ColourIdentityBrowse';
import { SwapQueuePanel } from '../swaps/SwapQueuePanel';
import { MoveSheet } from '../edit/MoveSheet';
import { ExportBar } from '../import-export/ExportBar';
import { useScryfallEnrich } from '../scryfall/useScryfallEnrich';

export function BrowseShell({
  deck,
  onChange,
  onBack,
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<BrowseView>(
    deck.browseViewDefault || defaultBrowseView(deck.format),
  );
  const [layout, setLayout] = useState<CardLayout>(deck.cardLayoutDefault || 'stacked');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const selected = useMemo(
    () => deck.cards.find((c) => c.instanceId === selectedId) || null,
    [deck.cards, selectedId],
  );
  const incomplete = incompleteEntryCount(deck.formalSwapEntries);
  const size = deckSize(deck);
  const total = totalCardQuantity(deck.cards);

  const onEnrichPatch = useCallback(
    (cards: CardInstance[]) => {
      onChange({
        ...deck,
        cards,
        updatedAt: new Date().toISOString(),
      });
    },
    [deck, onChange],
  );

  const { enriching } = useScryfallEnrich(deck, view === 'colour_identity', onEnrichPatch);

  function onSelectCard(card: CardInstance) {
    setSelectedId(card.instanceId);
  }

  function setLayoutAndPersist(next: CardLayout) {
    setLayout(next);
    if (deck.cardLayoutDefault !== next) {
      onChange({ ...deck, cardLayoutDefault: next, updatedAt: new Date().toISOString() });
    }
  }

  function onDropCard(instanceId: string, category: string) {
    const card = deck.cards.find((c) => c.instanceId === instanceId);
    if (!card || card.primaryCategory === category) return;
    onChange({
      ...deck,
      cards: moveCardCategory(deck.cards, instanceId, category, card.stack),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="db-shell">
      <header className="db-header">
        <button type="button" className="db-btn" onClick={onBack}>
          Library
        </button>
        <div className="db-header-main">
          <h2>{deck.name}</h2>
          <p className="db-meta">
            {deck.format} · {size} cards
            {total !== size ? ` · ${total} total` : ''}
            {incomplete ? ` · ${incomplete} incomplete swaps` : ''}
            {enriching ? ' · Enriching CI…' : ''}
          </p>
        </div>
        <div className="db-view-toggles">
          <div className="db-view-toggle" role="group" aria-label="Browse view">
            <button
              type="button"
              className={view === 'category' ? 'db-btn is-active' : 'db-btn'}
              onClick={() => setView('category')}
            >
              Categories
            </button>
            <button
              type="button"
              className={view === 'colour_identity' ? 'db-btn is-active' : 'db-btn'}
              onClick={() => setView('colour_identity')}
            >
              Colour identity
            </button>
          </div>
          <div className="db-view-toggle" role="group" aria-label="Card layout">
            <button
              type="button"
              className={layout === 'stacked' ? 'db-btn is-active' : 'db-btn'}
              onClick={() => setLayoutAndPersist('stacked')}
            >
              Stacked
            </button>
            <button
              type="button"
              className={layout === 'grid' ? 'db-btn is-active' : 'db-btn'}
              onClick={() => setLayoutAndPersist('grid')}
            >
              Grid
            </button>
          </div>
        </div>
      </header>

      <ExportBar deck={deck} onDeckChange={onChange} />

      <div className="db-body">
        <main className="db-main">
          {selected ? (
            <div className="db-selection-bar">
              <span>{selected.name}</span>
              <button type="button" className="db-btn" onClick={() => setMoveOpen(true)}>
                Move…
              </button>
            </div>
          ) : null}
          {view === 'colour_identity' ? (
            <ColourIdentityBrowse
              deck={deck}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
              layout={layout}
            />
          ) : (
            <CategoryBrowse
              deck={deck}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
              layout={layout}
              onDropCard={onDropCard}
              mode="main"
            />
          )}
        </main>
        <aside className="db-aside">
          <SwapQueuePanel deck={deck} onChange={onChange} />
          <CategoryBrowse
            deck={deck}
            selectedId={selectedId}
            onSelectCard={onSelectCard}
            layout="stacked"
            onDropCard={onDropCard}
            mode="aside"
          />
        </aside>
      </div>

      {moveOpen && selected ? (
        <MoveSheet
          deck={deck}
          card={selected}
          onClose={() => setMoveOpen(false)}
          onApply={(next) => {
            onChange(next);
            setMoveOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
