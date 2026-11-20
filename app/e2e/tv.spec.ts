// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The house on a TV, worked with a remote (design/living-room/, B with C's band, decided 19 November 2026).
 * The rows are pinned in the order RowsB drew them, the highlight has to move the way the arrows point, and a
 * resting TV has to raise the band on OK with Up and Down as the level. Device and scene requests are answered
 * here, so the mock house every other spec reads is left as it was. */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

const asked: string[] = []
async function tv(page: Page, rest = false) {
  asked.length = 0
  await page.route('**/devices/*/*', r => r.request().method() === 'POST'
    ? (asked.push(new URL(r.request().url()).pathname + ' ' + (r.request().postData() ?? '')), r.fulfill({ status: 200, body: '{}' }))
    : r.fallback())
  await page.route('**/rooms/*/intent/*', r => (asked.push(new URL(r.request().url()).pathname), r.fulfill({ status: 200, body: '{}' })))
  await page.goto(`/?tv=1&room=living&at=19:40${rest ? '&rest=1' : ''}`, { waitUntil: 'networkidle' })
}
const lit = (page: Page) => page.locator('[data-lit]')

test('the TV opens on its own room, in the rows RowsB drew', async ({ page }) => {
  await tv(page)
  await expect(page.locator('.tv-title h1')).toHaveText('Living room')
  await expect(page.locator('.tv-row h2')).toHaveText(['In the living room', 'Scenes here', 'Other rooms', 'Cameras', 'This house'])
  await expect(lit(page)).toContainText('Ceiling light')
  await expect(page.locator('.tv-hint')).toContainText('Turn off')
  // nothing a person must read from the sofa is under 22px
  const small = await page.locator('.tv-nm, .tv-st, .tv-hint').evaluateAll(es => es.filter(e => parseFloat(getComputedStyle(e).fontSize) < 22).length)
  expect(small).toBe(0)
})

test('the arrows move the highlight the way they point, and OK does what the hint says', async ({ page }) => {
  await tv(page)
  await page.keyboard.press('ArrowRight')
  await expect(lit(page)).toContainText('Floor lamp')
  await page.keyboard.press('ArrowLeft')
  await expect(lit(page)).toContainText('Ceiling light')
  await page.keyboard.press('Enter')
  await expect(lit(page)).toContainText('Off')                  // turned off, and still where it was, still lit
  await expect(lit(page)).toContainText('Ceiling light')
  expect(asked.some(a => /\/off /.test(a))).toBe(true)
  await page.keyboard.press('ArrowDown')
  await expect(lit(page)).toContainText('Movie')
  await expect(page.locator('.tv-row').first()).toHaveClass(/gone/)   // the row above slides away
})

test('another room is a press away, and Back comes home', async ({ page }) => {
  await tv(page)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
  await expect(lit(page)).toContainText('Kitchen')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tv-title h1')).toHaveText('Kitchen')
  await page.keyboard.press('Escape')
  await expect(page.locator('.tv-title h1')).toHaveText('Living room')
})

test('holding OK opens a thing, and Back returns to the card that opened it', async ({ page }) => {
  await tv(page)
  await page.keyboard.down('Enter'); await page.waitForTimeout(700); await page.keyboard.up('Enter')
  await expect(page.locator('.opened')).toBeVisible()
  expect(asked).toEqual([])                                     // a hold opens; it never also toggles
  await page.keyboard.press('Escape')
  await expect(page.locator('.opened')).toHaveCount(0)
  await expect(lit(page)).toContainText('Ceiling light')
})

test('a resting TV raises the room as a band on OK; Up and Down are the level, Back puts it away', async ({ page }) => {
  await tv(page, true)
  await expect(page.locator('.idle-remote')).toContainText('The living room')
  await page.keyboard.press('ArrowLeft')                        // nothing but OK, Up, Down and Home does anything at rest
  await expect(page.locator('.tvb-band')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('.tvb-band')).toBeVisible()
  await expect(lit(page)).toContainText('Ceiling light')
  await expect(lit(page)).toContainText('On, 35%')
  await page.keyboard.press('ArrowUp')
  await expect(lit(page)).toContainText('On, 45%')
  expect(asked.at(-1)).toMatch(/\/on .*"brightness_pct":45/)
  await page.keyboard.press('F3')                               // yellow: Sleep, the same color in every room
  await expect.poll(() => asked.at(-1)).toMatch(/intent\/asleep$/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.tvb-band')).toHaveCount(0)
  await expect(page.locator('.idle')).toBeVisible()
})

test('Other rooms on the band wakes the TV to its rows', async ({ page }) => {
  await tv(page, true)
  await page.keyboard.press('Enter')
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight')
  await expect(lit(page)).toContainText('Other rooms')
  await page.keyboard.press('Enter')
  await expect(page.locator('.idle')).toHaveCount(0)
  await expect(page.locator('.tv-title h1')).toHaveText('Living room')
})
