// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A room on a tall screen and a phone (design/every-screen/, room A, chosen 1 November 2026): laid out the way
   Your evening is on the same shape. The scenes are pills under the room's name, what is playing goes across the
   top, the lamp doing the lighting is two rows tall, two across on a phone and a 7-inch, three on the 10-inch,
   and on the narrow two a lamp that is off is a short bar at the end. The wall keeps the room it had. */
import { expect, test, type Page } from '@playwright/test'

async function room(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto('/?face=paper&nav=top&room=living&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.tiles > .tile').first()).toBeVisible()
}

const cells = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.tiles > .tile')].map(t => {
  const b = t.getBoundingClientRect()
  return { cls: t.className, size: (t as HTMLElement).dataset.size, quiet: (t as HTMLElement).dataset.quiet !== undefined,
           left: b.left, right: b.right, top: b.top, width: b.width, height: b.height }
}))

for (const [name, w, h, across] of [['a 7-inch hung tall', 579, 1029, 2], ['a phone', 390, 844, 2], ['the 10-inch hung tall', 900, 1440, 3]] as const) {
  test(`on ${name} the scenes are pills under the name and the room is ${across} across`, async ({ page }) => {
    await room(page, w, h)
    await expect(page.locator('.room-head .scenes-pills .scene').first()).toBeVisible()
    await expect(page.locator('.room-scenes')).toHaveCount(0)
    const cs = await cells(page)
    expect(new Set(cs.map(c => Math.round(c.left))).size).toBe(across)
    for (const c of cs) expect(c.right).toBeLessThanOrEqual(w)
    const tv = cs.find(c => c.size === 'full')!
    const one = cs.find(c => c.size === 'third' && !c.quiet)!
    expect(tv.width, 'what is playing goes across').toBeGreaterThan(one.width * (across - 1))
    const lamp = cs.find(c => c.size === 'half')!
    expect(lamp.height, 'the lamp doing the lighting is two rows tall').toBeGreaterThan(one.height * 1.8)
  })
}

for (const [name, w, h] of [['a 7-inch hung tall', 579, 1029], ['a phone', 390, 844]] as const) {
  test(`on ${name} a lamp that is off is a short bar across the end`, async ({ page }) => {
    await room(page, w, h)
    const cs = await cells(page)
    const off = cs.find(c => c.quiet && c.cls.includes('light'))!
    expect(off).toBeTruthy()
    expect(off.top).toBe(Math.max(...cs.map(c => c.top)))
    expect(off.width).toBeGreaterThan(w * 0.8)
    expect(off.height).toBeLessThan(100)
  })
}

test('the wall keeps its scenes card and its sideways room', async ({ page }) => {
  await room(page, 1440, 900)
  await expect(page.locator('.room-scenes')).toBeVisible()
  await expect(page.locator('.scenes-pills')).toHaveCount(0)
})
