import { OrderReconcileSummary } from './OrderReconcileSummary';
import {
  assignDefaultOuts,
  buildDeckImportText,
  cutOptionImageSrc,
  cutValueFromOpt,
  deckCutOptions,
  deckReconcileComplete,
  defaultCutForItem,
  defaultInImageSrc,
  defaultInPrinting,
  formatCardLabel,
  printingImageSrc,
  readCutValue,
} from './reconcile';
import { fetchPrintings, printOptionLines, printingValueFromParts, readPrintingValue } from './data';
import type { CutOption, ItemDecision, OrderReconcileDeck, OrderReconcileState, PrintingParts, ReconcileItem } from './types';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import { bridgeApplyAvailable } from '../lib/hub-utils';
import { ArchidektExport } from '../mtg/archidekt-export';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveFinish } from '../cards/CardPicker';

type CardPickerApi = {
  open: (config: {
    title?: string;
    items?: {
      value: unknown;
      lines?: string[];
      imgSrc?: string;
      scryfallId?: string;
      layout?: string;
      faceKey?: string;
      category?: string;
      finishes?: string[];
      name?: string;
      set_code?: string;
      collector_number?: string;
    }[];
    selectedValue?: unknown;
    groupByCategory?: boolean;
    showFoilToggle?: boolean;
    foilDefault?: boolean;
    onPick?: (value: unknown, item: { name?: string; set_code?: string; collector_number?: string; finishes?: string[] }, ctx?: { foil: boolean }) => void;
  }) => void;
  resolveFinish: typeof resolveFinish;
};

function cardPicker(): CardPickerApi | undefined {
  return (window as Window & { HubCardPicker?: CardPickerApi }).HubCardPicker;
}

type ReconcileCardProps = {
  item: ReconcileItem;
  deck: OrderReconcileDeck;
  decision: ItemDecision | null;
  isProxyOrder: boolean;
  onDecision: (itemId: string, decision: ItemDecision) => void;
  onItemChange: (itemId: string, patch: Partial<ReconcileItem>) => void;
};

