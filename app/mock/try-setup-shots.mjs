/* The drawings for design/try-setup/: board.html around the panel on two mock houses out of their box (FRESH=1
   NAMES=plain): one with a screen asking which Wi-Fi (NET=screen), one whose engine is still waiting (NET=setup), and one
   on a cable, ready for Get started,
   plus Today from the built site (site/dist). `npm run build && npm run build:try`, `bash ../site/build.sh`, then
   `node mock/try-setup-shots.mjs [id ...]`. */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DESIGN = path.join(HERE, '..', '..', 'design', 'try-setup')
const DIST = path.join(HERE, '..', '..', 'site', 'dist')
const OUT = path.join(DESIGN, 'shots')
const BASE = Number(process.env.PORT || 8480)
const [HUB, OFF, SITE, ON] = [BASE, BASE + 1, BASE + 2, BASE + 3]
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' }

const BOARDS = [
  ['today', 'wall', `/#try`], ['today-try', 'phone', '/try/'], ['way-in', 'wall'],
  ['a-ready', 'wall'], ['a-wifi', 'wall'], ['a-add', 'wall'], ['a-phone', 'phone'],
  ['b-plug', 'wall'], ['b-wifi', 'wall'], ['b-phone', 'phone'],
  ['c-start', 'wall'], ['c-done', 'wall'], ['c-phone', 'phone'],
]
const only = process.argv.slice(2)

const files = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const root = p.startsWith('/board/') ? DESIGN : DIST
  if (p.startsWith('/board/')) p = p.slice('/board'.length)
  if (p.endsWith('/')) p += 'index.html'
  try { res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }).end(await readFile(path.join(root, p))) }
  catch { res.writeHead(404).end() }
}).listen(SITE)
const mock = (port, env) => spawn(process.execPath, [path.join(HERE, 'brain.mjs')], { env: { ...process.env, PORT: String(port), FRESH: '1', NAMES: 'plain', ...env }, stdio: 'ignore' })
const mocks = [mock(HUB, { NET: 'screen' }), mock(OFF, { NET: 'setup' }), mock(ON, {})]
const sizes = {}
try {
  for (const port of [HUB, OFF, ON]) for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${port}`)).ok) break } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  const browser = await chromium.launch()
  for (const [id, screen, site] of BOARDS) {
    if (only.length && !only.includes(id)) continue
    const isPhone = screen === 'phone'
    const page = await browser.newPage({ viewport: isPhone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: isPhone ? 2 : 1.5,
                                         colorScheme: 'dark', isMobile: isPhone, hasTouch: isPhone })
    const url = site ? `http://localhost:${SITE}${site}` : `http://localhost:${SITE}/board/board.html?board=${id}&hub=${HUB}&off=${OFF}&on=${ON}`
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(OUT, `${id}.jpg`), type: 'jpeg', quality: 76 })
    sizes[id] = isPhone ? [390, 844] : [1440, 900]
    await page.close()
    console.log(id)
  }
  await browser.close()
} finally {
  for (const m of mocks) m.kill()
  files.close()
}
const file = path.join(OUT, 'sizes.json')
let kept = {}
try { kept = JSON.parse(await readFile(file, 'utf8')) } catch {}
await writeFile(file, JSON.stringify({ ...kept, ...sizes }, null, 1) + '\n')
