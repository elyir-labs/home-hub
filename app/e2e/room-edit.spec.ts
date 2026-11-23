// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Renaming and removing a room, under the room's own pencil (design/room-edit/, A, chosen 22 November).
 *
 * Pinned to the board: the heading is the field, the room's way out is the last thing on the screen after its
 * things, the question names where the things go before anything moves and the button says the whole act, and the
 * card left on the Rooms tab sits exactly where the room was and brings it back. These fail on purpose if the room
 * edit drifts from that.
 *
 * Its own mock on a port of its own: these rename and remove rooms, and the rest of the suite shares one house. */
import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 5183
const HUB = `http://localhost:${PORT}`
const MOCK = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock', 'brain.mjs')

test.use({ viewport: { width: 1440, height: 900 } })
test.describe.configure({ mode: 'serial' })

let mock: ChildProcess
test.beforeAll(async () => {
  mock = spawn(process.execPath, [MOCK], { env: { ...process.env, PORT: String(PORT), TZ: 'America/Chicago' }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(HUB)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('the room-edit mock did not start')
})
test.afterAll(() => { mock?.kill() })

async function roomsTab(page: Page) {
  await page.goto(`${HUB}/?nav=top&at=19:30`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /^Rooms$/ }).first().click()
  await expect(page.locator('.rooms-bento')).toBeVisible()
  await page.waitForTimeout(900)   // the house arriving
}
async function editRoom(page: Page, name: string) {
  await page.getByRole('button', { name: `Open ${name}` }).click()
  await page.locator('.room-edit').click()
  await expect(page.getByRole('textbox', { name: 'The room’s name' })).toHaveValue(name)
}

test('the heading is the field, and the room’s way out comes after everything in it', async ({ page }) => {
  await roomsTab(page)
  await editRoom(page, 'Kitchen')
  const last = await page.locator('.sort-scroll > *').last().getAttribute('class')
  expect(last).toContain('room-remove')
  const list = await page.locator('.sort').boundingBox(), out = await page.locator('.room-remove').boundingBox()
  expect(out!.y).toBeGreaterThan(list!.y + list!.height - 1)
})

test('a room is renamed where its name is, and a name the house has is refused in words', async ({ page }) => {
  await roomsTab(page)
  await editRoom(page, 'Office')
  const field = page.getByRole('textbox', { name: 'The room’s name' })
  await field.fill('Living room')
  await field.press('Enter')
  await expect(page.getByText('There’s already a Living room.')).toBeVisible()
  await expect(field).toHaveValue('Office')
  await field.fill('Study')
  await field.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Renamed to Study.' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.room-head h1')).toHaveText('Study')
})

test('removing asks where the things go first, and the button says the whole act', async ({ page }) => {
  await roomsTab(page)
  await editRoom(page, 'Kitchen')
  await page.getByRole('button', { name: 'Remove the Kitchen', exact: true }).click()
  const ask = page.locator('.room-remove')
  await expect(ask.getByText(/^Its \d+ things need a room first\. Where should they go\?$/)).toBeVisible()
  const go = ask.locator('.room-remove-go')
  await expect(go).toBeDisabled()
  await ask.getByRole('button', { name: 'Living room', exact: true }).click()
  await expect(go).toHaveText(/^Remove the Kitchen, move \d+ things to the Living room$/)
  await ask.getByRole('button', { name: 'Leave them to place later' }).click()
  await expect(go).toHaveText(/^Remove the Kitchen, leave \d+ things to place later$/)
  await ask.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByRole('button', { name: 'Remove the Kitchen', exact: true })).toBeVisible()
})

test('a removed room leaves its card where it was, drained, and Bring it back puts it back', async ({ page }) => {
  await roomsTab(page)
  const was = await page.locator('.rooms-bento > .room-cell').filter({ has: page.getByRole('button', { name: 'Open Kitchen' }) }).boundingBox()
  await editRoom(page, 'Kitchen')
  await page.getByRole('button', { name: 'Remove the Kitchen', exact: true }).click()
  await page.locator('.room-remove').getByRole('button', { name: 'Living room', exact: true }).click()
  await page.locator('.room-remove-go').click()

  const gone = page.locator('.room-gone')
  await expect(gone).toBeVisible()
  await page.waitForTimeout(1200)   // the house arriving again, from the right
  await expect(gone).toContainText('Kitchen')
  await expect(gone).toContainText(/Removed just now\. Its \d+ things are in the Living room\./)
  const at = await gone.boundingBox()
  expect([Math.round(at!.x), Math.round(at!.y), Math.round(at!.width), Math.round(at!.height)])
    .toEqual([Math.round(was!.x), Math.round(was!.y), Math.round(was!.width), Math.round(was!.height)])

  await gone.getByRole('button', { name: 'Bring it back' }).click()
  await expect(page.getByRole('button', { name: 'Open Kitchen' })).toBeVisible()
  await expect(page.locator('.room-gone')).toHaveCount(0)
})

test('an empty room is removed without a question about its things', async ({ page }) => {
  await roomsTab(page)
  await editRoom(page, 'Bathroom')
  await page.getByRole('button', { name: 'Remove the Bathroom', exact: true }).click()
  const ask = page.locator('.room-remove')
  await expect(ask.getByText('Nothing is in it.')).toBeVisible()
  await expect(ask.locator('.room-remove-to')).toHaveCount(0)
  await expect(ask.locator('.room-remove-go')).toHaveText('Remove the Bathroom')
  await expect(ask.locator('.room-remove-go')).toBeEnabled()
})
