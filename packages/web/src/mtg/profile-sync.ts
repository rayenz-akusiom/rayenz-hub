import { HubApiClient } from '../api/hub-api-client';
import { appendToYamlList, appendToYamlLists, parseYamlList } from '@rayenz-hub/shared';

const DB_NAME = 'rayenz-hub-profiles';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'profiles-dir';
const LIST_FIELDS = {
  protected_cards: 'protected_cards',
  blocked_cards: 'blocked_cards',
  themes: 'themes',
  keyword_interests: 'keyword_interests',
  typal_types: 'typal_types',
  art_tags: 'art_tags',
} as const;

type ListFieldKey = keyof typeof LIST_FIELDS;

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

function isApiProfilesEnabled(): boolean {
  return !!HubApiClient.getConfig().enabled;
}

function canWriteProfiles(): boolean {
  if (isApiProfilesEnabled()) {
    return true;
  }
  return typeof window.showDirectoryPicker === 'function' && !isMobileDevice();
}

function canWriteProfilesViaDirectory(): boolean {
  return typeof window.showDirectoryPicker === 'function' && !isMobileDevice();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => {
      reject(req.error);
    };
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
  });
}

function idbGet(key: string): Promise<FileSystemDirectoryHandle | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
          resolve(req.result as FileSystemDirectoryHandle | undefined);
        };
        req.onerror = () => {
          reject(req.error);
        };
      }),
  );
}

function idbSet(key: string, value: FileSystemDirectoryHandle): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error);
        };
      }),
  );
}

function verifyPermission(handle: FileSystemDirectoryHandle, mode: FileSystemPermissionMode): Promise<boolean> {
  if (!handle || !handle.queryPermission) {
    return Promise.resolve(false);
  }
  return handle.queryPermission({ mode }).then((state) => {
    if (state === 'granted') {
      return true;
    }
    if (state === 'prompt' && handle.requestPermission) {
      return handle.requestPermission({ mode }).then((s) => s === 'granted');
    }
    return false;
  });
}

function getProfilesDir(): Promise<FileSystemDirectoryHandle | null> {
  return idbGet(HANDLE_KEY).then((handle) => {
    if (!handle) {
      return null;
    }
    return verifyPermission(handle, 'readwrite').then((ok) => (ok ? handle : null));
  });
}

function connectProfilesDir(): Promise<FileSystemDirectoryHandle> {
  if (!canWriteProfilesViaDirectory()) {
    return Promise.reject(new Error('Profile updates require desktop Chrome on PC or a configured Hub API.'));
  }
  return window
    .showDirectoryPicker({ id: 'rayenz-mtg-profiles', mode: 'readwrite' })
    .then((handle) => idbSet(HANDLE_KEY, handle).then(() => handle));
}

function readProfileFile(handle: FileSystemDirectoryHandle, deckId: string): Promise<string> {
  return handle
    .getFileHandle(deckId + '.yaml')
    .then((fileHandle) => fileHandle.getFile())
    .then((file) => file.text());
}

function writeProfileFile(handle: FileSystemDirectoryHandle, deckId: string, text: string): Promise<void> {
  return handle
    .getFileHandle(deckId + '.yaml', { create: false })
    .then((fileHandle) => fileHandle.createWritable())
    .then((writable) =>
      writable.write(text).then(() => writable.close()),
    );
}

function pushProfileText(deckId: string, text: string) {
  const protectedCards = parseYamlList(text, 'protected_cards');
  const blockedCards = parseYamlList(text, 'blocked_cards');
  return HubApiClient.pushProfile(deckId, {
    yaml: text,
    protectedCards,
    blockedCards,
  });
}

function appendToProfileListViaApi(deckId: string, yamlField: string, cardName: string) {
  return HubApiClient.pullProfileYaml(deckId).then((yaml) => {
    const text = yaml || '';
    const result = appendToYamlList(text, yamlField, cardName);
    if (!result.changed) {
      return { field: yamlField, cardName, changed: false };
    }
    return pushProfileText(deckId, result.text).then(() => ({
      field: yamlField,
      cardName,
      changed: true,
    }));
  });
}

