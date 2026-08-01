import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  addCardToDeck,
  categoryIncluded,
  defaultAddCategory,
  filterAcquireSources,
  filterWantSources,
  finalizeFormalSwap,
  isSwapQueueCategory,
  newFormalSwapEntry,
  partitionWantSourcesBySwimlane,
  retargetFormalSwap,
  retargetLookingFor,
  syncCardsWithFormalSwaps,
  transplantCardInstance,
  type DeckDocument,
  type PrintingFields,
  type UnifiedWantRow,
  type WantSource,
} from '@rayenz-hub/shared';
import {
  defaultBrowseForSwapQueuePath,
  defaultLayoutForSwapQueuePath,
  type SwapQueueBrowseMode,
  type SwapQueueLayoutMode,
} from '../hub/routes';
import { CardSizePicker } from '../deck-builder/CardSizePicker';
import { useCardSize, type CardSizeKey } from '../deck-builder/card-size';
import {
  draftFromFormalEntry,
  SwapEditChrome,
  type SwapEditDraft,
} from '../deck-builder/swaps/swap-edit-chrome';
import { findMatchingPrintingInstance } from '../deck-builder/swaps/swap-pickers';
import {
  addLookingForCard,
  removeLookingForEntry,
} from '../deck-builder/swaps/useSwapQueue';
import { saveDeck } from '../deck-builder/store/deck-store';
import { pullRemoteLibraryUpdates } from '../deck-builder/store/library-sync';
import { DbMenu, DbMenuItem } from '../deck-builder/ui/DbMenu';
import '../deck-builder/deck-builder.css';
import { findDeck, loadSwapWantSources } from './aggregate';
import { enrichWantSourcesUsd } from './enrich-prices';
import { copyArchidektWants, copyNameQtyWants } from './export-ui';
import { LookingForEditChrome } from './LookingForEditChrome';
import { QueueTilesView } from './QueueTilesView';
import { SourceInterstitial } from './SourceInterstitial';
import './swap-queue.css';

export type SwapQueueEntryPath = 'swap-queue' | 'wishlist';

export type SwapQueueAppProps = {
  entryPath?: SwapQueueEntryPath;
};

const BROWSE_LABELS: Record<SwapQueueBrowseMode, string> = {
  default: 'Default',
  unified: 'Unified',
};

const LAYOUT_LABELS: Record<SwapQueueLayoutMode, string> = {
  tiles: 'Tiles',
  stacked: 'Stacked',
  grid: 'Grid',
};

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 4.5h12v1.5H3V4.5zm0 4h12v1.5H3V8.5zm0 4h12V14H3v-1.5z"
      />
    </svg>
  );
}

function MinUsdMenuControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className="sq-menu-min-usd"
      role="none"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <label className="sq-menu-min-usd-label">
        Min USD
        <input
          type="number"
          min={0}
          step={0.01}
          value={value}
          placeholder="off"
          aria-label="Min USD"
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

type DeckFilterOption = { deckId: string; deckName: string };

function deckFilterLabel(
  selectedIds: string[],
  options: DeckFilterOption[],
): string {
  if (!selectedIds.length) return 'All';
  if (selectedIds.length === 1) {
    const match = options.find((o) => o.deckId === selectedIds[0]);
    return match?.deckName || '1 deck';
  }
  return `${selectedIds.length} decks`;
}

function toggleDeckId(selectedIds: string[], deckId: string, checked: boolean): string[] {
  if (checked) {
    return selectedIds.includes(deckId) ? selectedIds : [...selectedIds, deckId];
  }
  return selectedIds.filter((id) => id !== deckId);
}

