// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The Houses app (design/houses/, The app and B), and the panel inside it (src/inapp.ts), driven against the mock
 * brain as the house.
 *
 * Both halves need a page on the app's own dev origin, 5174, served for real from this machine: Chrome lets a page
 * frame a house on this machine only when that page really came from here, and a page the test runner fulfills
 * itself counts as the public internet. So one server here serves the built app (app/dist-houses, npm run
 * build:houses) and, at /stand-in, a stand-in for the app that plays its half of the handshake by hand; a second,
 * on 5175, is some other site. One file, run in order, because two servers cannot both have 5174 -- found 3 October,
 * when two files each started their own and CI ran them side by side.
 *
 * The mock speaks the move: K7Q4MPWR is the code that works, anything else is the brain's 410. */
import { expect, test, type Page } from '@playwright/test'
import { createECDH } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

test.describe.configure({ mode: 'serial' })

const APP = 'http://localhost:5174'
const ELSE = 'http://localhost:5175'
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-houses')
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' }

/* The app's half, by hand: frame the panel as the app does, hand it a pass when it says it is ready, keep what it says. */
const standIn = (base: string, others: boolean, extra = '') => `<!doctype html>
  <body style="margin:0"><iframe id="f" allow="local-network-access" src="${base}/?app=1&layout=wall&nav=top&at=19:40${extra}" style="border:0;width:390px;height:844px"></iframe>
  <script>
    window.said = []
    const f = document.getElementById('f')
    addEventListener('message', ev => {
      if (ev.source !== f.contentWindow) return
      window.said.push(ev.data.type)
      if (ev.data.type === 'houses:ready') f.contentWindow.postMessage({ type: 'houses:token', token: 'from-the-app', lan: null, name: 'Lake house', others: ${others} }, ev.origin)
    })
  </script>`

let servers: Server[] = []
test.beforeAll(() => {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('npm run build:houses first')
  const base = process.env.BASE || 'http://localhost:8399'
  const serve = (appToo: boolean) => createServer((req, res) => {
    const path = (req.url || '/').split('#')[0]
    if (!appToo || path.startsWith('/stand-in')) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(standIn(base, path.includes('others'), new URL(path, 'http://x').searchParams.get('q') ?? ''))
    }
    const file = join(DIST, path.split('?')[0])
    const real = path !== '/' && existsSync(file) && !file.endsWith('/') ? file : join(DIST, 'index.html')    // try_files {path} /index.html
    res.writeHead(200, { 'Content-Type': TYPES[extname(real)] ?? 'application/octet-stream' })
    res.end(readFileSync(real))
  })
  servers = [serve(true).listen(5174), serve(false).listen(5175)]
})
test.afterAll(() => { for (const s of servers) s.close() })

async function app(page: Page, origin: string, _base: string, others = false) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${origin}/stand-in${others ? '?others' : ''}`)
}

// ---- the app ------------------------------------------------------------------------------------

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'

async function fresh(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${APP}/`)
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('houses'); q.onsuccess = q.onerror = q.onblocked = () => r(null) }))
}

test('a link from the house carries it in: named by the phone, then opened with its name as the switch', async ({ page }) => {
  await fresh(page)
  await page.goto(`${APP}/add#h=maple-court&c=K7Q4MPWR`)
  await expect(page.getByRole('heading', { name: 'Added.' })).toBeVisible()
  expect(new URL(page.url()).hash, 'the code is not kept in the address').toBe('')
  await page.getByRole('button', { name: 'Lake house' }).click()
  await page.getByRole('button', { name: 'Open Lake house' }).click()

  const house = page.frameLocator('.hs-frame')
  const name = house.locator('.house-switch')
  await expect(name).toContainText('Lake house')
  await expect(name, 'connected, with the pass the app handed over').toHaveClass(/\bup\b/)
  await name.click()
  const sheet = page.getByRole('dialog', { name: 'Houses' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.hs-row', { hasText: 'Lake house' })).toBeVisible()
  await expect(sheet.locator('.hs-row', { hasText: 'Add a house' })).toBeVisible()

  // and it is still there the next time the app opens
  await page.goto(`${APP}/`)
  await expect(page.frameLocator('.hs-frame').locator('.house-switch')).toContainText('Lake house')
})

test('on an iPhone in Safari nothing is added: the code is shown to carry to the Home Screen app', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: IPHONE, viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(`${APP}/add#h=maple-court&c=K7Q4MPWR`)
  await expect(page.getByRole('heading', { name: 'Add Houses to your Home Screen.' })).toBeVisible()
  await expect(page.locator('.hs-carry .hs-code i:not(.gap)')).toHaveText(['K', '7', 'Q', '4', 'M', 'P', 'W', 'R'])
  const kept = await page.evaluate(() => new Promise(r => { const q = indexedDB.open('houses', 1); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains('houses')) return r(0); const g = db.transaction('houses').objectStore('houses').count(); g.onsuccess = () => r(g.result) } }))
  expect(kept, 'nothing was added in Safari').toBe(0)
  await ctx.close()
})

