// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Paintings on a resting screen (design/tv-art/, decided 20 November 2026: C, and a channel too). A painting opens close
   on one part, pulls back to the whole uncropped, and only then says what it is; a screen can show nothing but
   paintings, one at a time; and a screen's page has the switch and the choice. The paintings are routed here, so the
   test needs no download. */
import { expect, test, type Page } from '@playwright/test'

const PAINTINGS = [
  { id: 'field', title: 'Wheat Field with Cypresses', painter: 'Vincent van Gogh', year: '1889', museum: 'The Metropolitan Museum of Art',
    line: 'Painted in the summer of 1889, near Saint-Rémy in the south of France.', w: 4, h: 3, focus: [0.23, 0.52] },
  { id: 'harbor', title: 'A Harbor', painter: 'A painter', year: 'about 1670', museum: 'Art Institute of Chicago', line: '', w: 3, h: 4, focus: null },
]
const PICTURE = "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='#6b7a5a'/></svg>"

async function house(page: Page, me: Record<string, unknown>) {
  await page.route('**/screens/me', r => r.fulfill({ json: { id: 'x', room: 'living', room_name: 'Living room', tv: true, by: 'screen', photos: true,
    play: 'each', shows: 'photos', notes: false, lines: false, today: false, facts: false, jokes: false, quotes: false, art: true, ...me } }))
  await page.route(/\/art$/, r => r.fulfill({ json: { paintings: PAINTINGS, have: 2, of: 2, bytes: 900_000, getting: false, failed: false } }))
  await page.route(/\/art\/[^/]+$/, r => r.fulfill({ contentType: 'image/svg+xml', body: PICTURE }))
}

test.describe('on the TV', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('a painting between the photos opens close, pulls back to the whole, then says what it is', async ({ page }) => {
    await house(page, {})
    await page.goto('/?tv=1&screen=1&room=living&rest=1&at=19:40&beat=art', { waitUntil: 'networkidle' })
    await expect(page.locator('.tvrest-plaque-title')).toHaveText('Wheat Field with Cypresses')
    await expect(page.locator('.tvrest-plaque-by')).toHaveText('Vincent van Gogh, 1889')
    await expect(page.locator('.tvrest-plaque-line')).toContainText('Saint-Rémy')
    await expect(page.locator('.tvrest-plaque-from')).toHaveText('The Metropolitan Museum of Art')
    await expect(page.locator('.tvrest-painting-look')).toHaveCSS('transform-origin', /^253px/)   // 23% of an 1100-wide painting
    /* where the look and the label are at four moments of the story, read in the page rather than from a screenshot */
    await page.evaluate(() => document.getAnimations().forEach(a => a.pause()))
    const story = []
    for (const ms of [1_000, 7_000, 13_500, 16_000]) {
      await page.evaluate(t => document.getAnimations().forEach(a => { a.currentTime = t }), ms)
      story.push(await page.evaluate(() => ({
        scale: Math.round(new DOMMatrix(getComputedStyle(document.querySelector('.tvrest-painting-look')!).transform).a * 10) / 10,
        label: Number(getComputedStyle(document.querySelector('.tvrest-plaque')!).opacity),
      })))
    }
    expect(story[0]).toEqual({ scale: 2.6, label: 0 })
    expect(story[1]).toEqual({ scale: 2.6, label: 0 })
    expect(story[2].scale).toBe(1)
    expect(story[3]).toEqual({ scale: 1, label: 1 })
    const box = await page.locator('.tvrest-painting').boundingBox()
    expect(Math.round(box!.width / box!.height * 100) / 100).toBeCloseTo(4 / 3, 1)
    await expect(page.locator('.tvrest-cardclock')).toBeVisible()
  })

  test('a screen that shows art rests on one painting at a time, with the clock small beside it', async ({ page }) => {
    await house(page, { shows: 'art', art: false })
    await page.goto('/?tv=1&screen=1&room=living&rest=1&at=19:40', { waitUntil: 'networkidle' })
    await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'art')
    await expect(page.locator('.tvrest-plaque')).toHaveCount(1)
    await expect(page.locator('.tvrest-plaque-title')).toHaveText(/Wheat Field with Cypresses|A Harbor/)
    await expect(page.locator('.tvrest-cardclock .tvrest-time')).toBeVisible()
    await expect(page.locator('.tvrest-slide')).toHaveCount(0)
  })

  test('a screen set to art that has no paintings yet keeps to its photos', async ({ page }) => {
    await house(page, { shows: 'art' })
    await page.route(/\/art$/, r => r.fulfill({ json: { paintings: [], have: 0, of: 60, bytes: 25_000_000, getting: true, failed: false } }))
    await page.goto('/?tv=1&screen=1&room=living&rest=1&at=19:40', { waitUntil: 'networkidle' })
    await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'photos')
  })
})

test('a wall screen set to art rests on the paintings too, with nothing about a remote', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await house(page, { tv: false, shows: 'art' })
  await page.goto('/?screen=1&room=living&rest=1&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.tvrest')).toHaveAttribute('data-face', 'art')
  await expect(page.locator('.tvrest-ok')).toHaveCount(0)
})

test('a screen\'s page offers Art between the photos, off to start, and as what it shows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(/\/art$/, r => r.fulfill({ json: { paintings: [], have: 0, of: 60, bytes: 25_400_000, getting: false, failed: false } }))
  await page.goto('/?sheet=photos&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.photos-screens li', { hasText: 'Kitchen' }).click()
  const art = page.getByRole('switch', { name: 'Art' })
  await expect(art).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.photos-screens li', { hasText: 'A painting every few photos' })).toContainText('from museums’ free collections')
  await expect(page.locator('.photos-art-foot')).toContainText('downloads the paintings once')
  await page.getByRole('button', { name: 'Art', exact: true }).click()
  await expect(page.locator('.photos-play-row').first()).toContainText('one painting at a time, all day')
  await expect(page.getByRole('switch', { name: 'Photos' })).toHaveCount(0)
  await expect(art).toHaveCount(0)
  await page.getByRole('button', { name: 'Photos', exact: true }).click()   // the mock remembers; leave it as found
  await expect(page.getByRole('switch', { name: 'Photos' })).toBeVisible()
})

test('a hub whose code has no paintings yet offers no art', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(/\/art$/, r => r.fulfill({ json: { paintings: [], have: 0, of: 0, bytes: 0, getting: false, failed: false } }))
  await page.goto('/?sheet=photos&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.photos-screens li', { hasText: 'Kitchen' }).click()
  await expect(page.getByRole('switch', { name: 'Jokes' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Art' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Art', exact: true })).toHaveCount(0)
})
