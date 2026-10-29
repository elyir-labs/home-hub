// Counts how many times each page is loaded and the install command is fetched: one number per page per day, and
// nothing that tells one visitor from another (privacy.html says so). No address, no cookie, nothing stored about
// the request but which page and which day. The maker's watcher reads the numbers into its Monday note (watch/).
// _routes.json sends only these paths through here, so the pictures and the pretend house's files never are.
import { POLICY } from '../policy.js'

export const COUNTED = ['/', '/privacy', '/install', '/try/']
const PAGES = new Set(['/', '/privacy'])
const NOT_A_PERSON = /bot|crawl|spider|slurp|preview|monitor|elyir-watch/i

export async function onRequest({ request, env, next, waitUntil }) {
  const path = new URL(request.url).pathname
  let res = await next()
  if (PAGES.has(path)) {
    res = new Response(res.body, res)
    res.headers.set('Content-Security-Policy', POLICY)
  }
  const who = request.headers.get('User-Agent') || ''
  if (env.COUNTS && request.method === 'GET' && res.status === 200 && COUNTED.includes(path) && !NOT_A_PERSON.test(who)) {
    waitUntil(count(env.COUNTS, new Date().toISOString().slice(0, 10), path).catch(() => {}))
  }
  return res
}

export async function count(db, day, path) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS loads (day TEXT NOT NULL, path TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, path))'),
    db.prepare('INSERT INTO loads (day, path, n) VALUES (?1, ?2, 1) ON CONFLICT (day, path) DO UPDATE SET n = n + 1').bind(day, path),
  ])
}