function DeckFilterMenuControl({
  options,
  selectedIds,
  onChange,
}: {
  options: DeckFilterOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  if (!options.length) {
    return (
      <div className="sq-menu-deck-filter" role="none">
        <p className="sq-menu-deck-empty">No decks in queue</p>
      </div>
    );
  }

  return (
    <div
      className="sq-menu-deck-filter"
      role="none"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="sq-menu-deck-actions">
        <button
          type="button"
          className="sq-menu-deck-action"
          onClick={() => onChange(options.map((o) => o.deckId))}
        >
          Select all
        </button>
        <button
          type="button"
          className="sq-menu-deck-action"
          onClick={() => onChange([])}
        >
          Clear
        </button>
      </div>
      <ul className="sq-menu-deck-list" role="group" aria-label="Filter by deck">
        {options.map((opt) => {
          const checked = selectedIds.includes(opt.deckId);
          return (
            <li key={opt.deckId}>
              <label className="sq-menu-deck-option">
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={opt.deckName}
                  onChange={(e) =>
                    onChange(toggleDeckId(selectedIds, opt.deckId, e.target.checked))
                  }
                />
                <span>{opt.deckName}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SwapQueueApp({ entryPath = 'swap-queue' }: SwapQueueAppProps) {
  const pathKey = entryPath === 'wishlist' ? '/wishlist' : '/swap-queue';
  const [decks, setDecks] = useState<DeckDocument[]>([]);
  const [sources, setSources] = useState<WantSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiWarning, setApiWarning] = useState('');
  const [browse, setBrowse] = useState<SwapQueueBrowseMode>(() =>
    defaultBrowseForSwapQueuePath(pathKey),
  );
  const [layout, setLayout] = useState<SwapQueueLayoutMode>(() =>
    defaultLayoutForSwapQueuePath(pathKey),
  );
  const [minUsd, setMinUsd] = useState<number | null>(null);
  const [minUsdInput, setMinUsdInput] = useState('');
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [interstitial, setInterstitial] = useState<UnifiedWantRow | null>(null);
  const [editing, setEditing] = useState<WantSource | null>(null);
  const [editingDeck, setEditingDeck] = useState<DeckDocument | null>(null);
  const [pairDraft, setPairDraft] = useState<SwapEditDraft | null>(null);
  const [pairOriginDeckId, setPairOriginDeckId] = useState<string | null>(null);
  const [originDeckWorking, setOriginDeckWorking] = useState<DeckDocument | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const { size: cardSize, widthPx: cardWidthPx, setSize: setCardSize } = useCardSize();
  const editingDeckRef = useRef(editingDeck);
  const pairDraftRef = useRef(pairDraft);
  const pairOriginDeckIdRef = useRef(pairOriginDeckId);
  const originDeckWorkingRef = useRef(originDeckWorking);
  editingDeckRef.current = editingDeck;
  pairDraftRef.current = pairDraft;
  pairOriginDeckIdRef.current = pairOriginDeckId;
  originDeckWorkingRef.current = originDeckWorking;

  useEffect(() => {
    setBrowse(defaultBrowseForSwapQueuePath(pathKey));
    setLayout(defaultLayoutForSwapQueuePath(pathKey));
  }, [pathKey]);

  async function refresh() {
    setLoading(true);
    setError('');
    setApiWarning('');
    try {
      try {
        await pullRemoteLibraryUpdates();
      } catch (e) {
        setApiWarning(e instanceof Error ? e.message : String(e));
      }
      const result = await loadSwapWantSources();
      setDecks(result.decks);
      setSources(result.sources);
      void enrichWantSourcesUsd(result.sources).then((enriched) => {
        setSources(enriched);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const deckOptions = useMemo((): DeckFilterOption[] => {
    const byId = new Map<string, string>();
    for (const s of sources) {
      if (!byId.has(s.deckId)) byId.set(s.deckId, s.deckName);
    }
    return [...byId.entries()]
      .map(([deckId, deckName]) => ({ deckId, deckName }))
      .sort((a, b) => a.deckName.localeCompare(b.deckName));
  }, [sources]);

  const libraryDeckOptions = useMemo((): DeckFilterOption[] => {
    return [...decks]
      .map((d) => ({ deckId: d.deckId, deckName: d.name }))
      .sort((a, b) => a.deckName.localeCompare(b.deckName));
  }, [decks]);

  const visible = useMemo(
    () =>
      filterWantSources(sources, {
        minUsd,
        deckIds: selectedDeckIds.length ? selectedDeckIds : null,
      }),
    [sources, minUsd, selectedDeckIds],
  );

  const lanes = useMemo(() => partitionWantSourcesBySwimlane(visible), [visible]);
  const exportSources = useMemo(() => filterAcquireSources(visible), [visible]);

  function setBrowseMode(next: SwapQueueBrowseMode) {
    setBrowse(next);
    if (next === 'unified' && layout === 'tiles') {
      setLayout('stacked');
    }
  }

  function setLayoutMode(next: SwapQueueLayoutMode) {
    setLayout(next);
    if (next === 'tiles' && browse === 'unified') {
      setBrowse('default');
    }
  }

  function clearEdit() {
    setEditing(null);
    setEditingDeck(null);
    setPairDraft(null);
    setPairOriginDeckId(null);
    setOriginDeckWorking(null);
    setAddPickerOpen(false);
  }

  function openSource(source: WantSource) {
    setInterstitial(null);
    const deck = findDeck(decks, source.deckId);
    if (!deck) return;
    setEditing(source);
    setEditingDeck(deck);
    setPairOriginDeckId(deck.deckId);
    setOriginDeckWorking(deck);
    if (source.kind === 'queued_in' || source.kind === 'queued_out') {
      const entry = deck.formalSwapEntries.find((e) => e.id === source.entryId);
      if (entry) setPairDraft(draftFromFormalEntry(entry));
      else setPairDraft(null);
    } else {
      setPairDraft(null);
    }
  }

  function activateUnified(row: UnifiedWantRow) {
    if (row.sources.length === 1) {
      openSource(row.sources[0]!);
      return;
    }
    setInterstitial(row);
  }

  async function persistDecks(docs: DeckDocument[]) {
    for (const doc of docs) {
      await saveDeck(doc);
    }
    clearEdit();
    setStatus('Saved');
    await refresh();
  }

  async function persistDeck(next: DeckDocument) {
    await persistDecks([next]);
  }

  function categoryValidOnDeck(deck: DeckDocument, category: string | null): string | null {
    if (!category) return null;
    if (!categoryIncluded(deck.categories || [], category)) return null;
    if (isSwapQueueCategory(category)) return null;
    return category;
  }

  function onPairDeckChange(nextDeckId: string) {
    const draft = pairDraftRef.current;
    const current = editingDeckRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!draft || !current || !originId || nextDeckId === current.deckId) return;

    const nextBase =
      nextDeckId === originId
        ? originDeckWorkingRef.current?.deckId === originId
          ? originDeckWorkingRef.current
          : findDeck(decks, originId)
        : findDeck(decks, nextDeckId);
    if (!nextBase) return;

    let next = nextBase;
    let from = current;
    let nextDraft: SwapEditDraft = {
      ...draft,
      outInstanceId: null,
      inTargetCategory: categoryValidOnDeck(nextBase, draft.inTargetCategory),
    };

    const inId = nextDraft.inInstanceId;
    const inOnCurrent = Boolean(inId && (from.cards || []).some((c) => c.instanceId === inId));
    const inOnNext = Boolean(inId && (next.cards || []).some((c) => c.instanceId === inId));

    // In still on origin is left there until Save; only move Ins added after leaving origin.
    if (inOnCurrent && !inOnNext && from.deckId !== originId && inId) {
      const cat = nextDraft.inTargetCategory || defaultAddCategory(next);
      const moved = transplantCardInstance(from, next, inId, cat);
      if (moved) {
        from = moved.from;
        next = moved.to;
        nextDraft = {
          ...nextDraft,
          inInstanceId: moved.newInstanceId,
          inTargetCategory: cat,
        };
      }
    }

    if (from.deckId === originId) setOriginDeckWorking(from);
    if (next.deckId === originId) setOriginDeckWorking(next);

    setEditingDeck(next);
    setPairDraft(nextDraft);
  }

  function savePairEdit() {
    const deck = editingDeckRef.current;
    const draft = pairDraftRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!deck || !draft || !originId) return;

    if (deck.deckId === originId) {
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
      void persistDeck(syncCardsWithFormalSwaps(deck, entries));
      return;
    }

    const origin =
      originDeckWorkingRef.current?.deckId === originId
        ? originDeckWorkingRef.current
        : findDeck(decks, originId);
    if (!origin) return;

    // Prefer origin that still has the entry (working copy may have drifted).
    const sourceWithEntry =
      origin.formalSwapEntries.some((e) => e.id === draft.entryId)
        ? origin
        : findDeck(decks, originId);
    if (!sourceWithEntry?.formalSwapEntries.some((e) => e.id === draft.entryId)) return;

    const moved = retargetFormalSwap(sourceWithEntry, deck, draft.entryId, {
      inInstanceId: draft.inInstanceId,
      inTargetCategory: draft.inTargetCategory,
      notes: draft.notes,
    });
    if (!moved) return;
    void persistDecks([moved.source, moved.target]);
  }

  function removePairEdit() {
    const deck = editingDeckRef.current;
    const draft = pairDraftRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!deck || !draft || !originId) return;

    if (deck.deckId === originId) {
      const entries = deck.formalSwapEntries
        .filter((e) => e.id !== draft.entryId)
        .map((e, i) => ({ ...e, sortIndex: i }));
      void persistDeck(syncCardsWithFormalSwaps(deck, entries));
      return;
    }

    // Retargeted away but not saved: remove from origin only.
    const origin = findDeck(decks, originId);
    if (!origin) return;
    const entries = origin.formalSwapEntries
      .filter((e) => e.id !== draft.entryId)
      .map((e, i) => ({ ...e, sortIndex: i }));
    void persistDeck(syncCardsWithFormalSwaps(origin, entries));
  }

  function finalizePairEdit() {
    const deck = editingDeckRef.current;
    const draft = pairDraftRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!deck || !draft || !originId) return;
    if (deck.deckId !== originId) return;
    if (!draft.inInstanceId || !draft.outInstanceId) return;

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
    const staged = syncCardsWithFormalSwaps(deck, entries);
    const done = finalizeFormalSwap(staged, draft.entryId);
    if (!done) return;
    void persistDeck(done);
  }

  async function finalizePair(deckId: string, entryId: string) {
    const deck = findDeck(decks, deckId);
    if (!deck) return;
    const done = finalizeFormalSwap(deck, entryId);
    if (!done) return;
    await persistDeck(done);
  }

  function onConfirmSwapIn(
    printing: PrintingFields,
    category: string,
    meta?: { proxy: boolean },
  ) {
    const draft = pairDraftRef.current;
    const deck = editingDeckRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!draft || !deck) return;
    const existing = findMatchingPrintingInstance(deck, printing, { proxy: meta?.proxy });
    if (existing) {
      setPairDraft({ ...draft, inInstanceId: existing.instanceId, inTargetCategory: category });
      return;
    }
    const before = new Set(deck.cards.map((c) => c.instanceId));
    const next = addCardToDeck(deck, printing, category, { proxy: meta?.proxy });
    const added = next.cards.find((c) => !before.has(c.instanceId));
    setEditingDeck(next);
    if (originId && next.deckId === originId) {
      setOriginDeckWorking(next);
    }
    if (added) {
      setPairDraft({ ...draft, inInstanceId: added.instanceId, inTargetCategory: category });
    }
  }

  async function createEmptySwap(deckId: string) {
    const deck = findDeck(decks, deckId);
    if (!deck) return;
    const entry = newFormalSwapEntry(deck.formalSwapEntries.length);
    const next = syncCardsWithFormalSwaps(deck, [...deck.formalSwapEntries, entry]);
    await saveDeck(next);
    setAddPickerOpen(false);
    setDecks((prev) => {
      const idx = prev.findIndex((d) => d.deckId === next.deckId);
      if (idx < 0) return [...prev, next];
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
    setEditing({
      deckId: next.deckId,
      deckName: next.name,
      format: next.format,
      kind: 'queued_in',
      entryId: entry.id,
      cardInstanceId: '',
      cardName: '',
      mergeKey: entry.id,
      quantity: 1,
      usd: null,
      outInstanceId: null,
      inInstanceId: null,
      pairIncomplete: true,
    });
    setEditingDeck(next);
    setPairOriginDeckId(next.deckId);
    setOriginDeckWorking(next);
    setPairDraft(draftFromFormalEntry(entry));
    setStatus('Added swap');
  }

  function removeLookingFor() {
    const deck = editingDeckRef.current;
    const source = editing;
    if (!deck || !source || source.kind !== 'seeking') return;
    void persistDeck(removeLookingForEntry(deck, source.entryId));
  }

  function replaceLookingFor(printing: PrintingFields, meta?: { proxy: boolean }) {
    const deck = editingDeckRef.current;
    const source = editing;
    if (!deck || !source || source.kind !== 'seeking') return;
    const without = removeLookingForEntry(deck, source.entryId);
    void persistDeck(addLookingForCard(without, printing, meta));
  }

  function retargetSeeking(nextDeckId: string) {
    const deck = editingDeckRef.current;
    const source = editing;
    if (!deck || !source || source.kind !== 'seeking') return;
    if (nextDeckId === deck.deckId) return;
    const target = findDeck(decks, nextDeckId);
    if (!target) return;
    const moved = retargetLookingFor(deck, target, source.entryId);
    if (!moved) return;
    void persistDecks([moved.source, moved.target]);
  }

  async function onExportArchidekt() {
    const ok = await copyArchidektWants(exportSources);
    setStatus(ok ? 'Copied Archidekt-style list' : 'Copy failed');
  }

  async function onExportNameQty() {
    const ok = await copyNameQtyWants(exportSources);
    setStatus(ok ? 'Copied name/qty list' : 'Copy failed');
  }

  function onCardSizeChange(next: CardSizeKey) {
    setCardSize(next);
  }

  const unified = browse === 'unified';
  const hasAny =
    lanes.seeking.length + lanes.queued_in.length + lanes.queued_out.length > 0;
  const hasUnfiltered = sources.length > 0;
  const filtersActive = minUsd != null || selectedDeckIds.length > 0;

  const shellStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
    ['--db-swap-card-w']: `${cardWidthPx}px`,
  } as CSSProperties;

  return (
    <div
      className="hub-app swap-queue-app"
      data-entry-path={entryPath}
      data-browse={browse}
      data-layout={layout}
      style={shellStyle}
    >
      <h1>Swap Queue</h1>
      <p className="hub-muted">
        Manage your swap queues across all of your decks
        {entryPath === 'wishlist' ? ' (Wishlist alias)' : ''}.
      </p>

      <header className="db-header sq-header" role="toolbar" aria-label="Swap Queue controls">
        <div className="db-toolbar-controls">
          <DbMenu label="Browse" value={BROWSE_LABELS[browse]}>
            <DbMenuItem active={browse === 'default'} onSelect={() => setBrowseMode('default')}>
              Default
            </DbMenuItem>
            <DbMenuItem active={browse === 'unified'} onSelect={() => setBrowseMode('unified')}>
              Unified
            </DbMenuItem>
          </DbMenu>
          <DbMenu label="Layout" value={LAYOUT_LABELS[layout]}>
            <DbMenuItem active={layout === 'tiles'} onSelect={() => setLayoutMode('tiles')}>
              Tiles
            </DbMenuItem>
            <DbMenuItem active={layout === 'stacked'} onSelect={() => setLayoutMode('stacked')}>
              Stacked
            </DbMenuItem>
            <DbMenuItem active={layout === 'grid'} onSelect={() => setLayoutMode('grid')}>
              Grid
            </DbMenuItem>
          </DbMenu>
          <DbMenu label="Deck" value={deckFilterLabel(selectedDeckIds, deckOptions)}>
            <DeckFilterMenuControl
              options={deckOptions}
              selectedIds={selectedDeckIds}
              onChange={setSelectedDeckIds}
            />
          </DbMenu>
          <CardSizePicker size={cardSize} onChange={onCardSizeChange} />
          <button
            type="button"
            className="db-btn"
            disabled={!libraryDeckOptions.length}
            onClick={() => setAddPickerOpen(true)}
          >
            Add
          </button>
        </div>
        <DbMenu
          icon={<HamburgerIcon />}
          ariaLabel="Swap Queue actions"
          align="end"
          triggerClassName="db-btn db-menu-icon-btn"
        >
          <DbMenuItem onSelect={() => void onExportArchidekt()}>Export Archidekt</DbMenuItem>
          <DbMenuItem onSelect={() => void onExportNameQty()}>Export name/qty</DbMenuItem>
          <DbMenuItem onSelect={() => void refresh()}>Refresh</DbMenuItem>
          <MinUsdMenuControl
            value={minUsdInput}
            onChange={(v) => {
              setMinUsdInput(v);
              const raw = v.trim();
              if (!raw) {
                setMinUsd(null);
                return;
              }
              const n = Number(raw);
              setMinUsd(Number.isFinite(n) ? n : null);
            }}
          />
        </DbMenu>
      </header>

      {status ? <p className="hub-muted" role="status">{status}</p> : null}
      {apiWarning ? <p className="db-warn">{apiWarning}</p> : null}
      {error ? <p className="hub-error">{error}</p> : null}
      {loading ? <p className="hub-muted">Loading library…</p> : null}

      {!loading && !error && !hasAny ? (
        <p className="hub-muted" data-testid="swap-queue-empty">
          {hasUnfiltered && filtersActive
            ? 'No queue items match the current filters.'
            : 'No Queued In, Out, or Seeking cards in your library yet.'}
        </p>
      ) : null}

      {!loading && hasAny ? (
        <QueueTilesView
          seeking={lanes.seeking}
          queuedIn={lanes.queued_in}
          queuedOut={lanes.queued_out}
          decks={decks}
          layout={layout}
          unified={unified}
          onSelect={openSource}
          onActivateUnified={activateUnified}
          onFinalizePair={(deckId, entryId) => void finalizePair(deckId, entryId)}
        />
      ) : null}

      {interstitial ? (
        <SourceInterstitial
          row={interstitial}
          onClose={() => setInterstitial(null)}
          onSelectSource={openSource}
        />
      ) : null}

      {addPickerOpen ? (
        <div
          className="db-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Choose deck for new swap"
        >
          <div className="db-modal-card" data-testid="swap-queue-add-deck">
            <h3>Add swap</h3>
            <p className="hub-muted">Choose which deck gets the new empty pair.</p>
            <ul className="sq-add-deck-list">
              {libraryDeckOptions.map((opt) => (
                <li key={opt.deckId}>
                  <button
                    type="button"
                    className="db-btn"
                    onClick={() => void createEmptySwap(opt.deckId)}
                  >
                    {opt.deckName}
                  </button>
                </li>
              ))}
            </ul>
            <div className="db-modal-actions">
              <button type="button" className="db-btn" onClick={() => setAddPickerOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing &&
      (editing.kind === 'queued_in' || editing.kind === 'queued_out') &&
      editingDeck &&
      pairDraft ? (
        <SwapEditChrome
          deck={editingDeck}
          draft={pairDraft}
          onDraftChange={(patch) => setPairDraft((d) => (d ? { ...d, ...patch } : d))}
          onConfirmIn={onConfirmSwapIn}
          onClose={clearEdit}
          onSave={savePairEdit}
          onRemove={removePairEdit}
          onFinalize={finalizePairEdit}
          finalizeDisabled={Boolean(
            pairOriginDeckId && editingDeck.deckId !== pairOriginDeckId,
          )}
          deckOptions={libraryDeckOptions}
          onDeckChange={onPairDeckChange}
          inLookupDeck={
            pairOriginDeckId && pairOriginDeckId !== editingDeck.deckId
              ? originDeckWorking || findDeck(decks, pairOriginDeckId)
              : null
          }
        />
      ) : null}

      {editing && editing.kind === 'seeking' && editingDeck ? (
        <LookingForEditChrome
          deck={editingDeck}
          source={editing}
          onClose={clearEdit}
          onRemove={removeLookingFor}
          onReplace={replaceLookingFor}
          deckOptions={libraryDeckOptions}
          onRetarget={retargetSeeking}
        />
      ) : null}
    </div>
  );
}
