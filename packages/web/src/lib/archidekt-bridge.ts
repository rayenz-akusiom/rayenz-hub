/**
 * Single access point for the Archidekt userscript bridge (`window.RayenzArchidektBridge`).
 */

export type ArchidektBridge = {
  isAvailable?: boolean;
  fetchDeckSnapshot?: (deckId: string | number) => Promise<unknown>;
  fetchFolder?: (folderIdOrUrl: number | string) => Promise<unknown>;
  stageApply?: (deckId: string | number, importText: string) => void;
  getStagedApply?: (deckId: string | number) => unknown;
  clearStagedApply?: (deckId: string | number) => void;
};

type BridgeWindow = Window & { RayenzArchidektBridge?: ArchidektBridge };

/** Prefer parent frame bridge (iframe embeds), then same-window. */
export function getArchidektBridge(): ArchidektBridge | null {
  try {
    const parentWin = window.parent !== window ? window.parent : window;
    const fromParent = (parentWin as BridgeWindow).RayenzArchidektBridge;
    if (fromParent) {
      return fromParent;
    }
  } catch {
    /* cross-origin parent */
  }
  return (window as BridgeWindow).RayenzArchidektBridge || null;
}

/** @deprecated Prefer getArchidektBridge */
export const getParentArchidektBridge = getArchidektBridge;

export function bridgeAvailable(): boolean {
  const bridge = getArchidektBridge();
  return !!(bridge && bridge.isAvailable);
}

export function bridgeApplyAvailable(): boolean {
  const bridge = getArchidektBridge();
  return !!(bridge && bridge.isAvailable && typeof bridge.stageApply === 'function');
}

export const isBridgeAvailable = bridgeAvailable;
export const canStageApply = bridgeApplyAvailable;

export function parseFolderId(url: string | null | undefined): number | null {
  const match = String(url || '').match(/archidekt\.com\/folders\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function parseDeckId(url: string | null | undefined): number | null {
  const match = String(url || '').match(/archidekt\.com\/decks\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export async function fetchFolderFromBridge(folderId: number): Promise<unknown> {
  if (!bridgeAvailable()) {
    throw new Error('Install Archidekt Deck Review Bridge userscript for folder fetch.');
  }
  const bridge = getArchidektBridge();
  if (typeof bridge?.fetchFolder !== 'function') {
    throw new Error('Install Archidekt Deck Review Bridge userscript for folder fetch.');
  }
  return bridge.fetchFolder(folderId);
}

export async function fetchDeckSnapshotFromBridge(url: string): Promise<unknown> {
  if (!bridgeAvailable()) {
    throw new Error('Install Archidekt Deck Review Bridge userscript for live Archidekt fetch.');
  }
  const deckId = parseDeckId(url);
  if (!deckId) {
    throw new Error('Invalid Archidekt URL: ' + url);
  }
  const bridge = getArchidektBridge();
  if (typeof bridge?.fetchDeckSnapshot !== 'function') {
    throw new Error('Install Archidekt Deck Review Bridge userscript for live Archidekt fetch.');
  }
  return bridge.fetchDeckSnapshot(deckId);
}
