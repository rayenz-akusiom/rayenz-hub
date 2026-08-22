import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  addCardToDeck,
  aggregateSwapWants,
  filterAcquireSources,
  filterWantSources,
  finalizeFormalSwap,
  isTheoryDeck,
  isValidSwapInTargetCategory,
  newFormalSwapEntry,
  partitionWantSourcesBySwimlane,
  retargetFormalSwap,
  retargetLookingFor,
  cancelFormalSwap,
  syncCardsWithFormalSwaps,
  toDeckSummary,
  type DeckDocument,
  type DeckSummary,
  type PrintingFields,
  type UnifiedWantRow,
  type WantSource,
} from '@rayenz-hub/shared';
import {
  defaultBrowseForSwapQueuePath,
  defaultLayoutForSwapQueuePath,
  hubUserSlug,
  isForeignUserSlug,
  parseSwapQueueRoute,
  rewriteRetiredUserSlug,
  swapQueueHash,
  swapQueueShareUrl,
  type SwapQueueBrowseMode,
  type SwapQueueEntryPath,
  type SwapQueueLayoutMode,
} from '../hub/routes';
import { CardSizePicker } from '../deck-builder/CardSizePicker';
import { useCardSize, type CardSizeKey } from '../deck-builder/card-size';
import { LibraryCoverArt } from '../deck-builder/library/LibraryCoverArt';
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
import { saveDualMode } from '../deck-builder/store/deck-dual-mode';
import { listFallbackLibrary, pullRemoteLibraryUpdates } from '../deck-builder/store/library-sync';
import { DbMenu, DbMenuItem } from '../deck-builder/ui/DbMenu';
import { FiltersMenu, filtersMenuLabel } from '../deck-builder/ui/FiltersMenu';
import { FormatBadge } from '../deck-builder/ui/FormatBadge';
import { ActiveFilterChips, type ActiveFilterChip } from '../deck-builder/ui/ActiveFilterChips';
import { SetFilterMenuControl, useSetMembershipFilter } from '../deck-builder/ui/SetFilterControl';
import {
  SyntaxFilterControl,
  useScryfallSyntaxFilter,
} from '../deck-builder/ui/SyntaxFilterControl';
import {
  getHubAuthSession,
  HUB_AUTH_CHANGED_EVENT,
  HUB_AUTH_REQUIRED_EVENT,
  useIsHubOwner,
} from '../lib/hub-auth-session';
import { navigateHub } from '../lib/hub-storage';
import { HubProgress, type HubProgressController } from '../lib/hub-progress';
import '../deck-builder/deck-builder.css';
import { findDeck, loadPublicSwapWantSources, loadSwapWantSources } from './aggregate';
import { enrichWantSourcesUsd } from './enrich-prices';
import { cadToUsd, fetchFxUsdCad, type FxUsdCad } from './fx-cad';
import { LookingForEditChrome } from './LookingForEditChrome';
import {
  CAD_FX_DISCLAIMER,
  formatPricePrimary,
  priceBadgeTitle,
  useSwapQueuePricePrefs,
  type SwapQueueCurrency,
} from './price-prefs';
import { QueueTilesView } from './QueueTilesView';
import { SourceInterstitial } from './SourceInterstitial';
import { SwapsGlanceDialog } from './SwapsGlanceDialog';
import { copyArchidektWants, copyNameQtyWants, copyText } from './export-ui';
import './swap-queue.css';

export type { SwapQueueEntryPath } from '../hub/routes';

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

function SqStatusSlot({
  error,
  apiWarning,
  filterError,
  status,
  loadingFilters,
}: {
  error: string;
  apiWarning: string;
  filterError: string;
  status: string;
  loadingFilters: boolean;
}) {
  const text =
    error || filterError || apiWarning || (loadingFilters ? 'Loading filters…' : '') || status;
  if (!text) return null;
  const kind = error || filterError ? 'error' : apiWarning ? 'warn' : 'muted';
  const className =
    kind === 'error' ? 'hub-banner-error' : kind === 'warn' ? 'hub-warn' : 'hub-muted';
  return (
    <p className={`sq-status-slot ${className}`} role={kind === 'error' ? 'alert' : 'status'}>
      {text}
    </p>
  );
}

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

/** Two fanned cards with “+” on the front (right) card — Add swap FAB icon. */
function SwapAddFabIcon() {
  return (
    <svg
      className="sq-add-fab-icon"
      width="26"
      height="26"
      viewBox="0 0 26 26"
      aria-hidden="true"
    >
      {/* Back / left card */}
      <g transform="rotate(-12 11 13)">
        <rect
          x="4.5"
          y="5.5"
          width="11"
          height="15"
          rx="1.2"
          fill="rgba(255, 255, 255, 0.85)"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </g>
      {/* Front / right card with + */}
      <g transform="rotate(12 15 13)">
        <rect
          x="10.5"
          y="5.5"
          width="11"
          height="15"
          rx="1.2"
          fill="rgba(255, 255, 255, 0.95)"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          fill="currentColor"
          d="M15.2 10.2h1.6v2.4h2.4v1.6h-2.4v2.4h-1.6v-2.4h-2.4v-1.6h2.4z"
        />
      </g>
    </svg>
  );
}

function parseOptionalAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function PriceMenuControl({
  currency,
  onCurrencyChange,
  minInput,
  maxInput,
  onMinChange,
  onMaxChange,
  alwaysShowPrices,
  onAlwaysShowChange,
  fxDate,
  fxUnavailable,
}: {
  currency: SwapQueueCurrency;
  onCurrencyChange: (next: SwapQueueCurrency) => void;
  minInput: string;
  maxInput: string;
  onMinChange: (next: string) => void;
  onMaxChange: (next: string) => void;
  alwaysShowPrices: boolean;
  onAlwaysShowChange: (next: boolean) => void;
  fxDate: string | null;
  fxUnavailable: boolean;
}) {
  const unit = currency;
  return (
    <div
      className="sq-menu-price"
      role="none"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <fieldset className="sq-menu-price-currency">
        <legend>Currency</legend>
        <label>
          <input
            type="radio"
            name="sq-currency"
            checked={currency === 'CAD'}
            onChange={() => onCurrencyChange('CAD')}
          />
          CAD
        </label>
        <label>
          <input
            type="radio"
            name="sq-currency"
            checked={currency === 'USD'}
            onChange={() => onCurrencyChange('USD')}
          />
          USD
        </label>
      </fieldset>
      <p className="sq-menu-price-hint">
        Switching currency keeps min/max numbers; they are reinterpreted in the new unit.
      </p>
      <label className="sq-menu-price-field">
        Min {unit}
        <input
          type="number"
          min={0}
          step={0.01}
          value={minInput}
          placeholder="off"
          aria-label={`Min ${unit}`}
          onChange={(e) => onMinChange(e.target.value)}
        />
      </label>
      <label className="sq-menu-price-field">
        Max {unit}
        <input
          type="number"
          min={0}
          step={0.01}
          value={maxInput}
          placeholder="off"
          aria-label={`Max ${unit}`}
          onChange={(e) => onMaxChange(e.target.value)}
        />
      </label>
      <label className="sq-menu-price-check">
        <input
          type="checkbox"
          checked={alwaysShowPrices}
          onChange={(e) => onAlwaysShowChange(e.target.checked)}
        />
        Always show prices on tiles
      </label>
      {currency === 'CAD' ? (
        <p className="sq-menu-price-hint" role="note">
          {fxUnavailable
            ? 'FX unavailable — showing and filtering in USD.'
            : fxDate
              ? `BoC FX ${fxDate}. ${CAD_FX_DISCLAIMER}`
              : CAD_FX_DISCLAIMER}
        </p>
      ) : null}
    </div>
  );
}

