import { useEffect, useMemo, useState } from 'react';
import {
  DECK_BUILDER_SETTINGS_EVENT,
  DEFAULT_DECK_BUILDER_SETTINGS,
  colourIdentitySectionsFor,
  groupByColourIdentity,
  partitionCategories,
  resolveDeckCards,
  type CardLayout,
  type CardView,
  type CategoryDef,
  type DeckBuilderSettingsPayload,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { loadDeckBuilderSettings } from '../../api/hub-api';
import { CardGroup, DeckHeaderRow } from './CategoryBrowse';
import { MasonryColumns } from './MasonryColumns';

function mergeStyle(remote: DeckBuilderSettingsPayload | null): DeckBuilderSettingsPayload {
  return { ...DEFAULT_DECK_BUILDER_SETTINGS, ...(remote || {}) };
}

export function ColourIdentityBrowse({
  deck,
  onSelectCard,
  selectedId,
  layout = 'stacked',
  separateLands = false,
}: {
  deck:
    | Pick<DeckDocument, 'cards' | 'categories' | 'format' | 'oracle'>
    | { cards: CardView[]; categories: CategoryDef[]; format?: DeckDocument['format']; oracle?: DeckDocument['oracle'] };
  onSelectCard?: (card: CardView) => void;
  selectedId?: string | null;
  layout?: CardLayout;
  separateLands?: boolean;
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
      return (
        <section
          key={section}
          className={layout === 'stacked' ? 'db-cat-column' : 'db-section'}
        >
          <h3 className="db-section-title">
            {section} <span className="db-count">({list.length})</span>
          </h3>
          <CardGroup
            cards={list}
            layout={layout}
            selectedId={selectedId}
            onSelectCard={onSelectCard}
          />
        </section>
      );
    })
    .filter(Boolean);

  return (
    <div className="db-browse">
      <DeckHeaderRow
        header={header}
        headerKeys={headerKeys}
        selectedId={selectedId}
        onSelectCard={onSelectCard}
        format={'format' in resolvedDeck ? resolvedDeck.format : undefined}
      />
      {layout === 'stacked' ? (
        <MasonryColumns>{sections}</MasonryColumns>
      ) : (
        sections
      )}
    </div>
  );
}
