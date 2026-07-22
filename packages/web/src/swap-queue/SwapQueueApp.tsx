import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  addCardToDeck,
  filterAcquireSources,
  filterWantSources,
  partitionWantSourcesBySwimlane,
  syncCardsWithFormalSwaps,
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

export function SwapQueueApp({ entryPath = 'swap-queue' }: SwapQueueAppProps) {
  const pathKey = entryPath === 'wishlist' ? '/wishlist' : '/swap-queue';
  const [decks, setDecks] = useState<DeckDocument[]>([]);
  const [sources, setSources] = useState<WantSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [browse, setBrowse] = useState<SwapQueueBrowseMode>(() =>
    defaultBrowseForSwapQueuePath(pathKey),
  );
  const [layout, setLayout] = useState<SwapQueueLayoutMode>(() =>
    defaultLayoutForSwapQueuePath(pathKey),
  );
  const [minUsd, setMinUsd] = useState<number | null>(null);
  const [minUsdInput, setMinUsdInput] = useState('');
  const [status, setStatus] = useState('');
  const [interstitial, setInterstitial] = useState<UnifiedWantRow | null>(null);
  const [editing, setEditing] = useState<WantSource | null>(null);
  const [editingDeck, setEditingDeck] = useState<DeckDocument | null>(null);
  const [pairDraft, setPairDraft] = useState<SwapEditDraft | null>(null);
  const { size: cardSize, widthPx: cardWidthPx, setSize: setCardSize } = useCardSize();
  const editingDeckRef = useRef(editingDeck);
  const pairDraftRef = useRef(pairDraft);
  editingDeckRef.current = editingDeck;
  pairDraftRef.current = pairDraft;

  useEffect(() => {
    setBrowse(defaultBrowseForSwapQueuePath(pathKey));
    setLayout(defaultLayoutForSwapQueuePath(pathKey));
  }, [pathKey]);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
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

  const visible = useMemo(
    () => filterWantSources(sources, { minUsd }),
    [sources, minUsd],
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
  }

  function openSource(source: WantSource) {
    setInterstitial(null);
    const deck = findDeck(decks, source.deckId);
    if (!deck) return;
    setEditing(source);
    setEditingDeck(deck);
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

  async function persistDeck(next: DeckDocument) {
    await saveDeck(next);
    clearEdit();
    setStatus('Saved');
    await refresh();
  }

  function savePairEdit() {
    const deck = editingDeckRef.current;
    const draft = pairDraftRef.current;
    if (!deck || !draft) return;
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
  }

  function removePairEdit() {
    const deck = editingDeckRef.current;
    const draft = pairDraftRef.current;
    if (!deck || !draft) return;
    const entries = deck.formalSwapEntries
      .filter((e) => e.id !== draft.entryId)
      .map((e, i) => ({ ...e, sortIndex: i }));
    void persistDeck(syncCardsWithFormalSwaps(deck, entries));
  }

  function onConfirmSwapIn(
    printing: PrintingFields,
    category: string,
    meta?: { proxy: boolean },
  ) {
    const draft = pairDraftRef.current;
    const deck = editingDeckRef.current;
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
    if (added) {
      setPairDraft({ ...draft, inInstanceId: added.instanceId, inTargetCategory: category });
    }
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
          <CardSizePicker size={cardSize} onChange={onCardSizeChange} />
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
      {error ? <p className="hub-error">{error}</p> : null}
      {loading ? <p className="hub-muted">Loading library…</p> : null}

      {!loading && !error && !hasAny ? (
        <p className="hub-muted" data-testid="swap-queue-empty">
          No Queued In, Out, or Seeking cards in your library yet.
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
        />
      ) : null}

      {interstitial ? (
        <SourceInterstitial
          row={interstitial}
          onClose={() => setInterstitial(null)}
          onSelectSource={openSource}
        />
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
        />
      ) : null}

      {editing && editing.kind === 'seeking' && editingDeck ? (
        <LookingForEditChrome
          deck={editingDeck}
          source={editing}
          onClose={clearEdit}
          onRemove={removeLookingFor}
          onReplace={replaceLookingFor}
        />
      ) : null}
    </div>
  );
}
