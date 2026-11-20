// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The doorbell and music on the TV (design/tv-doorbell/, A, and design/tv-music/, A and B, decided 20 November 2026).
   A ring brings the door up in a corner over whatever is on, awake or resting: OK makes it the whole screen and Back
   lets it go. Music in the TV's room leads its home as a row of its own, and a resting TV playing music shows the
   record; twenty seconds with no key brings it back, and OK raises a sheet under it with the music, the room and the
   other rooms (design/tv-playing/, A). The ring is spoken into this page's own stream, the way the
   brain sends it, and the music's actions are answered here. */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })
const lit = (page: Page) => page.locator('[data-lit]')
const risen = (page: Page) => page.locator('.tvb-sheet').evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)))
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

test('a resting TV whose room plays music shows the record, and OK raises the music, the room and the other rooms', async ({ page }) => {
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    for (const room of home.rooms) for (const d of room.devices) if (d.id === 's1') d.state = 'playing'
    await r.fulfill({ response: res, json: home })
  })
  await page.goto('/?tv=1&room=living&at=21:10&rest=1', { waitUntil: 'networkidle' })
  await expect(page.locator('.rec-t')).toHaveText('Blue in Green')
  await expect(page.locator('.rec-w')).toHaveCount(0)        // the TV is in that room: which speakers and where is not said
  await expect(page.locator('.idle-time')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('.tvb-srow h2')).toHaveText(['Playing here', 'In the living room', 'Other rooms'])
  await expect(page.locator('.tvb-srow').first().locator('.tvb-key')).toHaveText(['Pause', 'Next', 'Something else', 'Other rooms too', /^Volume\s*20%$/])
  await expect(lit(page)).toHaveText('Pause')
  await expect(page.locator('.tvb-srow').nth(1).locator('.tvb-nm')).not.toContainText(['Sonos'])   // the music row works the speaker
  await expect(page.locator('.tvb-chip').filter({ hasText: 'Movie' })).toBeVisible()
  const rec = (await page.locator('.rec-art').boundingBox())!, sheet = (await page.locator('.tvb-sheet').boundingBox())!
  expect(rec.y + rec.height).toBeLessThan(sheet.y)                         // the record steps up above the sheet, never under it
  for (const b of await page.locator('.tvb-sheet [data-tv]').evaluateAll(es => es.map(e => e.getBoundingClientRect().right)))
    expect(b).toBeLessThanOrEqual(1920)                                    // every row is one line inside the TV
  await risen(page)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
  await expect(page.locator('.tvb-srow').nth(2).locator('[data-lit]')).toHaveCount(1)   // Up and Down move between the rows
  await page.keyboard.press('Escape')
  await expect(page.locator('.tvb-sheet')).toHaveCount(0)
  await expect(page.locator('.rec-t')).toHaveText('Blue in Green')
})

const playing = async (page: Page) => page.route('**/home', async r => {
  const res = await r.fetch(), home = await res.json()
  for (const room of home.rooms) for (const d of room.devices) if (d.id === 's1') d.state = 'playing'
  await r.fulfill({ response: res, json: home })
})

test('Up or Down on the record raise the sheet on the volume, where they are louder and quieter', async ({ page }) => {
  const asked: string[] = []
  await page.route('**/devices/*/*', r => r.request().method() === 'POST'
    ? (asked.push(new URL(r.request().url()).pathname + ' ' + (r.request().postData() ?? '')), r.fulfill({ status: 200, body: '{}' }))
    : r.fallback())
  await playing(page)
  await page.goto('/?tv=1&room=living&at=21:10&rest=1', { waitUntil: 'networkidle' })
  await page.keyboard.press('ArrowUp')
  await expect(lit(page)).toContainText('Volume')
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => asked.at(-1)).toMatch(/\/volume .*"volume_level":0\.25/)
  await expect(lit(page)).toContainText('Volume')
})

