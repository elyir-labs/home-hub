// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The day's fun cards between the photos (design/tv-moments/, decided 20 November 2026: cards A). The house today, a
   fact, a trivia question whose answer OK brings, a joke and a quote; and each screen's switches for them. ?beat= holds
   the TV on the first card of a kind, the way ?at= holds the clock. */
import { expect, test, type Page } from '@playwright/test'

const all = (page: Page) => page.route('**/screens/me', r => r.fulfill({ json: { id: 'x', room: 'living', room_name: 'Living room', tv: true, by: 'screen', photos: true,
  play: 'days', shows: 'photos', notes: true, lines: true, today: true, facts: true, jokes: true, quotes: true } }))

test.describe('on the TV', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('the house today says when the sun next sets or rises, and the moon', async ({ page }) => {
    await page.goto('/?tv=1&room=living&rest=1&at=14:00&beat=day', { waitUntil: 'networkidle' })
    await expect(page.locator('.tvrest-card')).toContainText('The house today')
    await expect(page.locator('.tvrest-card-big')).toContainText(/The sun (sets|rises) at/)
    await expect(page.locator('.tvrest-card-sub')).toContainText('moon tonight')
  })

  test('a trivia question keeps its answer for OK, and OK brings it', async ({ page }) => {
    await page.goto('/?tv=1&room=living&rest=1&at=19:40&beat=trivia', { waitUntil: 'networkidle' })
    await expect(page.locator('.tvrest-card')).toContainText('Who knows?')
    await expect(page.locator('.tvrest-answer')).toHaveCount(0)
    await expect(page.locator('.tvrest-ok')).toContainText('The answer')
    await page.keyboard.press('Enter')
    await expect(page.locator('.tvrest-answer')).toHaveText('Uranus')
    await expect(page.locator('.tvb-band')).toHaveCount(0)
  })

  test('a joke waits for its punchline, and a quote is said with who said it', async ({ page }) => {
    await all(page)
    await page.goto('/?tv=1&screen=1&room=living&rest=1&at=19:40&beat=joke', { waitUntil: 'networkidle' })
    await expect(page.locator('.tvrest-card-big')).toHaveText('What do you call a dinosaur that knows lots of words?')
    await expect(page.locator('.tvrest-ok')).toContainText('The punchline')
    await page.keyboard.press('Enter')
    await expect(page.locator('.tvrest-card-sub')).toHaveText('A thesaurus.')
    await page.goto('/?tv=1&screen=1&room=living&rest=1&at=19:40&beat=quote', { waitUntil: 'networkidle' })
    await expect(page.locator('.tvrest-card-big')).toHaveText('“Well done is better than well said.”')
    await expect(page.locator('.tvrest-card-sub')).toHaveText('Benjamin Franklin')
  })
})

test('a screen\'s own page has a switch for each kind of card, jokes and quotes off to start', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?sheet=photos&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.photos-screens li', { hasText: 'Kitchen' }).click()
  await expect(page.getByRole('switch', { name: 'The house today' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('switch', { name: 'A fact or a trivia question' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('switch', { name: 'Jokes' })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('switch', { name: 'Quotes' })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('switch', { name: 'Jokes' }).click()
  await expect(page.getByRole('switch', { name: 'Jokes' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('switch', { name: 'Jokes' }).click()   // the mock remembers; leave it as found
  await expect(page.getByRole('switch', { name: 'Jokes' })).toHaveAttribute('aria-checked', 'false')
})
