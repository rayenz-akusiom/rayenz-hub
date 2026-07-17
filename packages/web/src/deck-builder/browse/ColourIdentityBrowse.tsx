import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  DECK_BUILDER_SETTINGS_EVENT,
  DEFAULT_DECK_BUILDER_SETTINGS,
  colourIdentitySectionsFor,
  groupByColourIdentity,
  partitionCategories,
  resolveDeckCards,
  sortCardsInGroup,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type CategoryDef,
  type DeckBuilderSettingsPayload,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { loadDeckBuilderSettings } from '../../api/hub-api';
import { CardGroup, DeckHeaderRow, type DropCardHandler } from './CategoryBrowse';
import { MasonryColumns } from './MasonryColumns';

function mergeStyle(remote: DeckBuilderSettingsPayload | null): DeckBuilderSettingsPayload {
  return { ...DEFAULT_DECK_BUILDER_SETTINGS, ...(remote || {}) };
}

export function ColourIdentityBrowse({
  deck,
  onSelectCard,
  selectedId,
  layout = 'stacked',
  cardSort = 'name_asc',
  separateLands = false,
  onDropCard,
  onCardContextMenu,
  deckMeta,
}: {
  deck:
    | Pick<DeckDocument, 'cards' | 'categories' | 'format' | 'oracle' | 'name'>
    | {
        cards: CardView[];
        categories: CategoryDef[];
        format?: DeckDocument['format'];
        oracle?: DeckDocument['oracle'];
        name?: string;
      };
  onSelectCard?: (card: CardView) => void;
  selectedId?: string | null;
  layout?: CardLayout;
  cardSort?: CardSortMode;
  separateLands?: boolean;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: (card: CardView, e: MouseEvent) => void;
  deckMeta?: string;
}) {
  const [style, setStyle] = useState<DeckBuilderSettingsPayload>(DEFAULT_DECK_BUILDER_SETTINGS);
  const resolvedCards = useMemo(
    () => resolveDeckCards({ cards: deck.cards, oracle: deck.oracle || {} }),
    [deck.cards, deck.oracle],
  );
  const resolvedDeck = useMemo(
    () => ({ ...deck, cards: resolvedCards }),
    [deck, resolvedCards],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settings } = await loadDeckBuilderSettings();
        if (!cancelled) setStyle(mergeStyle(settings));
      } catch {
        /* keep defaults */
      }
    })();

    function onSettings(event: Event) {
      const detail = (event as CustomEvent<DeckBuilderSettingsPayload>).detail;
      if (detail) setStyle(mergeStyle(detail));
    }
    window.addEventListener(DECK_BUILDER_SETTINGS_EVENT, onSettings);
    return () => {
      cancelled = true;
      window.removeEventListener(DECK_BUILDER_SETTINGS_EVENT, onSettings);
    };
  }, []);

  const { header, headerKeys, included, includedKeys } = partitionCategories(resolvedDeck);
  const mainCards = includedKeys.flatMap((k) => included[k]);
  const ciOptions = { style, separateLands };
  const groups = groupByColourIdentity(mainCards, ciOptions);
  const sectionOrder = colourIdentitySectionsFor(ciOptions);

  const sections = sectionOrder
    .map((section) => {
      const list = groups[section];
      if (!list?.length) return null;
      const sorted = sortCardsInGroup(list, cardSort, ciOptions);
      return (
        <section
          key={section}
          className={layout === 'stacked' ? 'db-cat-column' : 'db-section'}
        >
          <h3 className="db-section-title">
            {section} <span className="db-count">({sorted.length})</span>
          </h3>
          <CardGroup
            cards={sorted}
            layout={layout}
            selectedId={selectedId}
            onSelectCard={onSelectCard}
            draggable={Boolean(onDropCard)}
            onCardContextMenu={onCardContextMenu}
          />
        </section>
      );
    })
    .filter(Boolean);

  const deckName = 'name' in resolvedDeck && typeof resolvedDeck.name === 'string' ? resolvedDeck.name : undefined;

  return (
    <div className="db-browse">
      <DeckHeaderRow
        header={header}
        headerKeys={headerKeys}
        selectedId={selectedId}
        onSelectCard={onSelectCard}
        onDropCard={onDropCard}
        onCardContextMenu={onCardContextMenu}
        format={'format' in resolvedDeck ? resolvedDeck.format : undefined}
        cardSort={cardSort}
        deckName={deckName}
        deckMeta={deckMeta}
      />
      {layout === 'stacked' ? (
        <MasonryColumns>{sections}</MasonryColumns>
      ) : (
        sections
      )}
    </div>
  );
}
