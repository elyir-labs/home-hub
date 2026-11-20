// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A streaming box on the wall and the phone (design/box-card/, B, decided 20 November 2026). Asleep, its card says
 * Asleep, what was last on and Watch, in the TV card's own place; Watch opens its pane, which is the choice of what to
 * watch, and a tap there opens the app on the box. Device requests are answered here, so the mock house is left as it was. */
import { expect, test, type Page } from '@playwright/test'

const asked: string[] = []
async function room(page: Page, size: { width: number; height: number }) {
  asked.length = 0
  await page.setViewportSize(size)
  await page.route('**/devices/*/*', r => r.request().method() === 'POST'
    ? (asked.push(new URL(r.request().url()).pathname + ' ' + (r.request().postData() ?? '')), r.fulfill({ status: 200, body: '{}' }))
    : r.fallback())
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    for (const rm of home.rooms) for (const d of rm.devices) if (d.id === 'm1') d.state = 'standby'
    await r.fulfill({ response: res, json: home })
  })
  await page.goto('/?room=living&at=20:10', { waitUntil: 'networkidle' })
}
const card = (page: Page) => page.locator('.tile.media.asleep')

for (const [where, size] of [['the wall', { width: 1440, height: 900 }], ['a phone', { width: 390, height: 844 }]] as const) {
  test(`on ${where}, a sleeping box is somewhere to watch from, and Watch opens the choice`, async ({ page }) => {
    await room(page, size)
    await expect(card(page)).toContainText('Asleep')
    await expect(card(page)).toContainText('Last on The Bear')
    await expect(card(page)).not.toContainText('Tap to turn on')
    await card(page).getByRole('button', { name: 'Watch' }).click()
    const pane = page.locator('.watch')
    await expect(pane.locator('h2')).toHaveText('Watch on the TV')
    await expect(pane.locator('.watch-last')).toContainText('The Bear')
    await expect(pane.locator('.watch-app b').first()).toHaveText('Disney+')            // the ones the house has seen used, first
    await pane.locator('.watch-app', { hasText: 'Netflix' }).click()
    await expect.poll(() => asked).toContainEqual('/devices/m1/app {"source":"Netflix"}')
    await expect(pane.locator('.watch-app', { hasText: 'Netflix' })).toContainText('On the TV now')   // stays, saying what it did
  })
}