test('the Home Screen app asks for the code, and a wrong one says so', async ({ page }) => {
  await fresh(page)
  await page.goto(`${APP}/add`)
  await expect(page.getByRole('heading', { name: 'Add a house' })).toBeVisible()
  await page.getByLabel('The house’s web address').fill('maple-court.elyir.app')
  await page.getByLabel('The code').fill('AAAA BBBB')
  await expect(page.locator('.hs-error')).toContainText("isn't right")
  await page.getByLabel('The code').fill('k7q4-mpwr')
  await expect(page.getByRole('heading', { name: 'Added.' })).toBeVisible()
})

// ---- the panel inside it -------------------------------------------------------------------------

test('inside the app, the house is named where Connected was, and the name opens the houses', async ({ page, baseURL }) => {
  await app(page, APP, baseURL!, true)
  const frame = page.frameLocator('#f')
  const name = frame.locator('.house-switch')
  await expect(name).toContainText('Lake house')
  await expect(frame.locator('.topbar .link')).toHaveCount(0)
  await expect(name).toHaveClass(/others/)                         // another house wants somebody
  await name.click()
  await expect.poll(() => page.evaluate(() => (window as any).said)).toContain('houses:open')
})

test('the panel takes a pass only from the app', async ({ page, baseURL }) => {
  await app(page, ELSE, baseURL!)
  const frame = page.frameLocator('#f')
  await expect(frame.locator('.topbar')).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(frame.locator('.house-switch')).toHaveCount(0)      // nothing taken, so no name and no switch
})

test('outside the app, nothing changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?layout=wall&nav=top&at=19:40')
  await expect(page.locator('.topbar .link')).toBeVisible()
  await expect(page.locator('.house-switch')).toHaveCount(0)
})

// ---- a phone with no house (design/pretend-in-app/, B, chosen 19 October 2026) -----------------------

test('with no house the app says what it is and offers two ways on, stacked', async ({ page }) => {
  await fresh(page)
  await page.goto(`${APP}/`)
  await expect(page.getByRole('heading', { name: 'Your house, on this phone.' })).toBeVisible()
  const [add, pretend] = [page.getByRole('button', { name: 'Add a house' }), page.getByRole('button', { name: 'Try a pretend house' })]
  const [a, p] = [(await add.boundingBox())!, (await pretend.boundingBox())!]
  expect(p.y, 'Add a house first, the pretend house under it').toBeGreaterThan(a.y + a.height)
  expect(Math.abs(a.width - p.width)).toBeLessThan(2)
  expect(p.y + p.height).toBeLessThanOrEqual(844)

  await add.click()
  await expect(page.getByRole('heading', { name: 'Add a house' })).toBeVisible()
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByRole('heading', { name: 'Your house, on this phone.' })).toBeVisible()
})

test('the pretend house opens framed like a house, named so, and is never kept', async ({ page }) => {
  await fresh(page)
  await page.goto(`${APP}/?shell=ios&store=US`)
  await page.getByRole('button', { name: 'Try a pretend house' }).click()
  await expect(page.locator('.hs-frame')).toHaveAttribute('src', 'http://localhost:8399/?app=1&shell=ios&store=US')
  const name = page.frameLocator('.hs-frame').locator('.house-switch')
  await expect(name).toContainText('Pretend house')
  await name.click()
  await expect(page.getByRole('heading', { name: 'Your house, on this phone.' })).toBeVisible()
  const kept = await page.evaluate(() => new Promise(r => { const q = indexedDB.open('houses', 1); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains('houses')) return r(0); const g = db.transaction('houses').objectStore('houses').count(); g.onsuccess = () => r(g.result) } }))
  expect(kept).toBe(0)
})

// ---- the store app around it (design/store-app/, C, chosen 19 October 2026) ------------------------

