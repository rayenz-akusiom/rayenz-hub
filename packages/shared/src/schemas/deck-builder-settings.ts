import { z } from 'zod';

export const AllyThreeColourNamesSchema = z.enum(['shards', 'capenna']);
export const EnemyThreeColourNamesSchema = z.enum(['wedges', 'ikoria']);

export const DeckBuilderSettingsPayloadSchema = z.object({
  allyThreeColourNames: AllyThreeColourNamesSchema.default('shards'),
  enemyThreeColourNames: EnemyThreeColourNamesSchema.default('wedges'),
});

export type DeckBuilderSettingsPayload = z.infer<typeof DeckBuilderSettingsPayloadSchema>;

export type ThreeColourNamingStyle = Pick<
  DeckBuilderSettingsPayload,
  'allyThreeColourNames' | 'enemyThreeColourNames'
>;

export const DEFAULT_DECK_BUILDER_SETTINGS: DeckBuilderSettingsPayload = {
  allyThreeColourNames: 'shards',
  enemyThreeColourNames: 'wedges',
};

/** Dispatched on `window` after deck-builder settings are persisted. */
export const DECK_BUILDER_SETTINGS_EVENT = 'rayenz-deck-builder-settings';
