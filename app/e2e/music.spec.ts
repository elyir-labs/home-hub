// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Music in every room, in the built panel (design/music/RoomA and PhoneA, A with C's sentences, picked 20 October).

   A quiet speaker the hub can play on says so on its own card -- Play something, and the room's last two things
   again -- and Play something opens one pane over the room: what to play on one side, which rooms on the other,
   with this room already ticked. These pin what the board argues and what tests/music.test.ts cannot see: that
   the card is where it starts, that the pane remembers which room it came from, and that a tap plays in the rooms
   that are ticked. */
import { expect, test } from '@playwright/test'

const WALL = '/?face=glass&layout=wall&nav=top&at=19:40'

test('a quiet speaker offers Play something, and the pane opens on its own room, ticked first', async ({ page }) => {
  await page.goto(`${WALL}&room=kitchen`, { waitUntil: 'networkidle' })
  const card = page.locator('.tile.media', { has: page.getByRole('button', { name: 'Play something' }) })
  await expect(card.getByRole('button', { name: 'Play something' })).toBeVisible()
  await card.getByRole('button', { name: 'Play something' }).click()
  const pane = page.getByRole('dialog', { name: 'Play in the kitchen' })
  await expect(pane).toBeVisible()
  const rooms = pane.locator('.music-pane-room')
  await expect(rooms.first()).toContainText('Kitchen')
  await expect(rooms.first()).toContainText('This room')
  await expect(rooms.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(rooms.last()).toContainText('Everywhere')
  // what to play is on the left of where, as drawn
  const what = (await pane.locator('.music-pane-what').boundingBox())!, where = (await pane.locator('.music-pane-where').boundingBox())!
  expect(what.x + what.width).toBeLessThanOrEqual(where.x)
})

test('a tap plays it in the rooms that are ticked, and the pane goes', async ({ page }) => {
  await page.goto(`${WALL}&room=kitchen&music=kitchen`, { waitUntil: 'networkidle' })
  const pane = page.getByRole('dialog', { name: 'Play in the kitchen' })
  await pane.locator('.music-pane-room', { hasText: 'Living room' }).click()
  const sent = page.waitForRequest(r => r.url().endsWith('/music/play') && r.method() === 'POST')
  await pane.locator('[data-shelf="radio"]').getByRole('button', { name: 'Morning news' }).click()
  const body = (await sent).postDataJSON()
  expect(body.item.name).toBe('Morning news')
  expect(body.rooms).toEqual(['kitchen', 'living'])          // the room it was opened from leads
  expect(body.everywhere).toBe(false)
  await expect(pane).toBeHidden()
})

test('Everywhere is every speaker, whatever was ticked', async ({ page }) => {
  await page.goto(`${WALL}&room=kitchen&music=kitchen`, { waitUntil: 'networkidle' })
  const pane = page.getByRole('dialog', { name: 'Play in the kitchen' })
  await pane.locator('.music-pane-room', { hasText: 'Everywhere' }).click()
  await expect(pane.locator('.music-pane-room', { hasText: 'Kitchen' })).toHaveAttribute('aria-pressed', 'false')
  const sent = page.waitForRequest(r => r.url().endsWith('/music/play'))
  await pane.locator('[data-shelf="radio"]').getByRole('button', { name: 'Classical' }).click()
  expect((await sent).postDataJSON().everywhere).toBe(true)
})

test('the last two things are on the card, and one tap plays one again in that room', async ({ page }) => {
  await page.goto(`${WALL}&room=kitchen`, { waitUntil: 'networkidle' })
  const card = page.locator('.tile.media', { has: page.getByRole('button', { name: 'Play something' }) })
  await expect(card.locator('.music-again')).toHaveText(['Late-night jazz', 'Morning news'])
  const sent = page.waitForRequest(r => r.url().endsWith('/music/play'))
  await card.locator('.music-again', { hasText: 'Morning news' }).click()
  expect((await sent).postDataJSON().rooms).toEqual(['kitchen'])
})

test('a paused speaker keeps its own transport rather than offering something new', async ({ page }) => {
  await page.goto(`${WALL}&room=living`, { waitUntil: 'networkidle' })
  const sonos = page.locator('.tile.media', { hasText: 'Sonos' })
  await expect(sonos.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect(sonos.getByRole('button', { name: 'Play something' })).toHaveCount(0)
})

test('on a phone the same pane comes up from the foot, the rooms a row under what to play', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto('/?face=glass&at=19:40&room=kitchen&music=kitchen', { waitUntil: 'networkidle' })
  const pane = page.locator('.music-pane')
  await expect(pane).toBeVisible()
  const box = (await pane.boundingBox())!
  expect(Math.round(box.y + box.height)).toBe(844)
  expect(box.width).toBe(390)
  const what = (await page.locator('.music-pane-what').boundingBox())!, where = (await page.locator('.music-pane-where').boundingBox())!
  expect(where.y).toBeGreaterThanOrEqual(what.y + what.height - 1)
  await page.close()
})
