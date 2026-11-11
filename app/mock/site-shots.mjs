/* The pictures on the front page (site/, hub.elyir.com), taken from the built panel on the pretend house with made-up
   names (NAMES=plain), so the page never shows somebody else's show or brand, and with a passcode set (LOCKED=1), so
   no picture carries the band asking its owner for one. Every picture comes in the page's two looks, light and dark,
   matched (design/site-pair/, D): the living room on the wall and the phone, and the wall through a day.
   Last, the picture a shared link shows (design/link-preview/, B): the light wall alone, 1200x630, made from
   wall-room-light, so `npm run site-shots card` remakes only that one, with no build and no mock.
   `npm run build`, then `npm run site-shots`. Writes site/shots/; run it again whenever the panel changes how it looks. */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '..', '..', 'site', 'shots')
const PORT = process.env.PORT || '8475'
const BASE = `http://localhost:${PORT}`
const LOOKS = { light: { at: '13:00', shade: 'light' }, dark: { at: '19:40', shade: 'dark' } }
const DAY = { morning: '08:30', afternoon: '13:00', evening: '19:40' }
const SHOTS = Object.entries(LOOKS).flatMap(([look, { at, shade }]) => [
  [`wall-room-${look}`, [1440, 900], look, `/?room=living&at=${at}&wx=sunny&shade=${shade}`],
  [`phone-room-${look}`, [390, 844], look, `/?room=living&at=${at}&wx=sunny&shade=${shade}`],
  [`wall-rooms-${look}`, [1440, 900], look, `/?at=${at}&wx=sunny&shade=${shade}`, 'Rooms'],
  ...Object.entries(DAY).map(([part, when]) => [`wall-${part}-${look}`, [1440, 900], look, `/?at=${when}&wx=sunny&shade=${shade}`]),
])

const CARD_ONLY = process.argv[2] === 'card'

async function card(browser) {
  const wall = readFileSync(path.join(OUT, 'wall-room-light.jpg')).toString('base64')
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.setContent(`<body style="margin:0;width:1200px;height:630px;overflow:hidden;background:#f4f2ee radial-gradient(900px 460px at 78% 18%, rgba(233,184,114,.22), transparent 62%)">
    <div style="position:absolute;left:150px;top:28px;width:900px;padding:14px;border-radius:26px;background:#16181d;box-shadow:0 30px 70px rgba(28,24,16,.28)">
    <img src="data:image/jpeg;base64,${wall}" style="display:block;width:100%;border-radius:12px"></div></body>`)
  await page.screenshot({ path: path.join(OUT, 'card.jpg'), type: 'jpeg', quality: 85 })
  await page.close()
  console.log('card')
}

if (CARD_ONLY) {
  const browser = await chromium.launch()
  await card(browser)
  await browser.close()
  process.exit(0)
}

const mock = spawn(process.execPath, [path.join(HERE, 'brain.mjs')], { env: { ...process.env, PORT, NAMES: 'plain', LOCKED: '1' }, stdio: 'ignore' })
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  const browser = await chromium.launch()
  for (const [name, [width, height], colorScheme, query, tab] of SHOTS) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme })
    await page.goto(BASE + query, { waitUntil: 'networkidle' })
    if (tab) await page.getByRole('button', { name: tab, exact: true }).first().click()
    await page.waitForTimeout(2000)   // the sky and the cards settle in; a screenshot is slower than none of this
    await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 80 })
    await page.close()
    console.log(name)
  }
  await card(browser)
  await browser.close()
} finally {
  mock.kill()
}
