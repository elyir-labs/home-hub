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

test.describe('the resting wall', () => {
  for (const shade of ['dark', 'light']) for (const [when, at] of Object.entries(HOURS)) {
    test(`${shade}, at ${when}`, async ({ page }) => {
      await page.goto(`/?rest=1&at=${at}&shade=${shade}`, { waitUntil: 'networkidle' })
      await settle(page, 1280, 800)
      expect(await unreadable(page, '.idle')).toEqual([])
    })
  }
})
