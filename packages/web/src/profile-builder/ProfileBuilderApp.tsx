import { useEffect, useMemo, useState } from 'react';
import { parseYamlProfile } from '@rayenz-hub/shared';
import { HubApiClient } from '../api/hub-api-client';
import { loadHubLibraryDecks } from '../deck-suggest/data';
import type { DeckProfile, DeckRecord } from '../deck-suggest/types';
import { mainDeckCards, RepresentativeCardPicker } from './RepresentativeCardPicker';
import { TagSelectList } from './TagSelectList';
import { mergeThemes, replaceYamlListSection } from './yaml-save';

function deckIdFromHash(): string {
  const hash = window.location.hash || '';
  const query = hash.includes('?') ? hash.split('?')[1] : '';
  return new URLSearchParams(query).get('deckId')?.trim() || '';
}

async function fetchTagCandidates(deckId: string, cards: string[]) {
  const qs = encodeURIComponent(cards.join(','));
  return HubApiClient.apiFetch<{
    tags: string[];
    byCard: Record<string, string[]>;
    cardsMissing: string[];
  }>(`/v1/profiles/${encodeURIComponent(deckId)}/tag-candidates?cards=${qs}`);
}

export function ProfileBuilderApp() {
  const [deckId, setDeckId] = useState(deckIdFromHash());
  const [decks, setDecks] = useState<DeckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [byCard, setByCard] = useState<Record<string, string[]>>({});
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState('');
  const [saving, setSaving] = useState(false);

  const activeDeck = useMemo(
    () => decks.find((d) => d.deck_id === deckId) || null,
    [decks, deckId],
  );
  const pickerCards = useMemo(
    () => mainDeckCards(activeDeck?.deck_snapshot?.cards),
    [activeDeck],
  );

  useEffect(() => {
    let cancelled = false;
    void loadHubLibraryDecks()
      .then((list) => {
        if (!cancelled) {
          setDecks(list);
          if (!deckId && list[0]) setDeckId(list[0].deck_id);
        }
      })
      .catch(() => {
        if (!cancelled) setDecks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    void HubApiClient.pullProfileYaml(deckId)
      .then((yaml) => {
        if (cancelled || !yaml) return;
        const profile = parseYamlProfile(yaml) as DeckProfile;
        if (profile.representative_cards?.length) setSelectedCards(profile.representative_cards.slice(0, 5));
        if (profile.profile_tags?.length) setSelectedTags(profile.profile_tags);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  async function loadTags() {
    if (!deckId || !selectedCards.length) return;
    setTagsLoading(true);
    setTagsError('');
    try {
      const data = await fetchTagCandidates(deckId, selectedCards);
      setTags(data?.tags || []);
      setByCard(data?.byCard || {});
    } catch (err) {
      setTagsError(err instanceof Error ? err.message : String(err));
    } finally {
      setTagsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCards.length) void loadTags();
    else {
      setTags([]);
      setByCard({});
    }
  }, [selectedCards, deckId]);

  async function handleSave() {
    if (!deckId) return;
    setSaving(true);
    setSaveError('');
    setSaveOk('');
    try {
      const existing = (await HubApiClient.pullProfileYaml(deckId)) || `deck_id: ${deckId}\nformat: commander\n`;
      let yaml = existing;
      yaml = replaceYamlListSection(yaml, 'representative_cards', selectedCards);
      yaml = replaceYamlListSection(yaml, 'profile_tags', selectedTags);
      const themes = mergeThemes(yaml, selectedTags);
      yaml = replaceYamlListSection(yaml, 'themes', themes);
      await HubApiClient.pushProfile(deckId, { yaml });
      setSaveOk('Profile saved.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-app">
      <h2>Profile Builder</h2>
      <p className="ds-meta">
        Pick representative cards and tags to guide Budget upgrade suggestions.
      </p>
      {loading ? <p className="ds-meta">Loading decks…</p> : null}
      <label className="ds-field">
        Deck
        <select
          value={deckId}
          onChange={(e) => {
            setDeckId(e.target.value);
            window.location.hash = `#/profile-builder?deckId=${encodeURIComponent(e.target.value)}`;
          }}
        >
          {decks.map((d) => (
            <option key={d.deck_id} value={d.deck_id}>{d.deck_name}</option>
          ))}
        </select>
      </label>
      {activeDeck ? (
        <>
          <h3>Representative cards</h3>
          <RepresentativeCardPicker
            cards={pickerCards}
            selected={selectedCards}
            onChange={setSelectedCards}
          />
          <h3>Tags</h3>
          {tagsLoading ? <p className="ds-meta">Loading tags…</p> : null}
          {tagsError ? <p className="ds-error-inline">{tagsError}</p> : null}
          <TagSelectList
            tags={tags}
            byCard={byCard}
            selected={selectedTags}
            onChange={setSelectedTags}
          />
          <div className="pb-actions">
            <button type="button" className="ds-btn ds-btn-primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            <a className="ds-btn" href={`#/deck-suggest`}>Back to Deck Suggest</a>
          </div>
          {saveOk ? <p className="ds-meta">{saveOk}</p> : null}
          {saveError ? <p className="ds-error-inline">{saveError}</p> : null}
        </>
      ) : null}
    </div>
  );
}
