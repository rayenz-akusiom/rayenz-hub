import {
  resolveDeckCards,
  unifyWantSources,
  type CardView,
  type DeckDocument,
  type UnifiedWantRow,
  type WantSource,
} from '@rayenz-hub/shared';
import { DropSection } from '../deck-builder/browse/CategoryBrowse';
import { MasonryColumns } from '../deck-builder/browse/MasonryColumns';
import { useCardSize } from '../deck-builder/card-size';
import type { SwapQueueLayoutMode } from '../hub/routes';
import { SwimlaneSection } from './SwimlaneSections';
import { SwapFaceTile, SwapPairQueueTile } from './SwapFaceTile';

type Props = {
  seeking: WantSource[];
  queuedIn: WantSource[];
  queuedOut: WantSource[];
  decks: DeckDocument[];
  layout: SwapQueueLayoutMode;
  unified: boolean;
  onSelect?: (source: WantSource) => void;
  onActivateUnified?: (row: UnifiedWantRow) => void;
};

function deckMap(decks: DeckDocument[]) {
  return new Map(decks.map((d) => [d.deckId, d]));
}

type PairUnit = {
  key: string;
  deckId: string;
  deckName: string;
  entryId: string;
  inSource: WantSource | null;
  outSource: WantSource | null;
  incomplete: boolean;
};

/** One Swaps tile per formal entry (In and/or Out sides). */
function buildPairUnits(queuedIn: WantSource[], queuedOut: WantSource[]): PairUnit[] {
  const map = new Map<string, PairUnit>();

  function ensure(s: WantSource): PairUnit {
    const key = `${s.deckId}:${s.entryId}`;
    let unit = map.get(key);
    if (!unit) {
      unit = {
        key,
        deckId: s.deckId,
        deckName: s.deckName,
        entryId: s.entryId,
        inSource: null,
        outSource: null,
        incomplete: s.pairIncomplete,
      };
      map.set(key, unit);
    }
    unit.incomplete = unit.incomplete || s.pairIncomplete;
    return unit;
  }

  for (const s of queuedIn) {
    const unit = ensure(s);
    unit.inSource = s;
  }
  for (const s of queuedOut) {
    const unit = ensure(s);
    unit.outSource = s;
  }

  return [...map.values()];
}

function withQty(card: CardView, quantity: number): CardView {
  return { ...card, quantity };
}

/** Resolve a face from the deck library, or a name-only fallback when decks are missing. */
function resolveWantCard(
  s: WantSource,
  byDeck: Map<string, DeckDocument>,
  quantity = s.quantity,
): CardView {
  const deck = byDeck.get(s.deckId);
  const cards = deck ? resolveDeckCards(deck) : [];
  const found = cards.find((c) => c.instanceId === s.cardInstanceId);
  if (found) return withQty(found, quantity);
  return {
    instanceId: s.cardInstanceId,
    name: s.cardName,
    quantity,
    primaryCategory: 'Other',
    categories: ['Other'],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
    colourIdentity: [],
    typeLine: null,
    layout: null,
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: null,
    flavorName: null,
    manaValue: null,
    imageUrl: null,
  };
}

type DeckCardGroup = {
  deckId: string;
  deckName: string;
  cards: CardView[];
};

function groupSourcesByDeck(
  sources: WantSource[],
  byDeck: Map<string, DeckDocument>,
): { groups: DeckCardGroup[]; sourceByInstance: Map<string, WantSource> } {
  const sourceByInstance = new Map<string, WantSource>();
  const groupMap = new Map<string, DeckCardGroup>();

  for (const s of sources) {
    const card = resolveWantCard(s, byDeck);
    sourceByInstance.set(card.instanceId, s);
    let group = groupMap.get(s.deckId);
    if (!group) {
      group = { deckId: s.deckId, deckName: s.deckName, cards: [] };
      groupMap.set(s.deckId, group);
    }
    group.cards.push(card);
  }

  const groups = [...groupMap.values()].sort(
    (a, b) => a.deckName.localeCompare(b.deckName) || a.deckId.localeCompare(b.deckId),
  );
  return { groups, sourceByInstance };
}

function groupUnifiedByDeck(
  sources: WantSource[],
  byDeck: Map<string, DeckDocument>,
): { groups: DeckCardGroup[]; rowByInstance: Map<string, UnifiedWantRow> } {
  const rows = unifyWantSources(sources);
  const rowByInstance = new Map<string, UnifiedWantRow>();
  const groupMap = new Map<string, DeckCardGroup>();

  for (const row of rows) {
    const primary = row.sources[0]!;
    const card = resolveWantCard(primary, byDeck, row.totalQuantity);
    rowByInstance.set(card.instanceId, row);
    let group = groupMap.get(primary.deckId);
    if (!group) {
      group = {
        deckId: primary.deckId,
        deckName: primary.deckName,
        cards: [],
      };
      groupMap.set(primary.deckId, group);
    }
    group.cards.push(card);
  }

  const groups = [...groupMap.values()].sort(
    (a, b) => a.deckName.localeCompare(b.deckName) || a.deckId.localeCompare(b.deckId),
  );
  return { groups, rowByInstance };
}

