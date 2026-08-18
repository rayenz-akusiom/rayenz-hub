import type { Container } from 'inversify';
import type { AuthService } from '../services/auth-service.js';
import type { CognitoAuthPort } from '../services/cognito-auth.js';
import type { SpendLockService } from '../services/spend-lock.js';
import type { RateLimitService } from '../services/rate-limit.js';
import type { InviteService } from '../services/invite-service.js';
import type { ProfileRepository } from '../repositories/profile-repository.js';
import type { ReviewProgressRepository } from '../repositories/review-repository.js';
import type { SetPoolRepository } from '../repositories/set-pool-repository.js';
import type { DeckRepository } from '../repositories/deck-repository.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import type { UsernameDirectoryService } from '../services/username-directory-service.js';
import { TYPES } from './types.js';

export interface AppServices {
  authService: AuthService;
  cognitoAuth: CognitoAuthPort;
  spendLock: SpendLockService;
  rateLimit: RateLimitService;
  inviteService: InviteService;
  settingsRepository: SettingsRepository;
  profileRepository: ProfileRepository;
  reviewProgressRepository: ReviewProgressRepository;
  setPoolRepository: SetPoolRepository;
  deckRepository: DeckRepository;
  usernameDirectory: UsernameDirectoryService;
}

export function resolveAppServices(container: Container): AppServices {
  return {
    authService: container.get<AuthService>(TYPES.AuthService),
    cognitoAuth: container.get<CognitoAuthPort>(TYPES.CognitoAuthPort),
    spendLock: container.get<SpendLockService>(TYPES.SpendLockService),
    rateLimit: container.get<RateLimitService>(TYPES.RateLimitService),
    inviteService: container.get<InviteService>(TYPES.InviteService),
    settingsRepository: container.get<SettingsRepository>(TYPES.SettingsRepository),
    profileRepository: container.get<ProfileRepository>(TYPES.ProfileRepository),
    reviewProgressRepository: container.get<ReviewProgressRepository>(TYPES.ReviewProgressRepository),
    setPoolRepository: container.get<SetPoolRepository>(TYPES.SetPoolRepository),
    deckRepository: container.get<DeckRepository>(TYPES.DeckRepository),
    usernameDirectory: container.get<UsernameDirectoryService>(TYPES.UsernameDirectoryService),
  };
}
