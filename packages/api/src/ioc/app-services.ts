import type { Container } from 'inversify';
import type { AuthService } from '../services/auth-service.js';
import type { ProfileRepository } from '../repositories/profile-repository.js';
import type { ReviewProgressRepository } from '../repositories/review-repository.js';
import type { SetPoolRepository } from '../repositories/set-pool-repository.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import { TYPES } from './types.js';

export interface AppServices {
  authService: AuthService;
  settingsRepository: SettingsRepository;
  profileRepository: ProfileRepository;
  reviewProgressRepository: ReviewProgressRepository;
  setPoolRepository: SetPoolRepository;
}

export function resolveAppServices(container: Container): AppServices {
  return {
    authService: container.get<AuthService>(TYPES.AuthService),
    settingsRepository: container.get<SettingsRepository>(TYPES.SettingsRepository),
    profileRepository: container.get<ProfileRepository>(TYPES.ProfileRepository),
    reviewProgressRepository: container.get<ReviewProgressRepository>(TYPES.ReviewProgressRepository),
    setPoolRepository: container.get<SetPoolRepository>(TYPES.SetPoolRepository),
  };
}
