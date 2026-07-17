import { escapeHtml } from '../lib/string-utils';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import type { AssignmentCandidate, NeedsReviewItem, OrderReconcileDeck } from './types';

export function deckOptionTags(
  decks: { deck_id: string; deck_name: string }[],
  selectedId: string,
  disabledSet: Record<string, boolean>,
): string {
  return decks
    .map((d) => {
      const disabledAttr = disabledSet[d.deck_id] ? ' disabled' : '';
      return (
        '<option value="' +
        escapeHtml(d.deck_id) +
        '"' +
        (selectedId === d.deck_id ? ' selected' : '') +
        disabledAttr +
        '>' +
        escapeHtml(d.deck_name) +
        '</option>'
      );
    })
    .join('');
}

export function deckOptionsHtml(
  decks: OrderReconcileDeck[],
  selectedId: string,
  includeLeaveOut: boolean,
  disabledSet: Record<string, boolean>,
): string {
  let html = '';
  if (includeLeaveOut) {
    html += '<option value=""' + (!selectedId ? ' selected' : '') + '>— leave out (buy/trade only) —</option>';
  }
  const cubeDecks = decks.filter((d) => OrderReconcileExport.isCubeDeck(d));
  const commanderDecks = decks.filter((d) => !OrderReconcileExport.isCubeDeck(d));
  if (cubeDecks.length) {
    html += '<optgroup label="Cube">' + deckOptionTags(cubeDecks, selectedId, disabledSet) + '</optgroup>';
  }
  if (commanderDecks.length) {
    html += '<optgroup label="Commander">' + deckOptionTags(commanderDecks, selectedId, disabledSet) + '</optgroup>';
  }
  return html;
}

export function maybeboardDeckOptionsHtml(
  decks: OrderReconcileDeck[],
  nr: NeedsReviewItem,
  disabledSet: Record<string, boolean>,
): string {
  let html = '<option value=""' + (!nr.assigned_deck_id ? ' selected' : '') + '>— leave out (buy/trade only) —</option>';
  const seen: Record<string, boolean> = {};
  const suggested = (nr.candidates || []).filter((c) => {
    if (seen[c.deck_id]) {
      return false;
    }
    seen[c.deck_id] = true;
    return true;
  });
  if (suggested.length) {
    html +=
      '<optgroup label="Found in maybeboard">' +
      deckOptionTags(
        suggested.map((c) => ({ deck_id: c.deck_id, deck_name: c.deck_name })),
        nr.assigned_deck_id,
        disabledSet,
      ) +
      '</optgroup>';
  }
  html += deckOptionsHtml(decks, nr.assigned_deck_id, false, disabledSet);
  return html;
}

export function candidateOptionsHtml(
  candidates: AssignmentCandidate[],
  selectedId: string,
  disabledSet: Record<string, boolean>,
): string {
  const cube: AssignmentCandidate[] = [];
  const commander: AssignmentCandidate[] = [];
  (candidates || []).forEach((c) => {
    if (c.is_cube) {
      cube.push(c);
    } else {
      commander.push(c);
    }
  });
  cube.sort((a, b) => (a.deck_name || '').localeCompare(b.deck_name || '', undefined, { sensitivity: 'base' }));
  commander.sort((a, b) => (a.deck_name || '').localeCompare(b.deck_name || '', undefined, { sensitivity: 'base' }));
  function opts(list: AssignmentCandidate[]) {
    return list
      .map((c) => {
        const dis = disabledSet[c.deck_id] ? ' disabled' : '';
        return (
          '<option value="' +
          escapeHtml(c.deck_id) +
          '"' +
          (selectedId === c.deck_id ? ' selected' : '') +
          dis +
          '>' +
          escapeHtml(c.deck_name) +
          '</option>'
        );
      })
      .join('');
  }
  let html = '';
  if (cube.length) {
    html += '<optgroup label="Cube">' + opts(cube) + '</optgroup>';
  }
  if (commander.length) {
    html += '<optgroup label="Commander">' + opts(commander) + '</optgroup>';
  }
  return html;
}

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectOptionGroup = { label: string; options: SelectOption[] };

export function deckOptionGroups(
  decks: OrderReconcileDeck[],
  includeLeaveOut: boolean,
  disabledSet: Record<string, boolean>,
): SelectOptionGroup[] {
  const groups: SelectOptionGroup[] = [];
  if (includeLeaveOut) {
    groups.push({
      label: '',
      options: [{ value: '', label: '— leave out (buy/trade only) —' }],
    });
  }
  const cubeDecks = decks.filter((d) => OrderReconcileExport.isCubeDeck(d));
  const commanderDecks = decks.filter((d) => !OrderReconcileExport.isCubeDeck(d));
  if (cubeDecks.length) {
    groups.push({
      label: 'Cube',
      options: cubeDecks.map((d) => ({
        value: d.deck_id,
        label: d.deck_name,
        disabled: !!disabledSet[d.deck_id],
      })),
    });
  }
  if (commanderDecks.length) {
    groups.push({
      label: 'Commander',
      options: commanderDecks.map((d) => ({
        value: d.deck_id,
        label: d.deck_name,
        disabled: !!disabledSet[d.deck_id],
      })),
    });
  }
  return groups;
}

export function candidateOptionGroups(
  candidates: AssignmentCandidate[],
  disabledSet: Record<string, boolean>,
): SelectOptionGroup[] {
  const cube = candidates.filter((c) => c.is_cube);
  const commander = candidates.filter((c) => !c.is_cube);
  cube.sort((a, b) => (a.deck_name || '').localeCompare(b.deck_name || '', undefined, { sensitivity: 'base' }));
  commander.sort((a, b) => (a.deck_name || '').localeCompare(b.deck_name || '', undefined, { sensitivity: 'base' }));
  const groups: SelectOptionGroup[] = [];
  if (cube.length) {
    groups.push({
      label: 'Cube',
      options: cube.map((c) => ({
        value: c.deck_id,
        label: c.deck_name,
        disabled: !!disabledSet[c.deck_id],
      })),
    });
  }
  if (commander.length) {
    groups.push({
      label: 'Commander',
      options: commander.map((c) => ({
        value: c.deck_id,
        label: c.deck_name,
        disabled: !!disabledSet[c.deck_id],
      })),
    });
  }
  return groups;
}

export function maybeboardOptionGroups(
  decks: OrderReconcileDeck[],
  nr: NeedsReviewItem,
  disabledSet: Record<string, boolean>,
): SelectOptionGroup[] {
  const groups: SelectOptionGroup[] = [
    { label: '', options: [{ value: '', label: '— leave out (buy/trade only) —' }] },
  ];
  const seen: Record<string, boolean> = {};
  const suggested = (nr.candidates || []).filter((c) => {
    if (seen[c.deck_id]) return false;
    seen[c.deck_id] = true;
    return true;
  });
  if (suggested.length) {
    groups.push({
      label: 'Found in maybeboard',
      options: suggested.map((c) => ({
        value: c.deck_id,
        label: c.deck_name,
        disabled: !!disabledSet[c.deck_id],
      })),
    });
  }
  groups.push(...deckOptionGroups(decks, false, disabledSet));
  return groups;
}