test('a room in the sheet wakes the TV on that room', async ({ page }) => {
  await playing(page)
  await page.goto('/?tv=1&room=living&at=21:10&rest=1', { waitUntil: 'networkidle' })
  await page.keyboard.press('Enter')
  await page.locator('.tvb-chip').filter({ hasText: 'Kitchen' }).click()
  await expect(page.locator('.shell.resting')).toHaveCount(0)
  await expect(page.locator('.tv-title h1')).toHaveText('Kitchen')
})

test('while the room plays, the awake TV goes back to the record after twenty seconds with no key, and keys keep it awake', async ({ page }) => {
  await page.clock.install()
  await playing(page)
  await page.goto('/?tv=1&room=living&at=21:10', { waitUntil: 'networkidle' })
  await expect(page.locator('.tv-title h1')).toHaveText('Living room')
  for (let i = 0; i < 4; i++) { await page.clock.fastForward(10_000); await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight') }
  await expect(page.locator('.shell.resting')).toHaveCount(0)             // forty seconds of keys, ten apart: still awake
  await page.clock.fastForward(26_000)
  await expect(page.locator('.rec-t')).toHaveText('Blue in Green')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tvb-sheet')).toBeVisible()
  await page.clock.fastForward(26_000)
  await expect(page.locator('.tvb-sheet')).toHaveCount(0)                  // the sheet sinks after the same twenty seconds
  await expect(page.locator('.rec-t')).toHaveText('Blue in Green')
})

test('with nothing playing, the TV waits the usual three minutes', async ({ page }) => {
  await page.clock.install()
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    for (const room of home.rooms) for (const d of room.devices) if (d.id === 's1') d.state = 'idle'
    await r.fulfill({ response: res, json: home })
  })
  await page.goto('/?tv=1&room=living&at=21:10', { waitUntil: 'networkidle' })
  await page.clock.fastForward(60_000)
  await expect(page.locator('.shell.resting')).toHaveCount(0)
  await page.clock.fastForward(150_000)
  await expect(page.locator('.shell.resting')).toHaveCount(1)
})

test('a pair of speakers playing the same song is one record, and OK and the volume work both', async ({ page }) => {
  const asked: string[] = []
  await page.route('**/devices/*/*', r => r.request().method() === 'POST'
    ? (asked.push(new URL(r.request().url()).pathname), r.fulfill({ status: 200, body: '{}' }))
    : r.fallback())
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    const living = home.rooms.find((x: any) => x.id === 'living')
    const s1 = living.devices.find((d: any) => d.id === 's1')
    s1.state = 'playing'; s1.name = 'Left Pod'
    living.devices.push({ ...s1, id: 's2', name: 'Right Pod', attrs: { ...s1.attrs } })
    await r.fulfill({ response: res, json: home })
  })
  await page.goto('/?tv=1&room=living&at=21:10', { waitUntil: 'networkidle' })
  await expect(page.locator('.tv-now-where')).toHaveText('Left Pod and Right Pod · 20%')
  await expect(page.locator('.tv-title p')).not.toContainText('Blue in Green · Blue in Green')
  await page.keyboard.press('Enter')
  await expect.poll(() => asked.filter(a => a.endsWith('/pause')).sort()).toEqual(['/devices/s1/pause', '/devices/s2/pause'])
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => asked.filter(a => a.endsWith('/volume')).sort()).toEqual(['/devices/s1/volume', '/devices/s2/volume'])
})

test('a pause keeps the record on the resting TV, saying Paused, with Play on OK', async ({ page }) => {
  let s1: any
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    for (const room of home.rooms) for (const d of room.devices) if (d.id === 's1') { d.state = 'playing'; s1 = d }
    await r.fulfill({ response: res, json: home })
  })
  await page.goto('/?tv=1&room=living&at=21:10&rest=1', { waitUntil: 'networkidle' })
  await expect(page.locator('.rec-t')).toHaveText('Blue in Green')
  speak({ type: 'device', device: { ...s1, state: 'paused' } })
  await page.waitForTimeout(600)
  await expect(page.locator('.rec-t')).toHaveText('Blue in Green')
  await expect(page.locator('.rec-w')).toHaveText('Paused')
  await expect(page.locator('.rec-keys')).toContainText('Play, next, the room, the house')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tvb-key').first()).toHaveText('Play')
})
