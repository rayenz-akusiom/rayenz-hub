import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const ReleaseSchedulePreconStatusSchema = z.enum([
  'pending',
  'partial',
  'complete',
  'error',
]);
export type ReleaseSchedulePreconStatus = z.infer<typeof ReleaseSchedulePreconStatusSchema>;

export const ReleaseScheduleSetPoolStatusSchema = z.enum(['pending', 'ready', 'error']);
export type ReleaseScheduleSetPoolStatus = z.infer<typeof ReleaseScheduleSetPoolStatusSchema>;

export const ReleaseScheduleSetSchema = z.object({
  setCode: z
    .string()
    .min(1)
    .transform((s) => s.trim().toUpperCase()),
  name: z.string().min(1).optional(),
  finalRevealDate: isoDate,
  expectedCommanderDecks: z.number().int().min(0),
  loadedCommanderDecks: z.number().int().min(0).optional(),
  preconStatus: ReleaseSchedulePreconStatusSchema.optional(),
  setPoolStatus: ReleaseScheduleSetPoolStatusSchema.optional(),
  lastEnsuredAt: z.string().optional(),
  lastError: z.string().nullable().optional(),
});
export type ReleaseScheduleSet = z.infer<typeof ReleaseScheduleSetSchema>;

export const ReleaseScheduleDocumentSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  sets: z.array(ReleaseScheduleSetSchema),
});
export type ReleaseScheduleDocument = z.infer<typeof ReleaseScheduleDocumentSchema>;

/** Owner PUT body — worker fields optional; server merges from existing. */
export const ReleaseSchedulePutSchema = z.object({
  sets: z.array(ReleaseScheduleSetSchema),
});
export type ReleaseSchedulePut = z.infer<typeof ReleaseSchedulePutSchema>;

export const ReleaseEnsureJobStatusSchema = z.enum([
  'idle',
  'running',
  'complete',
  'error',
]);
export type ReleaseEnsureJobStatus = z.infer<typeof ReleaseEnsureJobStatusSchema>;

export const ReleaseEnsureJobSchema = z.object({
  jobId: z.string(),
  status: ReleaseEnsureJobStatusSchema,
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  current: z.number().int().min(0).optional(),
  total: z.number().int().min(0).optional(),
  label: z.string().optional(),
  error: z.string().nullable().optional(),
  updatedAt: z.string(),
});
export type ReleaseEnsureJob = z.infer<typeof ReleaseEnsureJobSchema>;

export const ReleaseEnsureKickResponseSchema = z.object({
  jobId: z.string(),
  status: ReleaseEnsureJobStatusSchema,
  dueSetCodes: z.array(z.string()).optional(),
});
export type ReleaseEnsureKickResponse = z.infer<typeof ReleaseEnsureKickResponseSchema>;

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Parse `YYYY-MM-DD` as UTC midnight; invalid → null. */
export function parseScheduleDay(isoDateStr: string | null | undefined): number | null {
  const raw = String(isoDateStr || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isRevealDateReached(
  finalRevealDate: string,
  now: Date = new Date(),
): boolean {
  const day = parseScheduleDay(finalRevealDate);
  if (day == null) return false;
  return startOfUtcDay(now) >= day;
}

export function isReleaseScheduleSetComplete(set: ReleaseScheduleSet): boolean {
  const loaded = set.loadedCommanderDecks ?? 0;
  const preconDone =
    set.preconStatus === 'complete' && loaded >= set.expectedCommanderDecks;
  const poolDone = set.setPoolStatus === 'ready';
  return preconDone && poolDone;
}

/** True when reveal day has passed and precon and/or set-pool work remains. */
export function isReleaseScheduleSetDue(
  set: ReleaseScheduleSet,
  now: Date = new Date(),
): boolean {
  if (!isRevealDateReached(set.finalRevealDate, now)) return false;
  return !isReleaseScheduleSetComplete(set);
}

export function listDueReleaseScheduleSets(
  doc: Pick<ReleaseScheduleDocument, 'sets'>,
  now: Date = new Date(),
): ReleaseScheduleSet[] {
  return doc.sets.filter((s) => isReleaseScheduleSetDue(s, now));
}

/** Merge owner PUT sets with prior worker-maintained fields (by setCode). */
export function mergeReleaseScheduleSets(
  incoming: ReleaseScheduleSet[],
  previous: ReleaseScheduleSet[],
): ReleaseScheduleSet[] {
  const prevByCode = new Map(previous.map((s) => [s.setCode.toUpperCase(), s]));
  return incoming.map((set) => {
    const code = set.setCode.trim().toUpperCase();
    const prev = prevByCode.get(code);
    const normalized = { ...set, setCode: code };
    if (!prev) return normalized;
    return {
      ...normalized,
      loadedCommanderDecks: set.loadedCommanderDecks ?? prev.loadedCommanderDecks,
      preconStatus: set.preconStatus ?? prev.preconStatus,
      setPoolStatus: set.setPoolStatus ?? prev.setPoolStatus,
      lastEnsuredAt: set.lastEnsuredAt ?? prev.lastEnsuredAt,
      lastError: set.lastError !== undefined ? set.lastError : prev.lastError,
    };
  });
}

export function emptyReleaseScheduleDocument(now = new Date()): ReleaseScheduleDocument {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    sets: [],
  };
}

export function idleReleaseEnsureJob(now = new Date()): ReleaseEnsureJob {
  return {
    jobId: 'release-ensure',
    status: 'idle',
    updatedAt: now.toISOString(),
  };
}
