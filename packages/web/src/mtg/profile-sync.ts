import { HubApiClient } from '../api/hub-api-client';

const DB_NAME = 'rayenz-hub-profiles';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'profiles-dir';
const LIST_FIELDS = {
  protected_cards: 'protected_cards',
  blocked_cards: 'blocked_cards',
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

function parseYamlList(text: string, fieldName: string): string[] {
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[^\s#]/.test(line) && !line.startsWith('-')) {
      inSection = line.trim() === fieldName + ':';
      continue;
    }
    if (inSection) {
      if (/^[^\s#-]/.test(line)) {
        break;
      }
      const match = line.match(/^\s*-\s+(.+?)\s*$/);
      if (match) {
        items.push(match[1].replace(/^["']|["']$/g, ''));
      }
    }
  }
  return items;
}

function listHasItem(items: string[], name: string): boolean {
  return items.some((item) => item === name);
}

function appendToYamlList(text: string, fieldName: string, cardName: string): { text: string; changed: boolean } {
  const items = parseYamlList(text, fieldName);
  if (listHasItem(items, cardName)) {
    return { text, changed: false };
  }

  const lines = text.split(/\r?\n/);
  let sectionIndex = -1;
  let insertAt = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === fieldName + ':') {
      sectionIndex = i;
      insertAt = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*-\s+/.test(lines[j])) {
          insertAt = j + 1;
        } else if (/^[^\s#-]/.test(lines[j])) {
          break;
        }
      }
      break;
    }
  }

  const entry = '  - ' + cardName;
  if (sectionIndex >= 0) {
    lines.splice(insertAt, 0, entry);
  } else {
    let anchor = -1;
    const anchors = ['archidekt_swaps:', 'constraints:', 'roles:', 'notes:'];
    for (let a = 0; a < anchors.length; a++) {
      for (let k = 0; k < lines.length; k++) {
        if (lines[k].trim() === anchors[a]) {
          anchor = k;
          break;
        }
      }
      if (anchor >= 0) {
        break;
      }
    }
    const block = [fieldName + ':', entry];
    if (anchor >= 0) {
      lines.splice(anchor, 0, '', block[0], block[1]);
    } else {
      if (lines.length && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      lines.push(block[0], block[1]);
    }
  }

  let out = lines.join('\n');
  if (!out.endsWith('\n')) {
    out += '\n';
  }
  return { text: out, changed: true };
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

function appendToProfileListViaApi(deckId: string, yamlField: string, cardName: string) {
  return HubApiClient.pullProfileYaml(deckId).then((yaml) => {
    const text = yaml || '';
    const result = appendToYamlList(text, yamlField, cardName);
    if (!result.changed) {
      return { field: yamlField, cardName, changed: false };
    }
    const protectedCards = parseYamlList(result.text, 'protected_cards');
    const blockedCards = parseYamlList(result.text, 'blocked_cards');
    return HubApiClient.pushProfile(deckId, {
      yaml: result.text,
      protectedCards,
      blockedCards,
    }).then(() => ({ field: yamlField, cardName, changed: true }));
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
  readProfileYaml,
  parseYamlList,
  LIST_FIELDS,
};
