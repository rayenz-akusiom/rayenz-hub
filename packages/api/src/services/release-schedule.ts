import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  RELEASE_ENSURE_JOB_ID,
  RELEASE_SCHEDULE_SK,
  SYSTEM_PK,
  emptyReleaseScheduleDocument,
  idleReleaseEnsureJob,
  mergeReleaseScheduleSets,
  releaseEnsureJobSk,
  ReleaseEnsureJobSchema,
  ReleaseScheduleDocumentSchema,
  type ReleaseEnsureJob,
  type ReleaseScheduleDocument,
  type ReleaseScheduleSet,
} from '@rayenz-hub/shared';

type DocClient = Pick<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient, 'send'>;

export class ReleaseScheduleService {
  constructor(
    private readonly doc: DocClient,
    private readonly tableName: string,
  ) {}

  async getSchedule(): Promise<ReleaseScheduleDocument> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: SYSTEM_PK, SK: RELEASE_SCHEDULE_SK },
      }),
    );
    const item = result.Item;
    if (!item?.document) {
      return emptyReleaseScheduleDocument();
    }
    return ReleaseScheduleDocumentSchema.parse(item.document);
  }

  async putSchedule(
    sets: ReleaseScheduleSet[],
    opts?: { updatedBy?: string },
  ): Promise<ReleaseScheduleDocument> {
    const previous = await this.getSchedule();
    const merged = mergeReleaseScheduleSets(sets, previous.sets);
    const now = new Date().toISOString();
    const document = ReleaseScheduleDocumentSchema.parse({
      version: 1,
      updatedAt: now,
      sets: merged,
    });
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: SYSTEM_PK,
          SK: RELEASE_SCHEDULE_SK,
          entityType: 'RELEASE_SCHEDULE',
          document,
          updatedAt: now,
          updatedBy: opts?.updatedBy,
        },
      }),
    );
    return document;
  }

  /** Worker-only full replace of schedule sets (status patches). */
  async replaceScheduleSets(sets: ReleaseScheduleSet[]): Promise<ReleaseScheduleDocument> {
    const now = new Date().toISOString();
    const document = ReleaseScheduleDocumentSchema.parse({
      version: 1,
      updatedAt: now,
      sets,
    });
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: SYSTEM_PK,
          SK: RELEASE_SCHEDULE_SK,
          entityType: 'RELEASE_SCHEDULE',
          document,
          updatedAt: now,
        },
      }),
    );
    return document;
  }

  async getJob(): Promise<ReleaseEnsureJob> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: SYSTEM_PK, SK: releaseEnsureJobSk() },
      }),
    );
    const item = result.Item;
    if (!item?.job) {
      return idleReleaseEnsureJob();
    }
    return ReleaseEnsureJobSchema.parse(item.job);
  }

  async putJob(job: ReleaseEnsureJob): Promise<ReleaseEnsureJob> {
    const parsed = ReleaseEnsureJobSchema.parse({
      ...job,
      jobId: RELEASE_ENSURE_JOB_ID,
      updatedAt: job.updatedAt || new Date().toISOString(),
    });
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: SYSTEM_PK,
          SK: releaseEnsureJobSk(),
          entityType: 'JOB',
          jobId: RELEASE_ENSURE_JOB_ID,
          job: parsed,
          updatedAt: parsed.updatedAt,
        },
      }),
    );
    return parsed;
  }
}
