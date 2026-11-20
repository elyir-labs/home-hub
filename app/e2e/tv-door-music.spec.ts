// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The doorbell and music on the TV (design/tv-doorbell/, A, and design/tv-music/, A and B, decided 20 November 2026).
   A ring brings the door up in a corner over whatever is on, awake or resting: OK makes it the whole screen and Back
   lets it go. Music in the TV's room leads its home as a row of its own, and a resting TV playing music shows the
   record, with a band of Pause, Next and the volume on OK. The ring is spoken into this page's own stream, the way the
   brain sends it, and the music's actions are answered here. */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })
const lit = (page: Page) => page.locator('[data-lit]')
let speak: (m: unknown) => void = () => {}
const ring = async (_page: Page) => speak({ type: 'ring', ring: { camera: 'f2', at: Date.now() / 1000 } })
test.beforeEach(async ({ page }) => { await page.routeWebSocket('**/stream', ws => { ws.connectToServer(); speak = m => ws.send(JSON.stringify(m)) }) })

test('a ring puts the door in the corner; OK makes it the whole screen, Back goes back to the room', async ({ page }) => {
  await page.goto('/?tv=1&room=living&at=21:10', { waitUntil: 'networkidle' })
  await expect(page.locator('.door-corner')).toHaveCount(0)
  await ring(page)
  const corner = page.locator('.door-corner')
  await expect(corner).toContainText("Someone's at the front door")
  await expect(page.locator('.door-keys')).toContainText('Bigger')
  await expect(page.locator('.tv-hint')).toBeHidden()
  const box = (await corner.boundingBox())!
  expect(box.x + box.width).toBeGreaterThan(1700)                     // the corner, over the room, which stays in view
  await expect(page.locator('.tv-title h1')).toHaveText('Living room')
  await page.keyboard.press('Enter')
  await expect(page.locator('.viewer')).toBeVisible()
  await expect(page.locator('.viewer-name')).toHaveText('Doorbell')
  await expect(corner).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.viewer')).toHaveCount(0)
  await expect(page.locator('.tv-title h1')).toHaveText('Living room')
})

test('Back lets the door go, and a resting TV shows it too', async ({ page }) => {
  await page.goto('/?tv=1&room=living&at=21:10&rest=1', { waitUntil: 'networkidle' })
  await ring(page)
  await expect(page.locator('.door-corner')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.door-corner')).toHaveCount(0)
  await expect(page.locator('.shell.resting')).toHaveCount(1)          // letting it go does not wake the TV
})

test('what plays in the room leads it: OK plays or pauses, Up is louder, Hold OK chooses something else', async ({ page }) => {
  const asked: string[] = []
  await page.route('**/devices/*/*', r => r.request().method() === 'POST'
    ? (asked.push(new URL(r.request().url()).pathname + ' ' + (r.request().postData() ?? '')), r.fulfill({ status: 200, body: '{}' }))
    : r.fallback())
  await page.goto('/?tv=1&room=living&at=21:10', { waitUntil: 'networkidle' })
  await expect(page.locator('.tv-row h2').first()).toHaveText('Playing here')
  await expect(lit(page)).toContainText('Blue in Green')
  await expect(page.locator('.tv-row').nth(1).locator('.tv-nm')).not.toContainText(['Sonos'])   // the speaker is the row above
  await page.keyboard.press('Enter')
  await expect.poll(() => asked.at(-1)).toMatch(/\/play /)
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => asked.at(-1)).toMatch(/\/volume .*"volume_level":0\.25/)
  await page.keyboard.down('Enter'); await page.waitForTimeout(700); await page.keyboard.up('Enter')
  await expect(page.locator('.music-pane')).toBeVisible()
})

test('a resting TV whose room plays music shows the record, and OK raises Pause, Next and the volume', async ({ page }) => {
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    for (const room of home.rooms) for (const d of room.devices) if (d.id === 's1') d.state = 'playing'
    await r.fulfill({ response: res, json: home })
  })
  await page.goto('/?tv=1&room=living&at=21:10&rest=1', { waitUntil: 'networkidle' })
  await expect(page.locator('.rec-t')).toHaveText('Blue in Green')
  await expect(page.locator('.rec-w')).toContainText('in the living room')
  await expect(page.locator('.idle-time')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('.tvb-key')).toHaveText(['Pause', 'Next', 'The living room'])
  await expect(lit(page)).toHaveText('Pause')
  await expect(page.locator('.tvb-vol')).toContainText('20%')
  await page.keyboard.press('Escape')
  await expect(page.locator('.tvb-key')).toHaveCount(0)
})
