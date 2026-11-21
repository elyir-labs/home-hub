// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Which screen is a TV, and which show photos (design/which-tv/, decided 20 November 2026: A, with B as a row on This
   screen, C's choice of screens, and Wall A). A screen says what it is; somebody at it can say otherwise; Photos lists
   the screens with a switch each; a wall with its photos on rests on them. */
import { expect, test } from '@playwright/test'

test('Your screens lists the house\'s screens, a TV by its room; the kitchen wall\'s own page turns its photos on and how they play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?sheet=photos&at=19:40', { waitUntil: 'networkidle' })
  const rows = page.locator('.photos-screens li')
  await expect(rows.nth(0)).toContainText('Living room TV')
  await expect(rows.nth(0)).toContainText('shows photos, day by day')
  await expect(rows.nth(1)).toContainText('Kitchen')
  await expect(rows.nth(1)).toContainText('shows the clock')
  await rows.nth(1).click()
  await expect(page.locator('.photos-screen-title')).toHaveText('Kitchen')
  await page.getByRole('switch', { name: 'Photos' }).click()
  await expect(page.getByRole('switch', { name: 'Photos' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'One after another' }).click()
  await page.getByRole('button', { name: 'Your screens' }).click()
  await expect(rows.nth(1)).toContainText('shows photos, one after another')
})

test('This screen says what it is, and an answer there starts the screen again as that', async ({ page }) => {
  const said: any[] = []
  await page.route('**/screens/me', async r => { said.push(r.request().postDataJSON()); return r.fallback() })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?screen=1&sheet=screen&at=19:40', { waitUntil: 'networkidle' })
  const row = page.locator('.hub-rows li', { hasText: 'What it is' })
  await expect(row).toContainText('A screen on the wall')
  expect(said.at(-1)).toMatchObject({ tv: false, by: 'screen' })
  await Promise.all([page.waitForEvent('load'), row.getByRole('button', { name: 'A TV' }).click()])
  expect(said.some(b => b.tv === true && b.by === 'person')).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('screen-kind'))).toBe('tv')
  await expect(page.locator('.tv-title, .tvrest, [data-on-tv]').first()).toBeVisible()
})

test('a wall screen with its photos switched on rests on them, with nothing about a remote', async ({ page }) => {
  await page.route('**/screens/me', r => r.fulfill({ json: { id: 'x', room: 'kitchen', room_name: 'Kitchen', tv: false, by: 'screen', photos: true } }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?screen=1&rest=1&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.tvrest[data-wall]')).toHaveAttribute('data-face', 'photos')
  await expect(page.locator('.tvrest-ok')).toHaveCount(0)
  await expect(page.locator('.idle-time')).toHaveCount(0)
})

test('a wall screen with its photos off rests as it always has', async ({ page }) => {
  await page.route('**/screens/me', r => r.fulfill({ json: { id: 'x', room: 'kitchen', room_name: 'Kitchen', tv: false, by: 'screen', photos: false } }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?screen=1&rest=1&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.idle-time')).toBeVisible()
  await expect(page.locator('.tvrest')).toHaveCount(0)
})
