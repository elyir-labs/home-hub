// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Restarting the hub (design/restart/, A with C's card, picked 9 November 2026). The row says when the machine is
 * waiting to start again; somebody back at the door within half an hour is offered the next restart first with the
 * one they tried beside it; and For working on the hub has all three. The mock's knobs ride on the page address:
 * ?owed=update, ?restart=again (mock/house.mjs), ?dev= (mock/developer.mjs).
 */
import { expect, test } from '@playwright/test'

const row = (page) => page.locator('.hub-rows > li', { has: page.locator('.hub-k', { hasText: /^Restart$/ }) })

test('a change waiting for the machine says so on the Restart row, and Restart now powers it off and on', async ({ page }) => {
  await page.goto('/?at=13:00&sheet=hub&owed=update')
  const r = row(page)
  await expect(r).toHaveClass(/restart-owed/)
  await expect(r).toContainText('The hub needs to restart to finish an update.')
  await expect(r).toContainText('If you leave it, it does this by itself tonight at 3:12 AM.')
  await r.getByRole('button', { name: 'Restart now' }).click()
  await expect(r.locator('b')).toHaveText('Power the hub off and on?')
  await expect(r.getByRole('button', { name: 'Power off and on' })).toBeVisible()
})

test('with nothing waiting, the row is the plain one and asks for a quick restart', async ({ page }) => {
  await page.goto('/?at=13:00&sheet=hub')
  const r = row(page)
  await expect(r).not.toHaveClass(/restart-owed/)
  await r.getByRole('button', { name: 'Restart' }).click()
  await expect(r.getByRole('button', { name: 'Quick restart' })).toBeVisible()
  await expect(r.getByRole('button', { name: /again$/ })).toHaveCount(0)
})

test('back at the door after a full restart, the machine comes first with the full one beside it', async ({ page }) => {
  await page.goto('/?at=13:00&sheet=hub&restart=again')
  const r = row(page)
  await r.getByRole('button', { name: 'Restart' }).click()
  await expect(r.locator('b')).toHaveText('Power the hub off and on?')
  await expect(r).toContainText('You did a full restart 10 minutes ago.')
  const buttons = r.locator('.note-ask button')
  await expect(buttons).toHaveText(['Power off and on', 'Full restart again', 'Not now'])
})

test('For working on the hub has all three restarts, how long it has been up, and who restarted it last', async ({ page }) => {
  await page.goto('/?at=13:00&sheet=developer&dev=landed')
  const card = page.locator('.dev-card[aria-label="Restart"]')
  await expect(card.locator('.dev-say')).toHaveText('Up 6 days. Last restarted 2 days ago, by the hub itself.')
  await expect(card.locator('.dev-step > span')).toHaveText([
    /^Quick restartThe hub’s own software\. About 30 seconds\.$/,
    /^Full restartEverything the hub runs, the radios included\. About 2 minutes\.$/,
    /^Power off and onThe machine itself\. About 3 minutes\.$/,
  ])
  await card.locator('.dev-step').nth(2).getByRole('button', { name: 'Restart' }).click()
  await expect(card.locator('.dev-ask')).toContainText('The screen goes dark for about 3 minutes.')
  await expect(card.locator('.dev-ask').getByRole('button', { name: 'Power off and on' })).toBeVisible()
})
