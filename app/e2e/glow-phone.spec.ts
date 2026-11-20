// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The strip behind the TV, from its own pane (design/tv-glow/, A with B): a Follows the TV switch, and Where the TV is,
   which marks the screen on the camera's picture with four dots when the TV can't find itself (B). The first time the
   strip then runs a light and the same questions as the TV's are asked; after that only the corners change. The house's
   answers and the camera's picture are made here: the pretend house has neither a strip nor a camera. */
import { expect, test, type Page } from '@playwright/test'

const CHOICE = { strip: 'ab12', run: 0, light: 'l1', name: 'Ceiling light', lights: 60, reachable: true }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAHnL4h9AAAAAElFTkSuQmCC', 'base64')

async function house(page: Page, glow: Record<string, unknown>) {
  const asked: { path: string; body: any }[] = []
  let state = { ...glow }
  await page.route('**/glow**', r => {
    const u = new URL(r.request().url()), m = r.request().method()
    if (u.pathname === '/glow/still') return r.fulfill({ body: PNG, contentType: 'image/png' })
    if (m === 'POST') {
      const body = r.request().postDataJSON(); asked.push({ path: u.pathname, body })
      if (u.pathname === '/glow') { state = body.on === false ? { ...state, on: false } : { ...state, strip: 'ab12', run: 0, on: true }; return r.fulfill({ json: { glow: state, target: null } }) }
      if (u.pathname === '/glow/corners') state = { ...state, set: true }
      return r.fulfill({ json: { ok: true, path: [] } })
    }
    return r.fulfill({ json: { glow: state, choices: [CHOICE], target: null } })
  })
  await page.goto('/?room=living&at=19:42', { waitUntil: 'networkidle' })
  const t = page.locator('.tile', { hasText: 'Ceiling light' }).first()
  await expect(t).toBeVisible(); await page.waitForTimeout(400)
  const b = (await t.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(24, b.height / 2)); await page.mouse.down()
  await expect(page.locator('.pane-rig')).toHaveCount(1, { timeout: 10_000 }); await page.mouse.up()
  return asked
}

test('switching it on the first time marks the TV on the camera\'s picture and asks which way the strip runs', async ({ page }) => {
  const asked = await house(page, {})
  const sw = page.getByRole('switch', { name: 'Follows the TV' })
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await sw.click()
  expect(asked.find(a => a.path === '/glow')?.body).toEqual({ strip: 'ab12', run: 0 })
  const sheet = page.locator('.gp')
  await expect(sheet.locator('h2')).toHaveText('Where is the TV?')
  await expect(sheet).toContainText("The picture isn't kept")
  const dot = sheet.getByRole('button', { name: 'Top left corner' }), frame = (await sheet.locator('.gp-frame').boundingBox())!
  const d = (await dot.boundingBox())!
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await page.mouse.down()
  await page.mouse.move(frame.x + frame.width * 0.1, frame.y + frame.height * 0.1, { steps: 4 }); await page.mouse.up()
  await sheet.getByRole('button', { name: "That's the TV" }).click()
  expect(asked.at(-1)!.path).toBe('/glow/chase')
  await sheet.getByRole('button', { name: 'Bottom left' }).click()
  await sheet.getByRole('button', { name: 'Across first' }).click()
  const corners = asked.find(a => a.path === '/glow/corners')!.body
  expect(corners.start).toBe('bottom-left'); expect(corners.first).toBe('across')
  expect(corners.corners[0][0]).toBeCloseTo(0.1, 1); expect(corners.corners[0][1]).toBeCloseTo(0.1, 1)
  await expect(sheet).toContainText('follows the picture now')
})

test('set up, Where the TV is changes only the corners, and the switch turns it off', async ({ page }) => {
  const asked = await house(page, { strip: 'ab12', run: 0, on: true, set: true })
  await expect(page.locator('.glow-row')).toContainText('Colors from the picture')
  await page.getByRole('button', { name: 'Where the TV is' }).click()
  await page.locator('.gp').getByRole('button', { name: "That's the TV" }).click()
  const corners = asked.find(a => a.path === '/glow/corners')!.body
  expect(Object.keys(corners)).toEqual(['corners'])
  await page.locator('.gp').getByRole('button', { name: 'Done' }).click()
  await page.getByRole('switch', { name: 'Follows the TV' }).click()
  expect(asked.at(-1)).toEqual({ path: '/glow', body: { on: false } })
  await expect(page.getByRole('switch', { name: 'Follows the TV' })).toHaveAttribute('aria-checked', 'false')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  test('the switch sits beside its words, and Where the TV is opens on the screen, not inside the pane', async ({ page }) => {
    await house(page, { strip: 'ab12', run: 0, on: true, set: true })
    const row = page.locator('.glow-row'); await row.scrollIntoViewIfNeeded()
    const words = (await row.locator('.rig-card-name').boundingBox())!, sw = (await row.getByRole('switch').boundingBox())!
    expect(sw.x).toBeGreaterThanOrEqual(words.x + words.width - 1)           // beside, never on top of the words
    await page.getByRole('button', { name: 'Where the TV is' }).click()
    const sheet = (await page.locator('.gp').boundingBox())!
    expect(sheet.y).toBeGreaterThanOrEqual(0)
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(844 + 1)
  })
})
