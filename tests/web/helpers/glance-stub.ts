import { vi } from 'vitest';

/** Stub URL.createObjectURL / revokeObjectURL for glance preview tests. */
export function stubGlanceObjectUrls(url = 'blob:glance-preview') {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => url),
    revokeObjectURL: vi.fn(),
  });
}
