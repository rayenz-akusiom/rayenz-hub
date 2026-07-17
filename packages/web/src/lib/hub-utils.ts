import { hubDocumentRoot } from '../hub/core-scripts';
import { HubProgress, type HubProgressController } from './hub-progress';
import { escapeHtml } from './string-utils';

type ArchidektBridge = {
  isAvailable?: boolean;
  stageApply?: (...args: unknown[]) => unknown;
};

type HubWindow = Window & {
  RayenzArchidektBridge?: ArchidektBridge;
  location: Location;
};

function w(): HubWindow {
  return window as HubWindow;
}

export function bridgeAvailable(): boolean {
  return typeof w().RayenzArchidektBridge !== 'undefined' && !!w().RayenzArchidektBridge?.isAvailable;
}

export function bridgeApplyAvailable(): boolean {
  const bridge = w().RayenzArchidektBridge;
  return !!(bridge && bridge.isAvailable && typeof bridge.stageApply === 'function');
}

export function optionKey(opt: { name: string; set_code?: string; collector_number?: string }): string {
  return [opt.name, opt.set_code || '', opt.collector_number || ''].join('|');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function scryfallImageFromId(scryfallId: string | null | undefined): string {
  const id = String(scryfallId || '').trim();
  if (!id || id.length < 2) {
    return '';
  }
  // Direct CDN — not rate-limited (unlike api.scryfall.com image redirects).
  // Path: /normal/front/{id[0]}/{id[1]}/{id}.jpg
  return `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`;
}

export function scryfallImageFromPrinting(setCode: string | null | undefined, collectorNumber: string | null | undefined): string {
  if (!setCode || !collectorNumber) {
    return '';
  }
  return (
    'https://api.scryfall.com/cards/' +
    encodeURIComponent(String(setCode).toLowerCase()) +
    '/' +
    encodeURIComponent(String(collectorNumber)) +
    '?format=image&version=normal'
  );
}

export function scryfallImageFromName(name: string | null | undefined): string {
  if (!name) {
    return '';
  }
  return 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name) + '&format=image&version=normal';
}

export function resolveHubUrl(path: string): string {
  try {
    return new URL(path, hubDocumentRoot()).href;
  } catch {
    return path;
  }
}

export function ensureCss(href: string, attrName: string): void {
  if (document.querySelector('link[' + attrName + ']')) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = resolveHubUrl(href);
  link.setAttribute(attrName, '1');
  document.head.appendChild(link);
}

export function suggestionsExportFilename(data: { meta?: { set_code?: string; generated_at?: string } }): string {
  const meta = (data && data.meta) || {};
  const setCode = (meta.set_code || 'SET').toUpperCase();
  const date = meta.generated_at || new Date().toISOString().slice(0, 10);
  return setCode + '-' + date + '-rules.json';
}

export function downloadSuggestionsJson(data: unknown): string {
  const filename = suggestionsExportFilename(data as { meta?: { set_code?: string; generated_at?: string } });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export function isLocalHub(): boolean {
  try {
    const host = w().location && w().location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

export function mountAppProgress(hostEl: HTMLElement | null): HubProgressController | null {
  if (!hostEl) {
    return null;
  }
  return HubProgress.mount(hostEl);
}

export function handoffSnapshotSummary(data: {
  decks?: Array<{ suggestions?: unknown[]; deck_snapshot?: { cards?: unknown[] } }>;
}) {
  const decks = (data && data.decks) || [];
  const reviewable = decks.filter((d) => (d.suggestions || []).length > 0);
  const withSnapshots = reviewable.filter(
    (d) => d.deck_snapshot && d.deck_snapshot.cards && d.deck_snapshot.cards.length,
  );
  return {
    reviewable: reviewable.length,
    withSnapshots: withSnapshots.length,
    missingSnapshots: reviewable.length - withSnapshots.length,
    allReady: reviewable.length > 0 && withSnapshots.length === reviewable.length,
  };
}

export const HubUtils = {
  escapeHtml,
  bridgeAvailable,
  bridgeApplyAvailable,
  optionKey,
  sleep,
  scryfallImageFromId,
  scryfallImageFromPrinting,
  scryfallImageFromName,
  ensureCss,
  resolveHubUrl,
  isLocalHub,
  mountAppProgress,
  suggestionsExportFilename,
  downloadSuggestionsJson,
  handoffSnapshotSummary,
};
