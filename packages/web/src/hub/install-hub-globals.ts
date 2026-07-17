import {
  CutCandidates,
  SuggestionsBundle,
  SwapQueue,
} from '@rayenz-hub/shared';
import { HubApiClient } from '../api/hub-api-client';
import { HubProgress } from '../lib/hub-progress';
import { HubStorage } from '../lib/hub-storage';
import { HubUtils } from '../lib/hub-utils';
import { ScryfallCache } from '../lib/scryfall-cache';
import { StringUtils } from '../lib/string-utils';
import { ArchidektExport } from '../mtg/archidekt-export';
import { OrderEmailParse } from '../mtg/email-parse';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import { ProfileSync } from '../mtg/profile-sync';

type HubGlobalsWindow = Window & {
  StringUtils?: typeof StringUtils;
  HubStorage?: typeof HubStorage;
  HubApiClient?: typeof HubApiClient;
  HubUtils?: typeof HubUtils;
  HubProgress?: typeof HubProgress;
  SwapQueue?: typeof SwapQueue;
  CutCandidates?: typeof CutCandidates;
  SuggestionsBundle?: typeof SuggestionsBundle;
  ScryfallCache?: typeof ScryfallCache;
  ArchidektExport?: typeof ArchidektExport;
  ProfileSync?: typeof ProfileSync;
  OrderEmailParse?: typeof OrderEmailParse;
  OrderReconcileExport?: typeof OrderReconcileExport;
};

let installed = false;

/** Install window globals for tests and any code that still reads window.Hub*. */
export function installHubGlobals(): void {
  if (installed) {
    return;
  }
  const w = window as HubGlobalsWindow;
  w.StringUtils = StringUtils;
  w.HubStorage = HubStorage;
  w.HubApiClient = HubApiClient;
  w.HubUtils = HubUtils;
  w.HubProgress = HubProgress;
  w.SwapQueue = SwapQueue;
  w.CutCandidates = CutCandidates;
  w.SuggestionsBundle = SuggestionsBundle;
  w.ScryfallCache = ScryfallCache;
  w.ArchidektExport = ArchidektExport;
  w.ProfileSync = ProfileSync;
  w.OrderEmailParse = OrderEmailParse;
  w.OrderReconcileExport = OrderReconcileExport;
  installed = true;
}

/** Test helper: clear install flag so globals can be reassigned. */
export function resetHubGlobalsInstalled(): void {
  installed = false;
}
