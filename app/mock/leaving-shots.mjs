/* The boards for design/leaving/: the built panel on the mock house, with each board's rows and sheets put in by
   design/leaving/boards.js, so the drawing is the panel's own CSS. `npm run build`, then `node mock/leaving-shots.mjs`.
   Writes design/leaving/shots/. */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(HERE, '..', '..', 'design', 'leaving')
const OUT = path.join(DIR, 'shots')
const PORT = process.env.PORT || '8476'
const BASE = `http://localhost:${PORT}`
const DRAW = readFileSync(path.join(DIR, 'boards.js'), 'utf8')
const BOARDS = ['today', 'today-people', 'a-row', 'a-ask', 'a-stays', 'a-next', 'b-hub', 'b-people', 'b-hand', 'c-row', 'c-erase']

mkdirSync(OUT, { recursive: true })
const mock = spawn(process.execPath, [path.join(HERE, 'brain.mjs')], { env: { ...process.env, PORT, NAMES: 'plain', LOCKED: '1' }, stdio: 'ignore' })
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  const browser = await chromium.launch()
  for (const id of BOARDS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Chicago', locale: 'en-US' })
    await page.addInitScript(DRAW)
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    const where = await page.evaluate((id) => window.LEAVING.at[id], id)
    await page.goto(`${BASE}${where}&at=13:00&wx=sunny&shade=light`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.evaluate((id) => window.LEAVING.draw(id), id)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT, `${id}.jpg`), quality: 85 })
    await page.close()
  }
  await browser.close()
} finally {
  mock.kill()
}
