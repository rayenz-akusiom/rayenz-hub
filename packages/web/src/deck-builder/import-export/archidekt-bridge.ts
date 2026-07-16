export type ArchidektBridge = {
  isAvailable?: boolean;
  fetchDeckSnapshot?: (deckId: string | number) => Promise<unknown>;
  fetchFolder?: (url: string) => Promise<unknown>;
  stageApply?: (deckId: string | number, importText: string) => void;
};

export function getParentArchidektBridge(): ArchidektBridge | null {
  try {
    const parentWin = window.parent !== window ? window.parent : window;
    const bridge = (parentWin as unknown as { RayenzArchidektBridge?: ArchidektBridge })
      .RayenzArchidektBridge;
    return bridge || null;
  } catch {
    return null;
  }
}

export function isBridgeAvailable(): boolean {
  const b = getParentArchidektBridge();
  return !!(b && b.isAvailable);
}

export function canStageApply(): boolean {
  const b = getParentArchidektBridge();
  return !!(b && b.isAvailable && typeof b.stageApply === 'function');
}
