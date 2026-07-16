import 'reflect-metadata';
import { Container } from 'inversify';
import { readEnv, type ApiEnv } from '../lib/auth.js';
import { AuthService } from '../services/auth-service.js';
import { ProfileRepository } from '../repositories/profile-repository.js';
import { ReviewProgressRepository } from '../repositories/review-repository.js';
import { SetPoolRepository } from '../repositories/set-pool-repository.js';
import { DeckRepository } from '../repositories/deck-repository.js';
import { createDocClient, SettingsRepository } from '../repositories/settings-repository.js';
import { createS3Client, S3BlobStore } from '../repositories/s3-blob-store.js';
import { TYPES } from './types.js';

export interface ContainerOverrides {
  apiEnv?: ApiEnv;
  authService?: AuthService;
  settingsRepository?: SettingsRepository;
  profileRepository?: ProfileRepository;
  reviewProgressRepository?: ReviewProgressRepository;
  setPoolRepository?: SetPoolRepository;
  deckRepository?: DeckRepository;
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
