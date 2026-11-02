// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* First run, walked whole on a hub out of its box: the screen plugged into a hub on its USB stick, with no network
 * and a drive beside it. The drive, the Wi-Fi, Welcome home while the hub downloads, the names, the engine's first
 * account, the passcode, where home is, the rooms, what is in the house, the web address, and Home. Each screen has a
 * spec of its own; this one is for the hand-offs between them, which only a run from one end to the other sees.
 *
 * Its own mock (FRESH=1 NET=screen DRIVE=stick), on a port of its own, since the suite's shares one lived-in house.
 * The mock keeps every answer (mock/house.mjs, firstRun), so what each screen shows is what the last one did. */
import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 5182
const HUB = `http://localhost:${PORT}`
const MOCK = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock', 'brain.mjs')

test.use({ viewport: { width: 1440, height: 900 } })

let mock: ChildProcess
test.beforeAll(async () => {
  mock = spawn(process.execPath, [MOCK], { env: { ...process.env, PORT: String(PORT), FRESH: '1', NET: 'screen', DRIVE: 'stick', NAMES: 'plain' }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(HUB)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('the out-of-the-box mock did not start')
})
test.afterAll(() => { mock?.kill() })

test('a hub out of its box, from the drive and the Wi-Fi to Home, each screen seeing what the last one did', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(`${HUB}/`)

  await expect(page.getByRole('heading', { name: 'This computer’s drive isn’t empty.' })).toBeVisible()
  await page.getByRole('radio', { name: /Keep what’s on the drive/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Which Wi‑Fi is yours?' })).toBeVisible()
  await page.getByText('Bluebell', { exact: true }).click()
  await page.locator('.wifi-secret input').fill('wrong')
  await page.getByRole('button', { name: 'Join' }).first().click()
  await expect(page.getByText('Bluebell didn’t accept that password. Check it and try again.')).toBeVisible({ timeout: 8000 })
  await page.locator('.wifi-secret input').fill('meadow-lark')
  await page.getByRole('button', { name: 'Join' }).first().click()

  await expect(page.getByRole('heading', { name: 'Welcome home.' })).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('On Bluebell. Getting the rest of the hub, which takes a few minutes the first time.')).toBeVisible()
  const start = page.getByRole('button', { name: 'Get started' })
  await expect(start, 'nothing to start until the hub has what it needs').toBeDisabled()
  await expect(start).toBeEnabled({ timeout: 15_000 })
  await start.click()

  await expect(page.locator('.setup-step')).toHaveText('Step 1 of 5')
  await page.getByLabel('Your name').fill('Robin')
  await page.getByLabel('A name for the house').fill('Maple Court')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Setting up the house…' })).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Choose a passcode.' })).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.setup-step')).toHaveText('Step 2 of 5')
  await page.getByLabel('Passcode, 4 to 8 digits').fill('2468')
  await page.getByLabel('Type it again').fill('2468')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Where is home?' })).toBeVisible()
  await page.getByPlaceholder('Search a town, or type coordinates').fill('Cedar')
  await page.getByRole('button', { name: /Cedar Falls, IA/ }).click()
  await page.getByRole('button', { name: 'Use this', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Which rooms do you have?' })).toBeVisible()
  await page.getByRole('button', { name: 'Kitchen', exact: true }).click()
  await page.getByRole('button', { name: 'Living room', exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: "What's in the house?" })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByRole('button', { name: 'Not now' }).first().click()

  await expect(page.getByRole('heading', { name: 'Maple Court is ready, Robin.' })).toBeVisible()
  await expect(page.getByText('Try it: type “Kitchen lights off”')).toBeVisible()
  await page.getByRole('button', { name: 'Start using the house' }).click()
  await expect(page.locator('.setup')).toHaveCount(0)
  await expect(page.locator('.stage').getByText('Kitchen').first(), 'Home, with the rooms just chosen').toBeVisible()
  expect(await page.evaluate(() => { const s = document.querySelector('.shell')!; return [s.scrollLeft, s.scrollTop] }),
    'Home where it belongs, not where a field focused during first run scrolled the screen').toEqual([0, 0])
  await expect(page.locator('.topbar')).toBeInViewport({ ratio: 1 })

  const said = await page.evaluate(async () => ({
    status: await (await fetch('/setup/status')).json(),
    home: await (await fetch('/home')).json(),
    ambient: await (await fetch('/ambient')).json(),
  }))
  expect(said.status).toMatchObject({ setup_done: true, owner: 'Robin', home: 'Maple Court', locked: true, location: true, rooms: 2, driver: 'ready' })
  expect(said.home.name).toBe('Maple Court')
  expect(said.home.rooms.map((r: { name: string }) => r.name)).toEqual(['Kitchen', 'Living room', 'New devices'])
  expect(said.ambient.location.name).toBe('Cedar Falls, IA')
})
