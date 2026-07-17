import { buildCutCandidates } from '@rayenz-hub/shared';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { optionKey } from '../lib/hub-utils';
import type { CardPickerItem } from '../cards/CardPicker';
import { cutOptionImageSrc, cutOptionLines, findSnapshotCard, isMissingSuggestedCut, printOptionLines } from './data';
import type { CutOption, ScryfallPrint } from './types';

export function deckCutOptions(deck: DeckEntry): CutOption[] {
  const options = buildCutCandidates(deck.deck_snapshot, { outQueueFallback: true }) as CutOption[];
  const seen: Record<string, boolean> = {};
  options.forEach((opt) => {
    seen[optionKey(opt)] = true;
  });

  (deck.suggestions || []).forEach((s) => {
    ((s.replaces || []) as Array<{ name?: string }>).forEach((r) => {
      if (!r.name) {
        return;
      }
      const snap = findSnapshotCard(deck, r.name);
      const opt: CutOption = {
        name: r.name,
        quantity: 1,
        set_code: snap?.set_code ?? null,
        collector_number: snap?.collector_number ?? null,
        primary_category: snap?.primary_category ?? null,
      };
      const key = optionKey(opt);
      if (!seen[key]) {
        seen[key] = true;
        options.push(opt);
      }
    });
  });

  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

export function cutMetaFromKey(key: string, options: CutOption[]): CardOutSelection {
  if (!key) {
    return { name: '', quantity: 1, set_code: null, collector_number: null };
  }
  const opt = options.find((o) => optionKey(o) === key);
  if (!opt) {
    const parts = key.split('|');
    return {
      name: parts[0] || '',
      quantity: 1,
      set_code: parts[1] || null,
      collector_number: parts[2] || null,
    };
  }
  return {
    name: opt.name,
    quantity: 1,
    set_code: opt.set_code || null,
    collector_number: opt.collector_number || null,
  };
}

type CardOutSelection = {
  name: string;
  quantity: number;
  set_code: string | null;
  collector_number: string | null;
};

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
  resolveFinish: (item: CardPickerItem | null | undefined, foilOn: boolean) => string;
};

function hubCardPicker(): HubCardPickerApi | undefined {
  return (window as Window & { HubCardPicker?: HubCardPickerApi }).HubCardPicker;
}

export function buildPrintPickerItems(
  prints: ScryfallPrint[],
  suggestion: Suggestion,
): CardPickerItem[] {
  const card = suggestion.card as {
    name: string;
    scryfall_id?: string;
    set_code?: string;
    collector_number?: string;
    layout?: string;
  };
  const items = prints.map((p) => ({
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
  }));
  if (!items.length && card.scryfall_id) {
    items.push({
      value: card.scryfall_id,
      imgSrc: 'https://api.scryfall.com/cards/' + card.scryfall_id + '?format=image&version=normal',
      scryfallId: card.scryfall_id,
      layout: card.layout || null,
      faceKey: card.scryfall_id,
      lines: [card.set_code + ' #' + card.collector_number],
      finishes: [],
      name: card.name,
      set_code: card.set_code,
      collector_number: card.collector_number,
    });
  }
  return items;
}

export function buildCutPickerItems(
  options: CutOption[],
  deck: DeckEntry,
  suggestion: Suggestion,
  currentKey: string,
  currentCut: CardOutSelection,
): CardPickerItem[] {
  const items: CardPickerItem[] = options.map((opt) => ({
    value: optionKey(opt),
    imgSrc: cutOptionImageSrc(opt, deck),
    category: opt.primary_category || null,
    lines: cutOptionLines(opt),
  }));
  if (isMissingSuggestedCut(suggestion)) {
    items.unshift({
      value: '',
      imgSrc: '',
      lines: ['No cut suggested', 'Choose manually'],
    });
  }
  if (currentKey && !items.some((item) => item.value === currentKey)) {
    items.unshift({
      value: currentKey,
      imgSrc: cutOptionImageSrc(currentCut as CutOption, deck),
      lines: cutOptionLines(currentCut),
    });
  }
  return items;
}

export function openPrintPicker(
  suggestion: Suggestion,
  prints: ScryfallPrint[],
  selectedPrintId: string,
  foilDefault: boolean,
  onPick: (printId: string, finish: string) => void,
): void {
  const picker = hubCardPicker();
  if (!picker) {
    return;
  }
  const card = suggestion.card as { name: string };
  picker.open({
    title: 'Choose printing — ' + card.name,
    showFoilToggle: true,
    foilDefault,
    items: buildPrintPickerItems(prints, suggestion),
    selectedValue: selectedPrintId,
    onPick: (value, item, ctx) => {
      const finish = picker.resolveFinish(item, ctx?.foil ?? false);
      onPick(String(value), finish);
    },
  });
}

export function openCutPicker(
  deck: DeckEntry,
  suggestion: Suggestion,
  options: CutOption[],
  selectedKey: string,
  currentCut: CardOutSelection,
  onPick: (key: string) => void,
): void {
  const picker = hubCardPicker();
  if (!picker) {
    return;
  }
  picker.open({
    title: 'Choose card to cut',
    groupByCategory: true,
    items: buildCutPickerItems(options, deck, suggestion, selectedKey, currentCut),
    selectedValue: selectedKey,
    onPick: (value) => {
      onPick(String(value));
    },
  });
}

export function printSummaryLabel(
  printId: string,
  prints: ScryfallPrint[],
  suggestion: Suggestion,
  finish: string,
): string {
  if (!printId) {
    return 'No printing selected';
  }
  const print = prints.find((p) => p.id === printId);
  const card = suggestion.card as { set_code?: string; collector_number?: string; scryfall_id?: string };
  let label = '';
  if (print) {
    label = printOptionLines(print).join(' · ');
  } else if (card.scryfall_id === printId) {
    label = (card.set_code || '') + ' #' + (card.collector_number || '');
  } else {
    label = 'Printing selected';
  }
  if (finish === 'foil') {
    label += ' · Foil';
  }
  return label;
}

export function cutSummaryLabel(cut: CardOutSelection, options: CutOption[]): string {
  if (!cut.name) {
    return 'No cut selected';
  }
  const opt = options.find((o) => optionKey(o) === optionKey(cut));
  if (opt) {
    if (opt.set_code && opt.collector_number) {
      return opt.name + ' (' + opt.set_code + ' #' + opt.collector_number + ')';
    }
    return opt.name;
  }
  if (cut.set_code && cut.collector_number) {
    return cut.name + ' (' + cut.set_code + ' #' + cut.collector_number + ')';
  }
  return cut.name;
}
