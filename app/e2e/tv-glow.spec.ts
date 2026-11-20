// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Setting up the light behind the TV from the sofa (design/tv-glow/, A, decided 20 November 2026): the TV shows four
   white corners for the camera to find, the strip runs a light from its start, and the TV asks which corner and which
   way; a camera that cannot find the screen says what to try. The house's answers and the camera helper on the hub
   (startup/glow.py) are answered here: the pretend house has no strip and no camera. */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })
const STRIP = { strip: 'ab12', run: 0, light: 'l9', name: 'Behind the TV', lights: 60, reachable: true }
const TARGET = { host: '192.168.1.57', port: 21325, key: '0011223344556677', run: 0 }

async function house(page: Page, corners: number[][] | null) {
  const asked: { path: string; body: any }[] = []
  await page.route('**/glow**', r => r.request().method() === 'POST'
    ? r.fulfill({ json: { glow: { strip: 'ab12', run: 0, on: true }, target: TARGET } })
    : r.fulfill({ json: { glow: {}, choices: [STRIP], target: null } }))
  await page.route('http://127.0.0.1:8397/**', async r => {
    const u = new URL(r.request().url()), body = r.request().postDataJSON()
    asked.push({ path: u.pathname + u.search, body })
    if (u.pathname === '/find') return r.fulfill({ json: u.search.includes('lit') ? { ok: true } : { corners } })
    if (u.pathname === '/save') return r.fulfill({ json: { path: ['left-up', 'top-right', 'right-down'] } })
    return r.fulfill({ json: { ok: true } })
  })
  return asked
}

test('a strip in the TV\'s room brings its setup to the house\'s row', async ({ page }) => {
  await house(page, null)
  await page.goto('/?tv=1&room=living&at=21:10', { waitUntil: 'networkidle' })
  await expect(page.locator('.tv-card', { hasText: 'Light behind the TV' })).toHaveCount(1)
})

test('the TV finds itself, asks which way the strip runs, and keeps the answers', async ({ page }) => {
  const SQUARE = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]
  const asked = await house(page, SQUARE)
  await page.goto('/?tv=1&room=living&at=21:10&glow=1', { waitUntil: 'networkidle' })
  await expect(page.locator('.tvg-corner')).toHaveCount(4)
  await expect(page.locator('.tvg h1')).toHaveText('Finding the screen')
  await expect(page.locator('.tvg h1')).toHaveText('Where did the light start?', { timeout: 10000 })
  expect(asked.find(a => a.path === '/chase')?.body).toEqual({ target: TARGET, lights: 60 })
  await page.getByRole('button', { name: 'Bottom left' }).click()
  await page.getByRole('button', { name: 'Up first' }).click()
  await expect(page.locator('.tvg-q')).toHaveText('Along the bottom too?')
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await expect(page.locator('.tvg h1')).toHaveText('The light behind the TV follows the picture')
  expect(asked.find(a => a.path === '/save')?.body).toEqual({ corners: SQUARE, start: 'bottom-left', first: 'up', bottom: false, lights: 60, target: TARGET })
  await page.keyboard.press('Escape')
  await expect(page.locator('.tvg')).toHaveCount(0)
})

test('a camera that cannot find the screen says what to try, and Try again looks again', async ({ page }) => {
  const asked = await house(page, null)
  await page.goto('/?tv=1&room=living&at=21:10&glow=1', { waitUntil: 'networkidle' })
  await expect(page.locator('.tvg h1')).toHaveText('Not this time', { timeout: 10000 })
  await expect(page.locator('.tvg-ask p')).toContainText("couldn't find the screen")
  const before = asked.filter(a => a.path.startsWith('/find')).length
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => asked.filter(a => a.path.startsWith('/find')).length, { timeout: 10000 }).toBeGreaterThan(before)
})
