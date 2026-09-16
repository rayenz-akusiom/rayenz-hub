import { parseYamlList, profileLookupKeys, type DeckDocument } from '@rayenz-hub/shared';
import { HubApiClient } from '../../api/hub-api-client';
import { toKebabCase } from '../../lib/string-utils';
import { ProfileSync } from '../../mtg/profile-sync';

/** Replace or insert a top-level YAML scalar (`key: value`) without touching other content. */
export function upsertYamlTopLevelScalar(text: string, key: string, value: string): string {
  const lines = String(text || '').split(/\r?\n/);
  const re = new RegExp(`^${key}:\\s*.*$`);
  let found = false;
  const out = lines.map((line) => {
    if (re.test(line)) {
      found = true;
      return `${key}: ${value}`;
    }
    return line;
  });
  if (!found) {
    return [`${key}: ${value}`, ...out].join('\n');
  }
  return out.join('\n');
}

export function rewriteProfileIdentity(yaml: string, deckId: string, deckName: string): string {
  let text = upsertYamlTopLevelScalar(yaml, 'deck_id', deckId);
  text = upsertYamlTopLevelScalar(text, 'deck_name', deckName);
  return text;
}

function isApiProfilesAvailable(): boolean {
  return !!HubApiClient.getConfig().enabled;
}

/**
 * Copy the source deck's profile YAML under the saved copy's deckId.
 * No-op when no source profile exists or Hub API profiles are unavailable.
 * Throws on push failure so the caller can soft-fail.
 */
export async function copyDeckProfile(
  source: Pick<DeckDocument, 'deckId' | 'archidektId' | 'name'>,
  saved: Pick<DeckDocument, 'deckId' | 'name'>,
  opts?: { publicUsername?: string | null },
): Promise<void> {
  let yaml: string | null = null;
  for (const key of profileLookupKeys(source)) {
    const text = await ProfileSync.readProfileYaml(key);
    if (text && String(text).trim()) {
      yaml = text;
      break;
    }
  }
  if (!yaml && opts?.publicUsername) {
    yaml = await HubApiClient.pullPublicProfileYaml(
      opts.publicUsername,
      toKebabCase(source.name),
    );
  }
  if (!yaml) return;

  const rewritten = rewriteProfileIdentity(yaml, saved.deckId, saved.name);
  if (!isApiProfilesAvailable()) return;

  const protectedCards = parseYamlList(rewritten, 'protected_cards');
  const blockedCards = parseYamlList(rewritten, 'blocked_cards');
  const tags = parseYamlList(rewritten, 'tags');
  await HubApiClient.pushProfile(saved.deckId, {
    yaml: rewritten,
    protectedCards,
    blockedCards,
    tags,
    deckName: saved.name,
  });
}
