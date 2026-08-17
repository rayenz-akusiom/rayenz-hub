import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  cardDisplayName,
  categoryIncluded,
  defaultSwapInTargetCategory,
  inTargetCategoryFromOutCard,
  isSwapQueueCategory,
  resolveDeckCards,
  type CardView,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { CardTile } from '../browse/CardTile';
import { PrintingPickerModal } from '../scryfall/PrintingPickerModal';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import { FinalizeSwapConfirmDialog } from './FinalizeSwapConfirm';
import { openOutCardPicker, type OutPickerFilter } from './swap-pickers';
import { SwapArrow } from './swap-pair-faces';

export type SwapEditDraft = {
  entryId: string;
  inInstanceId: string | null;
  outInstanceId: string | null;
  inTargetCategory: string | null;
  notes: string;
};

export type SwapEditDeckOption = { deckId: string; deckName: string };

export type SuggestAcceptInCard = {
  name: string;
  scryfallId?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
};

export type SuggestAcceptPrintingChoice = {
  printing: PrintingFields;
  proxy?: boolean;
};

export function draftFromFormalEntry(entry: {
  id: string;
  inInstanceId: string | null;
  outInstanceId: string | null;
  inTargetCategory?: string | null;
  notes?: string | null;
}): SwapEditDraft {
  return {
    entryId: entry.id,
    inInstanceId: entry.inInstanceId,
    outInstanceId: entry.outInstanceId,
    inTargetCategory: entry.inTargetCategory ?? null,
    notes: entry.notes || '',
  };
}

function hasUsableSuggestPrinting(suggestIn: SuggestAcceptInCard | null | undefined): boolean {
  if (!suggestIn?.name) return false;
  if (suggestIn.scryfallId) return true;
  return Boolean(suggestIn.setCode && suggestIn.collectorNumber);
}

function choiceFromSuggestIn(suggestIn: SuggestAcceptInCard): SuggestAcceptPrintingChoice {
  return {
    printing: {
      name: suggestIn.name,
      scryfallId: suggestIn.scryfallId || '',
      setCode: suggestIn.setCode || '',
      collectorNumber: suggestIn.collectorNumber || '',
      typeLine: null,
      colourIdentity: [],
      layout: null,
      foil: false,
      printedName: null,
      flavorName: null,
      manaValue: null,
    },
    proxy: false,
  };
}

/** Preview tile for a suggestion In that is not yet on the deck. */
export function suggestInCardView(
  suggestIn: SuggestAcceptInCard,
  pending: SuggestAcceptPrintingChoice | null,
): CardView {
  const p = pending?.printing;
  return {
    instanceId: 'suggest-accept-in',
    name: suggestIn.name,
    quantity: 1,
    primaryCategory: 'Queued In',
    categories: ['Queued In'],
    stack: null,
    setCode: p?.setCode || suggestIn.setCode || null,
    collectorNumber: p?.collectorNumber || suggestIn.collectorNumber || null,
    scryfallId: p?.scryfallId || suggestIn.scryfallId || null,
    archidektCardId: null,
    foil: Boolean(p?.foil),
    proxy: Boolean(pending?.proxy),
    colourIdentity: p?.colourIdentity || [],
    typeLine: p?.typeLine ?? null,
    layout: p?.layout ?? null,
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: p?.printedName ?? null,
    flavorName: p?.flavorName ?? null,
    manaValue: p?.manaValue ?? null,
    imageUrl: null,
  };
}

function SwapEditSlot({
  card,
  role,
  label,
  onChange,
}: {
  card: ReturnType<typeof resolveDeckCards>[number] | null;
  role: 'out' | 'in';
  /** When set and card is null, show this label instead of "Choose". */
  label?: string | null;
  onChange: () => void;
}) {
  const roleLabel = role === 'out' ? 'Out' : 'In';
  return (
    <div className="db-swap-edit-slot">
      {card ? (
        <CardTile
          card={card}
          selected={false}
          onSelect={() => onChange()}
          actionLabel={`Change ${roleLabel}`}
        />
      ) : (
        <button
          type="button"
          className="db-swap-edit-empty"
          aria-label={label ? `${roleLabel}: ${label}` : `Choose ${roleLabel}`}
          onClick={onChange}
        >
          {label || 'Choose'}
        </button>
      )}
    </div>
  );
}

function useModalScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const main = document.querySelector('.hub-main') as HTMLElement | null;
    const prevMain = main?.style.overflow ?? '';
    const prevBody = document.body.style.overflow;
    if (main) main.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      if (main) main.style.overflow = prevMain;
      document.body.style.overflow = prevBody;
    };
  }, [active]);
}

export function SwapEditChrome({
  deck,
  draft,
  onDraftChange,
  onConfirmIn,
  onClose,
  onRemove,
  onFinalize,
  finalizeDisabled,
  deckOptions,
  onDeckChange,
  inLookupDeck,
  mode = 'edit',
  showSeekingTab = false,
  suggestIn,
  outPickerFilter,
  onAcceptSwap,
  onAcceptSeeking,
}: {
  deck: DeckDocument;
  draft: SwapEditDraft;
  onDraftChange: (patch: Partial<SwapEditDraft>) => void;
  onConfirmIn: (printing: PrintingFields, category: string, meta?: { proxy: boolean }) => void;
  onClose: () => void;
  onRemove?: () => void;
  /** Commit the swap: remove Out, keep In, drop the queue entry. */
  onFinalize?: () => void;
  /** When true, Finalize is shown but disabled (e.g. retarget in progress). */
  finalizeDisabled?: boolean;
  /** When set, shows a Deck select for retargeting (Swap Queue). */
  deckOptions?: SwapEditDeckOption[];
  onDeckChange?: (deckId: string) => void;
  /** Extra deck used to resolve In when it still lives on the origin after a retarget. */
  inLookupDeck?: DeckDocument | null;
  /** Suggest accept uses locked In + primary CTAs; edit is the deckbuilder default. */
  mode?: 'edit' | 'suggest-accept';
  /** Show Swap | Add to Seeking tabs (Suggest accept only). */
  showSeekingTab?: boolean;
  /** Locked In card for suggest-accept (not yet on the deck). */
  suggestIn?: SuggestAcceptInCard | null;
  /** Extra Out picker exclusions for suggest-accept (protected / commanders). */
  outPickerFilter?: OutPickerFilter;
  onAcceptSwap?: (
    outInstanceId: string,
    choice: SuggestAcceptPrintingChoice,
    meta: { inTargetCategory: string | null; notes: string },
  ) => void;
  onAcceptSeeking?: (choice: SuggestAcceptPrintingChoice) => void;
}) {
  const isSuggestAccept = mode === 'suggest-accept';
  const [tab, setTab] = useState<'swap' | 'seeking'>('swap');
  const [phase, setPhase] = useState<'edit' | 'in-search' | 'finalize-confirm' | 'printing'>(
    'edit',
  );
  const [printingPurpose, setPrintingPurpose] = useState<'preview' | 'accept'>('preview');
  const [pendingIn, setPendingIn] = useState<SuggestAcceptPrintingChoice | null>(null);
  useModalScrollLock(true);

  const byId = new Map(resolveDeckCards(deck).map((c) => [c.instanceId, c]));
  if (inLookupDeck && inLookupDeck.deckId !== deck.deckId) {
    for (const c of resolveDeckCards(inLookupDeck)) {
      if (!byId.has(c.instanceId)) byId.set(c.instanceId, c);
    }
  }
  const inCard = draft.inInstanceId ? byId.get(draft.inInstanceId) || null : null;
  const outCard = draft.outInstanceId ? byId.get(draft.outInstanceId) || null : null;
  const canFinalize = Boolean(
    onFinalize && draft.inInstanceId && draft.outInstanceId && !finalizeDisabled,
  );
  const seekingTabActive = Boolean(showSeekingTab && tab === 'seeking');
  const canAcceptSwap = Boolean(isSuggestAccept && draft.outInstanceId && suggestIn?.name);
  const canAcceptSeeking = Boolean(isSuggestAccept && suggestIn?.name);

  const suggestPreviewCard = useMemo(() => {
    if (!isSuggestAccept || !suggestIn?.name) return null;
    return suggestInCardView(suggestIn, pendingIn);
  }, [isSuggestAccept, suggestIn, pendingIn]);

  const targetOptions = (deck.categories || [])
    .filter((c) => categoryIncluded(deck.categories, c.name) && !isSwapQueueCategory(c.name))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  const swapInDefaultCategory =
    draft.inTargetCategory || defaultSwapInTargetCategory(deck);

  function pickOut() {
    openOutCardPicker(
      deck,
      draft.outInstanceId,
      (instanceId) => {
        const patch: Partial<SwapEditDraft> = { outInstanceId: instanceId };
        if (!draft.inTargetCategory) {
          const card = deck.cards.find((c) => c.instanceId === instanceId);
          const category = inTargetCategoryFromOutCard(card, deck.categories);
          if (category) patch.inTargetCategory = category;
        }
        onDraftChange(patch);
      },
      isSuggestAccept ? outPickerFilter : undefined,
    );
  }

  function resolveAcceptChoice(): SuggestAcceptPrintingChoice | null {
    if (pendingIn) return pendingIn;
    if (suggestIn && hasUsableSuggestPrinting(suggestIn)) {
      return choiceFromSuggestIn(suggestIn);
    }
    return null;
  }

  function commitAccept(choice: SuggestAcceptPrintingChoice) {
    if (seekingTabActive) {
      onAcceptSeeking?.(choice);
      return;
    }
    if (!draft.outInstanceId) return;
    onAcceptSwap?.(draft.outInstanceId, choice, {
      inTargetCategory: draft.inTargetCategory,
      notes: draft.notes,
    });
  }

  /** Click In: change printing only (always allowed). */
  function openInPrinting() {
    if (!suggestIn?.name) return;
    setPrintingPurpose('preview');
    setPhase('printing');
  }

  /** Primary CTA: accept with current printing, or open picker if none usable. */
  function onAcceptClick() {
    if (!suggestIn?.name) return;
    if (!seekingTabActive && !draft.outInstanceId) return;
    const choice = resolveAcceptChoice();
    if (choice) {
      commitAccept(choice);
      return;
    }
    setPrintingPurpose('accept');
    setPhase('printing');
  }

  function onPrintingConfirm(printing: PrintingFields, _category?: string, meta?: { proxy: boolean }) {
    const choice: SuggestAcceptPrintingChoice = { printing, proxy: Boolean(meta?.proxy) };
    if (printingPurpose === 'preview') {
      setPendingIn(choice);
      setPhase('edit');
      return;
    }
    commitAccept(choice);
  }

  const confirmLabel = seekingTabActive ? 'Add to Seeking' : 'Add to Swap Queue';
  const printingConfirmLabel = printingPurpose === 'preview' ? 'Use printing' : confirmLabel;
  const title =
    isSuggestAccept && suggestIn?.name
      ? seekingTabActive
        ? `Add to Seeking · ${suggestIn.name}`
        : `Accept · ${suggestIn.name}`
      : 'Edit swap';

  const dialogLabel =
    phase === 'in-search'
      ? 'Choose In card from Scryfall'
      : phase === 'finalize-confirm'
        ? 'Confirm finalize swap'
        : phase === 'printing'
          ? printingConfirmLabel
          : isSuggestAccept
            ? 'Accept suggestion'
            : 'Edit swap';

  const pendingPrinting = pendingIn?.printing;
  const defaultScryfallId =
    pendingPrinting?.scryfallId || suggestIn?.scryfallId || null;

  return createPortal(
    <div
      className="db-modal"
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {phase === 'in-search' ? (
        <ScryfallSearchModal
          embedded
          deck={deck}
          title="Choose In card from Scryfall"
          confirmLabel="Use as In"
          printingTitle={(name) => `Printing — ${name}`}
          defaultCategory={swapInDefaultCategory}
          categoryOptions={targetOptions}
          onClose={() => setPhase('edit')}
          onAdd={(printing, category, meta) => {
            onConfirmIn(printing, category, meta);
            setPhase('edit');
          }}
        />
      ) : phase === 'finalize-confirm' ? (
        <FinalizeSwapConfirmDialog
          embedded
          outName={outCard ? cardDisplayName(outCard) : 'Out'}
          inName={inCard ? cardDisplayName(inCard) : 'In'}
          category={draft.inTargetCategory}
          onCancel={() => setPhase('edit')}
          onConfirm={() => {
            setPhase('edit');
            onFinalize?.();
          }}
        />
      ) : phase === 'printing' && suggestIn?.name ? (
        <PrintingPickerModal
          embedded
          cardName={suggestIn.name}
          defaultScryfallId={defaultScryfallId}
          selectedScryfallId={pendingPrinting?.scryfallId || null}
          foilDefault={Boolean(pendingPrinting?.foil)}
          proxyDefault={Boolean(pendingIn?.proxy)}
          confirmLabel={printingConfirmLabel}
          title={printingConfirmLabel}
          onConfirm={onPrintingConfirm}
          onClose={onClose}
          onBack={() => setPhase('edit')}
        />
      ) : (
        <div className="db-modal-card db-modal-wide db-swap-edit-chrome" data-testid="swap-queue-edit">
          <h3>{title}</h3>
          {showSeekingTab ? (
            <div className="db-aside-tabs db-swap-edit-tabs" role="tablist" aria-label="Accept destination">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'swap'}
                className={`db-aside-tab${tab === 'swap' ? ' is-active' : ''}`}
                onClick={() => setTab('swap')}
              >
                Swap
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'seeking'}
                className={`db-aside-tab${tab === 'seeking' ? ' is-active' : ''}`}
                onClick={() => setTab('seeking')}
              >
                Add to Seeking
              </button>
            </div>
          ) : null}
          <div className="db-swap-edit-scroll">
            {deckOptions?.length && onDeckChange ? (
              <label>
                Deck
                <select
                  className="db-select"
                  aria-label="Target deck"
                  value={deck.deckId}
                  onChange={(e) => onDeckChange(e.target.value)}
                >
                  {deckOptions.map((opt) => (
                    <option key={opt.deckId} value={opt.deckId}>
                      {opt.deckName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {seekingTabActive ? (
              <div className="db-swap-edit-slots db-swap-edit-slots-single">
                <SwapEditSlot
                  card={suggestPreviewCard}
                  role="in"
                  label={suggestIn?.name || null}
                  onChange={openInPrinting}
                />
              </div>
            ) : (
              <>
                <div className="db-swap-edit-slots">
                  <SwapEditSlot card={outCard} role="out" onChange={pickOut} />
                  <SwapArrow />
                  <SwapEditSlot
                    card={isSuggestAccept ? suggestPreviewCard : inCard}
                    role="in"
                    onChange={
                      isSuggestAccept ? openInPrinting : () => setPhase('in-search')
                    }
                  />
                </div>
                <label>
                  Place In card in category
                  <select
                    className="db-select"
                    value={draft.inTargetCategory || ''}
                    onChange={(e) => onDraftChange({ inTargetCategory: e.target.value || null })}
                  >
                    <option value="">— not set —</option>
                    {targetOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Notes
                  <input
                    className="db-input"
                    value={draft.notes}
                    onChange={(e) => onDraftChange({ notes: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>
          <div className="db-modal-actions db-swap-edit-actions">
            {isSuggestAccept ? (
              <>
                <button type="button" className="db-btn" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="db-btn is-active"
                  disabled={seekingTabActive ? !canAcceptSeeking : !canAcceptSwap}
                  onClick={onAcceptClick}
                >
                  {confirmLabel}
                </button>
              </>
            ) : (
              <>
                <div className="db-swap-edit-actions-secondary">
                  {onRemove ? (
                    <button type="button" className="db-btn db-btn-danger" onClick={onRemove}>
                      Remove
                    </button>
                  ) : null}
                  {onFinalize ? (
                    <button
                      type="button"
                      className="db-btn"
                      disabled={!canFinalize}
                      title={
                        finalizeDisabled
                          ? 'Finish the deck change before finalizing'
                          : !draft.inInstanceId || !draft.outInstanceId
                            ? 'Both In and Out are required to finalize'
                            : 'Remove Out and keep In in its target category'
                      }
                      onClick={() => setPhase('finalize-confirm')}
                    >
                      Finalize
                    </button>
                  ) : null}
                </div>
                <button type="button" className="db-btn is-active" onClick={onClose}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
