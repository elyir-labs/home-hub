// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Words on the sky stay readable whatever the hour (readable.ts measures them; design/readable-rest/, C). The
   resting screens have nothing between their words and the sky, so each is read at dawn, noon, dusk and night: the
   TV with and without music, and the wall in both looks. */
import { expect, test, type Page } from '@playwright/test'
import { unreadable } from './readable'

const HOURS = { dawn: '06:40', noon: '12:30', dusk: '18:20', night: '22:10' }
const playing = (page: Page) => page.route('**/home', async r => {
  const res = await r.fetch(), home = await res.json()
  for (const room of home.rooms) for (const d of room.devices) if (d.id === 's1') d.state = 'playing'
  await r.fulfill({ response: res, json: home })
})
const settle = async (page: Page, w: number, h: number) => { await page.mouse.move(w - 1, h - 1); await page.waitForTimeout(1800) }

test.describe('the resting TV', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })
  for (const [when, at] of Object.entries(HOURS)) {
    test(`with music on, at ${when}`, async ({ page }) => {
      await playing(page)
      await page.goto(`/?tv=1&room=living&rest=1&at=${at}`, { waitUntil: 'networkidle' })
      await settle(page, 1920, 1080)
      expect(await unreadable(page, '.idle')).toEqual([])
    })
    test(`at ${when}`, async ({ page }) => {
      await page.goto(`/?tv=1&room=living&rest=1&at=${at}`, { waitUntil: 'networkidle' })
      await settle(page, 1920, 1080)
      expect(await unreadable(page, '.idle')).toEqual([])
    })
  }
})

test.describe('the resting TV on its own cover', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })
  const COVERS = { bright: [245, 243, 238], dark: [18, 14, 16] }
  for (const [cover, rgb] of Object.entries(COVERS)) {
    test(`a ${cover} cover at noon`, async ({ page }) => {
      await page.route('**/home', async r => {
        const res = await r.fetch(), home = await res.json()
        for (const room of home.rooms) for (const d of room.devices) if (d.id === 's1') Object.assign(d, { state: 'playing', attrs: { ...d.attrs, entity_picture: '/art.png' } })
        await r.fulfill({ response: res, json: home })
      })
      await page.route('**/devices/s1/image*', async r => {
        const png = await page.evaluate(([r, g, b]) => { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d')!; x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 8, 8); return c.toDataURL('image/png').split(',')[1] }, rgb)
        await r.fulfill({ body: Buffer.from(png, 'base64'), contentType: 'image/png' })
      })
      await page.goto('/?tv=1&room=living&rest=1&at=12:30', { waitUntil: 'networkidle' })
      await settle(page, 1920, 1080)
      await expect(page.locator('.rec-blur')).toHaveCount(1)
      expect(await unreadable(page, '.idle')).toEqual([])
    })
  }
})

test.describe('the resting wall', () => {
  for (const shade of ['dark', 'light']) for (const [when, at] of Object.entries(HOURS)) {
    test(`${shade}, at ${when}`, async ({ page }) => {
      await page.goto(`/?rest=1&at=${at}&shade=${shade}`, { waitUntil: 'networkidle' })
      await settle(page, 1280, 800)
      expect(await unreadable(page, '.idle')).toEqual([])
    })
  }
})
