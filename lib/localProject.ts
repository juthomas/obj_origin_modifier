import {
  buildProjectBlob,
  loadProjectFromBlob,
} from "@/lib/projectFile";
import type { SceneObject } from "@/lib/types";

const DB_NAME = "obj-origin-modifier";
const DB_VERSION = 1;
const STORE = "autosave";
const KEY = "current-project";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveLocalProject(
  objects: SceneObject[],
  selectedId: string | null,
): Promise<void> {
  if (objects.length === 0) {
    await clearLocalProject();
    return;
  }

  const blob = await buildProjectBlob(objects, selectedId);
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbRequest(tx.objectStore(STORE).put(blob, KEY));
  } finally {
    db.close();
  }
}

export async function loadLocalProject(): Promise<{
  objects: SceneObject[];
  selectedId: string | null;
} | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const blob = await idbRequest(
      tx.objectStore(STORE).get(KEY) as IDBRequest<Blob | undefined>,
    );
    if (!blob) return null;
    return loadProjectFromBlob(blob);
  } finally {
    db.close();
  }
}

export async function clearLocalProject(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbRequest(tx.objectStore(STORE).delete(KEY));
  } finally {
    db.close();
  }
}
