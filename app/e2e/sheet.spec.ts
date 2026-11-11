// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* This house from the dock (design/every-screen/, This house B, chosen 1 November 2026): today's sheet, its
   doors in four groups, what needs somebody said first, Add left to its own door, and the whole panel standing
   above the dock rather than over it, with This house lit in it. */
import { expect, test, type Page } from '@playwright/test'

const groups = (page: Page) => page.locator('.door-group-name').allTextContents()

test('on a wall the doors are in their groups, Add is not one of them, and what needs you leads the front page', async ({ page }) => {
  await page.goto('/?face=paper&layout=wall&nav=top&at=19:40&sheet=house', { waitUntil: 'networkidle' })
  await expect(page.locator('.house-panel')).toBeVisible()
  expect((await groups(page)).map(g => g.trim().toLowerCase())).toEqual(['every day', 'people', 'the house', 'the hub'])
  await expect(page.locator('.doors .door', { hasText: 'Add to the house' })).toHaveCount(0)
  const first = page.locator('.house-main .house-page .page > *').first()
  await expect(first).toHaveClass(/house-needs/)
  await expect(page.locator('.house-main .house-need').first()).toContainText('Accounts')
})

test('the panel stands above the dock, which stays in front with This house lit', async ({ page }) => {
  await page.goto('/?face=paper&layout=wall&nav=top&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.dock-house').click()
  await expect(page.locator('.house-panel')).toBeVisible()
  await page.waitForTimeout(500)
  const panel = (await page.locator('.house-panel').boundingBox())!
  const dock = (await page.locator('.dock-body').boundingBox())!
  expect(panel.y + panel.height).toBeLessThanOrEqual(dock.y)
  await expect(page.locator('.dock-house')).toHaveClass(/active/)
  // a page inside it keeps its door lit too
  await page.locator('.doors .door', { hasText: 'Routines' }).click()
  await expect(page.locator('.dock-house')).toHaveClass(/active/)
  // and the door shuts it again
  await page.locator('.dock-house').click()
  await expect(page.locator('.house-panel')).toHaveCount(0)
})

test('a place in the dock shuts the panel and goes there', async ({ page }) => {
  await page.goto('/?face=paper&layout=wall&nav=top&at=19:40&sheet=house', { waitUntil: 'networkidle' })
  await expect(page.locator('.house-panel')).toBeVisible()
  await page.locator('.dock-place', { hasText: 'Cameras' }).click()
  await expect(page.locator('.house-panel')).toHaveCount(0)
  await expect(page.locator('.dock-place.active')).toHaveText('Cameras')
})

test('on a phone what needs you is above the groups, and the passcode is asked for once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?face=paper&at=19:40&sheet=house', { waitUntil: 'networkidle' })
  await expect(page.locator('.house-doors .house-needs')).toBeVisible()
  const top = async (s: string) => (await page.locator(s).first().boundingBox())!.y
  expect(await top('.house-doors .house-needs')).toBeLessThan(await top('.door-group'))
  const asks = await page.locator('.house-doors').getByText(/set a passcode/i).count()
  expect(asks).toBe(1)
})
