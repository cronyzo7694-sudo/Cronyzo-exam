/**
 * fileVault — where a student's own test files live.
 *
 * Everything here is **on the student's device**. No upload, no server, no
 * account required: an HTML file picked from a phone is stored in IndexedDB,
 * progress (answers, scroll, the file's own localStorage) is stored beside it,
 * and a reload or a dead battery does not wipe the attempt.
 *
 * Keyed by a random id, so two files with the same name never clash.
 */

export type TestFileRecord = {
  id: string;
  name: string;
  size: number;
  html: string;
  added_at: number;
  opened_at: number | null;
};

export type ProgressRecord = {
  id: string;
  values: Record<string, string>;
  scroll: number;
  storage: Record<string, string>;
  saved_at: number;
};

const DB_NAME = "cronyzo_test_files";
const DB_VERSION = 1;
const FILES = "files";
const PROGRESS = "progress";
export const LAST_FILE_KEY = "cz_last_test_file";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot store files locally."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PROGRESS)) db.createObjectStore(PROGRESS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Storage failed"));
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error("Storage failed"));
      }),
  );
}

export function newFileId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `tf_${Date.now().toString(36)}_${random}`;
}

export async function listTestFiles(): Promise<TestFileRecord[]> {
  try {
    const rows = await tx<TestFileRecord[]>(FILES, "readonly", (store) => store.getAll());
    return (rows ?? []).sort((a, b) => (b.opened_at ?? b.added_at) - (a.opened_at ?? a.added_at));
  } catch {
    return [];
  }
}

export async function putTestFile(record: TestFileRecord): Promise<void> {
  await tx(FILES, "readwrite", (store) => store.put(record));
}

export async function getTestFile(id: string): Promise<TestFileRecord | null> {
  try {
    const row = await tx<TestFileRecord | undefined>(FILES, "readonly", (store) => store.get(id));
    return row ?? null;
  } catch {
    return null;
  }
}

export async function deleteTestFile(id: string): Promise<void> {
  try {
    await tx(FILES, "readwrite", (store) => store.delete(id));
    await tx(PROGRESS, "readwrite", (store) => store.delete(id));
  } catch {
    /* nothing to clean up */
  }
}

export async function getProgress(id: string): Promise<ProgressRecord | null> {
  try {
    const row = await tx<ProgressRecord | undefined>(PROGRESS, "readonly", (store) => store.get(id));
    return row ?? null;
  } catch {
    return null;
  }
}

export async function saveProgress(record: ProgressRecord): Promise<void> {
  try {
    await tx(PROGRESS, "readwrite", (store) => store.put(record));
  } catch {
    /* private-mode browsers: the attempt still runs, just without autosave */
  }
}

export async function clearProgress(id: string): Promise<void> {
  try {
    await tx(PROGRESS, "readwrite", (store) => store.delete(id));
  } catch {
    /* ignore */
  }
}

export function rememberLastFile(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_FILE_KEY, id);
    else localStorage.removeItem(LAST_FILE_KEY);
  } catch {
    /* ignore */
  }
}

export function lastFileId(): string | null {
  try {
    return localStorage.getItem(LAST_FILE_KEY);
  } catch {
    return null;
  }
}

export function humanSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
