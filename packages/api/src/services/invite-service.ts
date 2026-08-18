import crypto from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  INVITE_TTL_DAYS,
  inviteItemSk,
  inviteTokenPk,
  userPk,
  type InviteListItem,
  type InviteStatus,
} from '@rayenz-hub/shared';
import { BadRequestError, ForbiddenError, type ApiEnv } from '../lib/auth.js';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export type InviteRecord = {
  inviteId: string;
  tokenHash: string;
  tokenCipher: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  createdBySub: string;
  usedAt?: string;
  revokedAt?: string;
  redeemedBySub?: string;
};

function inviteSecret(env: ApiEnv): Buffer {
  const raw = env.HUB_INVITE_SECRET || 'local-invite-secret';
  return crypto.createHash('sha256').update(raw).digest();
}

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function encryptInviteToken(token: string, env: ApiEnv): string {
  const key = inviteSecret(env);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function decryptInviteToken(cipherText: string, env: ApiEnv): string {
  const key = inviteSecret(env);
  const buf = Buffer.from(cipherText, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function effectiveStatus(record: InviteRecord, now = new Date()): InviteStatus {
  if (record.status === 'unused' && new Date(record.expiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  return record.status;
}

export class InviteRepository {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
  ) {}

  async put(ownerSub: string, record: InviteRecord): Promise<void> {
    const item = {
      PK: userPk(ownerSub),
      SK: inviteItemSk(record.inviteId),
      entityType: 'INVITE',
      ...record,
    };
    const lookup = {
      PK: inviteTokenPk(record.tokenHash),
      SK: 'META',
      entityType: 'INVITE_TOKEN',
      inviteId: record.inviteId,
      ownerSub,
    };
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: lookup }));
  }

  async getById(ownerSub: string, inviteId: string): Promise<InviteRecord | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(ownerSub), SK: inviteItemSk(inviteId) },
      }),
    );
    return result.Item ? mapInvite(result.Item) : null;
  }

  async getByTokenHash(tokenHash: string): Promise<{ ownerSub: string; inviteId: string } | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: inviteTokenPk(tokenHash), SK: 'META' },
      }),
    );
    if (!result.Item) {
      return null;
    }
    return {
      ownerSub: String(result.Item.ownerSub ?? ''),
      inviteId: String(result.Item.inviteId ?? ''),
    };
  }

  async listByOwner(ownerSub: string): Promise<InviteRecord[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': userPk(ownerSub),
          ':sk': 'INVITE::',
        },
      }),
    );
    return (result.Items || []).map(mapInvite);
  }

  async deleteTokenLookup(tokenHash: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: inviteTokenPk(tokenHash), SK: 'META' },
      }),
    );
  }
}

function mapInvite(item: Record<string, unknown>): InviteRecord {
  return {
    inviteId: String(item.inviteId ?? ''),
    tokenHash: String(item.tokenHash ?? ''),
    tokenCipher: String(item.tokenCipher ?? ''),
    status: (item.status as InviteStatus) || 'unused',
    createdAt: String(item.createdAt ?? ''),
    expiresAt: String(item.expiresAt ?? ''),
    createdBySub: String(item.createdBySub ?? ''),
    usedAt: item.usedAt ? String(item.usedAt) : undefined,
    revokedAt: item.revokedAt ? String(item.revokedAt) : undefined,
    redeemedBySub: item.redeemedBySub ? String(item.redeemedBySub) : undefined,
  };
}

export class InviteService {
  constructor(
    private readonly repo: InviteRepository,
    private readonly env: ApiEnv,
  ) {}

  inviteUrl(token: string): string {
    const origin = (this.env.HUB_PAGES_ORIGIN || 'https://rayenz-akusiom.github.io/rayenz-akusiom').replace(
      /\/$/,
      '',
    );
    return `${origin}/#/invite/${encodeURIComponent(token)}`;
  }

  async create(ownerSub: string): Promise<{ inviteId: string; url: string; expiresAt: string }> {
    const inviteId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const record: InviteRecord = {
      inviteId,
      tokenHash: hashInviteToken(token),
      tokenCipher: encryptInviteToken(token, this.env),
      status: 'unused',
      createdAt: now.toISOString(),
      expiresAt,
      createdBySub: ownerSub,
    };
    await this.repo.put(ownerSub, record);
    return { inviteId, url: this.inviteUrl(token), expiresAt };
  }

  async list(ownerSub: string): Promise<InviteListItem[]> {
    const records = await this.repo.listByOwner(ownerSub);
    return records.map((record) => {
      const status = effectiveStatus(record);
      const item: InviteListItem = {
        inviteId: record.inviteId,
        status,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        usedAt: record.usedAt,
        revokedAt: record.revokedAt,
      };
      if (status === 'unused' && record.tokenCipher) {
        try {
          item.url = this.inviteUrl(decryptInviteToken(record.tokenCipher, this.env));
        } catch {
          /* omit url if ciphertext cannot be decrypted */
        }
      }
      return item;
    });
  }

  async revoke(ownerSub: string, inviteId: string): Promise<void> {
    const record = await this.repo.getById(ownerSub, inviteId);
    if (!record) {
      throw new BadRequestError('Invite not found');
    }
    if (effectiveStatus(record) !== 'unused') {
      throw new BadRequestError('Invite cannot be revoked');
    }
    record.status = 'revoked';
    record.revokedAt = new Date().toISOString();
    await this.repo.put(ownerSub, record);
  }

  async redeem(token: string): Promise<InviteRecord> {
    const lookup = await this.repo.getByTokenHash(hashInviteToken(token));
    if (!lookup) {
      throw new ForbiddenError('Invite is not valid', 'INVITE_INVALID');
    }
    const record = await this.repo.getById(lookup.ownerSub, lookup.inviteId);
    if (!record || effectiveStatus(record) !== 'unused') {
      throw new ForbiddenError('Invite is not valid', 'INVITE_INVALID');
    }
    return record;
  }

  async markUsed(record: InviteRecord, redeemedBySub: string): Promise<void> {
    record.status = 'used';
    record.usedAt = new Date().toISOString();
    record.redeemedBySub = redeemedBySub;
    await this.repo.put(record.createdBySub, record);
    await this.repo.deleteTokenLookup(record.tokenHash);
  }
}
