import { useRef, type ChangeEvent } from 'react';
import { bridgeAvailable, isLocalHub } from '../lib/hub-utils';
import {
  buildDeckFromImportText,
  fetchSetPool,
  loadDeckRegistry,
  loadSetScopeFromUpload,
  parseDeckListFromText,
} from './data';
import { applyDeckList, resolveDeckLoadTab, selectAllDecks, toggleDeckSelection, type DeckLoadTab } from './deck-load';
import type { DeckRecord, DeckSelection, DeckSuggestSettings, SetScope } from './types';

type SetupProps = {
  settings: DeckSuggestSettings;
  setSettings: (next: DeckSuggestSettings) => void;
  setCodesInput: string;
  onSetCodesInput: (value: string) => void;
  setScope: SetScope | null;
  onSetScope: (scope: SetScope | null) => void;
  deckSelection: DeckSelection;
  onDeckSelectionChange: (next: DeckSelection) => void;
  deckLoadTab: DeckLoadTab;
  onDeckLoadTab: (tab: DeckLoadTab) => void;
  profilesConnected: boolean;
  onError: (msg: string) => void;
  onClearError: () => void;
  onProgressStart: (opts: { label: string; indeterminate?: boolean }) => void;
  onProgressUpdate: (opts: { label: string }) => void;
  onProgressFinish: (opts: { label: string; variant?: 'error' }) => void;
};

