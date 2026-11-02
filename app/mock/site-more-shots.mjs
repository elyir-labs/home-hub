/* The drawings for design/site-more/: the front page as it is built (site/dist, from site/build.sh) with each board's
   sections put into it by design/site-more/boards.js, so every color, size and word around them is the page's own.
   The pictures inside direction B are the panel itself on the pretend house (NAMES=plain, LOCKED=1), cut to a card.
   `npm run build && npm run build:try`, `bash ../site/build.sh`, then `node mock/site-more-shots.mjs [id ...]`. */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(HERE, '..', '..', 'site', 'dist')
const DESIGN = path.join(HERE, '..', '..', 'design', 'site-more')
const OUT = path.join(DESIGN, 'shots')
const PANEL_PORT = process.env.PORT || '8476'
const SITE_PORT = Number(PANEL_PORT) + 1
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' }

const BOARDS = [
  ['today', 'wall', '/'], ['today-phone', 'phone', '/'], ['today-try', 'phone', '/try/'],
  ['a', 'wall', '/'], ['a-phone', 'phone', '/'], ['a-try', 'phone', '/try/'],
  ['b', 'wall', '/'], ['b-phone', 'phone', '/'], ['b-try', 'phone', '/try/'],
  ['c', 'wall', '/'], ['c-phone', 'phone', '/'],
]
/* The panel cut to the four cards B shows: what each thing it does looks like where people use it. */
const CROPS = [
  ['crop-say', '/?at=19:40&wx=sunny&shade=dark', null, '.say', 'kitchen lights off'],
  ['crop-music', '/?room=living&at=19:40&wx=sunny&shade=dark', null, '.tile.media:has-text("Late Light")'],
  ['crop-routines', '/?room=living&at=19:40&wx=sunny&shade=dark', null, '.tile.room-scenes'],
  ['crop-camera', '/?at=19:40&wx=sunny&shade=dark', 'Rooms', '.room-cell:has-text("Backyard")'],
]
const only = process.argv.slice(2)

const site = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const root = p.startsWith('/board/') ? DESIGN : DIST
  if (p.startsWith('/board/')) p = p.slice('/board'.length)
  if (p.endsWith('/')) p += 'index.html'
  try { res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }).end(await readFile(path.join(root, p))) }
  catch { res.writeHead(404).end() }
}).listen(SITE_PORT)

const mock = spawn(process.execPath, [path.join(HERE, 'brain.mjs')], { env: { ...process.env, PORT: PANEL_PORT, NAMES: 'plain', LOCKED: '1' }, stdio: 'ignore' })
const sizes = {}
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${PANEL_PORT}`)).ok) break } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  const browser = await chromium.launch()
  for (const [name, query, tab, selector, typed] of CROPS) {
    if (only.length && !only.includes(name) && !only.includes('crops')) continue
    /* The command box is drawn on a phone, where it sits with the sentences it suggests under it. */
    const page = await browser.newPage({ viewport: typed ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: typed ? 3 : 2,
                                         colorScheme: 'dark', isMobile: !!typed, hasTouch: !!typed })
    await page.goto(`http://localhost:${PANEL_PORT}${query}`, { waitUntil: 'networkidle' })
    if (tab) await page.getByRole('button', { name: tab, exact: true }).first().click()
    if (typed) await page.getByLabel('Tell the house').fill(typed)
    await page.waitForTimeout(2000)
    const box = await page.locator(selector).first().boundingBox()
    const clip = typed ? { x: 0, y: box.y - 24, width: 390, height: box.height + 76 } : box
    await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82, clip })
    await page.close()
    console.log(name)
  }
  const script = await readFile(path.join(DESIGN, 'boards.js'), 'utf8')
  for (const [id, screen, at] of BOARDS) {
    if (only.length && !only.includes(id)) continue
    const phone = screen === 'phone'
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 2 : 1.5,
                                         colorScheme: 'dark', isMobile: phone, hasTouch: phone })
    await page.goto(`http://localhost:${SITE_PORT}${at}`, { waitUntil: 'networkidle' })
    await page.addScriptTag({ content: script })
    await page.evaluate((b) => window.SITE_MORE.draw(b), id)
    await page.waitForTimeout(at === '/' ? 600 : 2500)
    const full = at === '/'
    await page.screenshot({ path: path.join(OUT, `${id}.jpg`), type: 'jpeg', quality: 74, fullPage: full })
    sizes[id] = full ? await page.evaluate(() => [innerWidth, document.documentElement.scrollHeight]) : [phone ? 390 : 1440, phone ? 844 : 900]
    await page.close()
    console.log(id, sizes[id].join('×'))
  }
  await browser.close()
} finally {
  mock.kill()
  site.close()
}
const file = path.join(OUT, 'sizes.json')
let kept = {}
try { kept = JSON.parse(await readFile(file, 'utf8')) } catch {}
await writeFile(file, JSON.stringify({ ...kept, ...sizes }, null, 1) + '\n')
