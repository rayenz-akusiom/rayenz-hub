import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import {
  addCardToDeck,
  cardDisplayName,
  cardSupportsFoilToggle,
  changeCardPrinting,
  deckSize,
  defaultBrowseView,
  incompleteEntryCount,
  moveCardCategory,
  placeCardInCommanderSlot,
  removeCardFromDeck,
  setCardFoil,
  setCardProxy,
  totalCardQuantity,
  type BrowseView,
  type CardView,
  type CardLayout,
  type CardSortMode,
  type DeckDocument,
  type FormalSwapEntry,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { CategoryBrowse } from './CategoryBrowse';
import { ColourIdentityBrowse } from './ColourIdentityBrowse';
import { SwapQueuePanel, type SwapEditDraft } from '../swaps/SwapQueuePanel';
import { findMatchingPrintingInstance } from '../swaps/swap-pickers';
import { MoveSheet } from '../edit/MoveSheet';
import { CardContextMenu, type CardContextMenuState } from '../edit/CardContextMenu';
import { ExportBar } from '../import-export/ExportBar';
import { DeckActionsMenu } from '../import-export/DeckActionsMenu';
import { useScryfallEnrich } from '../scryfall/useScryfallEnrich';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import { PrintingPickerModal } from '../scryfall/PrintingPickerModal';
import { useCardSize } from '../card-size';
import { FormatBadge } from '../ui/FormatBadge';
import { DeckProfilePanel } from '../profile/DeckProfilePanel';
import { FoilIcon } from '../../cards/FoilIcon';
import { ProxyIcon } from '../../cards/ProxyIcon';

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.5 2.5h5.25c.55 0 1 .45 1 1v10.25c0-.41-.34-.75-.75-.75H3.5c-.55 0-1-.45-1-1v-8.5c0-.55.45-1 1-1zm6.25 0H15c.55 0 1 .45 1 1v8.5c0 .55-.45 1-1 1H9.75c.41 0 .75.34.75.75V3.5c0-.55-.45-1-1-1zM3.5 14.5h5.5c.83 0 1.5.45 1.5 1H3.5c-.55 0-1-.45-1-1s.45-1 1-1zm9.5 0h1.5c.55 0 1 .45 1 1s-.45 1-1 1h-3c0-.55.67-1 1.5-1z"
      />
    </svg>
  );
}

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
  const [cardSort, setCardSort] = useState<CardSortMode>(deck.cardSortDefault || 'name_asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [printingOpen, setPrintingOpen] = useState(false);
  const [draft, setDraft] = useState<SwapEditDraft | null>(null);
  const [asideTab, setAsideTab] = useState<'deck' | 'profile'>('deck');
  const [contextMenu, setContextMenu] = useState<CardContextMenuState | null>(null);
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

  const deckRef = useRef(deck);
  deckRef.current = deck;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const onEnrichPatch = useCallback(
    (next: DeckDocument) => {
      onChange(next);
    },
    [onChange],
  );

  const isColourIdentityView =
    view === 'colour_identity' || view === 'colour_identity_spells';
  // Enrich CI/type/leader keywords when missing; Archidekt imports already have layout defaults.
  const { enriching } = useScryfallEnrich(deck, true, onEnrichPatch);

  function onSelectCard(card: CardView) {
    setContextMenu(null);
    setSelectedId((prev) => (prev === card.instanceId ? null : card.instanceId));
  }

  function onCardContextMenu(card: CardView, e: MouseEvent) {
    setSelectedId(card.instanceId);
    setContextMenu({ x: e.clientX, y: e.clientY, instanceId: card.instanceId });
  }

  function onToggleFoil() {
    if (!selected) return;
    onChange(setCardFoil(deck, selected.instanceId, !selected.foil));
  }

  function onToggleProxy() {
    if (!selected) return;
    onChange(setCardProxy(deck, selected.instanceId, !selected.proxy));
  }

  function setLayoutAndPersist(next: CardLayout) {
    setLayout(next);
    if (deck.cardLayoutDefault !== next) {
      onChange({ ...deck, cardLayoutDefault: next, updatedAt: new Date().toISOString() });
    }
  }

  function setCardSortAndPersist(next: CardSortMode) {
    setCardSort(next);
    if (deck.cardSortDefault !== next) {
      onChange({ ...deck, cardSortDefault: next, updatedAt: new Date().toISOString() });
    }
  }

  function onDropCard(
    instanceId: string,
    category: string,
    opts?: { commanderSlot?: 0 | 1 },
  ) {
    const card = deck.cards.find((c) => c.instanceId === instanceId);
    if (!card) return;

    if (category === 'Commander' && opts?.commanderSlot != null) {
      onChange({
        ...deck,
        cards: placeCardInCommanderSlot(deck.cards, instanceId, opts.commanderSlot),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (card.primaryCategory === category) return;
    onChange({
      ...deck,
      cards: moveCardCategory(deck.cards, instanceId, category, card.stack),
      updatedAt: new Date().toISOString(),
    });
  }

  function clearSwapEdit() {
    setDraft(null);
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

  function onAddCard(
    printing: PrintingFields,
    category: string,
    meta?: { proxy: boolean },
  ) {
    const before = new Set(deck.cards.map((c) => c.instanceId));
    const next = addCardToDeck(deck, printing, category, { proxy: meta?.proxy });
    const added = next.cards.find((c) => !before.has(c.instanceId));
    onChange(next);
    if (added) setSelectedId(added.instanceId);
    setAddOpen(false);
  }

  function onConfirmSwapIn(
    printing: PrintingFields,
    category: string,
    meta?: { proxy: boolean },
  ) {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const currentDeck = deckRef.current;
    const existing = findMatchingPrintingInstance(currentDeck, printing, {
      proxy: meta?.proxy,
    });
    if (existing) {
      setDraft({ ...currentDraft, inInstanceId: existing.instanceId });
      return;
    }
    const before = new Set(currentDeck.cards.map((c) => c.instanceId));
    const next = addCardToDeck(currentDeck, printing, category, { proxy: meta?.proxy });
    const added = next.cards.find((c) => !before.has(c.instanceId));
    onChange(next);
    if (added) {
      setDraft({ ...currentDraft, inInstanceId: added.instanceId });
    }
  }

  function onChangePrinting(printing: PrintingFields, meta?: { proxy: boolean }) {
    if (!selectedId) return;
    onChange(changeCardPrinting(deck, selectedId, printing, { proxy: meta?.proxy }));
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

  function onSetCover() {
    if (!selected) return;
    onChange({
      ...deck,
      coverInstanceId: selected.instanceId,
      updatedAt: new Date().toISOString(),
    });
  }

  function onClearCover() {
    onChange({
      ...deck,
      coverInstanceId: null,
      updatedAt: new Date().toISOString(),
    });
  }

  const shellStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
  } as CSSProperties;

  const isCover = selected != null && deck.coverInstanceId === selected.instanceId;
  const foilToggleEnabled = selected ? cardSupportsFoilToggle(deck, selected) : false;
  const contextCard =
    contextMenu != null
      ? deck.cards.find((c) => c.instanceId === contextMenu.instanceId) || null
      : null;

  return (
    <div
      ref={shellRef}
      className={`db-shell${draft ? ' is-swap-editing' : ''}`}
      style={shellStyle}
    >
      <header className="db-header">
        <button type="button" className="db-btn db-library-back" onClick={onBack} aria-label="Library" title="Library">
          <BookIcon />
          <span>Library</span>
        </button>
        <div className="db-header-main">
          <h2 className="db-header-title">
            <FormatBadge format={deck.format} />
            <span>{deck.name}</span>
          </h2>
          <p className="db-meta">
            {size} cards
            {total !== size ? ` · ${total} total` : ''}
            {incomplete ? ` · ${incomplete} incomplete swaps` : ''}
            {enriching ? ' · Enriching…' : ''}
          </p>
        </div>
        <DeckActionsMenu deck={deck} onDeckChange={onChange} />
      </header>

      <ExportBar
        onAddCard={() => setAddOpen(true)}
        view={view}
        onViewChange={setView}
        layout={layout}
        onLayoutChange={setLayoutAndPersist}
        cardSort={cardSort}
        onCardSortChange={setCardSortAndPersist}
        cardSize={cardSize}
        onCardSizeChange={setCardSize}
      />

      <div className="db-body">
        <main className="db-main">
          {selected ? (
            <div className="db-selection-bar">
              <div className="db-selection-bar-actions">
                <button
                  type="button"
                  className={`db-btn db-foil-toggle${selected.foil ? ' is-foil' : ''}`}
                  aria-pressed={selected.foil}
                  aria-label={selected.foil ? 'Foil' : 'Not foil'}
                  title={
                    foilToggleEnabled || selected.foil
                      ? selected.foil
                        ? 'Foil — click to unmark'
                        : 'Mark as foil'
                      : 'This printing is not available in foil'
                  }
                  disabled={!foilToggleEnabled && !selected.foil}
                  onClick={onToggleFoil}
                >
                  <FoilIcon filled={selected.foil} />
                </button>
                <button
                  type="button"
                  className={`db-btn db-proxy-toggle${selected.proxy ? ' is-proxy' : ''}`}
                  aria-pressed={Boolean(selected.proxy)}
                  aria-label={selected.proxy ? 'Proxy' : 'Not proxy'}
                  title={selected.proxy ? 'Proxy — click to unmark' : 'Mark as proxy'}
                  onClick={onToggleProxy}
                >
                  <ProxyIcon filled={Boolean(selected.proxy)} />
                </button>
                {isCover ? (
                  <button type="button" className="db-btn" onClick={onClearCover}>
                    Clear cover
                  </button>
                ) : (
                  <button type="button" className="db-btn" onClick={onSetCover}>
                    Set as cover
                  </button>
                )}
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
          {isColourIdentityView ? (
            <ColourIdentityBrowse
              deck={deck}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
              layout={layout}
              cardSort={cardSort}
              separateLands={view === 'colour_identity_spells'}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
            />
          ) : (
            <CategoryBrowse
              deck={deck}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
              layout={layout}
              cardSort={cardSort}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              mode="main"
            />
          )}
        </main>
        <aside className="db-aside">
          <div className="db-aside-tabs" role="tablist" aria-label="Deck side panel">
            <button
              type="button"
              role="tab"
              id="db-aside-tab-deck"
              aria-selected={asideTab === 'deck'}
              aria-controls="db-aside-panel-deck"
              className={`db-aside-tab${asideTab === 'deck' ? ' is-active' : ''}`}
              onClick={() => setAsideTab('deck')}
            >
              Deck
            </button>
            <button
              type="button"
              role="tab"
              id="db-aside-tab-profile"
              aria-selected={asideTab === 'profile'}
              aria-controls="db-aside-panel-profile"
              className={`db-aside-tab${asideTab === 'profile' ? ' is-active' : ''}`}
              onClick={() => setAsideTab('profile')}
            >
              Profile
            </button>
          </div>
          <div
            role="tabpanel"
            id="db-aside-panel-deck"
            aria-labelledby="db-aside-tab-deck"
            hidden={asideTab !== 'deck'}
            className="db-aside-panel"
          >
            <SwapQueuePanel
              deck={deck}
              onChange={onChange}
              draft={draft}
              onStartEdit={(entry) => {
                setDraft(draftFromEntry(entry));
              }}
              onDraftChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
              onConfirmIn={onConfirmSwapIn}
              onCancelEdit={clearSwapEdit}
              onSaveEdit={saveSwapEdit}
              onRemoveEdit={removeSwapEdit}
            />
            <CategoryBrowse
              deck={deck}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
              layout="stacked"
              cardSort={cardSort}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              mode="aside"
              includeSwapCategories={editingSwap}
            />
          </div>
          <div
            role="tabpanel"
            id="db-aside-panel-profile"
            aria-labelledby="db-aside-tab-profile"
            hidden={asideTab !== 'profile'}
            className="db-aside-panel"
          >
            {asideTab === 'profile' ? <DeckProfilePanel deck={deck} /> : null}
          </div>
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

      {addOpen ? (
        <ScryfallSearchModal
          deck={deck}
          onClose={() => setAddOpen(false)}
          onAdd={onAddCard}
        />
      ) : null}

      {printingOpen && selected ? (
        <PrintingPickerModal
          cardName={selected.name}
          defaultScryfallId={selected.scryfallId}
          selectedScryfallId={selected.scryfallId}
          foilDefault={selected.foil}
          proxyDefault={Boolean(selected.proxy)}
          confirmLabel="Apply printing"
          title={`Printing — ${cardDisplayName(selected)}`}
          onClose={() => setPrintingOpen(false)}
          onConfirm={(printing, _category, meta) => onChangePrinting(printing, meta)}
        />
      ) : null}

      {contextMenu && contextCard ? (
        <CardContextMenu
          state={contextMenu}
          isCover={deck.coverInstanceId === contextCard.instanceId}
          foil={Boolean(contextCard.foil)}
          foilEnabled={cardSupportsFoilToggle(deck, contextCard)}
          proxy={Boolean(contextCard.proxy)}
          onClose={() => setContextMenu(null)}
          onToggleFoil={() => {
            onChange(setCardFoil(deck, contextCard.instanceId, !contextCard.foil));
          }}
          onToggleProxy={() => {
            onChange(setCardProxy(deck, contextCard.instanceId, !contextCard.proxy));
          }}
          onSetCover={() => {
            onChange({
              ...deck,
              coverInstanceId: contextCard.instanceId,
              updatedAt: new Date().toISOString(),
            });
          }}
          onClearCover={onClearCover}
          onMove={() => setMoveOpen(true)}
          onChangePrinting={() => setPrintingOpen(true)}
          onRemove={onRemoveSelected}
        />
      ) : null}
    </div>
  );
}
