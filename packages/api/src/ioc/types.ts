export const TYPES = {
  ApiEnv: Symbol.for('ApiEnv'),
  AuthService: Symbol.for('AuthService'),
  SettingsRepository: Symbol.for('SettingsRepository'),
  ProfileRepository: Symbol.for('ProfileRepository'),
  ReviewProgressRepository: Symbol.for('ReviewProgressRepository'),
  SetPoolRepository: Symbol.for('SetPoolRepository'),
  DeckRepository: Symbol.for('DeckRepository'),
} as const;
