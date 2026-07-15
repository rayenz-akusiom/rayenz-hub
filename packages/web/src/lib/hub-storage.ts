/**
 * Access HubStorage / DailiesSettings on the parent hub window (iframe),
 * falling back to same-window APIs / localStorage for tests and stand-alone.
 */

type HubParent = Window & {
  HubStorage?: {
    loadDailiesSettings: () => Record<string, unknown>;
    saveDailiesSettings: (settings: Record<string, unknown>) => void;
    loadDeckSuggestSettings: () => Record<string, unknown>;
    saveDeckSuggestSettings: (settings: Record<string, unknown>) => void;
    loadOrderReconcileSettings: () => Record<string, unknown>;
    saveOrderReconcileSettings: (settings: Record<string, unknown>) => void;
  };
  DailiesSettings?: {
    getMainPet: () => string;
    getMainPetSlug: () => string;
    saveMainPet: (name: string, slug: string | null) => void;
    getWishlists: (settings: unknown) => unknown[];
  };
  HubRouter?: {
    navigate: (hash: string) => void;
  };
};

function host(): HubParent {
  try {
    if (window.parent && window.parent !== window) {
      return window.parent as HubParent;
    }
  } catch {
    /* cross-origin */
  }
  return window as HubParent;
}

export function getHubStorage() {
  return host().HubStorage ?? null;
}

export function getDailiesSettingsApi() {
  return host().DailiesSettings ?? null;
}

export function navigateHub(hash: string) {
  const h = host();
  if (h.HubRouter?.navigate) {
    h.HubRouter.navigate(hash);
    return;
  }
  try {
    if (window.top) {
      window.top.location.hash = hash;
    }
  } catch {
    window.location.hash = hash;
  }
}

export function setParentHash(path: string) {
  const hash = path.startsWith('#') ? path : `#${path}`;
  try {
    if (window.top && window.top !== window) {
      window.top.location.hash = hash;
      return;
    }
  } catch {
    /* ignore */
  }
  window.location.hash = hash;
}
