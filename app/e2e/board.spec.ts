// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Notes and countdowns, and the family board (design/tv-moments/, decided 20 November 2026: cards A, with the board as a
   choice per screen). A phone leaves a note and a countdown and takes one down without it vanishing; a screen set to the
   board rests on it, on the TV and on a wall. */
import { expect, test } from '@playwright/test'

test('a phone leaves a note and a countdown, and one taken down keeps its row with Put it back', async ({ page }) => {
  const sent: any[] = []
  await page.route('**/board/**', async r => { if (r.request().method() === 'POST') sent.push(r.request().postDataJSON()); return r.fallback() })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?sheet=photos&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.photos-screens li', { hasText: 'Dinner at 7. Love, Mom' })).toContainText("from Mom's phone")
  await expect(page.locator('.photos-screens li', { hasText: "Sam's birthday" })).toContainText('In 3 days · every year')

  await page.getByRole('button', { name: 'Leave a note' }).click()
  await page.getByLabel('What it says').fill('Back by 6')
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  await page.getByRole('button', { name: 'Put it on the screens' }).click()
  await expect(page.locator('.photos-screens li', { hasText: 'Back by 6' })).toBeVisible()
  expect(sent[0].text).toBe('Back by 6')
  expect(sent[0].until).toBeGreaterThan(Date.now() / 1000 + 86400 - 60)

  await page.getByRole('button', { name: 'Add a countdown' }).click()
  await page.getByLabel('What').fill('Our anniversary')
  await expect(page.getByText('Every year, since it’s an anniversary.')).toBeVisible()
  await page.getByLabel('When').fill('2026-12-12')
  await page.getByRole('button', { name: 'Add the countdown' }).click()
  await expect(page.locator('.photos-screens li', { hasText: 'Our anniversary' })).toBeVisible()

  const row = page.locator('.photos-screens li', { hasText: 'Piano at 4 on Saturday' })
  await row.getByRole('button', { name: 'Take down' }).click()
  await expect(row).toContainText('Taken down')
  await row.getByRole('button', { name: 'Put it back' }).click()
  await expect(page.locator('.photos-screens li', { hasText: 'Piano at 4 on Saturday' })).not.toContainText('Taken down')
})

test('a screen\'s own page sets it to the family board, and then the notes switch is not needed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?sheet=photos&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.photos-screens li', { hasText: 'Kitchen' }).click()
  await expect(page.getByRole('switch', { name: 'Notes and countdowns' })).toBeVisible()
  await page.getByRole('button', { name: 'The family board' }).click()
  await expect(page.getByRole('switch', { name: 'Notes and countdowns' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Your screens' }).click()
  await expect(page.locator('.photos-screens li', { hasText: 'Kitchen' })).toContainText('shows the family board')
  await page.locator('.photos-screens li', { hasText: 'Kitchen' }).click()           // the mock remembers; leave the kitchen as it was
  await page.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Notes and countdowns' })).toBeVisible()
})

for (const [where, q, size] of [['the TV', '?tv=1&screen=1&room=living&rest=1&at=19:40', { width: 1920, height: 1080 }], ['a wall', '?screen=1&rest=1&at=19:40', { width: 1440, height: 900 }]] as const) {
  test(`${where} set to the family board rests on the notes, what is coming up, and a photo`, async ({ page }) => {
    await page.route('**/screens/me', r => r.fulfill({ json: { id: 'x', room: 'living', room_name: 'Living room', tv: where === 'the TV', by: 'screen', photos: true, play: 'days', shows: 'board', notes: true } }))
    await page.setViewportSize(size)
    await page.goto(`/${q}`, { waitUntil: 'networkidle' })
    await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'board')
    await expect(page.locator('.tvrest-boardnotes')).toContainText('Dinner at 7. Love, Mom')
    await expect(page.locator('.tvrest-coming')).toContainText("Sam's birthday")
    await expect(page.locator('.tvrest-boardphoto img')).toBeVisible()
  })
}
