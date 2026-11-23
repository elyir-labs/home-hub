// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A change made on a phone reaches a TV that is already resting (22 November 2026): photos switched to the board, or
   a photo added, used to wait until somebody woke the TV and it came back to rest. The hub says "rest" and the screen
   asks again for what it shows and its photos. */
import { expect, test } from '@playwright/test'

let speak: (m: unknown) => void = () => {}
test.use({ viewport: { width: 1920, height: 1080 } })

test('a resting TV switched to the board on a phone shows the board without being woken', async ({ page }) => {
  let shows = 'photos'
  await page.routeWebSocket('**/stream', ws => { ws.connectToServer(); speak = m => ws.send(JSON.stringify(m)) })
  await page.route('**/screens/me', async r => {
    const me = await (await r.fetch()).json()
    return r.fulfill({ json: { ...me, photos: true, shows } })
  })
  let photos = 0
  page.on('request', q => { if (new URL(q.url()).pathname === '/photos' && q.method() === 'GET') photos++ })
  await page.goto('/?screen=1&tv=1&room=living&rest=1&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'photos')
  const before = photos

  shows = 'board'
  speak({ type: 'rest' })
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'board')
  expect(photos, 'it asked for the photos again too, so one added on a phone shows').toBeGreaterThan(before)
})