function appendToProfileListViaDirectory(deckId: string, yamlField: string, cardName: string) {
  return getProfilesDir()
    .then((handle) => {
      if (!handle) {
        return connectProfilesDir();
      }
      return handle;
    })
    .then((handle) =>
      readProfileFile(handle, deckId).then((text) => {
        const result = appendToYamlList(text, yamlField, cardName);
        if (!result.changed) {
          return { field: yamlField, cardName, changed: false };
        }
        return writeProfileFile(handle, deckId, result.text).then(() => ({
          field: yamlField,
          cardName,
          changed: true,
        }));
      }),
    );
}

function appendToProfileList(deckId: string, field: string, cardName: string) {
  const yamlField = LIST_FIELDS[field as ListFieldKey] || field;
  if (!yamlField || !cardName) {
    return Promise.reject(new Error('Missing deck, field, or card name.'));
  }

  if (isApiProfilesEnabled()) {
    return appendToProfileListViaApi(deckId, yamlField, cardName);
  }
  return appendToProfileListViaDirectory(deckId, yamlField, cardName);
}

export type ProfileListUpdates = Partial<{
  themes: string[];
  keyword_interests: string[];
  typal_types: string[];
  art_tags: string[];
  protected_cards: string[];
  blocked_cards: string[];
}>;

function appendToProfileListsViaApi(deckId: string, updates: ProfileListUpdates) {
  return HubApiClient.pullProfileYaml(deckId).then((yaml) => {
    const result = appendToYamlLists(yaml || '', updates);
    if (!result.changed) {
      return { changed: false, added: result.added };
    }
    return pushProfileText(deckId, result.text).then(() => ({
      changed: true,
      added: result.added,
    }));
  });
}

function appendToProfileListsViaDirectory(deckId: string, updates: ProfileListUpdates) {
  return getProfilesDir()
    .then((handle) => {
      if (!handle) {
        return connectProfilesDir();
      }
      return handle;
    })
    .then((handle) =>
      readProfileFile(handle, deckId).then((text) => {
        const result = appendToYamlLists(text, updates);
        if (!result.changed) {
          return { changed: false, added: result.added };
        }
        return writeProfileFile(handle, deckId, result.text).then(() => ({
          changed: true,
          added: result.added,
        }));
      }),
    );
}

function appendToProfileLists(deckId: string, updates: ProfileListUpdates) {
  if (!deckId) {
    return Promise.reject(new Error('Missing deck, field, or card name.'));
  }
  if (isApiProfilesEnabled()) {
    return appendToProfileListsViaApi(deckId, updates);
  }
  return appendToProfileListsViaDirectory(deckId, updates);
}

function readProfileYamlFromDir(deckId: string): Promise<string | null> {
  return getProfilesDir().then((handle) => {
    if (!handle) {
      return null;
    }
    return readProfileFile(handle, deckId);
  });
}

function readProfileYaml(deckId: string): Promise<string | null> {
  if (HubApiClient.getConfig().enabled) {
    return HubApiClient.pullProfileYaml(deckId)
      .then((yaml) => {
        if (yaml) {
          return yaml;
        }
        return readProfileYamlFromDir(deckId);
      })
      .catch(() => readProfileYamlFromDir(deckId));
  }
  return readProfileYamlFromDir(deckId);
}

function isConnected(): Promise<boolean> {
  if (isApiProfilesEnabled()) {
    return Promise.resolve(true);
  }
  return getProfilesDir().then((h) => !!h);
}

export const ProfileSync = {
  canWriteProfiles,
  canWriteProfilesViaDirectory,
  connectProfilesDir,
  getProfilesDir,
  isConnected,
  appendToProfileList,
  appendToProfileLists,
  readProfileYaml,
  parseYamlList,
  LIST_FIELDS,
};