test('the Houses app hands the store app\'s storefront on to the house it frames', async ({ page }) => {
  await fresh(page)
  await page.goto(`${APP}/add#h=maple-court&c=K7Q4MPWR`)
  await expect(page.getByRole('heading', { name: 'Added.' })).toBeVisible()
  await page.getByRole('button', { name: 'Lake house' }).click()
  await page.getByRole('button', { name: 'Open Lake house' }).click()
  await expect(page.frameLocator('.hs-frame').locator('.house-switch')).toContainText('Lake house')   // kept, before the app is opened again
  await page.goto(`${APP}/?shell=ios&store=US`)
  await expect(page.locator('.hs-frame')).toHaveAttribute('src', /\?app=1&shell=ios&store=US$/)
})

/* The last step of setup, reached the real way: from devices, inside the store app. The house is answered here
   rather than by the mock, which remembers a name claimed by an earlier test and would then skip the step for
   that reason instead of the one being tested. */
const OFFER = { open: true, price: '$3 a month', pay: 'https://pay.example/start' }
async function lastStep(page: Page, shell: string) {
  await page.context().route(/\/address$/, r => r.request().method() === 'POST'
    ? r.fulfill({ json: { offer: OFFER, guess: 'jordan', house: 'jordan', address: 'jordan.elyir.app', want: 'on', carried: false, pay: 'https://pay.example/start?c=hc_1' } })
    : r.fulfill({ json: { offer: OFFER, guess: 'jordan', house: null } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${APP}/stand-in?q=${encodeURIComponent(`&setup=1&page=devices&${shell}`)}`)
  const house = page.frameLocator('#f')
  await house.locator('.setup-page .setup-actions .button.big').click()
  return house
}

test('on the US storefront the offer stays, and its button opens the payment page in the browser', async ({ page }) => {
  const house = await lastStep(page, 'shell=ios&store=US')
  const step = house.locator('.address-step')
  await expect(step.locator('h1')).toHaveText('Use it anywhere?')
  await expect(step.locator('.address-amount')).toHaveText('$3')
  await expect(step.locator('.address-out')).toHaveText('Opens the payment page for jordan.elyir.app. You come back here when it’s done.')
  // On a phone the verdict goes under the field instead of off the edge.
  const [field, said] = [(await step.locator('.address-name').boundingBox())!, (await step.locator('.address-said').boundingBox())!]
  expect(said.y).toBeGreaterThan(field.y + field.height - 1)
  expect(said.x + said.width).toBeLessThanOrEqual(390)

  await page.context().route('https://pay.example/**', r => r.fulfill({ contentType: 'text/html', body: 'the payment page' }))
  const opened = page.context().waitForEvent('page')
  await step.getByRole('button', { name: 'Continue in Safari' }).click()
  expect((await opened).url()).toContain('pay.example/start?c=hc_1')
  await expect(step.locator('h1')).toHaveText('Finish in Safari.')
  await expect(step.locator('.setup-lede')).toHaveText('The payment page for jordan.elyir.app is open in Safari. This screen moves on by itself when it is done.')
  await expect(step.locator('.setup-status')).toContainText('Waiting for the payment')
  const [again, not] = [step.getByRole('button', { name: 'Open it again' }), step.getByRole('button', { name: 'Not now' })]
  expect(Math.abs((await again.boundingBox())!.y - (await not.boundingBox())!.y)).toBeLessThan(4)
})

test('on Android the browser is not named', async ({ page }) => {
  const house = await lastStep(page, 'shell=android&store=US')
  await expect(house.getByRole('button', { name: 'Continue in your browser' })).toBeVisible()
})

test('on any other storefront there is no step: setup ends at ready', async ({ page }) => {
  for (const shell of ['shell=ios&store=CA', 'shell=android&store=GB', 'shell=ios']) {
    const house = await lastStep(page, shell)
    await expect(house.locator('.setup-page h1')).toContainText('is ready', { timeout: 5000 })
    await expect(house.locator('.address-step')).toHaveCount(0)
  }
})

// ---- telling this phone (design/notify/, B, chosen 20 October 2026) ---------------------------------

/* Headless Chromium has no push service and answers every page that notifications are denied, whatever was
   granted, so the browser's part is played by hand: the permission, and the subscription it hands back.
   Everything after that -- the key, the houses told -- is the app's. */
const NO_PUSH_SERVICE = () => {
  Object.defineProperty(Notification, 'permission', { get: () => 'granted' })
  Notification.requestPermission = async () => 'granted'
  let current: any = null
  const w = window as any
  w.subscribedWith = null
  PushManager.prototype.subscribe = async function (opts?: PushSubscriptionOptionsInit) {
    const key = new Uint8Array(opts!.applicationServerKey as Uint8Array)
    w.subscribedWith = btoa(String.fromCharCode(...key)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    // made up on each run: a fixed sample here reads as a credential to the secret scan
    const b64 = (n: number) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const json = { endpoint: 'https://push.example/this-phone', expirationTime: null, keys: { p256dh: b64(65), auth: b64(16) } }
    current = { endpoint: json.endpoint, options: { applicationServerKey: key.buffer, userVisibleOnly: true }, toJSON: () => json, unsubscribe: async () => { current = null; w.unsubscribed = true; return true } }
    return current
  }
  PushManager.prototype.getSubscription = async function () { return current }
}

async function addHouse(page: Page, label: string, name: string) {
  await page.goto(`${APP}/add#h=${label}&c=K7Q4MPWR`)
  await expect(page.getByRole('heading', { name: 'Added.' })).toBeVisible()
  await page.getByLabel('What you call this house').fill(name)
  await page.getByRole('button', { name: `Open ${name}` }).click()
  await expect(page.frameLocator('.hs-frame').locator('.house-switch')).toContainText(name)
}

async function houses(page: Page) {
  await page.frameLocator('.hs-frame').locator('.house-switch').click()
  const sheet = page.getByRole('dialog', { name: 'Houses' })
  await expect(sheet).toBeVisible()
  return sheet
}

test('Houses has a part for this phone under Add a house, drawn as the board draws it', async ({ page }) => {
  await page.addInitScript(NO_PUSH_SERVICE)
  await fresh(page)
  await addHouse(page, 'maple-court', 'Home')
  await addHouse(page, 'lake', 'Lake house')
  const sheet = await houses(page)
  const part = sheet.getByRole('region', { name: 'This phone' })
  await expect(part.locator('.hs-phone-cap')).toHaveText('This phone')
  await expect(part.locator('.hs-phone-t')).toHaveText('Notifications')
  await expect(part.locator('.hs-phone-s')).toHaveText('Your houses can tell this phone when something needs you.')
  await expect(part.locator('.hs-phone-fine')).toHaveText('Each house decides what is worth telling you. Your browser’s maker sees that one of your houses sent this phone something, and when, never what.')
  const toggle = part.getByRole('switch', { name: 'Notifications' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  const add = (await sheet.locator('.hs-row', { hasText: 'Add a house' }).boundingBox())!
  const [box, row, sw] = [(await part.boundingBox())!, (await part.locator('.hs-phone-row').boundingBox())!, (await toggle.boundingBox())!]
  expect(box.y, 'under Add a house').toBeGreaterThan(add.y + add.height)
  expect(box.y - (add.y + add.height), 'close under it, as drawn').toBeLessThan(30)
  expect(Math.abs(box.x - 26), 'on the rows’ left edge').toBeLessThan(2)
  expect([sw.width, sw.height]).toEqual([50, 30])
  expect(Math.abs(sw.x + sw.width - (row.x + row.width)), 'the switch at the row’s right').toBeLessThan(1)
  expect(Math.abs(sw.x + sw.width - (add.x + add.width - 10)), 'lined up with the houses’ arrows').toBeLessThan(2)
  expect(Math.abs((sw.y + sw.height / 2) - (row.y + row.height / 2))).toBeLessThan(2)
})

test('inside the store app the part is not there: a web view has no web push', async ({ page }) => {
  await fresh(page)
  await addHouse(page, 'maple-court', 'Home')
  await page.goto(`${APP}/?shell=ios&store=US`)
  const sheet = await houses(page)
  await expect(sheet.locator('.hs-row', { hasText: 'Add a house' })).toBeVisible()
  await expect(sheet.locator('.hs-phone')).toHaveCount(0)
})

test('switched on, every house is handed the subscription and this phone’s key; switched off, every house lets it go', async ({ page }) => {
  await page.addInitScript(NO_PUSH_SERVICE)
  await fresh(page)
  await addHouse(page, 'maple-court', 'Home')
  await addHouse(page, 'lake', 'Lake house')
  const asked: { method: string; auth: string | undefined; body: any }[] = []
  page.on('request', r => { if (r.url().endsWith('/phones/me/push') && r.method() !== 'OPTIONS') asked.push({ method: r.method(), auth: r.headers().authorization, body: r.postDataJSON() }) })

  const sheet = await houses(page)
  const toggle = sheet.getByRole('switch', { name: 'Notifications' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(sheet.locator('.hs-phone-s')).toHaveText('Your houses can tell this phone when something needs you.')
  await expect.poll(() => asked.filter(a => a.method === 'POST').length).toBe(2)
  const subscribedWith = await page.evaluate(() => (window as any).subscribedWith)
  for (const { auth, body } of asked) {
    expect(auth).toBe('Bearer mocktoken')
    expect(body.subscription.endpoint).toBe('https://push.example/this-phone')
    expect(body.subscription.keys.auth).toBeTruthy()
    expect(body.tz).toBe('America/Chicago')
    expect(body.vapid.publicKey, 'subscribed with the key it hands the house').toBe(subscribedWith)
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(body.vapid.privateKey, 'base64url'))
    expect(ecdh.getPublicKey('base64url'), 'the public half is the private half’s').toBe(body.vapid.publicKey)
  }
  expect(new Set(asked.map(a => a.body.vapid.privateKey)).size, 'one key for every house').toBe(1)

  asked.length = 0
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => asked.filter(a => a.method === 'DELETE').length).toBe(2)
  expect(await page.evaluate(() => (window as any).unsubscribed)).toBe(true)
})

test('a house that could not be told is named, by this phone’s name for it', async ({ page }) => {
  await page.addInitScript(NO_PUSH_SERVICE)
  await fresh(page)
  await addHouse(page, 'maple-court', 'Home')
  await addHouse(page, 'lake', 'Lake house')
  let first = true
  await page.route('**/phones/me/push', r => {
    if (r.request().method() !== 'POST' || !first) return r.fallback()
    first = false
    return r.abort()
  })
  const sheet = await houses(page)
  await sheet.getByRole('switch', { name: 'Notifications' }).click()
  await expect(sheet.getByRole('switch', { name: 'Notifications' })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet.locator('.hs-phone-s')).toHaveText(/^(Home|Lake house) can’t tell this phone yet\. It will be asked again\.$/)
})

test('People shows which phones the house tells, read only', async ({ page }) => {
  await page.route('**/status', async r => { const res = await r.fetch(); const j = await res.json(); await r.fulfill({ json: { ...j, locked: true } }) })
  await page.goto('/?sheet=people')
  const rows = page.locator('.phones li').filter({ has: page.locator('.phones-icon') })
  const robin = rows.filter({ hasText: "Robin's Android phone" })
  await expect(robin.locator('.phones-sub')).toContainText(' · told when something needs it')
  await expect(rows.first().locator('.phones-sub'), 'the wall is never told; it shows').not.toContainText('told')
  await expect(robin.getByRole('switch')).toHaveCount(0)
})

// ---- the widget's houses (design/widget/, A and C, chosen 20 October 2026; docs/apps.md) ----------------------

/* The store app's half, by hand: a message handler where WKWebView puts one, keeping what it is handed. */
const IOS_SHELL = () => {
  const w = window as any
  w.toShell = []
  w.webkit = { messageHandlers: { houses: { postMessage: (m: unknown) => w.toShell.push(m) } } }
}

test('inside the store app the shell is handed every house and the one opened, and opens the one its widget asks for', async ({ page }) => {
  await page.addInitScript(IOS_SHELL)
  await fresh(page)
  await addHouse(page, 'maple-court', 'Home')
  await addHouse(page, 'lake', 'Lake house')
  expect(await page.evaluate(() => (window as any).toShell), 'in a browser nothing is posted, even with a handler there').toEqual([])

  await page.goto(`${APP}/?shell=ios&store=US&open=maple-court`)
  await expect(page.frameLocator('.hs-frame').locator('.house-switch')).toContainText('Home')
  await expect(page.locator('.hs-frame')).toHaveAttribute('src', /\?app=1&shell=ios&store=US$/)
  expect(new URL(page.url()).search, 'only open comes off the address').toBe('?shell=ios&store=US')

  const said = await page.evaluate(() => (window as any).toShell as any[])
  const list = said.find(m => m.type === 'houses:list')
  expect(list.houses.map((h: any) => [h.id, h.name]).sort()).toEqual([['lake', 'Lake house'], ['maple-court', 'Home']])
  for (const h of list.houses) {
    expect(Object.keys(h).sort()).toEqual(['id', 'lan', 'name', 'origin', 'token'])
    expect(h.token).toBe('mocktoken')
    expect(h.origin).toBe('http://localhost:8399')
  }
  expect(said.filter(m => m.type === 'houses:opened')).toEqual([{ type: 'houses:opened', id: 'maple-court' }])

  await page.frameLocator('.hs-frame').locator('.house-switch').click()
  await page.getByRole('dialog', { name: 'Houses' }).locator('.hs-row', { hasText: 'Lake house' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).toShell.filter((m: any) => m.type === 'houses:opened').map((m: any) => m.id))).toEqual(['maple-court', 'lake'])
})
