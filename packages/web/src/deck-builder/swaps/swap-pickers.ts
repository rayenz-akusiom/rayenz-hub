import {
  cardDisplayName,
  cardHasBackFace,
  cardImageUrl,
  isSeekingCategory,
  resolveDeckCards,
  type CardInstance,
  type CardView,
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

function printingLine(card: CardView): string {
  const set = card.setCode ? String(card.setCode).toUpperCase() : '';
  const num = card.collectorNumber || '';
  if (set && num) return `${set} #${num}`;
  if (set) return set;
  return '';
}

/** Cards eligible as Out: deck cards including Queued Out; exclude formal Ins and Seeking. */
export function outPickerCards(deck: DeckDocument): CardView[] {
  const inIds = new Set(
    (deck.formalSwapEntries || [])
      .map((e) => e.inInstanceId)
      .filter((id): id is string => Boolean(id)),
  );
  return resolveDeckCards(deck).filter((card) => {
    if (inIds.has(card.instanceId)) return false;
    if (isSeekingCategory(card.primaryCategory)) return false;
    if ((card.categories || []).some((c) => isSeekingCategory(c))) return false;
    return true;
  });
}

export function buildOutPickerItems(cards: CardView[]): CardPickerItem[] {
  return cards.map((card) => {
    const doubleFaced = cardHasBackFace(card.layout);
    const qty = Math.max(1, Number(card.quantity) || 1);
    const displayName = cardDisplayName(card);
    const nameLine = qty > 1 ? `${displayName} ×${qty}` : displayName;
    return {
      value: card.instanceId,
      imgSrc: cardImageUrl(card) || undefined,
      backImgSrc: doubleFaced ? cardImageUrl(card, 'back') || undefined : undefined,
      scryfallId: card.scryfallId || undefined,
      layout: card.layout || undefined,
      faceKey: card.instanceId,
      category: card.primaryCategory || undefined,
      lines: [nameLine, printingLine(card)].filter(Boolean),
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
    items: buildOutPickerItems(outPickerCards(deck)),
    selectedValue: selectedInstanceId,
    onPick: (value) => {
      const id = String(value || '');
      if (id) onPick(id);
    },
  });
  return true;
}

/** Prefer existing deck instance that already matches this printing (+ foil/proxy). */
export function findMatchingPrintingInstance(
  deck: DeckDocument,
  printing: PrintingFields,
  opts?: { proxy?: boolean },
): CardInstance | null {
  const wantProxy = Boolean(opts?.proxy);
  const sid = printing.scryfallId || null;
  if (sid) {
    const byId = deck.cards.find(
      (c) =>
        c.scryfallId === sid &&
        Boolean(c.foil) === Boolean(printing.foil) &&
        Boolean(c.proxy) === wantProxy,
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
        Boolean(c.proxy) === wantProxy &&
        c.name === printing.name,
    ) || null
  );
}
