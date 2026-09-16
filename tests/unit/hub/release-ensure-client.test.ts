import { afterEach, describe, expect, it, vi } from 'vitest';
import { maybeEnsureReleaseSchedule } from '../../../packages/web/src/api/release-ensure.ts';

vi.mock('../../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: vi.fn(() => true),
}));

vi.mock('../../../packages/web/src/lib/hub-auth-session', () => ({
  getHubAuthSession: vi.fn(() => ({ accessToken: 'tok' })),
}));

vi.mock('../../../packages/web/src/api/hub-api-client', () => ({
  kickReleaseEnsure: vi.fn(),
  pullReleaseEnsureJob: vi.fn(),
}));

import { isApiConfigured } from '../../../packages/web/src/api/hub-api';
import { getHubAuthSession } from '../../../packages/web/src/lib/hub-auth-session';
import {
  kickReleaseEnsure,
  pullReleaseEnsureJob,
} from '../../../packages/web/src/api/hub-api-client';

describe('maybeEnsureReleaseSchedule', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(isApiConfigured).mockReturnValue(true);
    vi.mocked(getHubAuthSession).mockReturnValue({ accessToken: 'tok' } as never);
  });

  it('no-ops when unsigned or API off', async () => {
    vi.mocked(isApiConfigured).mockReturnValue(false);
    expect(await maybeEnsureReleaseSchedule()).toEqual({ kicked: false, refreshed: false });
    vi.mocked(isApiConfigured).mockReturnValue(true);
    vi.mocked(getHubAuthSession).mockReturnValue(null);
    expect(await maybeEnsureReleaseSchedule()).toEqual({ kicked: false, refreshed: false });
  });

  it('returns refreshed when a running job completes', async () => {
    vi.mocked(kickReleaseEnsure).mockResolvedValue({
      jobId: 'release-ensure',
      status: 'running',
      dueSetCodes: ['TLA'],
    });
    vi.mocked(pullReleaseEnsureJob).mockResolvedValue({
      jobId: 'release-ensure',
      status: 'complete',
      updatedAt: new Date().toISOString(),
    });
    vi.useFakeTimers();
    const promise = maybeEnsureReleaseSchedule();
    await vi.advanceTimersByTimeAsync(1600);
    const result = await promise;
    vi.useRealTimers();
    expect(result).toMatchObject({ kicked: true, refreshed: true });
  });
});
