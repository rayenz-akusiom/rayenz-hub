import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handoffSnapshotSummary } from '../../../packages/web/src/lib/hub-utils.ts';
import {
  createInitialReviewState,
  loadSuggestionsData,
  validateSuggestions,
} from '../../../packages/web/src/deck-review/index.ts';
import { DeckReviewApp } from '../../../packages/web/src/deck-review/DeckReviewApp.tsx';
import { resetHubModules } from '../helpers/hubHarness.ts';

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
  document.body.innerHTML = '';
});

describe('DeckReview.validateSuggestions', () => {
  it('normalizes string roles_matched to an array', () => {
    const data = {
      meta: { schema_version: '1.1' },
      decks: [{
        deck_id: 'd1',
        suggestions: [{
          suggestion_id: 's1',
          roles_matched: 'swap',
          replaces: { name: 'Old Card' },
        }],
      }],
    };
    const validated = validateSuggestions(data);
    expect(validated.decks[0].suggestions![0].roles_matched).toEqual(['swap']);
    expect(Array.isArray(validated.decks[0].suggestions![0].replaces)).toBe(true);
  });
});

describe('DeckReview handoff and transferSource', () => {
  const sampleData = {
    meta: { schema_version: '1.1', set_code: 'MSH', set_name: 'MSH', generated_at: '2026-06-30' },
    decks: [{
      deck_id: 'd1',
      deck_name: 'Test',
      suggestions: [{
        suggestion_id: 's1',
        priority_tier: 'swap',
        confidence: 'high',
        action: 'replace',
        card: { name: 'Card', set_code: 'MSH', collector_number: '1' },
        replaces: [],
      }],
    }],
  };

  it('loadSuggestionsData loads validated data', async () => {
    const next = await loadSuggestionsData(createInitialReviewState(), sampleData);
    expect(next.data!.decks).toHaveLength(1);
    expect(next.fileId).toBe('MSH-2026-06-30');
  });

  it('handoff with snapshots is reported as all ready', () => {
    const data = {
      decks: [{
        deck_snapshot: { cards: [{ name: 'Sol Ring' }] },
        suggestions: [{ suggestion_id: 's1' }],
      }],
    };
    expect(handoffSnapshotSummary(data).allReady).toBe(true);
  });

  it('loadSuggestionsData preserves deck_snapshot from handoff payload', async () => {
    const dataWithSnapshot = {
      meta: { schema_version: '1.1', set_code: 'MSH', set_name: 'MSH', generated_at: '2026-06-30' },
      decks: [{
        deck_id: 'd1',
        deck_name: 'Test',
        deck_snapshot: { fetched_at: '2026-06-22', cards: [{ name: 'Sol Ring', primary_category: 'Ramp' }] },
        suggestions: [{
          suggestion_id: 's1',
          priority_tier: 'swap',
          confidence: 'high',
          action: 'replace',
          card: { name: 'Card', set_code: 'MSH', collector_number: '1' },
          replaces: [],
        }],
      }],
    };
    const next = await loadSuggestionsData(createInitialReviewState(), dataWithSnapshot);
    expect(next.data!.decks[0].deck_snapshot!.cards).toHaveLength(1);
    expect(next.data!.decks[0].deck_snapshot!.fetched_at).toBe('2026-06-22');
  });

  it('DeckReviewApp redirects to Deck Suggest', async () => {
    const hubStorage = await import('../../../packages/web/src/lib/hub-storage.ts');
    const navigate = vi.spyOn(hubStorage, 'navigateHub').mockImplementation(() => {});
    render(<DeckReviewApp />);
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('#/deck-suggest');
    });
    navigate.mockRestore();
  });
});
