// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The dock (design/every-screen/, B, chosen 1 November 2026): one pill along the foot of every screen, the
   phone included, in the same order everywhere -- the command box's orb, the three places, what is playing, then
   Add and This house as doors of their own. The tabs are still three and Add is still not one of them. */
import { expect, test, type Page } from '@playwright/test'

const order = (page: Page) => page.evaluate(() => [...document.querySelector('.dock-body')!.children].map(c =>
  c.classList.contains('say') ? 'orb' : c.classList.contains('dock-places') ? `places:${[...c.children].map(p => p.textContent!.trim()).join('|')}`
    : c.classList.contains('dock-now') ? 'playing' : c.classList.contains('dock-add') ? 'add' : c.classList.contains('dock-house') ? 'house' : c.className))

for (const [w, h] of [[1440, 900], [1029, 579], [900, 1440]]) {
  test(`at ${w} by ${h} the dock is along the foot, in its order, and the top bar has no tabs`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/?face=paper&nav=top&at=19:40', { waitUntil: 'networkidle' })
    await expect(page.locator('.dock-body')).toBeVisible()
    const got = await order(page)
    expect(got[0]).toBe('orb')
    expect(got[1]).toMatch(/^places:Your evening\|Rooms\|Cameras$/)
    expect(got.slice(-2)).toEqual(['add', 'house'])
    await expect(page.locator('.topbar .tabs')).toHaveCount(0)
    await expect(page.locator('.topbar .household')).toBeVisible()
    const dock = (await page.locator('.dock-body').boundingBox())!
    expect(dock.y + dock.height).toBeLessThanOrEqual(h)
    expect(dock.y).toBeGreaterThan(h - 110)
    expect(Math.abs(dock.x + dock.width / 2 - w / 2)).toBeLessThan(2)
  })
}

for (const [w, h] of [[390, 844], [579, 1029]]) {
  test(`at ${w} by ${h} the dock is the same, each word under its picture, and all of it on the screen`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/?face=paper&nav=top&at=19:40', { waitUntil: 'networkidle' })
    await expect(page.locator('.dock-body')).toBeVisible()
    const got = await order(page)
    expect(got[0]).toBe('orb')
    expect(got[1]).toMatch(/^places:Your evening\|Rooms\|Cameras$/)
    expect(got.slice(-2)).toEqual(['add', 'house'])
    await expect(page.locator('.topbar .tabs')).toHaveCount(0)
    const dock = (await page.locator('.dock-body').boundingBox())!
    expect(dock.x).toBeGreaterThanOrEqual(0)
    expect(dock.x + dock.width).toBeLessThanOrEqual(w)
    const place = page.locator('.dock-place').first()
    const [icon, word] = [(await place.locator('svg').boundingBox())!, (await place.locator('span').boundingBox())!]
    expect(word.y, 'the word under its picture').toBeGreaterThan(icon.y + icon.height - 1)
  })
}

test('the places go where they say, and the one you are on is marked', async ({ page }) => {
  await page.goto('/?face=paper&layout=wall&nav=top&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.dock-place', { hasText: 'Cameras' }).click()
  await expect(page.locator('.dock-place.active')).toHaveText('Cameras')
  await page.locator('.dock-place', { hasText: 'Rooms' }).click()
  await expect(page.locator('.dock-place.active')).toHaveText('Rooms')
  await expect(page.locator('.room-cell').first()).toBeVisible()
})

test('while somebody is in the command box it has the dock, and the dock comes back when they leave it', async ({ page }) => {
  await page.goto('/?face=paper&layout=wall&nav=top&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.dock-body .say-box').click()
  await page.keyboard.type('kitchen lights')
  await expect(page.locator('.dock-place').first()).toBeHidden()
  await expect.poll(async () => (await page.locator('.say-box').boundingBox())!.width).toBeGreaterThan(400)   // 460ms of width
  await page.locator('.say-box input').blur()
  await expect(page.locator('.dock-place').first()).toBeVisible()
  await expect(page.locator('.dock-house')).toBeVisible()
})

test('This house opens from its door', async ({ page }) => {
  await page.goto('/?face=paper&layout=wall&nav=top&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.dock-house').click()
  await expect(page.locator('.house-panel')).toBeVisible()
})
