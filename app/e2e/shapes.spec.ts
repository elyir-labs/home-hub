// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Your evening on the screens it was not first drawn for (design/every-screen/): a 7-inch hung wide, now drawn at
   the wall's size rather than shrunk to 1440x900, and the 10-inch hung tall. On both, every card is whole and
   inside the screen; on the tall one the row is a grid that stops where the screen does, and its last place opens
   Rooms; a 7-inch hung tall is the same grid two across. The sizes are what startup/wall.sh hands the browser
   for those glasses. */
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
  await expect(page.locator('.dock-place.active')).toContainText('Rooms')
})

test('a 7-inch wall screen hung tall gets the home two across, not the phone page, ending inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 579, height: 1029 })
  await page.goto('/?wall=1&face=paper&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.bento-card').first()).toBeVisible()
  await page.waitForTimeout(1400)
  const cards = await boxes(page)
  expect(new Set(cards.map(b => Math.round(b.left))).size).toBe(2)
  const dock = (await page.locator('.dock-body').boundingBox())!
  for (const b of cards) {
    expect(b.right).toBeLessThanOrEqual(579)
    expect(b.bottom).toBeLessThanOrEqual(dock.y)
  }
  await page.locator('.bento-left').click()
  await expect(page.locator('.dock-place.active')).toContainText('Rooms')
})

test('a phone keeps its own page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?face=paper&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.rail-home')).toHaveCount(0)
})

test('a wide screen keeps the sideways row it always had', async ({ page }) => {
  await home(page, 1440, 900)
  await expect(page.locator('.bento-left')).toBeHidden()
  expect(await page.evaluate(() => { const r = document.querySelector('.bento')!; return r.scrollWidth > r.clientWidth })).toBe(true)
})

/* A tablet held tall (size rule 2, DockB-Tablet): from 640 wide a screen taller than wide is arranged as the 10-inch
   hung tall, asked for by nothing, with the clock rather than the phone's top row. On its side, or under 640, it
   keeps what it had. */
for (const [w, h] of [[820, 1180], [640, 900]]) {
  test(`a tablet held tall at ${w} by ${h} gets the home three across above the dock, not the phone page`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/?face=paper&at=19:40', { waitUntil: 'networkidle' })
    await expect(page.locator('.bento-card').first()).toBeVisible()
    await page.waitForTimeout(1400)
    await expect(page.locator('.topbar-clock')).toBeVisible()
    const cards = await boxes(page)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.bento')!).gridTemplateColumns.split(' ').length)).toBe(3)
    const dock = (await page.locator('.dock-body').boundingBox())!
    for (const b of cards) {
      expect(b.right).toBeLessThanOrEqual(w)
      expect(b.bottom).toBeLessThanOrEqual(dock.y)
    }
  })
}

test('just under 640 held tall is still a phone, and so is a phone on its side', async ({ page }) => {
  for (const [w, h] of [[639, 1000], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/?face=paper&at=19:40', { waitUntil: 'networkidle' })
    await expect(page.locator('.dock-body')).toBeVisible()
    await expect(page.locator('.rail-home')).toHaveCount(0)
  }
})

test('a tablet turned on its side keeps the sideways row', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 })
  await page.goto('/?face=paper&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.bento-card').first()).toBeVisible()
  await page.waitForTimeout(1400)
  expect(await page.evaluate(() => { const r = document.querySelector('.bento')!; return r.scrollWidth > r.clientWidth })).toBe(true)
})
