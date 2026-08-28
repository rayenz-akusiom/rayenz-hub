import type { DeckProfile } from './types';

export type ProfileReadiness = 'none' | 'partial' | 'ready';

export function profileReadiness(profile: DeckProfile | null | undefined): ProfileReadiness {
  if (!profile) return 'none';
  const hasRep = (profile.representative_cards || []).length > 0;
  const hasThemes = (profile.themes || []).length > 0;
  const hasRoles = (profile.roles || []).length > 0;
  const hasProfileTags = (profile.profile_tags || []).length > 0;
  if (hasThemes || hasRoles || hasProfileTags) return 'ready';
  if (hasRep) return 'partial';
  return 'none';
}

export function profileReadinessLabel(level: ProfileReadiness): string {
  if (level === 'ready') return 'Profile ready';
  if (level === 'partial') return 'Profile partial';
  return 'No profile yet';
}
