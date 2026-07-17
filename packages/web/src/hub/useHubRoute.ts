import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PATH,
  isSettingsPath,
  normalizeHash,
  pathFromHash,
  type HubPath,
} from './routes';

const ROUTE_KEY = 'rayenz-hub-route';

function getLastRoute(): string {
  try {
    return localStorage.getItem(ROUTE_KEY) || `#${DEFAULT_PATH}`;
  } catch {
    return `#${DEFAULT_PATH}`;
  }
}

function setLastRoute(route: string): void {
  try {
    localStorage.setItem(ROUTE_KEY, route);
  } catch {
    /* ignore */
  }
}

export function useHubRoute() {
  const [path, setPath] = useState<HubPath>(() => pathFromHash(window.location.hash));

  const applyPath = useCallback((nextPath: HubPath) => {
    setPath(nextPath);
    setLastRoute(`#${nextPath}`);
    if (nextPath === '/dailies') {
      document.body.setAttribute('data-neopets-dailies', 'rayenz');
    } else {
      document.body.removeAttribute('data-neopets-dailies');
    }
  }, []);

  const navigate = useCallback((hash: string) => {
    const normalized = normalizeHash(hash);
    const nextPath = pathFromHash(normalized);
    if (window.location.hash !== normalized) {
      window.location.hash = normalized;
    } else {
      applyPath(nextPath);
    }
  }, [applyPath]);

  useEffect(() => {
    function onHashChange() {
      applyPath(pathFromHash(window.location.hash));
    }

    if (!window.location.hash) {
      window.location.replace(normalizeHash(getLastRoute()));
    } else {
      applyPath(pathFromHash(window.location.hash));
    }

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [applyPath]);

  useEffect(() => {
    const api = {
      navigate: (hash: string) => {
        navigate(hash);
      },
      getRoutePath: () => path,
      registerRoute: () => {},
      init: () => {},
    };
    (window as Window & { HubRouter?: typeof api }).HubRouter = api;
  }, [navigate, path]);

  return {
    path,
    navigate,
    isSettings: isSettingsPath(path),
  };
}
