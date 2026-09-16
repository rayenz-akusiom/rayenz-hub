import {
  RELEASE_ENSURE_JOB_ID,
  listDueReleaseScheduleSets,
} from '@rayenz-hub/shared';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { mapHandlerError } from '../lib/handler-errors.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { requireSpendUnlocked } from '../lib/route-policy.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export type ReleaseEnsureInvoker = {
  invoke(functionName: string, payload: Record<string, unknown>): Promise<void>;
};

function defaultInvoker(): ReleaseEnsureInvoker {
  const client = new LambdaClient({});
  return {
    async invoke(functionName, payload) {
      await client.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(payload)),
        }),
      );
    },
  };
}

export async function handleReleaseEnsure(
  method: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
  invoker: ReleaseEnsureInvoker = defaultInvoker(),
) {
  try {
    await services.authService.authenticate(headers);
    if (method === 'GET') {
      const job = await services.releaseSchedule.getJob();
      return jsonResponse(200, job);
    }
    if (method === 'POST') {
      const locked = await requireSpendUnlocked(services.spendLock);
      if (locked) return locked;

      const schedule = await services.releaseSchedule.getSchedule();
      const due = listDueReleaseScheduleSets(schedule);
      if (!due.length) {
        const job = await services.releaseSchedule.getJob();
        return jsonResponse(200, {
          jobId: job.jobId || RELEASE_ENSURE_JOB_ID,
          status: job.status === 'running' ? 'running' : 'idle',
          dueSetCodes: [],
        });
      }

      const existing = await services.releaseSchedule.getJob();
      if (existing.status === 'running') {
        return jsonResponse(202, {
          jobId: existing.jobId || RELEASE_ENSURE_JOB_ID,
          status: 'running' as const,
          dueSetCodes: due.map((s) => s.setCode),
        });
      }

      const now = new Date().toISOString();
      const job = await services.releaseSchedule.putJob({
        jobId: RELEASE_ENSURE_JOB_ID,
        status: 'running',
        startedAt: now,
        current: 0,
        total: due.length,
        label: `Ensuring ${due.length} set(s)…`,
        error: null,
        updatedAt: now,
      });

      const functionName = process.env.HUB_RELEASE_ENSURE_FUNCTION_NAME;
      if (functionName) {
        try {
          await invoker.invoke(functionName, { source: 'http', jobId: RELEASE_ENSURE_JOB_ID });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await services.releaseSchedule.putJob({
            ...job,
            status: 'error',
            finishedAt: new Date().toISOString(),
            error: msg,
            updatedAt: new Date().toISOString(),
          });
          throw err;
        }
      } else {
        // Local / tests without a worker ARN: run in background (do not block HTTP).
        const { runReleaseEnsure } = await import('./release-ensure-worker.js');
        void runReleaseEnsure(services).catch(async (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          try {
            await services.releaseSchedule.putJob({
              jobId: RELEASE_ENSURE_JOB_ID,
              status: 'error',
              finishedAt: new Date().toISOString(),
              error: msg,
              updatedAt: new Date().toISOString(),
            });
          } catch {
            /* ignore */
          }
        });
      }

      return jsonResponse(202, {
        jobId: RELEASE_ENSURE_JOB_ID,
        status: 'running' as const,
        dueSetCodes: due.map((s) => s.setCode),
      });
    }
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
