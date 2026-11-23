// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Two speakers in a room playing one song (design/speaker-pair/, B with C, decided 20 November 2026). Until the household
   answers, the first leads and the other is a line under it, and the room asks once whether they are one pair; One pair
   makes them one card that plays, pauses and turns up together, Two speakers keeps two cards. Home says the song once.
   The pair's two speakers are made here from the pretend house's Sonos, and the answer is spoken back over the stream. */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })

let speak: (m: unknown) => void = () => {}
const pods: Record<string, any> = {}
async function twoPods(page: Page, attrs: (id: string) => Record<string, unknown> = () => ({})) {
  await page.routeWebSocket('**/stream', ws => { ws.connectToServer(); speak = m => ws.send(JSON.stringify(m)) })
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    const living = home.rooms.find((x: any) => x.id === 'living')
    const s1 = living.devices.find((d: any) => d.id === 's1')
    Object.assign(s1, { state: 'playing', name: 'Left Pod' }); s1.attrs = { ...s1.attrs, media_title: 'Drowning', media_artist: 'The Larkins', ...attrs('s1') }
    living.devices.push({ ...s1, id: 's2', name: 'Right Pod', attrs: { ...s1.attrs, ...attrs('s2') } })
    for (const d of living.devices) if (d.id === 'm1') d.state = 'off'
    pods.s1 = s1; pods.s2 = living.devices.find((d: any) => d.id === 's2')
    await r.fulfill({ response: res, json: home })
  })
}
const answered = (page: Page) => page.route('**/speakers/pair', async r => {
  const b = r.request().postDataJSON()
  for (const [id, other] of [[b.speakers[0], b.speakers[1]], [b.speakers[1], b.speakers[0]]]) {
    const d = { ...pods[id], attrs: { ...pods[id].attrs } }; delete d.attrs.pair; delete d.attrs.apart
    if (b.pair) d.attrs.pair = other; else d.attrs.apart = [other]
    speak({ type: 'device', device: d })
  }
  await r.fulfill({ json: { pairs: [] } })
})

test('unanswered, one leads and the other is a line under it, and the room asks once', async ({ page }) => {
  await twoPods(page)
  await page.goto('/?at=10:10&room=living', { waitUntil: 'networkidle' })
  await expect(page.locator('.tile.media').filter({ hasText: 'Drowning' })).toHaveCount(1)
  await expect(page.locator('.with-tile')).toContainText('Right Pod')
  await expect(page.locator('.with-tile')).toContainText('Playing with the Left Pod')
  await expect(page.locator('.pair-ask')).toContainText('Are these two one pair?')
  await page.locator('.pair-ask-back').click({ position: { x: 10, y: 10 } })    // not now
  await expect(page.locator('.pair-ask')).toHaveCount(0)
  await expect(page.locator('.with-tile')).toHaveCount(1)
})

test('One pair makes them one card, named for both, whose pause works both', async ({ page }) => {
  const acted: string[] = []
  await twoPods(page); await answered(page)
  await page.route('**/devices/*/*', r => r.request().method() === 'POST' ? (acted.push(new URL(r.request().url()).pathname), r.fulfill({ json: {} })) : r.fallback())
  await page.goto('/?at=10:10&room=living', { waitUntil: 'networkidle' })
  const sent = page.waitForRequest(r => r.url().endsWith('/speakers/pair'))
  await page.getByRole('button', { name: 'One pair' }).click()
  expect((await sent).postDataJSON()).toEqual({ speakers: ['s1', 's2'], pair: true })
  await expect(page.locator('.pair-ask')).toHaveCount(0)
  await expect(page.locator('.with-tile')).toHaveCount(0)
  const card = page.locator('.tile.media').filter({ hasText: 'Drowning' })
  await expect(card).toHaveCount(1)
  await expect(card.locator('.tile-name')).toHaveText('Left Pod and Right Pod')
  await card.getByRole('button', { name: 'Pause' }).click()
  await expect.poll(() => acted.filter(a => a.endsWith('/pause')).sort()).toEqual(['/devices/s1/pause', '/devices/s2/pause'])
})

test('Two speakers keeps two cards, and the room does not ask again', async ({ page }) => {
  await twoPods(page, id => ({ apart: [id === 's1' ? 's2' : 's1'] }))
  await page.goto('/?at=10:10&room=living', { waitUntil: 'networkidle' })
  await expect(page.locator('.tile.media').filter({ hasText: 'Drowning' })).toHaveCount(2)
  await expect(page.locator('.with-tile')).toHaveCount(0)
  await expect(page.locator('.pair-ask')).toHaveCount(0)
})

test('Home says the song once, for both speakers', async ({ page }) => {
  await twoPods(page)
  await page.goto('/?at=10:10', { waitUntil: 'networkidle' })
  await expect(page.locator('.onnow')).toContainText('Left Pod and Right Pod, Drowning')
  expect(((await page.locator('.onnow').textContent()) ?? '').split('Drowning').length - 1).toBe(1)
})

test.describe('on a wall or a computer', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' })

  test('Home\'s row gives the song one card, for both speakers', async ({ page }) => {
    await twoPods(page)
    await page.goto('/?at=10:10', { waitUntil: 'networkidle' })
    const row = page.locator('.bento')
    await expect(row.locator('.tile.media').filter({ hasText: 'Drowning' })).toHaveCount(1)
    await expect(row).not.toContainText('Right Pod')
  })
})
