// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The Houses app's worker. Nothing is cached: every house is live or it is not, and an app that showed a
   house from yesterday would be worse than one that says it cannot reach it.

   It shows what a house tells this phone -- one notification key for every house (src/push.ts) -- under the
   phone's own name for that house, and opens that house when one is tapped. What a house sends is
   brain/hub/pusher.py's: {id, class, text, subject, house, label, at, tag}; `label` is the house's own name in
   the zone, which is how this app keeps it, and a house with no address yet sends none. */

const titleFor = (houses, data) => houses.find(h => data.label && h.id === data.label)?.name || data.house || 'Your house'
const targetFor = data => (data.label ? `/?open=${encodeURIComponent(data.label)}` : '/')

/* The houses as src/db.ts keeps them, opened the same way so a worker that wakes first makes the same store. */
function houses() {
  return new Promise(resolve => {
    let r
    try { r = indexedDB.open('houses', 1) } catch { return resolve([]) }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('houses')) r.result.createObjectStore('houses', { keyPath: 'id' }) }
    r.onerror = () => resolve([])
    r.onsuccess = () => {
      const db = r.result
      const done = v => { db.close(); resolve(v) }
      try {
        const all = db.transaction('houses').objectStore('houses').getAll()
        all.onsuccess = () => done(all.result || [])
        all.onerror = () => done([])
      } catch { done([]) }
    }
  })
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { text: e.data ? e.data.text() : '' } }
  e.waitUntil(houses().then(list => self.registration.showNotification(titleFor(list, data), {
    body: data.text || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: data.class === 'alert',
    icon: '/apple-touch-icon.png',
    data: { label: data.label || null, target: targetFor(data) },
  })))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const { label, target } = e.notification.data || {}
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of open) {
      if (new URL(c.url).origin !== self.location.origin) continue
      await c.focus()
      c.postMessage({ type: 'houses:open-house', label })   // the open app moves to it without a reload
      return
    }
    await self.clients.openWindow(target || '/')
  })())
})
