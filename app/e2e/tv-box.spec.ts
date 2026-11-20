// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A streaming box beside the TV (design/tv-box/, A, decided 20 November 2026). The Watch row leads the TV's home with
 * what was last on and then the box's apps; OK on one opens it on the box and asks the screen to switch the TV over,
 * and when the box is back on its own home screen the TV is asked to show the house again, with that app still lit and
 * saying Just now. The screen's helper and the device requests are answered here. */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

const HELPER = 'http://helper.test'
const asked: string[] = [], shown: string[] = []
let tvSays: { showing: string | null; colors: boolean } = { showing: null, colors: false }
let box: Record<string, any> = {}
let speak: (m: object) => void = () => {}

async function tv(page: Page, withBox = true, colors = false) {
  asked.length = 0; shown.length = 0; tvSays = { showing: null, colors }
  await page.routeWebSocket('**/stream', ws => { ws.connectToServer(); speak = m => ws.send(JSON.stringify(m)) })
  await page.route('**/devices/*/*', r => r.request().method() === 'POST'
    ? (asked.push(new URL(r.request().url()).pathname + ' ' + (r.request().postData() ?? '')), r.fulfill({ status: 200, body: '{}' }))
    : r.fallback())
  await page.route(`${HELPER}/**`, r => {
    const post = r.request().method() === 'POST', tv = r.request().url().endsWith('/tv')
    if (post && tv) shown.push(JSON.parse(r.request().postData() ?? '{}').show)
    return r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' },
      json: post ? { ok: true } : tv ? tvSays : { role: 'hub', turn: 0, turns: false, other: null } })
  })
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    for (const room of home.rooms) for (const d of room.devices) {
      if (d.id === 's1') d.state = 'idle'
      if (d.id === 'm1') { if (!withBox) delete d.attrs.box; else { d.state = 'standby'; box = d } }
    }
    await r.fulfill({ response: res, json: home })
  })
  await page.goto(`/?tv=1&room=living&at=19:40&helper=${encodeURIComponent(HELPER)}`, { waitUntil: 'networkidle' })
}
const lit = (page: Page) => page.locator('[data-lit]')
/* What the box says next, as the hub's stream would bring it. */
const boxSays = (state: string, app: string | null) => speak({ type: 'device', device: { ...box, state, attrs: { ...box.attrs, app_name: app } } })

test('the Watch row leads the TV, with what was last on and then the apps the house has seen used', async ({ page }) => {
  await tv(page)
  await expect(page.locator('.tv-row h2')).toHaveText(['Watch on the TV', 'In the living room', 'Scenes here', 'Other rooms', 'Cameras', 'This house'])
  await expect(lit(page)).toContainText('Last on')
  await expect(lit(page)).toContainText('The Bear')
  await expect(page.locator('.tv-hint')).toContainText('Back to The Bear')
  await expect(page.locator('.tv-app .tv-nm')).toHaveText(['Disney+', 'Netflix', 'YouTube', 'Prime Video', 'Max', 'Apple TV', 'Hulu', 'All apps'])
  await expect(page.locator('.tv-row').nth(1).locator('.tv-nm')).not.toContainText(['TV'])   // the box is the Watch row, not a card in the room
  const small = await page.locator('.tv-nm, .tv-st, .tv-hint, .tv-lbl').evaluateAll(es => es.filter(e => parseFloat(getComputedStyle(e).fontSize) < 18).length)
  expect(small).toBe(0)
})

test('OK on an app says how to come back, opens it on the box and switches the TV over; the box going to sleep brings the house back', async ({ page }) => {
  await tv(page)
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  await expect(lit(page)).toContainText('Netflix')
  await page.keyboard.press('Enter')
  // nothing on this screen hears a colored button meant for the box, so the way back is Input, or sleep (A)
  await expect(page.locator('.tv-handover')).toContainText('Opening Netflix on the TV')
  await expect(page.locator('.tv-handover')).toContainText('press Input on the TV’s remote. When the TV goes to sleep')
  await expect.poll(() => asked).toContainEqual('/devices/m1/app {"source":"Netflix"}')
  await expect.poll(() => shown).toEqual(['box'])
  await expect(page.locator('.tv-handover')).toHaveCount(0)
  boxSays('on', 'Netflix')
  await page.waitForTimeout(300)
  boxSays('standby', null)
  await expect.poll(() => shown).toEqual(['box', 'house'])
  await expect(lit(page)).toContainText('Netflix')
  await expect(lit(page)).toContainText('Just now')
})

test('where a colored button is heard, the handover shows the four colors, and the TV found showing the house again is coming back', async ({ page }) => {
  await tv(page, true, true)
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tv-handover')).toContainText('press any colored button on the TV’s remote')
  await expect(page.locator('.tv-handover .tv-key')).toHaveCount(4)
  await expect.poll(() => shown).toEqual(['box'])
  tvSays = { showing: 'elsewhere', colors: true }
  await page.waitForTimeout(2500)
  tvSays = { showing: 'house', colors: true }                      // a colored button: cec-watch.py switched the TV itself
  await expect(lit(page)).toContainText('Just now', { timeout: 6000 })
  expect(shown).toEqual(['box'])                                    // the screen didn't need to switch it again
})

test('an app opened from the wall or a phone switches the TV over, and comes back the same way', async ({ page }) => {
  await tv(page)
  await page.waitForTimeout(300)
  boxSays('standby', null)
  speak({ type: 'device', device: { ...box, state: 'standby', attrs: { ...box.attrs, opened: { app: 'Netflix', at: Date.now() / 1000 } } } })
  await expect.poll(() => shown).toEqual(['box'])
  boxSays('on', 'Netflix')
  await page.waitForTimeout(300)
  boxSays('standby', null)
  await expect.poll(() => shown).toEqual(['box', 'house'])
  await expect(lit(page)).toContainText('Just now')
})

test('All apps lays the rest out in the same row', async ({ page }) => {
  await tv(page)
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight')
  await expect(lit(page)).toContainText('All apps')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tv-all')).toHaveCount(0)
  await expect(lit(page)).toContainText('Peacock')                // the highlight goes on to the first one it laid out
  await expect(page.locator('.tv-app .tv-nm')).toContainText(['Peacock', 'Paramount+', 'Spotify', 'Twitch', 'Plex'])
})

test('a TV with no box beside it opens on its room, as before', async ({ page }) => {
  await tv(page, false)
  await expect(page.locator('.tv-row h2').first()).toHaveText('In the living room')
  await expect(lit(page)).toContainText('Ceiling light')
})
