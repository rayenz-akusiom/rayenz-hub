import { describe, expect, it } from 'vitest';
import {
  cardMatchesFlagFilter,
  FLAG_FILTER_MODE_LABELS,
} from '../../../packages/web/src/deck-builder/ui/FlagFilterControl';

describe('cardMatchesFlagFilter', () => {
  it('All passes every flag value', () => {
    expect(cardMatchesFlagFilter(true, 'all')).toBe(true);
    expect(cardMatchesFlagFilter(false, 'all')).toBe(true);
  });

  it('Hide keeps only unflagged cards', () => {
    expect(cardMatchesFlagFilter(true, 'hide')).toBe(false);
    expect(cardMatchesFlagFilter(false, 'hide')).toBe(true);
  });

  it('Only keeps flagged cards', () => {
    expect(cardMatchesFlagFilter(true, 'only')).toBe(true);
    expect(cardMatchesFlagFilter(false, 'only')).toBe(false);
  });
});

describe('FLAG_FILTER_MODE_LABELS', () => {
  it('labels the three modes', () => {
    expect(FLAG_FILTER_MODE_LABELS.all).toBe('All');
    expect(FLAG_FILTER_MODE_LABELS.hide).toBe('Hide');
    expect(FLAG_FILTER_MODE_LABELS.only).toBe('Only');
  });
});
