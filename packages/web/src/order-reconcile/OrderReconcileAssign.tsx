import { useState } from 'react';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import {
  acquiredCardImageSrc,
  autoAssignedDeckNote,
  buildAssignmentPlan,
  buildReconcileItems,
  disabledDecksForReviewRow,
} from './assign';
import { validateScryfallName, resolveCubeDestinationForCard } from './data';
import { getDeckById } from './helpers';
import {
  candidateOptionGroups,
  deckOptionGroups,
  maybeboardOptionGroups,
  type SelectOptionGroup,
} from './select-options';
import type { NeedsReviewItem, OrderReconcileState } from './types';
import { STAGING_DECK_ID } from './types';

function SelectWithGroups({
  groups,
  value,
  onChange,
}: {
  groups: SelectOptionGroup[];
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <select className="or-category-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map((group, gi) =>
        group.label ? (
          <optgroup key={gi} label={group.label}>
            {group.options.map((opt) => (
              <option key={opt.value || '__empty__'} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ) : (
          group.options.map((opt) => (
            <option key={opt.value || '__empty__'} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}

type AssignRowProps = {
  nr: NeedsReviewItem;
  idx: number;
  state: OrderReconcileState;
  onUpdate: (idx: number, patch: Partial<NeedsReviewItem>) => void;
  onStatePatch: (patch: Partial<OrderReconcileState>) => void;
  onNameFix: (oldName: string, newName: string) => void;
  onStatus: (msg: string) => void;
};

function AssignRow({ nr, idx, state, onUpdate, onStatePatch, onNameFix, onStatus }: AssignRowProps) {
  const [showNameFix, setShowNameFix] = useState(false);
  const [fixName, setFixName] = useState(nr.copy.card_name);
  const disabled = disabledDecksForReviewRow(state, nr, idx);
  const assignedNote = autoAssignedDeckNote(state, nr.copy.card_name);
  const imgSrc = acquiredCardImageSrc(nr.copy);

  const deckGroups =
    nr.reason === 'conflict'
      ? candidateOptionGroups(nr.candidates, disabled)
      : nr.reason === 'maybeboard'
        ? maybeboardOptionGroups(state.decks, nr, disabled)
        : deckOptionGroups(state.decks, true, disabled);

  const selectedDeck = getDeckById(nr.assigned_deck_id, state.decks, state.stagingDeck, STAGING_DECK_ID);
  const cats = selectedDeck?.deck_snapshot ? OrderReconcileExport.deckCategories(selectedDeck.deck_snapshot) : [];

  async function handleDeckChange(deckId: string) {
    if (nr.reason === 'conflict') {
      const picked = (nr.candidates || []).find((c) => c.deck_id === deckId);
      onUpdate(idx, {
        assigned_deck_id: deckId,
        destination_category: picked ? picked.destination_category || '' : nr.destination_category,
      });
      return;
    }
    if (!deckId) {
      onUpdate(idx, { assigned_deck_id: '', destination_category: '' });
      return;
    }
    const deck = getDeckById(deckId, state.decks, state.stagingDeck, STAGING_DECK_ID);
    if (deck && OrderReconcileExport.isCubeDeck(deck)) {
      const { category, colorIdentityCache } = await resolveCubeDestinationForCard(
        deck,
        nr.copy.card_name,
        state.colorIdentityCache,
      );
      const deckCats = OrderReconcileExport.deckCategories(deck.deck_snapshot);
      onStatePatch({ colorIdentityCache });
      onUpdate(idx, {
        assigned_deck_id: deckId,
        destination_category: category && deckCats.includes(category) ? category : '',
      });
      return;
    }
    onUpdate(idx, { assigned_deck_id: deckId, destination_category: '' });
  }

  async function applyNameFix() {
    const newName = fixName.trim();
    if (!newName || newName === nr.copy.card_name) return;
    const ok = await validateScryfallName(newName);
    if (!ok) {
      onStatus('Scryfall could not find “' + newName + '”.');
      return;
    }
    onNameFix(nr.copy.card_name, newName);
  }

  return (
    <div className="or-assign-row" data-review-idx={idx}>
      {nr.conflict_note ? <div className="or-conflict-banner">{nr.conflict_note}</div> : null}
      <div className="or-assign-row-inner">
        <div className="or-assign-image">
          <img
            src={imgSrc}
            alt=""
            data-or-assign-img
            onError={() => setShowNameFix(true)}
          />
        </div>
        <div className="or-assign-fields">
          <h4>
            {nr.copy.card_name} <span className="or-badge">{nr.reason}</span>
          </h4>
          {assignedNote && (nr.reason === 'extra' || nr.reason === 'unmatched') ? (
            <p className="or-assign-note">Already assigned to: {assignedNote}</p>
          ) : null}
          <label>{nr.reason === 'conflict' ? 'Which deck gets this copy?' : 'Assign to deck (optional)'}</label>
          <SelectWithGroups groups={deckGroups} value={nr.assigned_deck_id} onChange={(v) => void handleDeckChange(v)} />
          {nr.reason !== 'conflict' && nr.assigned_deck_id ? (
            <>
              <label className="or-assign-category-label">Destination category</label>
              <select
                className="or-category-select"
                value={nr.destination_category}
                onChange={(e) => onUpdate(idx, { destination_category: e.target.value })}
              >
                <option value="">— choose category —</option>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      </div>
      {showNameFix ? (
        <div className="or-name-fix" data-or-name-fix>
          <p className="or-warning">Card not found on Scryfall — fix the name for all copies of this card:</p>
          <input type="text" className="or-name-fix-input" value={fixName} onChange={(e) => setFixName(e.target.value)} />{' '}
          <button type="button" className="or-btn or-btn-ghost or-name-fix-apply" onClick={() => void applyNameFix()}>
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type OrderReconcileAssignProps = {
  state: OrderReconcileState;
  onNeedsReviewChange: (items: OrderReconcileState['needsReview']) => void;
  onAcquiredCardsChange: (cards: OrderReconcileState['acquiredCards']) => void;
  onStartReconcile: (reconcileItems: OrderReconcileState['reconcileItems'], activeDeckId: string) => void;
  onStatus: (msg: string) => void;
  onRebuildPlan: (patch: Partial<OrderReconcileState>) => void;
};

export function OrderReconcileAssign({
  state,
  onNeedsReviewChange,
  onAcquiredCardsChange,
  onStartReconcile,
  onStatus,
  onRebuildPlan,
}: OrderReconcileAssignProps) {
  async function handleNameFix(oldName: string, newName: string) {
    const acquiredCards = state.acquiredCards.map((acq) => (acq.name === oldName ? { ...acq, name: newName } : acq));
    onAcquiredCardsChange(acquiredCards);
    const plan = await buildAssignmentPlan({ ...state, acquiredCards });
    onRebuildPlan({ ...plan, acquiredCards });
  }

  function handleStartReconcile() {
    const reconcileItems = buildReconcileItems(state);
    const first = state.decks.find((d) => reconcileItems.some((item) => item.deck_id === d.deck_id));
    onStartReconcile(reconcileItems, first ? first.deck_id : STAGING_DECK_ID);
  }

  return (
    <div className="or-status-card">
      <div className="or-status-header">
        <h3>Assign copies to decks</h3>
      </div>
      <div className="or-status-pane">
        {state.isProxyOrder ? (
          <p className="or-proxy-order-banner">Proxy order active — added cards will include the Proxies category.</p>
        ) : null}
        <p>
          {state.assignments.length} auto-assigned · {state.needsReview.length} optional assignment(s)
        </p>
        {!state.needsReview.length ? (
          <p className="or-empty">All copies assigned automatically.</p>
        ) : (
          state.needsReview.map((nr, idx) => (
            <AssignRow
              key={nr.copy.copy_id}
              nr={nr}
              idx={idx}
              state={state}
              onUpdate={(i, patch) => {
                const next = state.needsReview.map((item, j) => (j === i ? { ...item, ...patch } : item));
                onNeedsReviewChange(next);
              }}
              onStatePatch={(patch) => onRebuildPlan(patch)}
              onNameFix={(oldName, newName) => void handleNameFix(oldName, newName)}
              onStatus={onStatus}
            />
          ))
        )}
        <button type="button" className="or-btn or-btn-primary" onClick={handleStartReconcile}>
          Start reconcile
        </button>
      </div>
    </div>
  );
}
