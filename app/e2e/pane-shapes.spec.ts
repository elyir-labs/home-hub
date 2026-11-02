// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A lamp's pane on the screens it was not drawn for (design/every-screen/, room A, chosen 1 November 2026). Hung
   tall it is one column with every part the wall has, stacked, so the colors are never the part that goes
   missing, and it stands above the dock, which stays in front; a place in the dock shuts it. Hung wide on a 7-inch
   the instrument gets the width. */
import { expect, test, type Page } from '@playwright/test'

async function lamp(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto('/?face=paper&nav=top&room=living&at=19:40', { waitUntil: 'networkidle' })
  const box = (await page.locator('.tile.light.on').first().boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2))
  await page.mouse.down()
  await expect(page.locator('.pane-rig')).toBeVisible()
  await page.mouse.up()
  await page.waitForTimeout(600)
}

const box = async (page: Page, s: string) => (await page.locator(s).first().boundingBox())!

test('hung tall the pane stands above the dock, and the dock stays in front', async ({ page }) => {
  await lamp(page, 900, 1440)
  const pane = await box(page, '.opened-panel'), dock = await box(page, '.dock-body')
  expect(pane.y + pane.height).toBeLessThanOrEqual(dock.y)
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.dock-body'), [dock.x + dock.width / 2, dock.y + dock.height / 2])
  expect(hit, 'the dock is under the veil').toBe(true)
})

test('a place in the dock shuts the pane and goes there', async ({ page }) => {
  await lamp(page, 900, 1440)
  await page.locator('.dock-place', { hasText: 'Cameras' }).click()
  await expect(page.locator('.opened')).toHaveCount(0)
  await expect(page.locator('.dock-place.active')).toHaveText('Cameras')
})

test('hung tall the pane is one column, and its colors and the usual three are on it', async ({ page }) => {
  await lamp(page, 900, 1440)
  const said = await box(page, '.pane-said'), rig = await box(page, '.pane-rig'), pane = await box(page, '.opened-panel')
  expect(rig.y, 'the instrument is under what was said').toBeGreaterThanOrEqual(said.y + said.height - 1)
  expect(rig.width).toBeGreaterThan(pane.width * 0.8)
  const acts = await box(page, '.opened-acts'), name = await box(page, '.opened-name')
  expect(acts.y, 'the buttons stand beside the name').toBeLessThan(name.y + name.height)
  for (const s of ['.rig-swatch', '.rig-auto', '.rig-col']) {
    const b = await box(page, s)
    expect(b.x).toBeGreaterThanOrEqual(pane.x)
    expect(b.x + b.width).toBeLessThanOrEqual(pane.x + pane.width)
    expect(b.y + b.height).toBeLessThanOrEqual(pane.y + pane.height)
  }
})

test('on a 7-inch hung wide the colors are inside the pane, not past its edge', async ({ page }) => {
  await lamp(page, 1029, 579)
  const pane = await box(page, '.opened-panel')
  const rights = await page.locator('.rig-swatch').evaluateAll(els => els.map(e => e.getBoundingClientRect().right))
  expect(Math.max(...rights)).toBeLessThanOrEqual(pane.x + pane.width)
})
