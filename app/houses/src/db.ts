// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The houses, in IndexedDB rather than localStorage: Safari may clear localStorage for a Home Screen app, and
   this list is the one thing the app has that nobody else keeps (the printer app learned it first).

   What belongs to the phone rather than to any house -- its notification key -- is in a database of its own, so
   the houses' stays at version 1 and an upgrade can never be held up by the worker (public/sw.js reads the
   houses too) or by another open window. */
type Where = { db: string; store: string; keyPath?: string }
const HOUSES: Where = { db: 'houses', store: 'houses', keyPath: 'id' }
const PHONE: Where = { db: 'phone', store: 'kv' }

function open(w: Where): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(w.db, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(w.store)) r.result.createObjectStore(w.store, w.keyPath ? { keyPath: w.keyPath } : undefined) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function tx<T>(w: Where, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open(w).then(db => new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(w.store, mode).objectStore(w.store))
    req.onsuccess = () => { resolve(req.result as T); db.close() }
    req.onerror = () => { reject(req.error); db.close() }
  }))
}

export const all = <T>() => tx<T[]>(HOUSES, 'readonly', s => s.getAll())
export const put = (v: unknown) => tx<IDBValidKey>(HOUSES, 'readwrite', s => s.put(v))
export const del = (id: string) => tx<undefined>(HOUSES, 'readwrite', s => s.delete(id))

export const kept = <T>(key: string) => tx<T | undefined>(PHONE, 'readonly', s => s.get(key))
export const keep = (key: string, v: unknown) => tx<IDBValidKey>(PHONE, 'readwrite', s => s.put(v, key))
