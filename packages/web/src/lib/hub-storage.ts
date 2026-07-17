/**
 * Hub storage / router access (same-window SPA; parent walk kept for tests).
 */

type HubHost = Window & {
  HubStorage?: {
    loadDailiesSettings: () => Record<string, unknown>;
    saveDailiesSettings: (settings: Record<string, unknown>) => void;
    loadDeckSuggestSettings: () => Record<string, unknown>;
    saveDeckSuggestSettings: (settings: Record<string, unknown>) => void;
    loadOrderReconcileSettings: () => Record<string, unknown>;
    saveOrderReconcileSettings: (settings: Record<string, unknown>) => void;
    loadDeckBuilderSettings?: () => Record<string, unknown>;
    saveDeckBuilderSettings?: (settings: Record<string, unknown>) => void;
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

function host(): HubHost {
  return window as HubHost;
}

export function getHubStorage() {
  return host().HubStorage ?? null;
}

export function getDailiesSettingsApi() {
  return host().DailiesSettings ?? null;
}

export function navigateHub(hash: string) {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`;
  const h = host();
  if (h.HubRouter?.navigate) {
    h.HubRouter.navigate(normalized);
    return;
  }
  window.location.hash = normalized;
}

/** @deprecated Prefer navigateHub — kept for call-site compatibility. */
export function setParentHash(path: string) {
  navigateHub(path);
}
