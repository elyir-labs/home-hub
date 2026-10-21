// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A hub on its USB stick beside a drive with something on it (design/move-to-drive/, A with B's sheet, decided
   20 October 2026). The hub's half is faked at the routes. These pin both ways in: first run asks before
   anything else and erases only on the typed word; a household that kept the drive finds the row on This hub
   and erases on a hold. */
import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

const UBUNTU = { name: 'nvme0n1', serial: 'S6P7NS0T', model: 'Samsung SSD 980 500GB', bytes: 500107862016, empty: false,
  system: 'Ubuntu 24.04', used: 61e9, last: null }

async function hub(page: Page, kept: boolean) {
  const sent: { url: string; body: unknown }[] = []
  let state = { from: 'stick', drives: [UBUNTU], drive: UBUNTU, ask: !kept, kept, moved: false, moving: false }
  await page.route('**/drive', r => r.fulfill({ json: state }))
  await page.route('**/drive/*', async r => {
    sent.push({ url: new URL(r.request().url()).pathname, body: r.request().postDataJSON() })
    if (r.request().url().endsWith('/keep')) state = { ...state, ask: false, kept: true }
    await r.fulfill({ json: { ...state, moving: r.request().url().endsWith('/move') } })
  })
  return sent
}

test('first run asks about the drive before anything else, and Keep is an answer', async ({ page }) => {
  const sent = await hub(page, false)
  await page.goto('/?setup=1')
  await expect(page.getByRole('heading', { name: 'This computer’s drive isn’t empty.' })).toBeVisible()
  await expect(page.getByText('Samsung SSD 980 · 500 GB')).toBeVisible()
  await expect(page.getByText('Ubuntu 24.04', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: /Keep what’s on the drive/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome home.' })).toBeVisible()
  expect(sent.map(s => s.url)).toEqual(['/drive/keep'])
})

test('erasing names what is lost, and wakes only on the typed word', async ({ page }) => {
  const sent = await hub(page, false)
  await page.goto('/?setup=1')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Ubuntu 24.04 and 61 GB of files')).toBeVisible()
  const erase = page.getByRole('button', { name: 'Erase the drive' })
  await page.locator('input').fill('yes')
  await expect(erase).toBeDisabled()
  await page.locator('input').fill('erase')
  await erase.click()
  await expect(page.getByRole('heading', { name: 'Moving the hub onto the drive…' })).toBeVisible()
  expect(sent).toEqual([{ url: '/drive/move', body: { name: 'nvme0n1', serial: 'S6P7NS0T' } }])
})

test('a household that kept the drive finds it on This hub, and erases on a hold, not a tap', async ({ page }) => {
  const sent = await hub(page, true)
  await page.goto('/?sheet=hub')
  await page.getByRole('button', { name: 'Move…' }).click()
  const hold = page.getByRole('button', { name: 'Hold to erase the drive' })
  await hold.click()
  await page.waitForTimeout(300)
  expect(sent).toEqual([])
  const box = (await hold.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down(); await page.waitForTimeout(1900); await page.mouse.up()
  await expect(page.getByRole('heading', { name: 'The house is moving to its own drive.' })).toBeVisible()
  expect(sent.map(s => s.url)).toEqual(['/drive/move'])
})
