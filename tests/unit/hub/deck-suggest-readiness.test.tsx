import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGenerateReadiness } from '../../../packages/web/src/deck-suggest/readiness.ts';
import { DeckSuggestSetup } from '../../../packages/web/src/deck-suggest/DeckSuggestSetup.tsx';
import { resetHubModules } from '../helpers/hubHarness.ts';

function readyState(overrides: Record<string, unknown> = {}) {
  const base = {
    setScope: {
      complete: true,
      codes: ['MSH'],
      codesKey: 'MSH',
      cards: [{ name: 'Test Card' }],
      source: 'scryfall',
    },
    deckSelection: {
      decks: [{ deck_id: 'd1', deck_name: 'Deck One' }],
      selectedIds: ['d1'],
    },
    ui: { setCodesInput: 'MSH' },
    generating: false,
  };
  return Object.assign(base, overrides);
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
  delete (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge;
  document.body.innerHTML = '';
});

describe('getGenerateReadiness', () => {
  it('returns ok when set pool, decks, and selection are ready', () => {
    const result = getGenerateReadiness(readyState());
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.items.every((i) => i.ok)).toBe(true);
  });

  it('fails when set pool is missing', () => {
    const result = getGenerateReadiness(readyState({ setScope: null }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('set');
  });

  it('fails when set pool is incomplete', () => {
    const scope = readyState().setScope as { complete: boolean };
    scope.complete = false;
    const result = getGenerateReadiness(readyState({ setScope: scope }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('set');
  });

  it('fails when set codes input does not match loaded scope', () => {
    const result = getGenerateReadiness(readyState({ ui: { setCodesInput: 'MH2' } }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('set');
  });

  it('fails when no decks are loaded', () => {
    const result = getGenerateReadiness(
      readyState({
        deckSelection: { decks: [], selectedIds: [] },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('decks');
    expect(result.missing).toContain('selection');
  });

  it('fails when decks exist but none selected', () => {
    const result = getGenerateReadiness(
      readyState({
        deckSelection: {
          decks: [{ deck_id: 'd1', deck_name: 'Deck One' }],
          selectedIds: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('selection');
    expect(result.missing).not.toContain('decks');
  });

  it('fails when generating even if requirements are met', () => {
    const result = getGenerateReadiness(readyState({ generating: true }));
    expect(result.ok).toBe(false);
    expect(result.generating).toBe(true);
  });

  it('allows generate readiness to fail without set while decks can still load', () => {
    const result = getGenerateReadiness(readyState({ setScope: null }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('set');
    expect(result.missing).not.toContain('decks');
  });
});

describe('DeckSuggest setup controls without set pool', () => {
  it('enables folder controls when bridge is available and set pool is missing', () => {
    (window as Window & { RayenzArchidektBridge?: { isAvailable: boolean } }).RayenzArchidektBridge = {
      isAvailable: true,
    };
    const noop = () => {};
    render(
      <DeckSuggestSetup
        settings={{}}
        setSettings={noop}
        setCodesInput="MSH"
        onSetCodesInput={noop}
        setScope={null}
        onSetScope={noop}
        deckSelection={{ folderUrl: '', decks: [], selectedIds: [] }}
        onDeckSelectionChange={noop}
        deckLoadTab="folder"
        onDeckLoadTab={noop}
        profilesConnected={false}
        onError={noop}
        onClearError={noop}
        onProgressStart={noop}
        onProgressUpdate={noop}
        onProgressFinish={noop}
      />,
    );

    const folderTab = screen.getByRole('button', { name: 'Folder' });
    const loadFolderBtn = screen.getByRole('button', { name: 'Load decks' });
    expect((folderTab as HTMLButtonElement).disabled).toBe(false);
    expect((loadFolderBtn as HTMLButtonElement).disabled).toBe(false);
    expect(getGenerateReadiness({ setScope: null, ui: { setCodesInput: 'MSH' } }).ok).toBe(false);
  });
});
