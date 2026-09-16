import { getHubAuthSession } from '../lib/hub-auth-session';
import { isApiConfigured } from './hub-api';
import {
  kickReleaseEnsure,
  pullReleaseEnsureJob,
  type ReleaseEnsureKickRemote,
} from './hub-api-client';

const POLL_MS = 1500;
const MAX_POLLS = 40;

/**
 * When signed in with Hub API configured, kick release-ensure and wait if a job started.
 * Returns true when the precon library may have new decks (caller should refresh).
 */
export async function maybeEnsureReleaseSchedule(opts?: {
  signal?: AbortSignal;
  onStatus?: (label: string) => void;
}): Promise<{ kicked: boolean; refreshed: boolean; kick?: ReleaseEnsureKickRemote }> {
  if (!isApiConfigured() || !getHubAuthSession()?.accessToken) {
    return { kicked: false, refreshed: false };
  }
  try {
    const kick = await kickReleaseEnsure();
    if (kick.status !== 'running') {
      return { kicked: true, refreshed: false, kick };
    }
    opts?.onStatus?.(
      kick.dueSetCodes?.length
        ? `Checking for new precons (${kick.dueSetCodes.join(', ')})…`
        : 'Checking for new precons…',
    );
    for (let i = 0; i < MAX_POLLS; i++) {
      if (opts?.signal?.aborted) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (opts?.signal?.aborted) break;
      const job = await pullReleaseEnsureJob();
      if (job.label) opts?.onStatus?.(job.label);
      if (job.status !== 'running') {
        return { kicked: true, refreshed: job.status === 'complete', kick };
      }
    }
    return { kicked: true, refreshed: false, kick };
  } catch {
    return { kicked: false, refreshed: false };
  }
}
