import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  addCardToDeck,
  changeCardPrinting,
  deckSize,
  defaultBrowseView,
  incompleteEntryCount,
  moveCardCategory,
  removeCardFromDeck,
  totalCardQuantity,
  type BrowseView,
  type CardInstance,
  type CardLayout,
  type DeckDocument,
  type FormalSwapEntry,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { CategoryBrowse } from './CategoryBrowse';
import { ColourIdentityBrowse } from './ColourIdentityBrowse';
import {
  SwapQueuePanel,
  type SwapEditDraft,
  type SwapPickSlot,
} from '../swaps/SwapQueuePanel';
import { MoveSheet } from '../edit/MoveSheet';
import { ExportBar } from '../import-export/ExportBar';
import { useScryfallEnrich } from '../scryfall/useScryfallEnrich';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import { PrintingPickerModal } from '../scryfall/PrintingPickerModal';
import { CardSizePicker } from '../CardSizePicker';
import { useCardSize } from '../card-size';

function draftFromEntry(entry: FormalSwapEntry): SwapEditDraft {
  return {
    entryId: entry.id,
    inInstanceId: entry.inInstanceId,
    outInstanceId: entry.outInstanceId,
    inTargetCategory: entry.inTargetCategory,
    notes: entry.notes || '',
  };
}

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
  const [addOpen, setAddOpen] = useState(false);
  const [printingOpen, setPrintingOpen] = useState(false);
  const [draft, setDraft] = useState<SwapEditDraft | null>(null);
  const [picking, setPicking] = useState<SwapPickSlot | null>(null);
  const { size: cardSize, setSize: setCardSize, widthPx: cardWidthPx } = useCardSize();
  const shellRef = useRef<HTMLDivElement>(null);
  const cardSizeReady = useRef(false);

  // Disable stack margin transitions before paint when --db-card-w changes
  // (avoids "fly in from above" while keeping hover expand animation).
  useLayoutEffect(() => {
    if (!cardSizeReady.current) {
      cardSizeReady.current = true;
      return;
    }
    const el = shellRef.current;
    if (!el) return;
    el.setAttribute('data-card-size-resizing', '');
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.removeAttribute('data-card-size-resizing');
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      el.removeAttribute('data-card-size-resizing');
    };
  }, [cardWidthPx]);

  const selected = useMemo(
    () => deck.cards.find((c) => c.instanceId === selectedId) || null,
    [deck.cards, selectedId],
  );
  const incomplete = incompleteEntryCount(deck.formalSwapEntries);
  const size = deckSize(deck);
  const total = totalCardQuantity(deck.cards);
  const editingSwap = Boolean(draft);

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
    if (draft && picking) {
      setDraft({
        ...draft,
        ...(picking === 'out'
          ? { outInstanceId: card.instanceId }
          : { inInstanceId: card.instanceId }),
      });
      setPicking(null);
      return;
    }
    setSelectedId((prev) => (prev === card.instanceId ? null : card.instanceId));
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

  function clearSwapEdit() {
    setDraft(null);
    setPicking(null);
  }

  function saveSwapEdit() {
    if (!draft) return;
    const entries = [...deck.formalSwapEntries]
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((e, i) =>
        e.id === draft.entryId
          ? {
              ...e,
              inInstanceId: draft.inInstanceId,
              outInstanceId: draft.outInstanceId,
              inTargetCategory: draft.inTargetCategory,
              notes: draft.notes.trim() || null,
              sortIndex: i,
            }
          : { ...e, sortIndex: i },
      );
    onChange({
      ...deck,
      formalSwapEntries: entries,
      updatedAt: new Date().toISOString(),
    });
    clearSwapEdit();
  }

  function removeSwapEdit() {
    if (!draft) return;
    const entries = deck.formalSwapEntries
      .filter((e) => e.id !== draft.entryId)
      .map((e, i) => ({ ...e, sortIndex: i }));
    onChange({
      ...deck,
      formalSwapEntries: entries,
      updatedAt: new Date().toISOString(),
    });
    clearSwapEdit();
  }

  function onAddCard(printing: PrintingFields, category: string) {
    const before = new Set(deck.cards.map((c) => c.instanceId));
    const next = addCardToDeck(deck, printing, category);
    const added = next.cards.find((c) => !before.has(c.instanceId));
    onChange(next);
    if (added) setSelectedId(added.instanceId);
    setAddOpen(false);
  }

  function onChangePrinting(printing: PrintingFields) {
    if (!selectedId) return;
    onChange(changeCardPrinting(deck, selectedId, printing));
    setPrintingOpen(false);
  }

  function onRemoveSelected() {
    if (!selected) return;
    if (!window.confirm(`Remove “${selected.name}” from this deck?`)) return;
    onChange(removeCardFromDeck(deck, selected.instanceId));
    setSelectedId(null);
    setMoveOpen(false);
    setPrintingOpen(false);
  }

  const shellStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
  } as CSSProperties;

  return (
    <div ref={shellRef} className="db-shell" style={shellStyle}>
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
          <CardSizePicker size={cardSize} onChange={setCardSize} />
        </div>
      </header>

      <ExportBar
        deck={deck}
        onDeckChange={onChange}
        onAddCard={picking ? undefined : () => setAddOpen(true)}
      />

      <div className="db-body">
        <main className="db-main">
          {picking ? (
            <div className="db-selection-bar is-pick">
              <span>Select {picking === 'out' ? 'Out' : 'In'} card…</span>
              <button type="button" className="db-btn" onClick={() => setPicking(null)}>
                Cancel pick
              </button>
            </div>
          ) : selected ? (
            <div className="db-selection-bar">
              <span>{selected.name}</span>
              <div className="db-selection-bar-actions">
                <button type="button" className="db-btn" onClick={() => setMoveOpen(true)}>
                  Move…
                </button>
                <button
                  type="button"
                  className="db-btn"
                  onClick={() => setPrintingOpen(true)}
                >
                  Change printing…
                </button>
                <button type="button" className="db-btn db-btn-danger" onClick={onRemoveSelected}>
                  Remove
                </button>
              </div>
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
          <SwapQueuePanel
            deck={deck}
            onChange={onChange}
            draft={draft}
            picking={picking}
            onStartEdit={(entry) => {
              setDraft(draftFromEntry(entry));
              setPicking(null);
            }}
            onDraftChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
            onSetPicking={setPicking}
            onCancelEdit={clearSwapEdit}
            onSaveEdit={saveSwapEdit}
            onRemoveEdit={removeSwapEdit}
          />
          <CategoryBrowse
            deck={deck}
            selectedId={picking ? null : selectedId}
            onSelectCard={onSelectCard}
            layout="stacked"
            onDropCard={onDropCard}
            mode="aside"
            includeSwapCategories={editingSwap}
          />
        </aside>
      </div>

      {moveOpen && selected && !picking ? (
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

      {addOpen ? (
        <ScryfallSearchModal
          deck={deck}
          onClose={() => setAddOpen(false)}
          onAdd={onAddCard}
        />
      ) : null}

      {printingOpen && selected && !picking ? (
        <PrintingPickerModal
          cardName={selected.name}
          defaultScryfallId={selected.scryfallId}
          selectedScryfallId={selected.scryfallId}
          foilDefault={selected.foil}
          confirmLabel="Apply printing"
          title={`Printing — ${selected.name}`}
          onClose={() => setPrintingOpen(false)}
          onConfirm={(printing) => onChangePrinting(printing)}
        />
      ) : null}
    </div>
  );
}
