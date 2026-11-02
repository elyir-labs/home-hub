// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Start over, the last row of This hub (design/leaving/, B, decided 1 November 2026). The hub's half is faked at the
   routes: /reset is answered here, and /setup/status says the house is new once it has been asked. These pin that it
   says what goes before anything does, that a tap is not a hold, and that the wall opens on Welcome afterwards. */
import { test, expect, type Page } from '@playwright/test'

async function hub(page: Page) {
  const asked: string[] = []
  await page.route('**/reset', async r => { asked.push(r.request().method()); await r.fulfill({ json: { ok: true } }) })
  await page.route('**/setup/status', async r => {
    const real = await (await r.fetch()).json()
    await r.fulfill({ json: asked.length ? { ...real, setup_done: false, locked: false, owner: null, home: null } : real })
  })
  return asked
}

test('the last row of This hub, and its sheet says what goes before anything does', async ({ page }) => {
  const asked = await hub(page)
  await page.goto('/?sheet=hub&at=13:00')
  const rows = page.locator('.hub-rows > li')
  await expect(rows.last().locator('.hub-k')).toHaveText('Start over')
  await rows.last().getByRole('button', { name: 'Start over…' }).click()
  const sheet = page.getByRole('dialog', { name: 'Start over' })
  await expect(sheet.getByText(/Erased:.*Rooms, routines, phones, the passcode/)).toBeVisible()
  await expect(sheet.getByText(/have to be reset, one by one/)).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Back up first' })).toBeVisible()
  const hold = sheet.getByRole('button', { name: 'Hold to erase the hub' })
  const [box, label] = [(await hold.boundingBox())!, (await hold.locator('span').boundingBox())!]
  expect(Math.abs(box.x + box.width / 2 - (label.x + label.width / 2)), 'the words sit in the middle of the hold').toBeLessThan(2)
  await sheet.getByRole('button', { name: 'Hold to erase the hub' }).click()
  await page.waitForTimeout(400)
  expect(asked, 'a tap is not a hold').toEqual([])
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()
})

test('held, the hub is asked once, and the wall opens on Welcome when the hub answers as new', async ({ page }) => {
  const asked = await hub(page)
  await page.goto('/?sheet=hub&at=13:00')
  await page.locator('.hub-rows > li').last().getByRole('button', { name: 'Start over…' }).click()
  const hold = page.getByRole('button', { name: 'Hold to erase the hub' })
  const box = (await hold.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByRole('heading', { name: 'The hub is starting over.' })).toBeVisible({ timeout: 4000 })
  await page.mouse.up()
  expect(asked).toEqual(['POST'])
  await expect(page.getByRole('heading', { name: 'Welcome home.' })).toBeVisible({ timeout: 10_000 })
  expect(new URL(page.url()).search).toBe('')
})

test('without a passcode the hub refuses, and the sheet says why', async ({ page }) => {
  await page.goto('/?sheet=hub&at=13:00')
  await page.locator('.hub-rows > li').last().getByRole('button', { name: 'Start over…' }).click()
  await page.getByRole('button', { name: 'Hold to erase the hub' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Set a passcode first/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The hub is starting over.' })).toBeHidden()
})
