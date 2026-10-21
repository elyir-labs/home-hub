// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A phone on the hub's own Wi-Fi gives it the house's (design/setup-network/, A, decided 19 October 2026).
   The hub's half is faked at the routes: what it reports, and what it does with a join. These pin the
   journey on a phone: which Wi-Fi, a wrong password said where it was typed, the hub on it with the
   address to carry, and the card that can't do both telling the phone before it goes. */
import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

type Hub = { both: boolean; accepts: string }

async function hub(page: Page, { both, accepts }: Hub) {
  let net: Record<string, unknown> = {
    how: 'none', ip: '10.42.0.1', name: 'hub', can_change: true, managed: true,
    bridges: { ssid: '', checked: false, known: false, count: 0 }, setup: { ssid: 'Elyir Hub 4F2A', both },
  }
  const asked: string[] = []
  page.on('request', q => {
    const path = new URL(q.url()).pathname
    if (!/^\/(assets|sounds)\/|^\/$|\.\w+$/.test(path)) asked.push(path)
  })
  await page.route('**/network', r => r.fulfill({ json: net }))
  await page.route('**/network/scan', r => r.fulfill({ json: { can_change: true, networks: [
    { ssid: 'Elyir Hub 4F2A', signal: 'strong', band: '2.4', secure: true },
    { ssid: 'Bluebell', signal: 'strong', band: '5', secure: true },
    { ssid: 'Bluebell Guest', signal: 'ok', band: '2.4', secure: true },
  ] } }))
  await page.route('**/network/hub', async r => {
    const { ssid, password } = r.request().postDataJSON()
    const moving = { ...net, moving: { ssid, since: 1 } }
    net = password === accepts
      ? { ...net, ip: '192.168.1.20', joined: ssid }
      : { ...net, reverted: ssid, reverted_why: 'password' }
    await r.fulfill({ json: moving })
  })
  await page.goto('/?wifi=1')
  return asked
}

test('asks which Wi-Fi, never offering the hub’s own, on one screen', async ({ page }) => {
  await hub(page, { both: true, accepts: 'right' })
  await expect(page.getByRole('heading', { name: 'Which Wi‑Fi is yours?' })).toBeVisible()
  const names = await page.locator('.wifi-name').allTextContents()
  expect(names).toEqual(['Bluebell', 'Bluebell Guest', 'A network that isn’t listed'])
  const scroll = await page.locator('.setup').evaluate(el => el.scrollHeight - el.clientHeight)
  expect(scroll).toBeLessThanOrEqual(1)
})

test('a wrong password is said on the phone that typed it, and a right one ends on the address', async ({ page }) => {
  await hub(page, { both: true, accepts: 'right' })
  await page.getByText('Bluebell', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bluebell’s password' })).toBeVisible()
  await page.locator('.wifi-secret input').fill('wrong')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByText('Bluebell didn’t accept that password. Check it and try again.')).toBeVisible()

  await page.locator('.wifi-secret input').fill('right')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByRole('heading', { name: 'The hub is on Bluebell.' })).toBeVisible()
  await expect(page.locator('.wifi-where')).toContainText('hub.local')
  await expect(page.getByText('If that doesn’t open, try 192.168.1.20.')).toBeVisible()
})

test('a card that can’t do both says what happens before it takes the phone with it', async ({ page }) => {
  await hub(page, { both: false, accepts: 'right' })
  await page.getByText('Bluebell', { exact: true }).click()
  await page.locator('.wifi-secret input').fill('right')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByRole('heading', { name: 'The hub is joining Bluebell.' })).toBeVisible()
  await expect(page.getByText('Scan the code on the hub again to try once more.', { exact: false })).toBeVisible()
})

test('nothing of the house is asked for: only the hub’s network', async ({ page }) => {
  const asked = await hub(page, { both: true, accepts: 'right' })
  await expect(page.locator('.wifi-name').first()).toBeVisible()
  await page.waitForTimeout(500)
  expect([...new Set(asked)].sort()).toEqual(['/network', '/network/scan'])
})
