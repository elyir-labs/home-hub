// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A speaker's card with a song on it (design/speaker-card/, A, decided 20 November 2026): the cover a square beside
   the words, on the same cover blurred, back, pause, next and the volume, and no sounds while the song plays. Every
   word is read against the blurred cover with a bright cover and a dark one (readable.ts). The covers are made up. */
import { expect, test } from '@playwright/test'
import { unreadable } from './readable'

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })

const COVERS = {   // a 2x2 picture of each, as a PNG: near-white (the hard case) and near-black
  bright: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8+vkdAwMDEwMYAAAiOQLaR4OCZwAAAABJRU5ErkJggg==',
  dark: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGMU4hNgYGBgYgADAAJsADQ559FgAAAAAElFTkSuQmCC',
}
for (const [cover, png] of Object.entries(COVERS)) {
  test(`a song is its cover beside the words, readable on a ${cover} cover, with no sounds under it`, async ({ page }) => {
    await page.route('**/home', async r => {
      const res = await r.fetch(), home = await res.json()
      for (const d of home.rooms.find((x: any) => x.id === 'living').devices) if (d.id === 's1')
        Object.assign(d, { state: 'playing', attrs: { ...d.attrs, media_title: 'Slow Evening', media_artist: 'The Larkins', entity_picture: '/art.png' } })
      await r.fulfill({ response: res, json: home })
    })
    await page.route('**/devices/s1/image*', r => r.fulfill({ body: Buffer.from(png, 'base64'), contentType: 'image/png' }))
    await page.goto('/?at=10:10&room=living', { waitUntil: 'networkidle' })
    const card = page.locator('.tile.media.record')
    await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(600)
    const name = (await card.locator('.tile-name').boundingBox())!, title = (await card.locator('.media-title').boundingBox())!
    expect(name.y + name.height).toBeLessThanOrEqual(title.y + 1)          // the name sits above the title, never under it
    const art = (await card.locator('.media-art').boundingBox())!
    expect(art.width).toBeLessThan(120)                                    // the cover is a square beside the words
    await expect(card.locator('.sounds')).toHaveCount(0)
    await expect(card.locator('.vol')).toBeVisible()
    expect(await unreadable(page, '.tile.media.record')).toEqual([])
  })
}

test('a quiet speaker keeps its sounds, as it did', async ({ page }) => {
  await page.route('**/home', async r => {
    const res = await r.fetch(), home = await res.json()
    for (const d of home.rooms.find((x: any) => x.id === 'living').devices) if (d.id === 's1')
      Object.assign(d, { state: 'idle', attrs: { volume_level: 0.2, music: true } })
    await r.fulfill({ response: res, json: home })
  })
  await page.goto('/?at=10:10&room=living', { waitUntil: 'networkidle' })
  await expect(page.locator('.tile.media:not(.record)').filter({ hasText: 'Sonos' }).locator('.sounds')).toHaveCount(1)
})
