// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A wall switch set up on its light, as design/switch-setup/ShowC.dc.html draws it (C, picked 22 November).

   Reported from a real house: a reset switch was added, the page said Added., and nothing else happened --
   no question about dimming, the other switch, or walking in, and no name to find it by afterward. Now the
   house tries each thing on the light and asks what was seen, and ends on the switch's settings. This
   fails on purpose if the order or the questions drift. */
import { expect, test } from '@playwright/test'

test('a switch that joins is set up on its light, then named after its room', async ({ page }) => {
  const steps: string[] = []
  page.on('request', r => {
    const m = new URL(r.url()).pathname.match(/^\/bridge\/switches\/[0-9a-f]{4}\/([a-z]+)$/)
    if (m && r.method() === 'POST') steps.push(`${m[1]} ${r.postData() ?? ''}`.trim())
  })
  await page.route('**/bridge', route => route.fulfill({ json: { state: 'none', bridges: 1, waiting: 1 } }))
  await page.goto('/?sheet=add')

  await page.getByRole('button', { name: /A switch on the wall/ }).click()
  await page.getByRole('button', { name: 'That’s the one' }).click()

  await expect(page.getByText('Did a light come on?')).toBeVisible()
  await page.getByRole('button', { name: /Yes, a light came on/ }).click()

  await expect(page.getByText('What did it do?')).toBeVisible()
  await expect(page.getByText(/Going down… \d+%/)).toBeVisible()
  for (const answer of ['It got dimmer, smoothly, all the way down', 'It stayed bright, then went off near the end',
                        'It flickered or buzzed', 'I can’t see it from here'])
    await expect(page.getByRole('button', { name: new RegExp(answer) })).toBeVisible()
  await page.getByRole('button', { name: /It got dimmer, smoothly/ }).click()

  await expect(page.getByText('Is there another switch for this light?')).toBeVisible()
  await expect(page.getByText(/Heard: the switch at the top of the stairs/)).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByText('Should it come on when someone walks in?')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByText('Which room is it in?')).toBeVisible()
  const room = page.locator('.press-rooms .chip-btn').first()
  const roomName = (await room.innerText()).trim()
  await room.click()
  await expect(page.locator('.sw-setup input')).toHaveValue(`${roomName} light`)
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByText(`${roomName} light is set up.`)).toBeVisible()
  await expect(page.getByText('Last step: restart the switch')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Not now' })).toHaveCount(0)

  expect(steps.filter(s => !s.startsWith('show'))).toEqual([
    'light {"light":true}', 'dims {"dims":true}', 'listen {}', 'pair {"with":"0021"}', 'walkin {"mode":"on_off"}',
  ])
})

test('a bulb that stays bright and then goes off is on and off only, and nobody is sent to the tab midway', async ({ page }) => {
  await page.route('**/bridge', route => route.fulfill({ json: { state: 'none', bridges: 1, waiting: 1 } }))
  await page.goto('/?sheet=add')
  await page.getByRole('button', { name: /A switch on the wall/ }).click()
  await page.getByRole('button', { name: 'That’s the one' }).click()
  await page.getByRole('button', { name: /Yes, a light came on/ }).click()

  await page.getByRole('button', { name: /It stayed bright, then went off near the end/ }).click()
  await expect(page.getByText('Restart the switch.')).toHaveCount(0)
  await expect(page.getByText('Is there another switch for this light?')).toBeVisible()
  await expect(page.getByText(/it stays on and off/)).toBeVisible()
})
