// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Photos, on a phone (design/tv-photos/PageA, decided 20 November 2026 with C): the page lists what the TV
   has, Add photos sends one redrawn on the phone with its size beside it, and a tapped photo comes off the TV. */
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('a phone adds a photo, sees whose each one is, and takes one off the TV', async ({ page }) => {
  const sent: { headers: Record<string, string>; size: number }[] = []
  const removed: string[] = []
  await page.route('**/photos', async r => {
    if (r.request().method() !== 'POST') return r.fallback()
    sent.push({ headers: r.request().headers(), size: r.request().postDataBuffer()?.length ?? 0 })
    return r.fulfill({ json: { id: 'new1', kind: 'jpg', added: Date.now() / 1000, taken: null, by: 'This phone', w: 64, h: 48 } })
  })
  await page.route('**/photos/*', r => { if (r.request().method() === 'DELETE') { removed.push(r.request().url()); return r.fulfill({ json: { ok: true } }) } return r.fallback() })
  await page.goto('/?sheet=photos&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.photos-count:not(.photos-on-head)')).toContainText('3 photos')
  await expect(page.locator('.photos-count:not(.photos-on-head)')).toContainText('from 2 phones')

  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 48
    const g = c.getContext('2d')!; g.fillStyle = '#d98a72'; g.fillRect(0, 0, 64, 48)
    return [...new Uint8Array(await (await new Promise<Blob>(done => c.toBlob(b => done(b!), 'image/png'))).arrayBuffer())]
  })
  await page.locator('.photos-input').setInputFiles({ name: 'beach.png', mimeType: 'image/png', buffer: Buffer.from(png) })
  await expect(page.locator('.photos-count:not(.photos-on-head)')).toContainText('4 photos')
  expect(sent).toHaveLength(1)
  expect(sent[0].headers['content-type']).toBe('image/jpeg')
  expect([sent[0].headers['x-width'], sent[0].headers['x-height']]).toEqual(['64', '48'])

  await page.locator('.photos-cell').nth(1).click()
  await expect(page.locator('.photos-sheet')).toContainText("From Sam's phone")
  await page.getByRole('button', { name: 'Take off the TV' }).click()
  await expect(page.locator('.photos-sheet')).toHaveCount(0)
  await expect(page.locator('.photos-count:not(.photos-on-head)')).toContainText('3 photos')
  expect(removed[0]).toMatch(/\/photos\/coast$/)
})
