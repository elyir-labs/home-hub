// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* This screen (design/this-screen/, A, chosen 22 October 2026). The screen's own helper
   (startup/screen-helper.py) is stood in for here, at the address the panel asks. */
import { expect, test, type Page } from '@playwright/test'

const HELPER = 'http://127.0.0.1:8380'

async function helper(page: Page, role: 'screen' | 'hub', other: { home: string } | null = null) {
  const state = { role, turn: 0, turns: true, other }
  const sent: { path: string; body: unknown }[] = []
  await page.route(`${HELPER}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'GET') return route.fulfill({ json: state })
    const body = route.request().postDataJSON(); sent.push({ path, body })
    if (path === '/turn') { state.turn = body.turn; return route.fulfill({ json: { turn: body.turn } }) }
    return route.fulfill({ json: { ok: true } })
  })
  await page.addInitScript(() => { localStorage.setItem('screen', '1'); localStorage.setItem('screen-room', 'kitchen') })
  return sent
}

test('a screen has a page of its own, whose line says what it is, and it turns by the picture that looks upright', async ({ page }) => {
  const sent = await helper(page, 'screen')
  await page.goto('/?sheet=house&at=19:40', { waitUntil: 'networkidle' })
  const door = page.locator('.door', { hasText: 'This screen' })
  await expect(door.locator('.door-hint')).toHaveText(/^Kitchen · shows /)
  await door.click()

  const pageEl = page.locator('.page-screen')
  await expect(pageEl.locator('.ts-way-name')).toHaveText(['As it is', 'Turn right', 'Turn over', 'Turn left'])
  await expect(pageEl.locator('.hub-k')).toHaveText(['Room', 'Light or dark', 'What it does', 'Restart'])

  await pageEl.locator('.ts-way', { hasText: 'Turn left' }).click()
  await expect(pageEl).toContainText('Turned left a moment ago.')
  await pageEl.getByRole('button', { name: 'Put it back' }).click()
  expect(sent.filter(s => s.path === '/turn').map(s => s.body)).toEqual([{ turn: 270 }, { turn: 0 }])
})

test('a screen asked to run a house of its own says what that means first', async ({ page }) => {
  const sent = await helper(page, 'screen')
  await page.goto('/?sheet=screen&at=19:40', { waitUntil: 'networkidle' })
  await page.locator('.page-screen li', { hasText: 'What it does' }).getByRole('button', { name: 'Change' }).click()
  const ask = page.getByRole('dialog', { name: 'What should this screen do?' })
  await expect(ask.locator('.ts-choice.on')).toContainText('Run a house of its own')
  await ask.getByRole('button', { name: 'Start a new house here' }).click()
  await expect(ask).toContainText('Starting a new house here')
  expect(sent).toEqual([{ path: '/role', body: { to: 'hub' } }])
})

test('the hub\'s own screen offers to show another hub only when there is one', async ({ page }) => {
  await helper(page, 'hub')
  await page.goto('/?sheet=screen&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.page-screen li', { hasText: 'Restart' })).toContainText('restarting it restarts the house')
  await page.locator('.page-screen li', { hasText: 'What it does' }).getByRole('button', { name: 'Change' }).click()
  const ask = page.getByRole('dialog', { name: 'What should this screen do?' })
  await expect(ask.getByRole('button', { name: /Show the house from another hub/ })).toBeDisabled()
  await expect(ask).toContainText('There’s no other hub on your Wi‑Fi.')
})

test('a phone has no This screen', async ({ page }) => {
  await page.goto('/?sheet=house&at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.door', { hasText: 'This screen' })).toHaveCount(0)
})
