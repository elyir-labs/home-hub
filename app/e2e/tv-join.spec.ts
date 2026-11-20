// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A TV joining a house that has a passcode, with only its remote (design/tv-join/, C with A's numbers and B's pad,
   decided 20 November 2026). The TV plugged into the hub is already in and asked only its room; a TV on another box
   asks every phone as it comes up and takes the passcode meanwhile, from the remote's numbers or the pad. A TV never
   shows the upside-down pill. The house's answers are faked here, since the mock has no passcode. */
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

const ME = { locked: true, paired: false, home: 'Maple Court', phone: null }
const SCREEN = { id: 's1', name: 'A screen', kind: 'screen', joined: 0, expires: null, remote: false, last_seen: null, me: true }
const lit = (page: Page) => page.locator('[data-lit]')

test('a TV on another box asks the phones, and the passcode goes in with the numbers or the pad', async ({ page }) => {
  let joined = false
  await page.route('**/phones/me', r => r.fulfill({ json: joined ? { ...ME, paired: true } : { ...ME, plugged_in: false } }))
  await page.route('**/phones/ask', r => r.fulfill({ json: { id: 'a1', name: 'A screen', kind: 'screen', asked: 0 } }))
  await page.route('**/phones/claim/a1', r => r.fulfill({ json: { state: 'waiting' } }))
  await page.route('**/phones/code', r => { joined = true; return r.fulfill({ json: { ok: true, phone: { ...SCREEN, how: 'code' } } }) })
  await page.goto('/?screen=1&tv=1&join=1&at=21:10', { waitUntil: 'networkidle' })

  await expect(page.locator('.tvj h1')).toHaveText('This TV is for Maple Court.')
  await expect(page.locator('.tvj-waiting')).toHaveText('Asked every phone in the house')
  await expect(page.locator('.turn-pill')).toHaveCount(0)
  await expect(lit(page)).toHaveText('1')
  await expect(page.locator('.tvj-hint')).toContainText('Type straight in')

  await page.keyboard.press('4'); await page.keyboard.press('8')           // the remote's numbers
  await page.keyboard.press('9'); await page.keyboard.press('Escape')      // Back takes one off
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')  // the pad: 2
  await expect(page.locator('.tvj-code i.on')).toHaveCount(3)
  await expect(page.locator('[data-k="join"]')).toHaveClass(/off/)
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter')   // 1, the fourth: Join lights
  await expect(lit(page)).toHaveText('Join')

  const sent = page.waitForRequest(r => r.url().endsWith('/phones/code'))
  await page.keyboard.press('Enter')
  expect((await sent).postDataJSON()).toMatchObject({ code: '4821', kind: 'screen' })
  await expect(page.locator('.tvr h1')).toHaveText('Which room is this TV in?')
  await expect(page.locator('.tvr-lede')).toHaveText('It opens on the room you choose.')
})

test("the TV plugged into the hub is already in, and OK on a room is the answer", async ({ page }) => {
  let joined = false
  await page.route('**/phones/me', r => r.fulfill({ json: joined ? { ...ME, paired: true } : { ...ME, plugged_in: true } }))
  await page.route('**/phones/plugged-in', r => { joined = true; return r.fulfill({ json: { ok: true, phone: { ...SCREEN, how: 'plugged in' } } }) })
  // a house with a passcode lists its phones, and this screen is on the list as the one plugged in
  await page.route('**/status', async r => { const res = await r.fetch(); r.fulfill({ response: res, json: { ...(await res.json()), locked: true } }) })
  await page.route('**/phones', r => r.fulfill({ json: { phones: [{ ...SCREEN, how: 'plugged in' }], asks: [] } }))
  const asked = page.waitForRequest(r => r.url().endsWith('/phones/plugged-in'))
  await page.goto('/?screen=1&tv=1&join=1&at=21:10', { waitUntil: 'networkidle' })
  await asked

  await expect(page.locator('.tvr h1')).toHaveText('Which room is this TV in?')
  await expect(page.locator('.tvr-lede')).toContainText("It's plugged into the hub, so it's already part of")
  await expect(page.locator('.turn-pill')).toHaveCount(0)
  await expect(page.locator('.tvj')).toHaveCount(0)
  const first = await lit(page).locator('.tvr-nm').textContent()
  const small = await page.locator('.tvr-nm, .tvr-st, .tvr-lede, .tvr-hint').evaluateAll(es => es.filter(e => parseFloat(getComputedStyle(e).fontSize) < 22).length)
  expect(small).toBe(0)

  const placed = page.waitForRequest(r => r.url().endsWith('/phones/me/room') && r.method() === 'POST')
  await page.keyboard.press('Enter')
  expect((await placed).postDataJSON().room).toBeTruthy()
  await expect(page.locator('.tvr')).toHaveCount(0)
  await expect(page.locator('.tv-title h1')).toHaveText(first!)
})