function priceMenuLabel(
  min: number | null,
  max: number | null,
  currency: SwapQueueCurrency,
): string {
  if (min == null && max == null) return 'Off';
  const unit = currency;
  if (min != null && max != null) return `${min}–${max} ${unit}`;
  if (min != null) return `≥${min} ${unit}`;
  return `≤${max} ${unit}`;
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
          Clear decks
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
  const [routeUserSlug, setRouteUserSlug] = useState(
    () => parseSwapQueueRoute()?.userSlug ?? null,
  );
  const [shareUsername, setShareUsername] = useState<string | null>(null);
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
  const [minAmount, setMinAmount] = useState<number | null>(null);
  const [maxAmount, setMaxAmount] = useState<number | null>(null);
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const setFilter = useSetMembershipFilter();
  const syntaxCards = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string }[] = [];
    for (const s of sources) {
      const name = String(s.cardName || '').trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({ name });
    }
    return out;
  }, [sources]);
  const syntaxFilter = useScryfallSyntaxFilter(syntaxCards);
  const {
    currency,
    setCurrency,
    alwaysShowPrices,
    setAlwaysShowPrices,
  } = useSwapQueuePricePrefs();
  const [fx, setFx] = useState<FxUsdCad | null>(null);
  const [fxUnavailable, setFxUnavailable] = useState(false);
  const [status, setStatus] = useState('');
  const [interstitial, setInterstitial] = useState<UnifiedWantRow | null>(null);
  const [editing, setEditing] = useState<WantSource | null>(null);
  const [editingDeck, setEditingDeck] = useState<DeckDocument | null>(null);
  const [pairDraft, setPairDraft] = useState<SwapEditDraft | null>(null);
  const [pairOriginDeckId, setPairOriginDeckId] = useState<string | null>(null);
  const [originDeckWorking, setOriginDeckWorking] = useState<DeckDocument | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [swapsGlanceOpen, setSwapsGlanceOpen] = useState(false);
  const isOwner = useIsHubOwner();
  const { size: cardSize, widthPx: cardWidthPx, setSize: setCardSize } = useCardSize();
  const editingDeckRef = useRef(editingDeck);
  const pairDraftRef = useRef(pairDraft);
  const pairOriginDeckIdRef = useRef(pairOriginDeckId);
  const originDeckWorkingRef = useRef(originDeckWorking);
  const decksRef = useRef(decks);
  const autosaveTimerRef = useRef(0);
  const progressHostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HubProgressController | null>(null);
  editingDeckRef.current = editingDeck;
  pairDraftRef.current = pairDraft;
  pairOriginDeckIdRef.current = pairOriginDeckId;
  originDeckWorkingRef.current = originDeckWorking;
  decksRef.current = decks;
  const readOnly = isForeignUserSlug(routeUserSlug);

  useEffect(() => {
    function syncRoute() {
      const parsed = parseSwapQueueRoute();
      if (!parsed) {
        setRouteUserSlug(null);
        return;
      }
      const rewritten = rewriteRetiredUserSlug(parsed.userSlug);
      if (rewritten !== parsed.userSlug) {
        navigateHub(swapQueueHash(rewritten, entryPath));
      }
      setRouteUserSlug(rewritten);
    }
    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, [entryPath]);

  useEffect(() => {
    const username = getHubAuthSession()?.username?.trim();
    const slug = username ? hubUserSlug() : '';
    if (!slug || parseSwapQueueRoute()) return;
    navigateHub(swapQueueHash(slug, entryPath));
  }, [entryPath]);

  useEffect(() => {
    setBrowse(defaultBrowseForSwapQueuePath(pathKey));
    setLayout(defaultLayoutForSwapQueuePath(pathKey));
  }, [pathKey]);

  async function refresh() {
    setLoading(true);
    setError('');
    setApiWarning('');
    const progress = progressRef.current;
    progress?.start({ label: 'Loading library…', indeterminate: true });
    const parsedSlug = parseSwapQueueRoute()?.userSlug ?? null;
    const userSlug = parsedSlug ? rewriteRetiredUserSlug(parsedSlug) : null;
    const viewingOther = isForeignUserSlug(userSlug);
    try {
      if (viewingOther && userSlug) {
        const result = await loadPublicSwapWantSources(userSlug);
        if (!result) {
          setShareUsername(null);
          setDecks([]);
          setSources([]);
          setError(`Unknown user “${userSlug}”`);
          progress?.finish({ label: 'Could not load library.', variant: 'error' });
          return;
        }
        setShareUsername(result.username || result.slug);
        setDecks(result.decks);
        setSources(result.sources);
        void enrichWantSourcesUsd(result.sources).then((enriched) => {
          setSources(enriched);
        });
        progress?.dismiss();
        return;
      }
      setShareUsername(null);
      let list: DeckSummary[] | undefined;
      try {
        list = await pullRemoteLibraryUpdates();
      } catch (e) {
        setApiWarning(e instanceof Error ? e.message : String(e));
        try {
          list = await listFallbackLibrary();
        } catch {
          setError(
            getHubAuthSession()?.accessToken
              ? 'Could not load library from Hub API.'
              : e instanceof Error
                ? e.message
                : String(e),
          );
          setDecks([]);
          setSources([]);
          progress?.finish({ label: 'Could not load library.', variant: 'error' });
          return;
        }
      }
      const result = await loadSwapWantSources(list);
      setDecks(result.decks);
      setSources(result.sources);
      void enrichWantSourcesUsd(result.sources).then((enriched) => {
        setSources(enriched);
      });
      progress?.dismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      progress?.finish({ label: 'Could not load library.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (progressHostRef.current && !progressRef.current) {
      progressRef.current = HubProgress.mount(progressHostRef.current);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [routeUserSlug]);

  useEffect(() => {
    function onAuthChanged() {
      const username = getHubAuthSession()?.username?.trim();
      const slug = username ? hubUserSlug() : '';
      if (slug && !parseSwapQueueRoute()) {
        navigateHub(swapQueueHash(slug, entryPath));
        return;
      }
      void refresh();
    }
    window.addEventListener(HUB_AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthChanged);
    return () => {
      window.removeEventListener(HUB_AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthChanged);
    };
  }, [entryPath]);

  useEffect(() => {
    let cancelled = false;
    if (currency !== 'CAD') {
      setFx(null);
      setFxUnavailable(false);
      return;
    }
    void fetchFxUsdCad().then((next) => {
      if (cancelled) return;
      if (next) {
        setFx(next);
        setFxUnavailable(false);
      } else {
        setFx(null);
        setFxUnavailable(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const effectiveCurrency: SwapQueueCurrency =
    currency === 'CAD' && fxUnavailable ? 'USD' : currency;
  const fxRate = fx?.rate ?? null;

  function toUsdThreshold(amount: number | null): number | null {
    if (amount == null) return null;
    if (effectiveCurrency === 'CAD' && fxRate != null && fxRate > 0) {
      return cadToUsd(amount, fxRate);
    }
    return amount;
  }

  const minUsd = toUsdThreshold(minAmount);
  const maxUsd = toUsdThreshold(maxAmount);
  const priceFilterActive = minAmount != null || maxAmount != null;
  const showPrices = alwaysShowPrices || priceFilterActive;

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
      .filter((d) => !isTheoryDeck(d))
      .map((d) => ({ deckId: d.deckId, deckName: d.name }))
      .sort((a, b) => a.deckName.localeCompare(b.deckName));
  }, [decks]);

  const libraryDeckSummaries = useMemo((): DeckSummary[] => {
    return [...decks]
      .filter((d) => !isTheoryDeck(d))
      .map((d) => toDeckSummary(d))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [decks]);

  const visible = useMemo(
    () =>
      filterWantSources(sources, {
        minUsd,
        maxUsd,
        deckIds: selectedDeckIds.length ? selectedDeckIds : null,
        setMembership:
          setFilter.appliedCodes.length && setFilter.membership
            ? setFilter.membership
            : null,
        setExcludeMembership:
          setFilter.appliedExcludeCodes.length && setFilter.excludeMembership
            ? setFilter.excludeMembership
            : null,
        syntaxMembership: syntaxFilter.active ? syntaxFilter.membership : null,
      }),
    [
      sources,
      minUsd,
      maxUsd,
      selectedDeckIds,
      setFilter.appliedCodes.length,
      setFilter.membership,
      setFilter.appliedExcludeCodes.length,
      setFilter.excludeMembership,
      syntaxFilter.active,
      syntaxFilter.membership,
    ],
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
    window.clearTimeout(autosaveTimerRef.current);
    setEditing(null);
    setEditingDeck(null);
    setPairDraft(null);
    setPairOriginDeckId(null);
    setOriginDeckWorking(null);
    setAddPickerOpen(false);
  }

  function applyLocalDecks(savedDocs: DeckDocument[]) {
    const byId = new Map(decksRef.current.map((d) => [d.deckId, d]));
    for (const doc of savedDocs) {
      byId.set(doc.deckId, doc);
    }
    const nextDecks = [...byId.values()];
    decksRef.current = nextDecks;
    setDecks(nextDecks);
    const nextSources = aggregateSwapWants(nextDecks);
    setSources(nextSources);
    void enrichWantSourcesUsd(nextSources).then((enriched) => {
      setSources(enriched);
    });
    return nextDecks;
  }

  async function persistDecks(
    docs: DeckDocument[],
    opts?: { closeEdit?: boolean },
  ): Promise<DeckDocument[]> {
    const savedDocs: DeckDocument[] = [];
    let apiError: string | undefined;
    for (const doc of docs) {
      const { saved, apiError: err } = await saveDualMode(doc);
      savedDocs.push(saved);
      if (err) apiError = err;
    }
    applyLocalDecks(savedDocs);
    if (opts?.closeEdit) clearEdit();
    setStatus(apiError ? `Saved locally (${apiError})` : 'Saved');
    return savedDocs;
  }

  async function persistDeck(next: DeckDocument, opts?: { closeEdit?: boolean }) {
    return persistDecks([next], opts);
  }

  function openSource(source: WantSource) {
    if (readOnly) return;
    window.clearTimeout(autosaveTimerRef.current);
    setInterstitial(null);
    const deck = findDeck(decksRef.current, source.deckId);
    if (!deck || isTheoryDeck(deck)) return;
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

  function categoryValidOnDeck(deck: DeckDocument, category: string | null): string | null {
    if (!isValidSwapInTargetCategory(deck.categories || [], category)) return null;
    return String(category).trim();
  }

  function syncedFromDraft(deck: DeckDocument, draft: SwapEditDraft): DeckDocument {
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
    return syncCardsWithFormalSwaps(deck, entries);
  }

  async function autosavePairEdit(draftOverride?: SwapEditDraft) {
    const deck = editingDeckRef.current;
    const draft = draftOverride ?? pairDraftRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!deck || !draft || !originId) return;
    if (deck.deckId !== originId) return;

    const next = syncedFromDraft(deck, draft);
    const saved = await persistDeck(next, { closeEdit: false });
    const savedDeck = saved[0];
    if (!savedDeck) return;
    editingDeckRef.current = savedDeck;
    originDeckWorkingRef.current = savedDeck;
    setEditingDeck(savedDeck);
    setOriginDeckWorking(savedDeck);
  }

  function schedulePairAutosave(nextDraft: SwapEditDraft) {
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void autosavePairEdit(nextDraft);
    }, 300);
  }

  function patchPairDraft(patch: Partial<SwapEditDraft>) {
    setPairDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      pairDraftRef.current = next;
      schedulePairAutosave(next);
      return next;
    });
  }

  async function onPairDeckChange(nextDeckId: string) {
    window.clearTimeout(autosaveTimerRef.current);
    const draft = pairDraftRef.current;
    const current = editingDeckRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!draft || !current || !originId || nextDeckId === current.deckId) return;

    const target = findDeck(decksRef.current, nextDeckId);
    if (!target) return;

    // Flush same-deck draft onto current before retarget when still on origin.
    let source = current;
    if (current.deckId === originId) {
      source = syncedFromDraft(current, draft);
    }

    const sourceWithEntry =
      source.formalSwapEntries.some((e) => e.id === draft.entryId)
        ? source
        : findDeck(decksRef.current, originId);
    if (!sourceWithEntry?.formalSwapEntries.some((e) => e.id === draft.entryId)) return;

    const moved = retargetFormalSwap(sourceWithEntry, target, draft.entryId, {
      inInstanceId: draft.inInstanceId,
      inTargetCategory: categoryValidOnDeck(target, draft.inTargetCategory),
      notes: draft.notes,
    });
    if (!moved) return;

    const saved = await persistDecks([moved.source, moved.target], { closeEdit: false });
    const newTarget =
      saved.find((d) => d.deckId === nextDeckId) ||
      findDeck(decksRef.current, nextDeckId) ||
      moved.target;
    const entry = newTarget.formalSwapEntries.find((e) => e.id === draft.entryId);
    const nextDraft = entry
      ? draftFromFormalEntry(entry)
      : {
          ...draft,
          outInstanceId: null,
          inTargetCategory: categoryValidOnDeck(newTarget, draft.inTargetCategory),
        };

    setEditingDeck(newTarget);
    setPairOriginDeckId(newTarget.deckId);
    setOriginDeckWorking(newTarget);
    setPairDraft(nextDraft);
    setEditing({
      deckId: newTarget.deckId,
      deckName: newTarget.name,
      format: newTarget.format,
      kind: nextDraft.inInstanceId ? 'queued_in' : 'queued_out',
      entryId: draft.entryId,
      cardInstanceId: nextDraft.inInstanceId || nextDraft.outInstanceId || '',
      cardName: '',
      mergeKey: draft.entryId,
      quantity: 1,
      usd: null,
      setCode: null,
      collectorNumber: null,
      foil: false,
      outInstanceId: nextDraft.outInstanceId,
      inInstanceId: nextDraft.inInstanceId,
      pairIncomplete: !nextDraft.inInstanceId || !nextDraft.outInstanceId,
    });
  }

  function removePairEdit() {
    window.clearTimeout(autosaveTimerRef.current);
    const deck = editingDeckRef.current;
    const draft = pairDraftRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!deck || !draft || !originId) return;

    if (deck.deckId === originId) {
      void persistDeck(cancelFormalSwap(deck, draft.entryId), { closeEdit: true });
      return;
    }

    const origin = findDeck(decksRef.current, originId);
    if (!origin) return;
    void persistDeck(cancelFormalSwap(origin, draft.entryId), { closeEdit: true });
  }

  function finalizePairEdit() {
    window.clearTimeout(autosaveTimerRef.current);
    const deck = editingDeckRef.current;
    const draft = pairDraftRef.current;
    const originId = pairOriginDeckIdRef.current;
    if (!deck || !draft || !originId) return;
    if (deck.deckId !== originId) return;
    if (!draft.inInstanceId || !draft.outInstanceId) return;

    const staged = syncedFromDraft(deck, draft);
    const done = finalizeFormalSwap(staged, draft.entryId);
    if (!done) return;
    void persistDeck(done, { closeEdit: true });
  }

  async function finalizePair(deckId: string, entryId: string) {
    const deck = findDeck(decksRef.current, deckId);
    if (!deck) return;
    const done = finalizeFormalSwap(deck, entryId);
    if (!done) return;
    await persistDeck(done, { closeEdit: true });
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
    const excludeOutIds = new Set(
      (deck.formalSwapEntries || [])
        .map((e) => e.outInstanceId)
        .filter((id): id is string => Boolean(id)),
    );
    if (draft.outInstanceId) excludeOutIds.add(draft.outInstanceId);
    const existing = findMatchingPrintingInstance(deck, printing, {
      proxy: meta?.proxy,
      excludeInstanceIds: excludeOutIds,
    });
    if (existing) {
      patchPairDraft({
        inInstanceId: existing.instanceId,
        inTargetCategory: category,
      });
      return;
    }
    const before = new Set(deck.cards.map((c) => c.instanceId));
    const next = addCardToDeck(deck, printing, category, { proxy: meta?.proxy });
    const added = next.cards.find((c) => !before.has(c.instanceId));
    editingDeckRef.current = next;
    setEditingDeck(next);
    if (originId && next.deckId === originId) {
      originDeckWorkingRef.current = next;
      setOriginDeckWorking(next);
    }
    if (added) {
      const nextDraft = {
        ...draft,
        inInstanceId: added.instanceId,
        inTargetCategory: category,
      };
      pairDraftRef.current = nextDraft;
      setPairDraft(nextDraft);
      schedulePairAutosave(nextDraft);
    }
  }

  async function createEmptySwap(deckId: string) {
    const deck = findDeck(decksRef.current, deckId);
    if (!deck || isTheoryDeck(deck)) return;
    const entry = newFormalSwapEntry(deck.formalSwapEntries.length);
    const next = syncCardsWithFormalSwaps(deck, [...deck.formalSwapEntries, entry]);
    const saved = await persistDeck(next, { closeEdit: false });
    const savedDeck = saved[0] || next;
    setAddPickerOpen(false);
    setEditing({
      deckId: savedDeck.deckId,
      deckName: savedDeck.name,
      format: savedDeck.format,
      kind: 'queued_in',
      entryId: entry.id,
      cardInstanceId: '',
      cardName: '',
      mergeKey: entry.id,
      quantity: 1,
      usd: null,
      setCode: null,
      collectorNumber: null,
      foil: false,
      outInstanceId: null,
      inInstanceId: null,
      pairIncomplete: true,
    });
    setEditingDeck(savedDeck);
    setPairOriginDeckId(savedDeck.deckId);
    setOriginDeckWorking(savedDeck);
    setPairDraft(draftFromFormalEntry(entry));
    setStatus('Added swap');
  }

  function removeLookingFor() {
    const deck = editingDeckRef.current;
    const source = editing;
    if (!deck || !source || source.kind !== 'seeking') return;
    void persistDeck(removeLookingForEntry(deck, source.entryId), { closeEdit: true });
  }

  function replaceLookingFor(printing: PrintingFields, meta?: { proxy: boolean }) {
    const deck = editingDeckRef.current;
    const source = editing;
    if (!deck || !source || source.kind !== 'seeking') return;
    const without = removeLookingForEntry(deck, source.entryId);
    void persistDeck(addLookingForCard(without, printing, meta), { closeEdit: true });
  }

  function retargetSeeking(nextDeckId: string) {
    const deck = editingDeckRef.current;
    const source = editing;
    if (!deck || !source || source.kind !== 'seeking') return;
    if (nextDeckId === deck.deckId) return;
    const target = findDeck(decksRef.current, nextDeckId);
    if (!target) return;
    const moved = retargetLookingFor(deck, target, source.entryId);
    if (!moved) return;
    void persistDecks([moved.source, moved.target], { closeEdit: true });
  }

  async function onExportArchidekt() {
    const ok = await copyArchidektWants(exportSources);
    setStatus(ok ? 'Copied Archidekt-style list' : 'Copy failed');
  }

  async function onExportNameQty() {
    const ok = await copyNameQtyWants(exportSources);
    setStatus(ok ? 'Copied name/qty list' : 'Copy failed');
  }

  async function onCopyShareLink() {
    const slug = routeUserSlug || (getHubAuthSession()?.username?.trim() ? hubUserSlug() : '');
    if (!slug) {
      setStatus('Sign in to copy a share link');
      return;
    }
    const ok = await copyText(swapQueueShareUrl(slug));
    setStatus(ok ? 'Copied share link' : 'Copy failed');
  }

  function onCardSizeChange(next: CardSizeKey) {
    setCardSize(next);
  }

  const unified = browse === 'unified';
  const hasAny =
    lanes.seeking.length + lanes.queued_in.length + lanes.queued_out.length > 0;
  const hasUnfiltered = sources.length > 0;
  const filtersActive =
    priceFilterActive ||
    selectedDeckIds.length > 0 ||
    setFilter.active ||
    syntaxFilter.active;

  function applyNetworkFilters() {
    void Promise.all([setFilter.apply(), syntaxFilter.apply()]);
  }

  function clearAllFilters() {
    setFilter.clear();
    syntaxFilter.clear();
    setSelectedDeckIds([]);
    setMinAmount(null);
    setMaxAmount(null);
    setMinInput('');
    setMaxInput('');
  }

  const filtersValue = filtersMenuLabel([
    syntaxFilter.active ? syntaxFilter.label : '',
    selectedDeckIds.length ? deckFilterLabel(selectedDeckIds, deckOptions) : '',
    setFilter.active ? setFilter.label : '',
    priceFilterActive ? priceMenuLabel(minAmount, maxAmount, effectiveCurrency) : '',
  ]);

  const filterChips: ActiveFilterChip[] = [];
  if (syntaxFilter.active && syntaxFilter.label) {
    filterChips.push({
      id: 'syntax',
      label: syntaxFilter.label,
      onDismiss: () => syntaxFilter.clear(),
    });
  }
  if (selectedDeckIds.length) {
    filterChips.push({
      id: 'decks',
      label: deckFilterLabel(selectedDeckIds, deckOptions),
      onDismiss: () => setSelectedDeckIds([]),
    });
  }
  if (setFilter.active && setFilter.label) {
    filterChips.push({
      id: 'set',
      label: setFilter.label,
      onDismiss: () => setFilter.clear(),
    });
  }
  if (priceFilterActive) {
    filterChips.push({
      id: 'price',
      label: priceMenuLabel(minAmount, maxAmount, effectiveCurrency),
      onDismiss: () => {
        setMinAmount(null);
        setMaxAmount(null);
        setMinInput('');
        setMaxInput('');
      },
    });
  }

  const shellStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
    ['--db-swap-card-w']: `${cardWidthPx}px`,
  } as CSSProperties;

  function switchQueueMode(next: SwapQueueEntryPath) {
    if (next === entryPath) return;
    navigateHub(swapQueueHash(routeUserSlug, next));
  }

  const queueTitle = entryPath === 'wishlist' ? 'Wishlist' : 'Swap Queue';
  const titlePerson = shareUsername || routeUserSlug;
  const filterError = setFilter.error || syntaxFilter.error || '';

  return (
    <div
      className="hub-app swap-queue-app"
      data-entry-path={entryPath}
      data-browse={browse}
      data-layout={layout}
      data-readonly={readOnly ? 'true' : undefined}
      style={shellStyle}
    >
      <div className="hub-sticky-chrome">
        <div className="sq-chrome-title">
          <div className="sq-title-row">
            <h1>{readOnly && titlePerson ? `${titlePerson}'s ${queueTitle}` : queueTitle}</h1>
            <div className="sq-mode" role="group" aria-label="Queue mode">
              <button
                type="button"
                className={`sq-mode-btn${entryPath === 'swap-queue' ? ' is-active' : ''}`}
                aria-pressed={entryPath === 'swap-queue'}
                onClick={() => switchQueueMode('swap-queue')}
              >
                Swap Queue
              </button>
              <button
                type="button"
                className={`sq-mode-btn${entryPath === 'wishlist' ? ' is-active' : ''}`}
                aria-pressed={entryPath === 'wishlist'}
                onClick={() => switchQueueMode('wishlist')}
              >
                Wishlist
              </button>
            </div>
          </div>
          <p className="hub-muted">
            {readOnly
              ? 'Read-only view of Seeking, Queued In, and Out.'
              : entryPath === 'wishlist'
                ? 'Same Seeking, Queued In, and Out queues, shown as a grid by default.'
                : 'Manage Seeking, Queued In, and Out across your decks.'}
          </p>
        </div>

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
          <FiltersMenu
            value={filtersValue}
            loading={setFilter.loading || syntaxFilter.loading}
            ariaDetail={filtersValue !== 'All' ? filtersValue : undefined}
            onApply={applyNetworkFilters}
            onClear={clearAllFilters}
            applyLoading={setFilter.loading || syntaxFilter.loading}
          >
            <SyntaxFilterControl
              value={syntaxFilter.queryInput}
              onChange={syntaxFilter.setQueryInput}
              onApply={applyNetworkFilters}
              error={syntaxFilter.error}
            />
            <DeckFilterMenuControl
              options={deckOptions}
              selectedIds={selectedDeckIds}
              onChange={setSelectedDeckIds}
            />
            <SetFilterMenuControl
              value={setFilter.setCodesInput}
              onChange={setFilter.setSetCodesInput}
              excludeValue={setFilter.excludeCodesInput}
              onExcludeChange={setFilter.setExcludeCodesInput}
              showExclude
              hideActions
              onApply={applyNetworkFilters}
              onClear={setFilter.clear}
              loading={setFilter.loading}
              error={setFilter.error}
            />
            <PriceMenuControl
              currency={currency}
              onCurrencyChange={setCurrency}
              minInput={minInput}
              maxInput={maxInput}
              onMinChange={(v) => {
                setMinInput(v);
                setMinAmount(parseOptionalAmount(v));
              }}
              onMaxChange={(v) => {
                setMaxInput(v);
                setMaxAmount(parseOptionalAmount(v));
              }}
              alwaysShowPrices={alwaysShowPrices}
              onAlwaysShowChange={setAlwaysShowPrices}
              fxDate={fx?.date ?? null}
              fxUnavailable={fxUnavailable}
            />
          </FiltersMenu>
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
          <DbMenuItem onSelect={() => void onCopyShareLink()}>Copy share link</DbMenuItem>
          {isOwner && !readOnly ? (
            <DbMenuItem onSelect={() => setSwapsGlanceOpen(true)}>Swaps at a glance…</DbMenuItem>
          ) : null}
          <DbMenuItem onSelect={() => void refresh()}>Refresh</DbMenuItem>
        </DbMenu>
      </header>
        <div className="hub-progress-host" ref={progressHostRef} id="sq-progress-host" />
        <ActiveFilterChips chips={filterChips} onClearAll={clearAllFilters} />
      </div>

      <div className="sq-body">
      <SqStatusSlot
        error={error}
        apiWarning={apiWarning}
        filterError={filterError}
        status={status}
        loadingFilters={setFilter.loading || syntaxFilter.loading}
      />

      {!loading && !error && !hasAny ? (
        <div className="db-empty-state" data-testid="swap-queue-empty">
          {hasUnfiltered && filtersActive ? (
            <p>No queue items match the current filters.</p>
          ) : (
            <>
              <p>
                {readOnly
                  ? 'No Queued In, Out, or Seeking cards in this library yet.'
                  : 'No Queued In, Out, or Seeking cards in your library yet.'}
              </p>
              {readOnly ? null : (
                <>
                  <p>
                    Seeking is cards you want. Queued In and Out are planned swaps. Add a swap
                    to get started.
                  </p>
                  <div className="hub-empty-actions">
                    <button
                      type="button"
                      className="db-btn"
                      disabled={!libraryDeckOptions.length}
                      title={
                        libraryDeckOptions.length
                          ? undefined
                          : 'Open a deck in Commander or Cube Builder first'
                      }
                      onClick={() => setAddPickerOpen(true)}
                    >
                      Add swap
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : null}

      {!loading && hasAny ? (
        <QueueTilesView
          seeking={lanes.seeking}
          queuedIn={lanes.queued_in}
          queuedOut={lanes.queued_out}
          decks={decks}
          layout={layout}
          unified={unified}
          onSelect={readOnly ? undefined : openSource}
          onActivateUnified={readOnly ? undefined : activateUnified}
          onFinalizePair={readOnly ? undefined : (deckId, entryId) => void finalizePair(deckId, entryId)}
          showPrices={showPrices}
          formatPrice={(usd) => formatPricePrimary(usd, effectiveCurrency, fxRate)}
          priceTitle={(usd) => priceBadgeTitle(usd, effectiveCurrency, fxRate)}
        />
      ) : null}
      </div>

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
          <div className="db-modal-card db-modal-wide" data-testid="swap-queue-add-deck">
            <h3>Add swap</h3>
            <p className="hub-muted">Choose which deck gets the new empty pair.</p>
            <ul className="sq-add-deck-grid db-library-grid">
              {libraryDeckSummaries.map((d) => {
                const dual = Boolean(d.coverImageUrl && d.coverImageUrlSecondary);
                return (
                  <li
                    key={d.deckId}
                    className={`db-library-tile${dual ? ' is-partner-pair' : ''}${
                      d.coverPartnerStatus === 'illegal' ? ' is-illegal-pair' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="db-library-tile-open"
                      aria-label={d.name}
                      title={
                        d.coverPartnerStatus === 'illegal'
                          ? `${d.name} — These commanders can’t partner`
                          : d.name
                      }
                      onClick={() => void createEmptySwap(d.deckId)}
                    >
                      <LibraryCoverArt deck={d} />
                      <span className="db-library-tile-caption">
                        <FormatBadge format={d.format} />
                        <span className="db-library-tile-name">{d.name}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
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
          onDraftChange={patchPairDraft}
          onConfirmIn={onConfirmSwapIn}
          onClose={() => {
            window.clearTimeout(autosaveTimerRef.current);
            const draft = pairDraftRef.current;
            if (draft) void autosavePairEdit(draft).finally(() => clearEdit());
            else clearEdit();
          }}
          onRemove={removePairEdit}
          onFinalize={finalizePairEdit}
          finalizeDisabled={Boolean(
            pairOriginDeckId && editingDeck.deckId !== pairOriginDeckId,
          )}
          deckOptions={libraryDeckOptions}
          onDeckChange={(deckId) => void onPairDeckChange(deckId)}
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

      {readOnly || (!loading && !error && !hasAny && !(hasUnfiltered && filtersActive)) ? null : (
      <button
        type="button"
        className="db-add-fab"
        aria-label="Add swap"
        title="Add swap"
        disabled={!libraryDeckOptions.length}
        onClick={() => setAddPickerOpen(true)}
      >
        <SwapAddFabIcon />
      </button>
      )}

      {readOnly ? null : (
      <SwapsGlanceDialog
        open={swapsGlanceOpen}
        sources={visible}
        setCodes={setFilter.active ? setFilter.appliedCodes : []}
        onClose={() => setSwapsGlanceOpen(false)}
      />
      )}
    </div>
  );
}
