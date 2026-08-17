export const TYPES = {
  ApiEnv: Symbol.for('ApiEnv'),
  AuthService: Symbol.for('AuthService'),
  CognitoAuthPort: Symbol.for('CognitoAuthPort'),
  SpendLockService: Symbol.for('SpendLockService'),
  RateLimitService: Symbol.for('RateLimitService'),
  InviteService: Symbol.for('InviteService'),
  SettingsRepository: Symbol.for('SettingsRepository'),
  ProfileRepository: Symbol.for('ProfileRepository'),
  ReviewProgressRepository: Symbol.for('ReviewProgressRepository'),
  SetPoolRepository: Symbol.for('SetPoolRepository'),
  DeckRepository: Symbol.for('DeckRepository'),
} as const;
