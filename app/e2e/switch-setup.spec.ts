// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A wall switch set up on its light, as design/switch-setup/ShowC.dc.html draws it (C, picked 22 November).

   Reported from a real house: a reset switch was added, the page said Added., and nothing else happened --
   no question about dimming, the other switch, or walking in, and no name to find it by afterward. Now the
   house tries each thing on the light and asks what was seen, and ends on the switch's settings. This
   fails on purpose if the order or the questions drift. */
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.request.post('/bridge/switches/start-over') })

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
  await expect(page.getByText('From the switch')).toBeVisible()
  await expect(page.getByText('Its bulbs can dim · you saw it')).toBeVisible()
  await expect(page.getByText('Last step: restart the switch')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Not now' })).toHaveCount(0)

  expect(steps.filter(s => !s.startsWith('show'))).toEqual([
    'light {"light":true}', 'dims {"dims":true}', 'dims {"dims":true,"found":true}', 'listen {}', 'pair {"with":"0021"}', 'walkin {"mode":"on_off"}',
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

test('a light that can dim can still be on and off only, chosen from the light itself', async ({ page }) => {
  await page.route('**/bridge', route => route.fulfill({ json: { state: 'none', bridges: 1, waiting: 1 } }))
  await page.goto('/?sheet=add')
  await page.getByRole('button', { name: /A switch on the wall/ }).click()
  await page.getByRole('button', { name: 'That’s the one' }).click()
  await page.getByRole('button', { name: /Yes, a light came on/ }).click()
  await page.getByRole('button', { name: /It got dimmer, smoothly/ }).click()
  await page.getByRole('button', { name: 'There isn’t another' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const office = page.locator('.press-rooms .chip-btn', { hasText: 'Office' })
  await office.click()
  await page.locator('.sw-setup input').fill('Stair light')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.goto('/?room=office')
  const card = page.getByText('Stair light', { exact: true }).first()
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up()
  await expect(page.locator('.pane-switch')).toContainText('Wall switch · dims · comes on when someone walks in')

  await page.locator('.pane-switch').getByRole('button', { name: 'Change' }).click()
  await expect(page.getByText('How the switch for this light is set up.')).toBeVisible()
  await expect(page.getByText('Its bulbs can dim · you saw it')).toBeVisible()
  await page.getByRole('button', { name: 'On and off only' }).click()
  await expect(page.getByText('Then restart the switch')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.pane-switch')).toContainText('Wall switch · on and off only')
})

/* Two switches for one light, both freshly started over, set up from whichever end somebody happens to start at
   (design/switch-setup/, two switches for one light, B, from either end), and a room made on the way
   (room, A). The other switch is added from inside the step, and never left half set up. */
async function startAt(page: import('@playwright/test').Page, light: boolean) {
  const calls: string[] = []
  page.on('request', r => {
    const m = new URL(r.url()).pathname.match(/^\/bridge\/switches\/([0-9a-f]{4})\/([a-z]+)$/)
    if (m && r.method() === 'POST' && !['show', 'listen'].includes(m[2])) calls.push(`${m[1]} ${m[2]} ${r.postData() ?? ''}`.trim())
  })
  await page.route('**/bridge', route => route.fulfill({ json: { state: 'none', bridges: 1, waiting: 1 } }))
  // nobody presses anything (answered, not held open: a held request ties up one of the browser's few connections)
  await page.route('**/bridge/switches/*/listen', route => setTimeout(() => route.fulfill({ json: { heard: null } }), 300))
  await page.goto('/?sheet=add')
  await page.getByRole('button', { name: /A switch on the wall/ }).click()
  await page.getByRole('button', { name: 'That’s the one' }).click()
  await page.getByRole('button', { name: light ? /Yes, a light came on/ : /No, nothing came on/ }).click()
  return calls
}

async function addTheOtherHere(page: import('@playwright/test').Page, label: RegExp) {
  await page.getByRole('button', { name: label }).click()
  await expect(page.getByText('Start the other switch over.')).toBeVisible()
  await page.getByRole('button', { name: 'That’s the one' }).click()
}

async function inANewRoom(page: import('@playwright/test').Page) {
  await expect(page.getByText('Which room is it in?')).toBeVisible()
  await page.getByRole('button', { name: 'New room' }).click()
  await page.getByLabel('The new room’s name').fill('Stairway')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.press-rooms .chip-btn.on')).toHaveText('Stairway')
  await expect(page.locator('.sw-setup input.input')).toHaveValue('Stairway light')
  await page.getByRole('button', { name: 'Next' }).click()
}

test('started at the switch with the light, the other end is added from inside the step and joins paired', async ({ page }) => {
  const calls = await startAt(page, true)
  await page.getByRole('button', { name: /It got dimmer, smoothly/ }).click()
  await expect(page.getByText('If the other one is already on the house, go and press it.')).toBeVisible()
  await addTheOtherHere(page, /There is, but it isn’t added yet/)
  await expect(page.getByText('Both switches work this light now.')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Should it come on when someone walks in?')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await inANewRoom(page)
  await expect(page.getByText('Stairway light is set up.')).toBeVisible()
  await expect(page.getByText('Added with this one')).toBeVisible()
  expect(calls).toContain('0021 light {"light":false}')
  expect(calls).toContain('0020 pair {"with":"0021"}')
})

test('started at the far end, the switch added second has the light, and the light is set up from it', async ({ page }) => {
  const calls = await startAt(page, false)
  await expect(page.getByText('Which switch has the light?')).toBeVisible()
  await addTheOtherHere(page, /It isn’t added yet/)
  await expect(page.getByText('What did it do?')).toBeVisible()
  await expect(page.getByText('the switch just added has the light')).toBeVisible()
  await page.getByRole('button', { name: /It got dimmer, smoothly/ }).click()
  await expect(page.getByText('Should it come on when someone walks in?')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await inANewRoom(page)
  await expect(page.getByText('Stairway light is set up.')).toBeVisible()
  await expect(page.getByText('Its bulbs can dim · you saw it')).toBeVisible()
  expect(calls).toContain('0021 light {"light":true}')
  expect(calls).toContain('0020 pair {"with":"0021"}')
  expect(calls).toContain('0021 walkin {"mode":"on_off"}')
})
