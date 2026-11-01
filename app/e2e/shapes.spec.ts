// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Your evening on the screens it was not first drawn for (design/every-screen/): a 7-inch hung wide, now drawn at
   the wall's size rather than shrunk to 1440x900, and the 10-inch hung tall. On both, every card is whole and
   inside the screen; on the tall one the row is a grid that stops where the screen does, and its last place opens
   Rooms. The sizes are what startup/wall.sh hands the browser for those glasses. */
import { expect, test, type Page } from '@playwright/test'

async function home(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto('/?layout=rail&face=paper&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.bento-card').first()).toBeVisible()
  await page.waitForTimeout(1400)   // the row's arrival is over and the tall grid has measured itself
}

const boxes = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.bento > .bento-card')].map(c => {
  const b = c.getBoundingClientRect()
  return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }
}))

test('a 7-inch hung wide keeps every card whole, top to bottom', async ({ page }) => {
  await home(page, 1029, 579)
  const bar = await page.locator('.bottombar').boundingBox()
  for (const b of await boxes(page)) {
    expect(b.top).toBeGreaterThanOrEqual(0)
    expect(b.bottom).toBeLessThanOrEqual(bar!.y + 1)
  }
  expect(await page.evaluate(() => document.querySelector('.stage')!.scrollHeight <= document.querySelector('.stage')!.clientHeight + 1)).toBe(true)
})

test('hung tall, the row is a grid three across that ends inside the screen', async ({ page }) => {
  await home(page, 900, 1440)
  const cards = await boxes(page)
  const lefts = [...new Set(cards.map(b => Math.round(b.left)))]
  expect(lefts.length).toBe(3)
  for (const b of cards) {
    expect(b.left).toBeGreaterThanOrEqual(0)
    expect(b.right).toBeLessThanOrEqual(900)
    expect(b.bottom).toBeLessThanOrEqual(1440)
  }
  expect(await page.evaluate(() => { const r = document.querySelector('.bento')!; return r.scrollWidth <= r.clientWidth + 1 })).toBe(true)
})

test('hung tall, the last place says what is left and opens Rooms', async ({ page }) => {
  await home(page, 900, 1440)
  const left = page.locator('.bento-left')
  await expect(left).toBeVisible()
  await expect(left).toContainText(/and \d+ more/)
  await left.click()
  await expect(page.locator('.tabs .tab.active')).toContainText('Rooms')
})

test('a wide screen keeps the sideways row it always had', async ({ page }) => {
  await home(page, 1440, 900)
  await expect(page.locator('.bento-left')).toBeHidden()
  expect(await page.evaluate(() => { const r = document.querySelector('.bento')!; return r.scrollWidth > r.clientWidth })).toBe(true)
})
