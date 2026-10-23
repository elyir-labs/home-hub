// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* For working on the hub (design/developer/, B, on the list by default when the hub is not on releases). The mock
 * gives each page address its own hub (mock/developer.mjs): ?dev= says what it follows, &ssh=off and &code=1 the
 * rest. Every test that changes something carries its own run= so a reused mock never hands it yesterday's hub.
 */
import { expect, test, type Page } from '@playwright/test'

const run = () => `run=${Date.now()}${Math.floor(Math.random() * 1e6)}`
const door = (page: Page) => page.locator('.door', { hasText: 'For working on the hub' })

test('a hub flashed from a branch has the page by default, and names its build readably', async ({ page }) => {
  await page.goto('/?at=21:58&sheet=hub&dev=landed')
  await expect(door(page)).toContainText('SSH on')
  await expect(page.locator('.door', { has: page.locator('.door-name', { hasText: /^The hub$/ }) })).toContainText('pi-image-wall · e39341a')
  await expect(page.locator('.hub-version')).toHaveText('pi-image-wall · e39341a')

  await door(page).click()
  await expect(page.locator('.house-head h2')).toHaveText('For working on the hub')
  await expect(page.locator('.dev-opt.on')).toContainText('Landed in development: the next update moves this hub there.')
  const rows = page.locator('.dev-table tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Up to date')
  await expect(rows.nth(1).getByRole('button', { name: 'Update now' })).toBeVisible()
  await expect(rows.nth(2)).toContainText('last seen 2 days ago')
  await expect(rows.nth(2)).toContainText('Not answering')
})

test('a hub on releases shows nothing until the version is tapped seven times, and then asks for the passcode', async ({ page }) => {
  await page.goto(`/?at=21:58&sheet=hub&code=1&${run()}`)
  await expect(page.locator('.hub-version')).toHaveText('v0.3.0')
  await expect(door(page)).toHaveCount(0)
  for (let i = 0; i < 6; i++) await page.locator('.hub-version').click()
  await expect(page.locator('.sheet.code')).toHaveCount(0)
  await page.locator('.hub-version').click()
  await page.locator('.code-input').fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.house-head h2')).toHaveText('For working on the hub')
  await expect(door(page)).toBeVisible()

  await page.getByRole('button', { name: 'Take this page away' }).click()
  await expect(door(page)).toHaveCount(0)
})

test('moving to another channel asks in the row first', async ({ page }) => {
  await page.goto(`/?at=21:58&sheet=developer&dev=branch&${run()}`)
  await page.locator('.dev-opt', { has: page.locator('b', { hasText: /^development$/ }) }).click()
  await expect(page.locator('.dev-ask')).toContainText('Move this hub to development?')
  await page.getByRole('button', { name: 'Move it' }).click()
  await expect(page.locator('.dev-opt.on')).toContainText('development')
  await expect(page.locator('.dev-opt.on')).toContainText('Moving here now.')
})

test('a computer adds keys from GitHub by name, and SSH comes on', async ({ page }) => {
  await page.goto(`/?at=21:58&sheet=developer&dev=branch&ssh=off&${run()}`)
  await expect(door(page)).toContainText('SSH off')
  await page.getByRole('button', { name: 'Add a key' }).click()
  await expect(page.locator('.house-head h2')).toHaveText('Add an SSH key')
  await page.locator('#dev-user').fill('jordan')
  await expect(page.locator('.dev-pk')).toHaveCount(3)
  await page.locator('.dev-pk', { hasText: 'jordan@laptop' }).click()
  await page.locator('.dev-pk', { hasText: 'jordan@studio' }).click()
  await page.getByRole('button', { name: 'Allow 2 keys' }).click()
  await expect(page.locator('.dev-key')).toHaveCount(2)
  await expect(page.locator('.dev-key').nth(1)).toContainText('from github.com/jordan')
  await expect(door(page)).toContainText('SSH on')
})

test('a pasted key is read back before it is allowed', async ({ page }) => {
  await page.goto(`/?at=21:58&sheet=developer&dev=branch&ssh=off&key=1&${run()}`)
  await page.getByRole('tab', { name: 'Paste one' }).click()
  await page.locator('#dev-paste').fill('nonsense')
  await expect(page.locator('.dev-warn')).toContainText('That isn’t a public key.')
  await page.locator('#dev-paste').fill('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICUwO0ZRXGdyfYiTnqm0v8rV4Ov2AQwXIi04Q05ZZG96 jordan@laptop')
  await expect(page.locator('.dev-pk.on')).toContainText('SHA256:jMtL…/zk')
  await page.getByRole('button', { name: 'Allow this key' }).click()
  await expect(page.locator('.dev-key')).toContainText('jordan@laptop')
})

test('a wall screen never offers to type a key: it shows the code for a phone', async ({ page }) => {
  await page.goto(`/?at=21:58&sheet=developer&dev=branch&ssh=off&key=1&screen=1&${run()}`)
  await expect(page.locator('.house-head h2')).toHaveText('For working on the hub')
  await expect(page.locator('.dev-qr')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a key' })).toHaveCount(0)
  await expect(page.locator('#dev-user, #dev-paste')).toHaveCount(0)
})

test('removing the last key turns SSH off, and the command names the hub’s own user', async ({ page }) => {
  await page.goto(`/?at=21:58&sheet=developer&dev=branch&user=jordan&${run()}`)
  await expect(page.locator('.dev-cmd')).toContainText('ssh jordan@hub.local')
  await page.locator('.dev-key').nth(0).getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.dev-key')).toHaveCount(1)
  await page.locator('.dev-key').nth(0).getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('region', { name: 'SSH' })).toContainText('Off. Nothing can sign in over the network.')
  await expect(door(page)).toContainText('SSH off')
})

test('looking a GitHub user up asks for the passcode first', async ({ page }) => {
  await page.goto(`/?at=21:58&sheet=developer&dev=branch&ssh=off&key=1&code=1&${run()}`)
  await page.locator('#dev-user').fill('jordan')
  await page.locator('.code-input').fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.dev-pk')).toHaveCount(3)
})

test('Update now updates one screen', async ({ page }) => {
  await page.goto(`/?at=21:58&sheet=developer&dev=landed&${run()}`)
  const hall = page.locator('.dev-table tbody tr', { hasText: 'Hallway' })
  await hall.getByRole('button', { name: 'Update now' }).click()
  await expect(hall).toContainText('Updating…')
})
