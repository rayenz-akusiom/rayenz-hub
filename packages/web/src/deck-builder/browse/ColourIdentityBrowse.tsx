import { useEffect, useState } from 'react';
import {
  DECK_BUILDER_SETTINGS_EVENT,
  DEFAULT_DECK_BUILDER_SETTINGS,
  colourIdentitySectionsFor,
  groupByColourIdentity,
  partitionCategories,
  type CardInstance,
  type CardLayout,
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
  deck: Pick<DeckDocument, 'cards' | 'categories'> | { cards: CardInstance[]; categories: CategoryDef[] };
  onSelectCard?: (card: CardInstance) => void;
  selectedId?: string | null;
  layout?: CardLayout;
  separateLands?: boolean;
}) {
  const [style, setStyle] = useState<DeckBuilderSettingsPayload>(DEFAULT_DECK_BUILDER_SETTINGS);

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

  const { header, headerKeys, included, includedKeys } = partitionCategories(deck);
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
      />
      {layout === 'stacked' ? (
        <MasonryColumns>{sections}</MasonryColumns>
      ) : (
        sections
      )}
    </div>
  );
}
