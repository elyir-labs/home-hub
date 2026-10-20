// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The pretend house (src/try.ts, hub.elyir.com/try): the panel with the mock house running inside the page.
 *
 * Served here the way the site serves it -- app/dist-try as plain files under /try/ (npm run build:try), on a port of
 * its own -- with no mock brain anywhere behind it, so anything that only works because :8399 is running fails here.
 * Every request the page sends over the network is watched, and the only ones allowed to fail are the ones the
 * pretend house says it cannot answer. */
import { expect, test, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

test.describe.configure({ mode: 'serial' })

const SITE = 'http://localhost:5180'
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-try')
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }

let server: Server
test.beforeAll(async () => {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('npm run build:try first')
  server = createServer((req, res) => {
    const path = new URL(req.url || '/', 'http://x').pathname
    if (!path.startsWith('/try/')) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not the site') }
    const file = join(DIST, path.slice('/try/'.length))
    const real = existsSync(file) && statSync(file).isFile() ? file : join(DIST, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPES[extname(real)] ?? 'application/octet-stream' })
    res.end(readFileSync(real))
  })
  await new Promise<void>(r => server.listen(5180, r))
})
test.afterAll(() => server?.close())

/* Routes the hub has and the mock never did, where the panel already takes a 404 well: /alive is still an answer
   (reach.ts), and /strip is no strip being set up (store.ts). */
const UNANSWERED_OK = ['GET /alive', 'GET /strip']

function watch(page: Page) {
  const broken: string[] = [], unanswered: string[] = []
  page.on('requestfailed', r => broken.push(`${r.failure()?.errorText} ${r.url()}`))
  page.on('response', r => { if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`) })
  page.on('console', m => {
    const said = m.text().match(/^the pretend house has no answer for (.+)$/)
    if (said && !UNANSWERED_OK.includes(said[1])) unanswered.push(said[1])
  })
  page.on('pageerror', e => broken.push(`page error: ${e.message}`))
  page.on('request', r => { if (!r.url().startsWith(`${SITE}/try/`) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) broken.push(`left the page's folder: ${r.url()}`) })
  return { broken, unanswered }
}

const lamp = (page: Page) => page.locator('.tile.light', { has: page.locator('text=Reading lamp') }).first()
const houseSays = (page: Page, id: string) => page.evaluate(async (id) => {
  const home = await (await fetch('/home')).json()
  return home.rooms.flatMap((r: { devices: { id: string; state: string }[] }) => r.devices).find((d: { id: string }) => d.id === id)?.state
}, id)

test('the pretend house: rooms from the page itself, a tap that stays, a still, and a reload that puts it back', async ({ page }) => {
  const seen = watch(page)
  await page.goto(`${SITE}/try/?at=20:10&wx=cloudy`, { waitUntil: 'networkidle' })
  await expect(page.getByText('Connected'), 'the stream is the house in the page').toBeVisible()
  await expect(page.getByRole('button', { name: /^Ceiling light, On/ })).toBeVisible()
  await page.getByRole('button', { name: 'Rooms', exact: true }).click()
  for (const room of ['Living room', 'Kitchen', 'Office', 'Backyard']) await expect(page.locator('main').getByText(room, { exact: true }).first()).toBeVisible()

  await page.goto(`${SITE}/try/?room=living&at=20:10&wx=cloudy`, { waitUntil: 'networkidle' })
  await expect(lamp(page)).toBeVisible()
  await expect(lamp(page)).not.toHaveClass(/\bon\b/)
  expect(await houseSays(page, 'l3')).toBe('off')
  await lamp(page).click()
  await expect(lamp(page)).toHaveClass(/\bon\b/)
  await expect.poll(() => houseSays(page, 'l3'), { message: 'the house kept the tap' }).toBe('on')
  await page.waitForTimeout(6000)                  // past the panel's own wait for the house to confirm (store.ts, perform)
  await expect(lamp(page), 'and the card still says so once nothing is guessed').toHaveClass(/\bon\b/)
  /* a change the panel did not make and so cannot have guessed: it can only arrive on the stream */
  const floor = page.locator('.tile.light', { has: page.locator('text=Floor lamp') }).first()
  await expect(floor).toHaveClass(/\bon\b/)
  await page.evaluate(() => fetch('/devices/l2/off', { method: 'POST' }))
  await expect(floor).not.toHaveClass(/\bon\b/)

  await page.goto(`${SITE}/try/?page=cameras&at=20:10&wx=cloudy`, { waitUntil: 'networkidle' })
  await expect.poll(() => page.locator('img[src^="blob:"]').count(), { message: 'a camera still, from the house in the page' }).toBeGreaterThan(0)

  await page.goto(`${SITE}/try/?room=living&at=20:10&wx=cloudy`, { waitUntil: 'networkidle' })
  expect(await houseSays(page, 'l3'), 'a new page is a new house').toBe('off')
  await expect(lamp(page)).not.toHaveClass(/\bon\b/)

  expect(seen.broken, 'nothing the page asked the network for failed').toEqual([])
  expect(seen.unanswered, 'nothing the panel asked the house for went unanswered').toEqual([])
})

test("the pretend house names nobody else's show or brand", async ({ page }) => {
  await page.goto(`${SITE}/try/?at=20:10&wx=cloudy`, { waitUntil: 'networkidle' })
  const said = await page.evaluate(async () => {
    const paths = ['/home', '/things', '/accounts', '/discovered', '/catalog', '/health', '/happened/changes', '/setup/status']
    return (await Promise.all(paths.map(p => fetch(p).then(r => r.text())))).join('\n') + document.body.innerText
  })
  for (const name of ['The Bear', 'Disney', 'Philips', 'Hue', 'Sonos', 'Chromecast', 'Miles Davis', 'Nest', 'Google', 'Ring', 'TP-Link', 'Samsung', 'Hunter', 'IKEA', 'Tesla'])
    expect(said, name).not.toContain(name)
})
