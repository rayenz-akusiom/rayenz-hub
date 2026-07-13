import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  resolveUserId,
  settingsDomainFromPath,
  settingsSk,
  userPk,
  type AuthContext,
  type SettingsDomain,
  type SettingsUpsert,
} from '@rayenz-hub/shared';
import type { ApiEnv } from './auth.js';

export interface SettingsRecord {
  domain: string;
  formatVersion: number;
  payload: Record<string, unknown>;
  updatedAt: string;
}

type DocClient = Pick<DynamoDBDocumentClient, 'send'>;

export function createDocClient(env: ApiEnv): DynamoDBDocumentClient {
  const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = {
    region: env.AWS_REGION || 'us-east-1',
  };
  if (env.DYNAMODB_ENDPOINT) {
    clientConfig.endpoint = env.DYNAMODB_ENDPOINT;
    clientConfig.credentials = {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    };
  }
  const base = new DynamoDBClient(clientConfig);
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export class SettingsRepository {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
  ) {}

  async get(auth: AuthContext, env: ApiEnv, restDomain: string): Promise<SettingsRecord | null> {
    const settingsDomain = settingsDomainFromPath(restDomain);
    if (!settingsDomain) {
      return null;
    }
    const userId = resolveUserId(auth, env);
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: userPk(userId),
          SK: settingsSk(settingsDomain),
        },
      }),
    );
    if (!result.Item) {
      return null;
    }
    return mapItemToRecord(restDomain, result.Item);
  }

  async put(
    auth: AuthContext,
    env: ApiEnv,
    restDomain: string,
    input: SettingsUpsert,
  ): Promise<SettingsRecord> {
    const settingsDomain = settingsDomainFromPath(restDomain);
    if (!settingsDomain) {
      throw new Error('Invalid domain');
    }
    const userId = resolveUserId(auth, env);
    const now = new Date().toISOString();
    const item = {
      PK: userPk(userId),
      SK: settingsSk(settingsDomain as SettingsDomain),
      entityType: 'SETTINGS',
      domain: settingsDomain,
      formatVersion: input.formatVersion ?? 1,
      payload: input.payload,
      updatedAt: now,
      createdAt: now,
    };
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      }),
    );
    return {
      domain: restDomain,
      formatVersion: item.formatVersion,
      payload: item.payload,
      updatedAt: now,
    };
  }
}

function mapItemToRecord(restDomain: string, item: Record<string, unknown>): SettingsRecord {
  return {
    domain: restDomain,
    formatVersion: Number(item.formatVersion ?? 1),
    payload: (item.payload as Record<string, unknown>) || {},
    updatedAt: String(item.updatedAt ?? ''),
  };
}
