import { OrderEmailParse } from '../mtg/email-parse';
import type { AcquiredCard, InputMode, OrderReconcileState } from './types';

export function parseInputToAcquired(inputMode: InputMode, listText: string, emailText: string): AcquiredCard[] {
  if (inputMode === 'email') {
    const result = OrderEmailParse.parseOrderEmail(emailText);
    return OrderEmailParse.mergeAcquiredCards(result.cards).map((c, i) => ({
      ...c,
      id: c.id || 'acq-' + i,
    }));
  }
  const listResult = OrderEmailParse.parseCardList(listText);
  return OrderEmailParse.mergeAcquiredCards(listResult.cards).map((c, i) => ({
    ...c,
    id: c.id || 'acq-' + i,
  }));
}

export function updateAcquiredField(
  cards: AcquiredCard[],
  index: number,
  field: keyof AcquiredCard,
  value: string,
): AcquiredCard[] {
  return cards.map((card, i) => {
    if (i !== index) return card;
    if (field === 'quantity') {
      return { ...card, quantity: parseInt(value, 10) || 1 };
    }
    return { ...card, [field]: value || null };
  });
}

export type InputPhaseProps = {
  state: OrderReconcileState;
  error: string;
  listText: string;
  emailText: string;
  onListTextChange: (text: string) => void;
  onEmailTextChange: (text: string) => void;
  onInputModeChange: (mode: InputMode) => void;
  onProxyOrderChange: (checked: boolean) => void;
  onParse: () => void;
  onContinue: () => void;
};
