// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Moving out, the last row of People (design/leaving/, B, decided 1 November 2026). The hub's half is faked at the
   routes: /handover says what it would take and is answered here, and /setup/status says the house was handed over once
   it has been asked. These pin that the sheet names this house's people and services before anything goes, that a tap
   is not a hold, and that the next people find the house already there and are asked only two things. */
import { test, expect, type Page } from '@playwright/test'

const ASK = { phones: 2, people: ['Jordan', 'Sam'], accounts: ['Thermostat account'], rooms: 8, devices: 30, routines: 5 }

async function hub(page: Page) {
  const asked: string[] = []
  await page.route('**/handover', async r => {
    if (r.request().method() === 'GET') return r.fulfill({ json: ASK })
    asked.push(r.request().method()); await r.fulfill({ json: { ok: true } })
  })
  await page.route('**/setup/status', async r => {
    const real = await (await r.fetch()).json()
    await r.fulfill({ json: asked.length ? { ...real, setup_done: false, locked: false, owner: null, home: null, handed_over: true } : real })
  })
  return asked
}

test('the last row of People, and its sheet names what goes from this house before anything does', async ({ page }) => {
  const asked = await hub(page)
  await page.goto('/?sheet=people&at=13:00')
  const row = page.locator('.hub-rows > li').last()
  await expect(row.locator('.hub-k')).toHaveText('Moving out')
  await row.getByRole('button', { name: 'Hand it over…' }).click()
  const sheet = page.getByRole('dialog', { name: 'Hand the house over' })
  await expect(sheet.getByText('Erased: the 2 phones that can use the house, the passcode, Jordan and Sam, the services the house signed into (Thermostat account) and what happened here.')).toBeVisible()
  await expect(sheet.getByText(/Stays: 8 rooms, the lights and switches in them, 5 routines/)).toBeVisible()
  await expect(sheet.getByText(/payments stop/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Hold to hand the house over' }).click()
  await page.waitForTimeout(400)
  expect(asked, 'a tap is not a hold').toEqual([])
})

test('held, the house is handed over once, and the next people are asked only who they are and for a passcode', async ({ page }) => {
  const asked = await hub(page)
  await page.goto('/?sheet=people&at=13:00')
  await page.locator('.hub-rows > li').last().getByRole('button', { name: 'Hand it over…' }).click()
  const hold = page.getByRole('button', { name: 'Hold to hand the house over' })
  const box = (await hold.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByRole('heading', { name: 'The house is being handed over.' })).toBeVisible({ timeout: 4000 })
  await page.mouse.up()
  expect(asked).toEqual(['POST'])
  await expect(page.getByRole('heading', { name: 'This house is ready for you.' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/rooms · .* lights, switches and sensors/)).toBeVisible()
  await expect(page.getByText('Moving from another hub?')).toBeHidden()
  await page.getByRole('button', { name: 'Get started' }).click()
  await expect(page.getByText('Step 1 of 2')).toBeVisible()
})
