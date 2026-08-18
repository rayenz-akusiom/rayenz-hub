import 'reflect-metadata';
import { Container } from 'inversify';
import { readEnv, type ApiEnv } from '../lib/auth.js';
import { AuthService } from '../services/auth-service.js';
import { createCognitoAuthPort, type CognitoAuthPort } from '../services/cognito-auth.js';
import { SpendLockService } from '../services/spend-lock.js';
import { RateLimitService } from '../services/rate-limit.js';
import { InviteRepository, InviteService } from '../services/invite-service.js';
import { ProfileRepository } from '../repositories/profile-repository.js';
import { ReviewProgressRepository } from '../repositories/review-repository.js';
import { SetPoolRepository } from '../repositories/set-pool-repository.js';
import { DeckRepository } from '../repositories/deck-repository.js';
import { UsernameDirectory } from '../repositories/username-directory.js';
import { UsernameDirectoryService } from '../services/username-directory-service.js';
import { createDocClient, SettingsRepository } from '../repositories/settings-repository.js';
import { createS3Client, S3BlobStore } from '../repositories/s3-blob-store.js';
import { TYPES } from './types.js';

export interface ContainerOverrides {
  apiEnv?: ApiEnv;
  authService?: AuthService;
  cognitoAuth?: CognitoAuthPort;
  spendLock?: SpendLockService;
  rateLimit?: RateLimitService;
  inviteService?: InviteService;
  settingsRepository?: SettingsRepository;
  profileRepository?: ProfileRepository;
  reviewProgressRepository?: ReviewProgressRepository;
  setPoolRepository?: SetPoolRepository;
  deckRepository?: DeckRepository;
  usernameDirectory?: UsernameDirectoryService;
  docClient?: { send: (command: unknown) => Promise<unknown> };
}

function bindRepositories(container: Container, env: ApiEnv, overrides: ContainerOverrides): void {
  if (overrides.settingsRepository) {
    container.bind(TYPES.SettingsRepository).toConstantValue(overrides.settingsRepository);
  } else {
    container
      .bind(TYPES.SettingsRepository)
      .toDynamicValue(() => new SettingsRepository(createDocClient(env), env.HUB_TABLE_NAME || 'HubTable'))
      .inSingletonScope();
  }

  if (overrides.profileRepository) {
    container.bind(TYPES.ProfileRepository).toConstantValue(overrides.profileRepository);
  } else {
    container
      .bind(TYPES.ProfileRepository)
      .toDynamicValue(() => {
        const doc = createDocClient(env);
        const s3 = new S3BlobStore(createS3Client(env), env.HUB_BUCKET_NAME || 'rayenz-hub-data-local');
        return new ProfileRepository(doc, env.HUB_TABLE_NAME || 'HubTable', s3);
      })
      .inSingletonScope();
  }

  if (overrides.reviewProgressRepository) {
    container.bind(TYPES.ReviewProgressRepository).toConstantValue(overrides.reviewProgressRepository);
  } else {
    container
      .bind(TYPES.ReviewProgressRepository)
      .toDynamicValue(
        () => new ReviewProgressRepository(createDocClient(env), env.HUB_TABLE_NAME || 'HubTable'),
      )
      .inSingletonScope();
  }

  if (overrides.setPoolRepository) {
    container.bind(TYPES.SetPoolRepository).toConstantValue(overrides.setPoolRepository);
  } else {
    container
      .bind(TYPES.SetPoolRepository)
      .toDynamicValue(() => {
        const doc = createDocClient(env);
        const s3 = new S3BlobStore(createS3Client(env), env.HUB_BUCKET_NAME || 'rayenz-hub-data-local');
        return new SetPoolRepository(doc, env.HUB_TABLE_NAME || 'HubTable', s3);
      })
      .inSingletonScope();
  }

  if (overrides.deckRepository) {
    container.bind(TYPES.DeckRepository).toConstantValue(overrides.deckRepository);
  } else {
    container
      .bind(TYPES.DeckRepository)
      .toDynamicValue(() => {
        const doc = createDocClient(env);
        const s3 = new S3BlobStore(createS3Client(env), env.HUB_BUCKET_NAME || 'rayenz-hub-data-local');
        return new DeckRepository(doc, env.HUB_TABLE_NAME || 'HubTable', s3);
      })
      .inSingletonScope();
  }
}

export function createContainer(overrides: ContainerOverrides = {}): Container {
  const container = new Container({ defaultScope: 'Singleton' });
  const env = overrides.apiEnv ?? readEnv();

  container.bind(TYPES.ApiEnv).toConstantValue(env);

  if (overrides.authService) {
    container.bind(TYPES.AuthService).toConstantValue(overrides.authService);
  } else {
    container.bind(TYPES.AuthService).toDynamicValue(() => new AuthService(env)).inSingletonScope();
  }

  bindRepositories(container, env, overrides);

  const doc = overrides.docClient ?? createDocClient(env);

  if (overrides.cognitoAuth) {
    container.bind(TYPES.CognitoAuthPort).toConstantValue(overrides.cognitoAuth);
  } else {
    container.bind(TYPES.CognitoAuthPort).toConstantValue(createCognitoAuthPort(env));
  }

  if (overrides.spendLock) {
    container.bind(TYPES.SpendLockService).toConstantValue(overrides.spendLock);
  } else {
    container.bind(TYPES.SpendLockService).toConstantValue(new SpendLockService(doc, env.HUB_TABLE_NAME || 'HubTable'));
  }

  if (overrides.rateLimit) {
    container.bind(TYPES.RateLimitService).toConstantValue(overrides.rateLimit);
  } else {
    container.bind(TYPES.RateLimitService).toConstantValue(new RateLimitService(doc, env.HUB_TABLE_NAME || 'HubTable'));
  }

  if (overrides.inviteService) {
    container.bind(TYPES.InviteService).toConstantValue(overrides.inviteService);
  } else {
    const invites = new InviteRepository(doc, env.HUB_TABLE_NAME || 'HubTable');
    container.bind(TYPES.InviteService).toConstantValue(new InviteService(invites, env));
  }

  if (overrides.usernameDirectory) {
    container.bind(TYPES.UsernameDirectoryService).toConstantValue(overrides.usernameDirectory);
  } else {
    const directory = new UsernameDirectory(doc, env.HUB_TABLE_NAME || 'HubTable');
    container.bind(TYPES.UsernameDirectoryService).toConstantValue(new UsernameDirectoryService(directory));
  }

  return container;
}

let productionContainer: Container | undefined;

export function getProductionContainer(): Container {
  if (!productionContainer) {
    productionContainer = createContainer();
  }
  return productionContainer;
}

export function resetProductionContainer(): void {
  productionContainer = undefined;
}