function FaceLane({
  sources,
  decks,
  layout,
  unified,
  onSelect,
  onActivateUnified,
}: {
  sources: WantSource[];
  decks: DeckDocument[];
  layout: 'stacked' | 'grid';
  unified: boolean;
  onSelect?: (source: WantSource) => void;
  onActivateUnified?: (row: UnifiedWantRow) => void;
}) {
  const byDeck = deckMap(decks);
  const variant = layout === 'stacked' ? 'column' : 'section';

  if (unified) {
    const { groups, rowByInstance } = groupUnifiedByDeck(sources, byDeck);
    const sections = groups.map((g) => (
      <DropSection
        key={g.deckId}
        category={g.deckName}
        cards={g.cards}
        layout={layout}
        variant={variant}
        onSelectCard={(card) => {
          const row = rowByInstance.get(card.instanceId);
          if (row) onActivateUnified?.(row);
        }}
      />
    ));
    return layout === 'stacked' ? <MasonryColumns>{sections}</MasonryColumns> : <>{sections}</>;
  }

  const { groups, sourceByInstance } = groupSourcesByDeck(sources, byDeck);
  const sections = groups.map((g) => (
    <DropSection
      key={g.deckId}
      category={g.deckName}
      cards={g.cards}
      layout={layout}
      variant={variant}
      onSelectCard={(card) => {
        const src = sourceByInstance.get(card.instanceId);
        if (src) onSelect?.(src);
      }}
    />
  ));
  return layout === 'stacked' ? <MasonryColumns>{sections}</MasonryColumns> : <>{sections}</>;
}

function TilesView({
  seeking,
  queuedIn,
  queuedOut,
  decks,
  onSelect,
}: {
  seeking: WantSource[];
  queuedIn: WantSource[];
  queuedOut: WantSource[];
  decks: DeckDocument[];
  onSelect?: (source: WantSource) => void;
}) {
  const { widthPx } = useCardSize();
  const byDeck = deckMap(decks);
  const pairs = buildPairUnits(queuedIn, queuedOut);

  return (
    <div className="sq-swimlanes" data-testid="queue-tiles-view" data-layout="tiles">
      <SwimlaneSection
        lane="swaps"
        hasItems={pairs.length > 0}
        emptyMessage="No swap pairs."
      >
        <ul className="sq-lane-grid is-grid is-pairs db-card-grid">
          {pairs.map((unit) => {
            const deck = byDeck.get(unit.deckId);
            const cards = deck ? resolveDeckCards(deck) : [];
            const byId = new Map(cards.map((c) => [c.instanceId, c]));
            const inSrc = unit.inSource;
            const outSrc = unit.outSource;
            const inCard = inSrc
              ? byId.get(inSrc.cardInstanceId) || null
              : outSrc?.inInstanceId
                ? byId.get(outSrc.inInstanceId) || null
                : null;
            const outCard = outSrc
              ? byId.get(outSrc.cardInstanceId) || null
              : inSrc?.outInstanceId
                ? byId.get(inSrc.outInstanceId) || null
                : null;
            const entry = deck?.formalSwapEntries?.find((e) => e.id === unit.entryId);
            const openSrc = inSrc || outSrc!;
            return (
              <li key={unit.key}>
                <SwapPairQueueTile
                  outCard={outCard}
                  inCard={inCard}
                  incomplete={unit.incomplete}
                  categoryLabel={entry?.inTargetCategory}
                  actionLabel={`Swap, ${unit.deckName}`}
                  cardWidthPx={widthPx}
                  onClick={() => onSelect?.(openSrc)}
                />
              </li>
            );
          })}
        </ul>
      </SwimlaneSection>

      <SwimlaneSection
        lane="seeking"
        hasItems={seeking.length > 0}
        emptyMessage="No Seeking cards."
      >
        <ul className="sq-lane-grid is-grid db-card-grid">
          {seeking.map((s) => {
            const deck = byDeck.get(s.deckId);
            const cards = deck ? resolveDeckCards(deck) : [];
            const card = cards.find((c) => c.instanceId === s.cardInstanceId) || null;
            return (
              <li key={`${s.deckId}:${s.entryId}`}>
                <SwapFaceTile
                  card={card}
                  actionLabel={`${s.cardName}, Seeking, ${s.deckName}`}
                  onClick={() => onSelect?.(s)}
                />
              </li>
            );
          })}
        </ul>
      </SwimlaneSection>
    </div>
  );
}

/** Default / Unified browse body driven by Layout (Tiles | Stacked | Grid). */
export function QueueTilesView({
  seeking,
  queuedIn,
  queuedOut,
  decks,
  layout,
  unified,
  onSelect,
  onActivateUnified,
}: Props) {
  if (layout === 'tiles') {
    return (
      <TilesView
        seeking={seeking}
        queuedIn={queuedIn}
        queuedOut={queuedOut}
        decks={decks}
        onSelect={onSelect}
      />
    );
  }

  const faceLayout = layout;
  return (
    <div
      className="sq-swimlanes"
      data-testid="queue-tiles-view"
      data-layout={layout}
      data-unified={unified ? 'true' : 'false'}
    >
      <SwimlaneSection
        lane="queued_in"
        hasItems={queuedIn.length > 0}
        emptyMessage="No Queued In cards."
      >
        <FaceLane
          sources={queuedIn}
          decks={decks}
          layout={faceLayout}
          unified={unified}
          onSelect={onSelect}
          onActivateUnified={onActivateUnified}
        />
      </SwimlaneSection>

      <SwimlaneSection
        lane="queued_out"
        hasItems={queuedOut.length > 0}
        emptyMessage="No Out cards."
      >
        <FaceLane
          sources={queuedOut}
          decks={decks}
          layout={faceLayout}
          unified={unified}
          onSelect={onSelect}
          onActivateUnified={onActivateUnified}
        />
      </SwimlaneSection>

      <SwimlaneSection
        lane="seeking"
        hasItems={seeking.length > 0}
        emptyMessage="No Seeking cards."
      >
        <FaceLane
          sources={seeking}
          decks={decks}
          layout={faceLayout}
          unified={unified}
          onSelect={onSelect}
          onActivateUnified={onActivateUnified}
        />
      </SwimlaneSection>
    </div>
  );
}
