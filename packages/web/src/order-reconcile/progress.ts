import { DEFAULT_ORDER_RECONCILE_SETTINGS } from '@rayenz-hub/shared';
import { loadOrderReconcileProgress, loadOrderReconcileSettings, saveOrderReconcileProgress } from '../lib/hub-storage';
import type { OrderReconcileProgress, OrderReconcileState } from './types';

export function createInitialState(): OrderReconcileState {
  const settings = loadOrderReconcileSettings() as OrderReconcileState['settings'];
  const sessionId = 'session-' + new Date().toISOString().slice(0, 10);
  const progress = loadOrderReconcileProgress(sessionId) as OrderReconcileProgress;
  if (!progress.decisions) {
    progress.decisions = {};
  }

  return {
    phase: (progress.phase as OrderReconcileState['phase']) || 'input',
    sessionId,
    settings: { ...DEFAULT_ORDER_RECONCILE_SETTINGS, ...settings },
    acquiredCards: (progress.acquiredCards as OrderReconcileState['acquiredCards']) || [],
    copies: (progress.copies as OrderReconcileState['copies']) || [],
    assignments: (progress.assignments as OrderReconcileState['assignments']) || [],
    needsReview: (progress.needsReview as OrderReconcileState['needsReview']) || [],
    decks: [],
    stagingDeck: null,
    reconcileItems: (progress.reconcileItems as OrderReconcileState['reconcileItems']) || [],
    completedDecks: (progress.completedDecks as OrderReconcileState['completedDecks']) || {},
    activeDeckId: (progress.activeDeckId as string | null) ?? null,
    assignmentIndex: null,
    inputMode: 'list',
    isProxyOrder: !!progress.isProxyOrder,
    colorIdentityCache: {},
    progress: {
      decisions: progress.decisions || {},
    },
    statusMessage: '',
  };
}

export function saveStateProgress(state: OrderReconcileState): void {
  saveOrderReconcileProgress(state.sessionId || undefined, {
    decisions: state.progress.decisions,
    assignments: state.assignments,
    needsReview: state.needsReview,
    copies: state.copies,
    acquiredCards: state.acquiredCards,
    reconcileItems: state.reconcileItems,
    completedDecks: state.completedDecks,
    activeDeckId: state.activeDeckId,
    phase: state.phase,
    isProxyOrder: state.isProxyOrder,
  });
}

export function getDecision(state: OrderReconcileState, itemId: string) {
  return state.progress.decisions[itemId] || null;
}

export function setDecision(state: OrderReconcileState, itemId: string, decision: OrderReconcileState['progress']['decisions'][string]): OrderReconcileState {
  return {
    ...state,
    progress: {
      ...state.progress,
      decisions: { ...state.progress.decisions, [itemId]: decision },
    },
  };
}

export function resetSession(state: OrderReconcileState): OrderReconcileState {
  return {
    ...state,
    phase: 'input',
    assignments: [],
    needsReview: [],
    copies: [],
    reconcileItems: [],
    acquiredCards: [],
    completedDecks: {},
    isProxyOrder: false,
    activeDeckId: null,
    progress: { decisions: {} },
  };
}
