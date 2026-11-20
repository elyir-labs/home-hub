// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A TV at rest (design/rest-tv/, decided 20 November 2026): the household's photos, the music while it plays and
   Goodnight at bedtime, each answering the remote the way its board says. The sky with no photos needs a house
   nobody has sent one to (PHOTOS=none), which this suite's mock is not, so tests/restTv.test.ts pins that rule. */
import { expect, test, type Page } from '@playwright/test'

let asked: string[] = []
async function rest(page: Page, at: string) {
  asked = []
  await page.route('**/home/intent/**', r => { asked.push(r.request().url()); return r.fulfill({ json: { ok: true } }) })
  await page.route('http://127.0.0.1:8380/**', r => { asked.push(r.request().url()); return r.fulfill({ json: { ok: true } }) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`/?tv=1&room=living&rest=1&at=${at}`, { waitUntil: 'networkidle' })
}

test('in the evening a resting TV shows the household\'s photos, whose phone each came from, and OK raises the room', async ({ page }) => {
  await rest(page, '19:40')
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'photos')
  await expect(page.locator('.tvrest-said')).toHaveText(/^\w+ \d{4} · from .+(phone|iPhone)$/)
  await expect(page.locator('.tvrest-ok')).toContainText('The living room')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tvb-band')).toBeVisible()
})

test('at bedtime it lists what is still on, Goodnight runs Bedtime and puts the TV to sleep', async ({ page }) => {
  await rest(page, '23:10')
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'goodnight')
  await expect(page.locator('.tvrest-left li').first()).toContainText('Living room')
  await page.keyboard.press('Enter')
  await expect.poll(() => asked.some(u => /home\/intent\/asleep$/.test(u))).toBe(true)
  await expect.poll(() => asked.some(u => u.endsWith('/sleep'))).toBe(true)
  await expect(page.locator('.tvb-band')).toHaveCount(0)
})

test('Not yet leaves the TV to its photos for the rest of the night', async ({ page }) => {
  await rest(page, '23:10')
  await page.keyboard.press('Escape')
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'photos')
  expect(asked).toEqual([])
})
