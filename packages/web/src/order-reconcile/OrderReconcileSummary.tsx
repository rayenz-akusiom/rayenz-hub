import { summaryCardImageSrc, summarizeDeck, type SummaryCard } from './summary';
import type { ItemDecision, OrderReconcileDeck, ReconcileItem } from './types';

function SummaryCardImg({ card }: { card: SummaryCard | null | undefined }) {
  if (!card) {
    return <div className="or-summary-card or-summary-card-empty">No card</div>;
  }
  const src = summaryCardImageSrc(card);
  const title = card.name || '';
  if (!src) {
    return (
      <div className="or-summary-card or-summary-card-empty" title={title}>
        No card
      </div>
    );
  }
  return <img className="or-summary-card" src={src} alt={title} title={title} />;
}

function SummaryGroup({ cards, emptyLabel }: { cards: SummaryCard[]; emptyLabel?: string }) {
  if (!cards?.length) {
    return (
      <div className="or-summary-group or-summary-group-empty">
        <span className="or-summary-group-empty-label">{emptyLabel || 'None'}</span>
      </div>
    );
  }
  return (
    <div className="or-summary-group">
      {cards.map((c, i) => (
        <SummaryCardImg key={i} card={c} />
      ))}
    </div>
  );
}

function SummaryCol({ label, cards }: { label: string; cards: SummaryCard[] }) {
  return (
    <div className="or-summary-section-col">
      <div className="or-summary-section-label">{label}</div>
      <SummaryGroup cards={cards} emptyLabel="None" />
    </div>
  );
}

function SummarySection({ inCards, outCards }: { inCards: SummaryCard[]; outCards: SummaryCard[] }) {
  const hasIn = !!(inCards && inCards.length);
  const hasOut = !!(outCards && outCards.length);
  if (hasIn && !hasOut) {
    return (
      <div className="or-summary-section or-summary-section-single">
        <SummaryCol label="In" cards={inCards} />
      </div>
    );
  }
  if (!hasIn && hasOut) {
    return (
      <div className="or-summary-section or-summary-section-single">
        <SummaryCol label="Out" cards={outCards} />
      </div>
    );
  }
  return (
    <div className="or-summary-section">
      <SummaryCol label="In" cards={inCards} />
      <div className="or-summary-arrow" aria-hidden="true">
        →
      </div>
      <SummaryCol label="Out" cards={outCards} />
    </div>
  );
}

export function OrderReconcileSummary({
  deck,
  items,
  getDecision,
}: {
  deck: OrderReconcileDeck;
  items: ReconcileItem[];
  getDecision: (itemId: string) => ItemDecision | null;
}) {
  const summary = summarizeDeck(deck, items, getDecision);
  return (
    <div className="or-summary-box">
      <h4>Changes summary</h4>
      <SummarySection inCards={summary.ins} outCards={summary.outs} />
      <h4>Remaining queue</h4>
      <SummarySection inCards={summary.remainingIn} outCards={summary.remainingOut} />
    </div>
  );
}
