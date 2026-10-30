// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A screen that starts on its side (design/sideways-start/, B, decided 28 October 2026). The wall turns a glass made
   tall a quarter on its own (startup/wall.sh guess, pinned in driver-layer/host/tests.sh), so the one thing on screen
   is the upside-down pill, now on the hub's own first start as well as a screen's. The screen's helper is stood in for
   at the address the panel asks, already turned by the guess. */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

async function guessed(page: Page) {
  const state = { role: 'hub', turn: 90, turns: true, other: null }
  const sent: number[] = []
  await page.route('http://127.0.0.1:8380/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state })
    state.turn = route.request().postDataJSON().turn; sent.push(state.turn)
    return route.fulfill({ json: { turn: state.turn } })
  })
  return sent
}

test('the hub’s own first start carries the upside-down pill, and a wrong guess is one tap from upright', async ({ page }) => {
  const sent = await guessed(page)
  await page.goto('/?setup=1&wall=1')
  const pill = page.locator('.turn-pill')
  await expect(pill).toHaveText('Upside down? Tap to turn it')
  await expect(pill).toHaveClass(/upside/)
  await pill.click()
  await expect(pill).toHaveText('Turned over. Put it back')
  await pill.click()
  await expect(pill).toHaveText('Upside down? Tap to turn it')
  expect(sent).toEqual([270, 90])
})

test('the pill is on Which Wi‑Fi too, the first thing a hub with no network shows', async ({ page }) => {
  await guessed(page)
  await page.route('**/setup/status', async r => r.fulfill({ json: { ...(await (await r.fetch()).json()), driver: 'down' } }))
  await page.route('**/network', r => r.fulfill({ json: { how: 'none', ip: '10.42.0.1', name: 'hub', can_change: true, managed: true,
    bridges: { ssid: '', checked: false, known: false, count: 0 }, setup: { ssid: 'Elyir Hub 4F2A', both: false, phones: 0, password: 'kite-maple-41' } } }))
  await page.route('**/network/scan', r => r.fulfill({ json: { can_change: true, networks: [] } }))
  await page.goto('/?setup=1&wall=1')
  await expect(page.getByRole('heading', { name: 'Which Wi‑Fi is yours?' })).toBeVisible()
  await expect(page.locator('.turn-pill')).toHaveText('Upside down? Tap to turn it')
})

test('a phone setting the hub up has no pill', async ({ page }) => {
  await page.route('http://127.0.0.1:8380/**', r => r.abort())
  await page.goto('/?setup=1')
  await expect(page.locator('.setup')).toBeVisible()
  await expect(page.locator('.turn-pill')).toHaveCount(0)
})
