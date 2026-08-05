import { vi } from 'vitest';

export const progressController = {
  start: vi.fn(),
  update: vi.fn(),
  finish: vi.fn(),
  dismiss: vi.fn(),
  isActive: vi.fn(() => false),
  isFinished: vi.fn(() => false),
  setIndeterminate: vi.fn(),
  destroy: vi.fn(),
};

/** Use inside `vi.mock('.../hub-progress', () => hubProgressMockModule())`. */
export function hubProgressMockModule() {
  return {
    HubProgress: { mount: vi.fn(() => progressController) },
  };
}
