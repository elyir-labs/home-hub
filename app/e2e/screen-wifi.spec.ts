// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The screen plugged into a hub with no network asks which Wi-Fi itself, with the hub's own Wi-Fi as a code beside
   the question (design/screen-wifi/, C, decided 22 October 2026). The hub's half is faked at the routes: only this
   screen is told the password, a phone on the hub's Wi-Fi is counted, and a join is answered. These pin the board:
   the two side by side on one screen, a phone taking over, a wrong password said on the wall, Welcome home saying
   which Wi-Fi it is on, the code alone on a screen nobody can touch, and nothing new anywhere else. */
import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

type Hub = { password?: string; phones?: number; noPointer?: boolean }

async function hub(page: Page, { password = 'kite-maple-41', phones = 0, noPointer = false }: Hub = {}) {
  const setup = { ssid: 'Elyir Hub 4F2A', both: false, phones, ...(password ? { password } : {}) }
  const state = {
    net: { how: 'none', ip: '10.42.0.1', name: 'hub', can_change: true, managed: true,
           bridges: { ssid: '', checked: false, known: false, count: 0 }, setup } as Record<string, unknown>,
  }
  if (noPointer) await page.addInitScript(() => {
    const real = window.matchMedia.bind(window)
    window.matchMedia = (q: string) => (q === '(any-pointer: none)' ? { ...real(q), matches: true, media: q } as MediaQueryList : real(q))
  })
  await page.route('**/setup/status', async r => {
    const status = await (await r.fetch()).json()
    await r.fulfill({ json: { ...status, driver: 'down' } })
  })
  await page.route('**/network', r => r.fulfill({ json: state.net }))
  await page.route('**/network/setup.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><rect width='1' height='1'/></svg>" }))
  await page.route('**/network/scan', r => r.fulfill({ json: { can_change: true, networks: [
    { ssid: 'Elyir Hub 4F2A', signal: 'strong', band: '2.4', secure: true },
    { ssid: 'Bluebell', signal: 'strong', band: '5', secure: true },
  ] } }))
  await page.route('**/network/hub', async r => {
    const { ssid, password: typed } = r.request().postDataJSON()
    const moving = { ...state.net, moving: { ssid, since: 1 } }
    state.net = typed === 'right' ? { ...state.net, joined: ssid } : { ...state.net, reverted: ssid, reverted_why: 'password' }
    await r.fulfill({ json: moving })
  })
  await page.goto('/?setup=1&wall=1')
  return state
}

test('asks which Wi-Fi with the code beside it, tops level, on one screen', async ({ page }) => {
  await hub(page)
  await expect(page.getByRole('heading', { name: 'Which Wi‑Fi is yours?' })).toBeVisible()
  await expect(page.locator('.wifi-name')).toHaveText(['Bluebell', 'A network that isn’t listed'])
  const code = page.locator('.wifi-code')
  await expect(code).toContainText('Elyir Hub 4F2A')
  await expect(code).toContainText('kite-maple-41')
  await expect(code.locator('img')).toHaveAttribute('src', '/network/setup.svg')

  const ask = await page.locator('.wifi-ask').boundingBox(), card = await code.boundingBox()
  expect(card!.x).toBeGreaterThan(ask!.x + ask!.width)
  expect(Math.abs(card!.y - ask!.y)).toBeLessThanOrEqual(1)
  const scroll = await page.locator('.setup').evaluate(el => el.scrollHeight - el.clientHeight)
  expect(scroll).toBeLessThanOrEqual(1)
})

test('steps aside for a phone on the hub’s Wi-Fi, and comes back when it leaves', async ({ page }) => {
  const state = await hub(page, { phones: 1 })
  await expect(page.getByRole('heading', { name: 'Carry on on your phone.' })).toBeVisible()
  await expect(page.getByText('A phone has joined Elyir Hub 4F2A.')).toBeVisible()
  state.net = { ...state.net, setup: { ...(state.net.setup as object), phones: 0 } }
  await expect(page.getByRole('heading', { name: 'Which Wi‑Fi is yours?' })).toBeVisible({ timeout: 8000 })
})

test('a wrong password is said on the wall, and a right one carries on to Welcome home', async ({ page }) => {
  await hub(page)
  await page.getByText('Bluebell', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bluebell’s password' })).toBeVisible()
  await expect(page.locator('.wifi-secret input')).toBeFocused()
  await page.locator('.wifi-secret input').fill('wrong')
  await page.getByRole('button', { name: 'Join' }).first().click()
  await expect(page.getByText('Bluebell didn’t accept that password. Check it and try again.')).toBeVisible()

  await page.locator('.wifi-secret input').fill('right')
  await page.getByRole('button', { name: 'Join' }).first().click()
  await expect(page.getByRole('heading', { name: 'Welcome home.' })).toBeVisible()
  await expect(page.getByText('On Bluebell. Getting the rest of the hub, which takes a few minutes the first time.')).toBeVisible()
})

test('a screen nobody can touch or point at shows only the code', async ({ page }) => {
  await hub(page, { noPointer: true })
  await expect(page.getByRole('heading', { name: 'Welcome home.' })).toBeVisible()
  await expect(page.getByText('First, this hub needs your Wi‑Fi.')).toBeVisible()
  await expect(page.locator('.wifi-code')).toContainText('kite-maple-41')
  await expect(page.locator('.wifi-name')).toHaveCount(0)
})

test('anywhere that isn’t told the password, first run is as it was', async ({ page }) => {
  await hub(page, { password: '' })
  await expect(page.getByRole('heading', { name: 'Welcome home.' })).toBeVisible()
  await expect(page.getByText('Getting things ready. The first start takes a minute or two.')).toBeVisible()
  await expect(page.locator('.wifi-code')).toHaveCount(0)
})
