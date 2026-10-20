// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A rule that says "send a note" is heard on every screen at home (docs/messages.md, step 1).
 *
 * The brain has always sent the note down the stream, and the panel had no branch for it, so the
 * note was built, logged and dropped -- while Why? told the household the rule "Sends a note".
 * The mock never sends one, so the note is spoken here the way rules.py says it.
 */
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

test("a rule's note shows on the screen", async ({ page }) => {
  let speak: (m: object) => void = () => {}
  await page.routeWebSocket('**/stream', ws => { ws.connectToServer(); speak = m => ws.send(JSON.stringify(m)) })
  await page.goto('/?at=19:40', { waitUntil: 'networkidle' })
  await expect(page.locator('.bento, .onnow, .rooms').first()).toBeVisible()

  speak({ type: 'notify', text: 'The garage door has been open for ten minutes.', rule: 'r1' })
  await expect(page.locator('.toast[role=status]')).toHaveText(/garage door has been open for ten minutes/)
})
