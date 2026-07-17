import {
  cardHasBackFace,
  cardImageUrl,
  type CardInstance,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import type { CardPickerItem } from '../../cards/CardPicker';

type HubCardPickerApi = {
  open: (config: {
    title?: string;
    items?: CardPickerItem[];
    selectedValue?: unknown;
    sort?: boolean;
    groupByCategory?: boolean;
    showFoilToggle?: boolean;
    foilDefault?: boolean;
    onPick?: (value: unknown, item: CardPickerItem, ctx?: { foil?: boolean }) => void;
  }) => void;
};

function hubCardPicker(): HubCardPickerApi | undefined {
  return (window as Window & { HubCardPicker?: HubCardPickerApi }).HubCardPicker;
}

function printingLine(card: CardInstance): string {
  const set = card.setCode ? String(card.setCode).toUpperCase() : '';
  const num = card.collectorNumber || '';
  if (set && num) return `${set} #${num}`;
  if (set) return set;
  return '';
}

export function buildOutPickerItems(cards: CardInstance[]): CardPickerItem[] {
  return cards.map((card) => {
    const doubleFaced = cardHasBackFace(card.layout);
    return {
      value: card.instanceId,
      imgSrc: cardImageUrl(card) || undefined,
      backImgSrc: doubleFaced ? cardImageUrl(card, 'back') || undefined : undefined,
      scryfallId: card.scryfallId || undefined,
      layout: card.layout || undefined,
      faceKey: card.instanceId,
      category: card.primaryCategory || undefined,
      lines: [card.name, printingLine(card)].filter(Boolean),
    };
  });
}

export function openOutCardPicker(
  deck: DeckDocument,
  selectedInstanceId: string | null,
  onPick: (instanceId: string) => void,
): boolean {
  const picker = hubCardPicker();
  if (!picker) return false;
  picker.open({
    title: 'Select Out card',
    groupByCategory: true,
    items: buildOutPickerItems(deck.cards),
    selectedValue: selectedInstanceId,
    onPick: (value) => {
      const id = String(value || '');
      if (id) onPick(id);
    },
  });
  return true;
}

/** Prefer existing deck instance that already matches this printing. */
export function findMatchingPrintingInstance(
  deck: DeckDocument,
  printing: PrintingFields,
): CardInstance | null {
  const sid = printing.scryfallId || null;
  if (sid) {
    const byId = deck.cards.find(
      (c) => c.scryfallId === sid && Boolean(c.foil) === Boolean(printing.foil),
    );
    if (byId) return byId;
  }
  const set = printing.setCode ? String(printing.setCode).toLowerCase() : '';
  const num = printing.collectorNumber ? String(printing.collectorNumber) : '';
  if (!set || !num) return null;
  return (
    deck.cards.find(
      (c) =>
        String(c.setCode || '').toLowerCase() === set &&
        String(c.collectorNumber || '') === num &&
        Boolean(c.foil) === Boolean(printing.foil) &&
        c.name === printing.name,
    ) || null
  );
}
