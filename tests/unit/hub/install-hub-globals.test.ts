import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installHubGlobals,
  resetHubGlobalsInstalled,
} from '../../../packages/web/src/hub/install-hub-globals.ts';
import { StringUtils } from '../../../packages/web/src/lib/string-utils.ts';
import { HubStorage } from '../../../packages/web/src/lib/hub-storage.ts';

type HubGlobalsWindow = Window & {
  StringUtils?: typeof StringUtils;
  HubStorage?: typeof HubStorage;
};

describe('installHubGlobals', () => {
  beforeEach(() => {
    resetHubGlobalsInstalled();
    const w = window as HubGlobalsWindow;
    delete w.StringUtils;
    delete w.HubStorage;
  });

  afterEach(() => {
    resetHubGlobalsInstalled();
  });

  it('installs expected window globals once', () => {
    installHubGlobals();
    const w = window as HubGlobalsWindow;
    expect(w.StringUtils).toBe(StringUtils);
    expect(w.HubStorage).toBe(HubStorage);
  });

  it('is idempotent and does not reassign globals', () => {
    installHubGlobals();
    const w = window as HubGlobalsWindow;
    const firstStringUtils = w.StringUtils;
    const firstHubStorage = w.HubStorage;

    w.StringUtils = undefined;
    w.HubStorage = undefined;

    installHubGlobals();

    expect(w.StringUtils).toBeUndefined();
    expect(w.HubStorage).toBeUndefined();
    expect(firstStringUtils).toBe(StringUtils);
    expect(firstHubStorage).toBe(HubStorage);
  });

  it('allows reinstall after resetHubGlobalsInstalled', () => {
    installHubGlobals();
    const w = window as HubGlobalsWindow;
    w.StringUtils = undefined;

    resetHubGlobalsInstalled();
    installHubGlobals();

    expect(w.StringUtils).toBe(StringUtils);
  });
});