export function DeckSuggestSetup({
  settings,
  setSettings,
  setCodesInput,
  onSetCodesInput,
  setScope,
  onSetScope,
  deckSelection,
  onDeckSelectionChange,
  deckLoadTab,
  onDeckLoadTab,
  profilesConnected,
  onError,
  onClearError,
  onProgressStart,
  onProgressUpdate,
  onProgressFinish,
}: SetupProps) {
  const setUploadRef = useRef<HTMLInputElement>(null);
  const deckUploadRef = useRef<HTMLInputElement>(null);
  const bridge = bridgeAvailable();
  const decks = deckSelection.decks || [];
  const selected = deckSelection.selectedIds || [];

  function saveSettings(next: DeckSuggestSettings) {
    setSettings(next);
  }

  async function handleFetchSet() {
    onClearError();
    const codes = setCodesInput
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((c) => c.trim().toUpperCase());
    if (!codes.length) {
      onError('Enter at least one set code.');
      return;
    }
    saveSettings({ ...settings, setCodes: setCodesInput });
    onProgressStart({ label: 'Fetching Scryfall set pool…', indeterminate: true });
    try {
      const scope = await fetchSetPool(codes, { forceRefresh: true });
      onSetScope(scope);
      onProgressFinish({ label: 'Loaded ' + scope.cards.length + ' cards from Scryfall.' });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      onProgressFinish({
        label: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    }
  }

  function handleSetUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onSetScope(loadSetScopeFromUpload(JSON.parse(String(reader.result))));
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleLoadFolder(folderUrl: string) {
    onClearError();
    saveSettings({ ...settings, folderUrl });
    onProgressStart({ label: 'Loading decks from folder…', indeterminate: true });
    try {
      const loaded = await loadDeckRegistry(folderUrl);
      onDeckSelectionChange(applyDeckList(loaded, deckSelection));
      onProgressFinish({ label: 'Loaded ' + loaded.length + ' deck(s) from folder.' });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      onProgressFinish({
        label: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    }
  }

  function tabClass(name: DeckLoadTab): string {
    return 'ds-deck-load-tab' + (deckLoadTab === name ? ' active' : '');
  }

  return (
    <>
      <h3>Setup</h3>
      <p className="ds-meta">
        <a href="#/settings/deck-suggest">Open Deck Suggest settings</a> for folder URL, set codes, and
        debug prefs.
      </p>
      <label className="ds-field">
        Set codes (comma-separated)
        <input
          type="text"
          id="ds-set-codes"
          value={setCodesInput}
          placeholder="MSH,MSC,MAR"
          onChange={(e) => onSetCodesInput(e.target.value)}
        />
      </label>
      <div className="ds-actions">
        <button type="button" className="ds-btn" id="ds-fetch-set" onClick={() => void handleFetchSet()}>
          Load set pool
        </button>
        <label className="ds-btn ds-btn-ghost">
          Upload set JSON
          <input
            ref={setUploadRef}
            type="file"
            id="ds-set-upload"
            accept=".json"
            hidden
            onChange={handleSetUpload}
          />
        </label>
      </div>

      {setScope ? (
        <p className="ds-meta">
          Set pool: {setScope.codes.join(', ')} — {setScope.cards.length} cards ({setScope.source}
          {setScope.fromCache ? ' (cached)' : ''})
        </p>
      ) : null}

      <h4 className="ds-meta">Decks</h4>
      <div className="ds-deck-load-tabs">
        <button
          type="button"
          className={tabClass('folder')}
          data-deck-tab="folder"
          disabled={!bridge}
          title={bridge ? undefined : 'Requires Archidekt bridge'}
          onClick={() => onDeckLoadTab('folder')}
        >
          Folder
        </button>
        <button
          type="button"
          className={tabClass('paste-import')}
          data-deck-tab="paste-import"
          onClick={() => onDeckLoadTab('paste-import')}
        >
          Paste deck
        </button>
        <button
          type="button"
          className={tabClass('paste-urls')}
          data-deck-tab="paste-urls"
          onClick={() => onDeckLoadTab('paste-urls')}
        >
          Paste URLs
        </button>
        <button
          type="button"
          className={tabClass('upload')}
          data-deck-tab="upload"
          onClick={() => onDeckLoadTab('upload')}
        >
          Upload JSON
        </button>
      </div>

      {deckLoadTab === 'folder' ? (
        <div className="ds-deck-load-pane" id="ds-deck-pane-folder">
          <label className="ds-field">
            Archidekt folder URL
            <input
              type="text"
              id="ds-folder-url"
              defaultValue={settings.folderUrl || ''}
              key={'folder-' + (settings.folderUrl || '')}
              onBlur={(e) => saveSettings({ ...settings, folderUrl: e.target.value.trim() })}
            />
          </label>
          <div className="ds-actions">
            <button
              type="button"
              className="ds-btn"
              id="ds-load-folder"
              disabled={!bridge}
              onClick={() => {
                const el = document.getElementById('ds-folder-url') as HTMLInputElement | null;
                void handleLoadFolder(el?.value.trim() || settings.folderUrl || '');
              }}
            >
              Load decks
            </button>
          </div>
          {!bridge ? (
            <p className="ds-meta">
              Install the Archidekt Deck Review Bridge userscript to load from a folder, or paste a deck
              import below.
            </p>
          ) : null}
        </div>
      ) : null}

      {deckLoadTab === 'paste-import' ? (
        <div className="ds-deck-load-pane" id="ds-deck-pane-paste-import">
          <label className="ds-field">
            Deck name (optional)
            <input
              type="text"
              id="ds-paste-deck-name"
              defaultValue={settings.pasteDeckName || ''}
            />
          </label>
          <label className="ds-field">
            Archidekt deck URL (optional, for profiles)
            <input type="text" id="ds-paste-deck-url" defaultValue={settings.pasteDeckUrl || ''} />
          </label>
          <label className="ds-field">
            Archidekt import text (one card per line)
            <textarea
              id="ds-deck-import"
              placeholder={'1x Sol Ring (cmm) 1 [Ramp]\n1x Lightning Bolt (mh2) 123 [Removal]'}
              defaultValue={settings.pasteDeckImport || ''}
            />
          </label>
          <div className="ds-actions">
            <button
              type="button"
              className="ds-btn"
              id="ds-load-import"
              onClick={() => {
                onClearError();
                const importEl = document.getElementById('ds-deck-import') as HTMLTextAreaElement;
                const nameEl = document.getElementById('ds-paste-deck-name') as HTMLInputElement;
                const urlEl = document.getElementById('ds-paste-deck-url') as HTMLInputElement;
                const nextSettings = {
                  ...settings,
                  pasteDeckImport: importEl?.value || '',
                  pasteDeckName: nameEl?.value.trim() || '',
                  pasteDeckUrl: urlEl?.value.trim() || '',
                };
                saveSettings(nextSettings);
                try {
                  const deck = buildDeckFromImportText(importEl?.value || '', {
                    deck_name: nextSettings.pasteDeckName || undefined,
                    archidekt_url: nextSettings.pasteDeckUrl || undefined,
                  });
                  onDeckSelectionChange(applyDeckList([deck], deckSelection));
                } catch (err) {
                  onError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Load deck
            </button>
          </div>
        </div>
      ) : null}

      {deckLoadTab === 'paste-urls' ? (
        <div className="ds-deck-load-pane" id="ds-deck-pane-paste-urls">
          <label className="ds-field">
            Archidekt deck URLs (one per line)
            <textarea
              id="ds-deck-urls"
              placeholder="https://archidekt.com/decks/12345/my-deck"
              defaultValue={settings.customDeckUrls || ''}
            />
          </label>
          <div className="ds-actions">
            <button
              type="button"
              className="ds-btn"
              id="ds-load-paste-urls"
              onClick={() => {
                onClearError();
                const urlsEl = document.getElementById('ds-deck-urls') as HTMLTextAreaElement;
                saveSettings({ ...settings, customDeckUrls: urlsEl?.value || '' });
                try {
                  const loaded = parseDeckListFromText(urlsEl?.value || '');
                  onDeckSelectionChange(applyDeckList(loaded, deckSelection));
                } catch (err) {
                  onError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Load decks
            </button>
          </div>
        </div>
      ) : null}

      {deckLoadTab === 'upload' ? (
        <div className="ds-deck-load-pane" id="ds-deck-pane-upload">
          <div className="ds-actions">
            <label className="ds-btn ds-btn-ghost">
              Upload deck JSON
              <input
                ref={deckUploadRef}
                type="file"
                id="ds-deck-upload"
                accept=".json"
                hidden
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  if (!file) {
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const deck = JSON.parse(String(reader.result)) as DeckRecord;
                      deck.deck_id = deck.deck_id || 'upload-' + Date.now();
                      onDeckSelectionChange(applyDeckList([deck], deckSelection));
                    } catch (err) {
                      onError(err instanceof Error ? err.message : String(err));
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      ) : null}

      {profilesConnected ? (
        <p className="ds-meta">Profiles directory connected.</p>
      ) : (
        <p className="ds-meta">Connect profiles in Deck Review for roles and blocklists.</p>
      )}

      {isLocalHub() ? (
        <fieldset className="ds-rules-debug-setup">
          <legend>Developer</legend>
          <label className="ds-deck-option">
            <input
              type="checkbox"
              id="ds-rules-debug"
              checked={!!settings.rulesDebug}
              onChange={(e) => saveSettings({ ...settings, rulesDebug: e.target.checked })}
            />{' '}
            Debug trace
          </label>
          <p className="ds-meta">Local dev only — traces why cards did not match deck profile.</p>
        </fieldset>
      ) : null}

      {decks.length ? (
        <fieldset className="ds-deck-list">
          <legend>Decks ({decks.length})</legend>
          <div className="ds-deck-select-actions">
            <button
              type="button"
              id="ds-select-all-decks"
              onClick={() =>
                onDeckSelectionChange({ ...deckSelection, selectedIds: selectAllDecks(decks) })
              }
            >
              Select all
            </button>
            <button
              type="button"
              id="ds-clear-all-decks"
              onClick={() => onDeckSelectionChange({ ...deckSelection, selectedIds: [] })}
            >
              Clear all
            </button>
          </div>
          {decks.map((deck) => (
            <label key={deck.deck_id} className="ds-deck-option">
              <input
                type="checkbox"
                name="ds-deck"
                value={deck.deck_id}
                checked={selected.indexOf(deck.deck_id) >= 0}
                onChange={(e) =>
                  onDeckSelectionChange({
                    ...deckSelection,
                    selectedIds: toggleDeckSelection(selected, deck.deck_id, e.target.checked),
                  })
                }
              />{' '}
              {deck.deck_name}
            </label>
          ))}
        </fieldset>
      ) : null}
    </>
  );
}

export { resolveDeckLoadTab };