function ReconcileCard({ item, deck, decision, onDecision, onItemChange }: ReconcileCardProps) {
  const [cardError, setCardError] = useState('');
  const defaultOut = defaultCutForItem(item, deck);
  const defaultInPrint = defaultInPrinting(item);
  const [printing, setPrinting] = useState<PrintingParts>(defaultInPrint);
  const [cut, setCut] = useState<CutOption | null>(defaultOut);
  const [destCategory, setDestCategory] = useState(item.destination_category || '');

  useEffect(() => {
    setCut(defaultCutForItem(item, deck));
  }, [item, deck, item.destination_category]);

  const cats = deck.deck_snapshot ? OrderReconcileExport.deckCategories(deck.deck_snapshot) : [];
  const inImg = printingImageSrc(printing) || defaultInImageSrc(item);
  const outImg = cut ? cutOptionImageSrc(cut) : '';

  const openPrintPicker = useCallback(async () => {
    try {
      const prints = await fetchPrintings(item.card_name);
      const currentPrint = printing;
      cardPicker()?.open({
        title: 'Choose printing — ' + item.card_name,
        showFoilToggle: true,
        foilDefault: currentPrint.finish === 'foil',
        items: prints.map((p) => ({
          value: p.id,
          imgSrc: 'https://api.scryfall.com/cards/' + p.id + '?format=image&version=normal',
          scryfallId: p.id,
          layout: p.layout || null,
          faceKey: p.id,
          lines: printOptionLines(p),
          finishes: p.finishes,
          name: p.name,
          set_code: p.set,
          collector_number: p.collector_number,
        })),
        selectedValue: currentPrint.scryfall_id || '',
        onPick: (value, pickItem, ctx) => {
          const finish = cardPicker()?.resolveFinish(pickItem, ctx?.foil) || 'nonfoil';
          setPrinting({
            scryfall_id: String(value),
            name: pickItem.name || item.card_name,
            set_code: pickItem.set_code,
            collector_number: pickItem.collector_number,
            finish,
          });
        },
      });
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    }
  }, [item.card_name, printing]);

  const openCutPicker = useCallback(() => {
    const opts =
      item.is_cube && destCategory
        ? deckCutOptions(deck, destCategory, false)
        : deckCutOptions(deck, null, !item.is_cube);
    cardPicker()?.open({
      title: 'Choose card to cut',
      groupByCategory: true,
      items: opts.map((opt) => ({
        value: cutValueFromOpt(opt),
        imgSrc: cutOptionImageSrc(opt),
        category: opt.primary_category || null,
        lines: [opt.name, opt.set_code ? opt.set_code.toUpperCase() + ' #' + opt.collector_number : ''],
      })),
      selectedValue: cut ? cutValueFromOpt(cut) : '',
      onPick: (value) => {
        const picked = readCutValue(String(value));
        setCut(picked);
      },
    });
  }, [item, deck, destCategory, cut]);

  function handleAccept() {
    if (!printing.name) {
      setCardError('Choose a printing before accepting.');
      return;
    }
    if (!destCategory) {
      setCardError('Choose a destination category.');
      return;
    }
    if (item.is_cube && (!cut || !cut.name)) {
      setCardError('Choose a card to cut from the ' + destCategory + ' section.');
      return;
    }
    setCardError('');
    onItemChange(item.item_id, { destination_category: destCategory });
    onDecision(item.item_id, {
      status: 'accepted',
      accepted: {
        quantity: 1,
        destination_category: destCategory,
        card_in: printing,
        card_out: cut,
      },
    });
  }

  function handleSkip() {
    setCardError('');
    onDecision(item.item_id, { status: 'skipped' });
  }

  const decisionClass =
    decision?.status === 'accepted'
      ? ' or-decision-accepted'
      : decision?.status === 'skipped'
        ? ' or-decision-skipped'
        : decision?.status === 'rejected'
          ? ' or-decision-rejected'
          : '';

  return (
    <div className={'or-reconcile-card' + decisionClass} data-item-id={item.item_id} data-is-cube={item.is_cube ? '1' : undefined}>
      <h3>{item.card_name}</h3>
      <label>Destination category</label>
      <select
        className="or-category-select"
        value={destCategory}
        onChange={(e) => {
          const val = e.target.value;
          setDestCategory(val);
          onItemChange(item.item_id, { destination_category: val });
          if (item.is_cube) {
            setCut(defaultCutForItem({ ...item, destination_category: val }, deck));
          }
        }}
      >
        <option value="">— choose category —</option>
        {cats.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <div className="or-swap-pair">
        <div className="or-swap-col or-swap-in">
          <div className="or-swap-label or-swap-label-in">In</div>
          <button type="button" className={'or-card-image or-card-image-btn' + (!inImg ? ' or-card-image-empty' : '')} onClick={() => void openPrintPicker()}>
            {inImg ? <img src={inImg} alt="" /> : <img alt="" />}
          </button>
          <p className="or-picker-summary">{formatCardLabel(printing)}</p>
        </div>
        <div className="or-swap-arrow">→</div>
        <div className="or-swap-col or-swap-out">
          <div className="or-swap-label or-swap-label-out">Out</div>
          <button type="button" className={'or-card-image or-card-image-btn' + (!outImg ? ' or-card-image-empty' : '')} onClick={openCutPicker}>
            {outImg ? <img src={outImg} alt="" /> : <img alt="" />}
          </button>
          <p className="or-picker-summary">{cut ? formatCardLabel(cut) : 'Choose cut…'}</p>
        </div>
      </div>
      {cardError ? (
        <p className="or-card-error" data-or-card-error="1">
          {cardError}
        </p>
      ) : null}
      <div className="or-actions">
        <button type="button" className="or-btn or-btn-ghost" onClick={handleSkip}>
          Skip
        </button>
        <button type="button" className="or-btn or-btn-success" onClick={handleAccept}>
          Accept
        </button>
      </div>
    </div>
  );
}

export type OrderReconcileDeckPanelProps = {
  state: OrderReconcileState;
  deck: OrderReconcileDeck;
  items: ReconcileItem[];
  onDecision: (itemId: string, decision: ItemDecision) => void;
  onItemChange: (itemId: string, patch: Partial<ReconcileItem>) => void;
  onCompleteDeck: () => void;
  onStatus: (msg: string) => void;
};

export function OrderReconcileDeckPanel({
  state,
  deck,
  items,
  onDecision,
  onItemChange,
  onCompleteDeck,
  onStatus,
}: OrderReconcileDeckPanelProps) {
  const itemsWithOuts = useMemo(() => assignDefaultOuts(deck, items.map((item) => ({ ...item }))), [deck, items]);

  const getDecisionFn = useCallback((itemId: string) => state.progress.decisions[itemId] || null, [state.progress.decisions]);
  const complete = deckReconcileComplete(items, getDecisionFn);
  const importText = buildDeckImportText(deck, items, getDecisionFn, state.isProxyOrder);

  function copyImport() {
    void ArchidektExport.copyText(importText).then(() => onStatus('Deck import copied.'));
  }

  function applyDeck() {
    const deckId = ArchidektExport.parseDeckId(deck.archidekt_url || '');
    ArchidektExport.stageDeckApply(deckId, importText);
    window.open(deck.archidekt_url, '_blank', 'noopener');
    onStatus('Applied — move to next deck.');
    onCompleteDeck();
  }

  return (
    <div className="or-status-card">
      <div className="or-status-header">
        <h3>{deck.deck_name}</h3>
        {deck.archidekt_url ? (
          <a className="or-deck-link" href={deck.archidekt_url} target="_blank" rel="noopener">
            Open on Archidekt ↗
          </a>
        ) : null}
      </div>
      <div className="or-status-pane">
        {state.isProxyOrder ? (
          <p className="or-proxy-order-banner">Proxy order active — added cards will include the Proxies category.</p>
        ) : null}
        {itemsWithOuts.map((item) => (
          <ReconcileCard
            key={item.item_id}
            item={item}
            deck={deck}
            decision={getDecisionFn(item.item_id)}
            isProxyOrder={state.isProxyOrder}
            onDecision={onDecision}
            onItemChange={onItemChange}
          />
        ))}
        <OrderReconcileSummary deck={deck} items={items} getDecision={getDecisionFn} />
        <div className="or-apply-row">
          <button type="button" className="or-btn or-btn-primary" disabled={!complete.complete} onClick={copyImport}>
            Copy deck import
          </button>
          {bridgeApplyAvailable() ? (
            <button type="button" className="or-btn or-btn-success" disabled={!complete.complete} onClick={applyDeck}>
              Confirm &amp; apply
            </button>
          ) : null}
        </div>
        <textarea className="or-textarea" readOnly value={importText} style={{ minHeight: 100, marginTop: 12 }} />
      </div>
    </div>
  );
}
