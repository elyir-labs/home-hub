// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Morning and night (design/tv-moments/, decided 20 November 2026: morning A, with the night line). The first rest after
   first light greets with the day's line, and a key sends it back to the photos; Bedtime carries the evening's line, and
   after it is pressed that line is the last thing on the screen before the TV goes off. */
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

test('the first rest after first light is the morning card, and a key sends it back to the photos', async ({ page }) => {
  await page.goto('/?tv=1&room=living&rest=1&at=07:02', { waitUntil: 'networkidle' })
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'morning')
  await expect(page.locator('.tvrest-morning')).toContainText('Good morning')
  await expect(page.locator('.tvrest-morning-line')).not.toBeEmpty()
  await expect(page.locator('.tvrest-morning-foot')).toContainText("Sam's birthday in 3 days")
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'photos')
})

test('Bedtime carries the evening line, and after it the line alone is the last thing before the TV goes off', async ({ page }) => {
  const asked: string[] = []
  await page.route('**/home/intent/**', r => { asked.push(r.request().url()); return r.fulfill({ json: { ok: true } }) })
  await page.route('http://127.0.0.1:8380/**', r => { asked.push(r.request().url()); return r.fulfill({ json: { ok: true } }) })
  await page.goto('/?tv=1&room=living&rest=1&at=23:10', { waitUntil: 'networkidle' })
  await expect(page.locator('.tvrest-evening')).not.toBeEmpty()
  const line = await page.locator('.tvrest-evening').textContent()
  await page.keyboard.press('Enter')
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'night')
  await expect(page.locator('.tvrest-goodnight-line')).toHaveText(line!)
  expect(asked.some(u => u.endsWith('/sleep'))).toBe(false)
  await expect.poll(() => asked.some(u => u.endsWith('/sleep')), { timeout: 10_000 }).toBe(true)
})

test('a phone leaves a line for the morning, and a screen\'s lines can be turned off', async ({ page }) => {
  const sent: any[] = []
  await page.route('**/board/mornings', async r => { sent.push(r.request().postDataJSON()); return r.fallback() })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?sheet=photos&at=21:30', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Leave a line for the morning' }).click()
  await page.getByLabel('What it says').fill('Proud of you for today.')
  await page.getByRole('button', { name: 'Leave it for the morning' }).click()
  await expect(page.locator('.photos-screens li', { hasText: 'Proud of you for today.' })).toContainText('For the morning')
  expect(sent[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  const row = page.locator('.photos-screens li', { hasText: 'Proud of you for today.' })
  await row.getByRole('button', { name: 'Take down' }).click()
  await expect(row).toContainText('Taken down')

  await page.locator('.photos-screens li', { hasText: 'Living room TV' }).click()
  await page.getByRole('switch', { name: 'A line for the day' }).click()
  await expect(page.getByRole('switch', { name: 'A line for the day' })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('switch', { name: 'A line for the day' }).click()   // the mock remembers; leave it as found
})
