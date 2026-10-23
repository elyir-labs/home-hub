/* For working on the hub, for the mock brain (design/developer/, B; the brain's half is brain/hub/developer.py).

   What a hub follows changes what the whole panel says about its own version, so a page asks for one with
   `?dev=` on the panel's own address, read off each request's Referer, the way ?printers= is. One mock serves every
   e2e test at once, so each page address gets its own copy, and what it changes (a key, a screen) is its own.

     (nothing)        a hub on releases: the page is not on the list until seven taps on the version
     ?dev=landed      flashed from pi-image-wall, which has landed in development; SSH on with two keys; three screens
     ?dev=branch      the same, the branch still being worked on
     ?dev=development on development, two behind
     ?dev=release     a hub on releases that somebody already revealed it on
     &ssh=off         SSH off, no keys
     &user=jordan     the hub's SSH user is not pi (HUB_SSH_USER, or the first user on the box)
     &code=1          every change, and looking up GitHub keys, asks for the passcode, which is 1234

   GitHub answers for jordan only: three keys, the third an old RSA one to leave off. As the brain does, removing the
   last key turns SSH off, and SSH cannot be turned on with no key. */

const SHA = 'e39341a161495b2f26826c292bc0bbdb1a213aeb', DEV = '8c40702bc43e94077332e33a983b538bbff4a68b'
const KEYS = [
  { line: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICUwO0ZRXGdyfYiTnqm0v8rV4Ov2AQwXIi04Q05ZZG96 jordan@laptop', type: 'ed25519', fingerprint: 'SHA256:jMtLbcm6rO027qTX3y5wqQfpU7jF2C0mTrXHNrnJ/zk', name: 'jordan@laptop' },
  { line: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEpVYGt2gYyXoq24w87Z5O/6BRAbJjE8R1JdaHN+iZSf jordan@studio', type: 'ed25519', fingerprint: 'SHA256:tZVVSz8vLQjMbBRWcdHPxJGMJlGoeUBFEFJlhXQdXuE', name: 'jordan@studio' },
  { line: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQADChEYHyYtNDtCSVBXXmVsc3qBiI+WnaSrsrnAx87V3OPq8fj/Bg0UGyIpMDc+RUxTWmFob3Z9hIuSmaCnrrW8w8rR2N/m7fT7AgkQFx4lLDM6QUhPVl1ka3J5gIeOlZyjqrG4v8bN1Nvi6fD3/gUMExohKC82PURLUllgZ251fIOKkZifpq20u8LJ0Nfe5ezz+gEIDxYdJCsyOUBHTlVcY2pxeH+GjZSboqmwt77FzNPa4ejv9v0ECxIZICcuNTxDSlFYX2ZtdHuCiZCXnqWss7rByM/W3eTr8vkABw4VHCMqMTg/Rk1UW2JpcHd+hYyTmqGor7a9xMvS2eDn7vX8AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dzj6vH4/wYNFBsiKTA3PkVMU1phaG92fYSLkpmgp661vMPK0djf5u30+wIJEBceJSwzOkFIT1ZdZGtyeYCHjpWco6qxuL/GzdTb4unw9/4FDBMaISgvNj1ES1JZYGdudXyDipGYn6attLvCydDX3uXs8/oBCA8WHSQrMjlAR05VXGNqcXh/ho2Um6KpsLe+xczT2uHo7/b9BAsSGSAnLjU8Q0pRWF9mbXR7gomQl56lrLO6wcjP1t3k6/L5AAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK+2vcTL0tng5+71/A== old-laptop', type: 'rsa 4096', fingerprint: 'SHA256:3WYXsm63f1NmI0y88zqMro4FkB/ZzAYRL7pUNtx2zfQ', name: 'old-laptop' },
]
const pages = new Map()

function asked(req) {
  let q = new URLSearchParams()
  try { q = new URL(req.headers.referer || '').searchParams } catch { /* no page behind it: a curl, a test */ }
  return { q, key: q.toString() }
}
function seed(q, now) {
  const dev = q.get('dev') || ''
  const channel = { landed: 'pi-image-wall', branch: 'pi-image-wall', development: 'development' }[dev] || 'release'
  const version = channel === 'pi-image-wall' ? `pi-image-wall-${SHA}` : channel === 'development' ? `development-${DEV}` : 'v0.3.0'
  const on = q.get('ssh') !== 'off' && dev !== ''
  return {
    code: q.get('code') === '1',
    d: { shown: dev !== '', channel, version, commit: channel === 'pi-image-wall' ? SHA : channel === 'development' ? DEV : 'abc123def456',
      landed: dev === 'landed' ? 'pi-image-wall' : null, behind: channel === 'development' ? 2 : channel === 'release' ? 0 : null,
      ssh: { on, user: q.get('user') || 'pi', host: 'hub.local', ip: '192.168.1.20', pending: false,
        keys: on ? [{ name: 'jordan@laptop', type: 'ed25519', fingerprint: KEYS[0].fingerprint, added: now - 3600, source: 'pasted' },
                    { name: 'jordan@studio', type: 'ed25519', fingerprint: KEYS[1].fingerprint, added: now - 7200, source: 'github:jordan' }] : [] },
      screens: dev === '' ? [] : [
        { id: 'kitchen', name: 'Kitchen wall screen', host: 'screen.local', ip: '192.168.1.41', version: `development-${DEV}`, commit: DEV, channel: 'development', landed: false, current: true, seen: now - 60, updating: false },
        { id: 'hallway', name: 'Hallway wall screen', host: 'screen-2.local', ip: '192.168.1.57', version: `pi-image-wall-${SHA}`, commit: SHA, channel: 'pi-image-wall', landed: true, current: false, seen: now - 120, updating: false },
        { id: 'bedroom', name: 'Bedroom wall screen', host: 'screen-3.local', ip: '192.168.1.63', version: 'development-71c0d2e', commit: '71c0d2e9a0b1', channel: 'development', landed: false, current: true, seen: now - 2 * 86400, updating: false },
      ],
      requested: { channel: null } },
  }
}
function page(req) {
  const a = asked(req)
  if (!pages.has(a.key)) pages.set(a.key, seed(a.q, Math.floor(Date.now() / 1000)))
  return pages.get(a.key)
}

/** /setup/status as this page's hub would answer it: its own version, so the panel names its own build. */
export function developerStatus(req, status) {
  const v = page(req).d.version
  return v === status.version ? status : { ...status, version: v }
}

function send(res, body, code = 200) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
function read(req, then) { let raw = ''; req.on('data', c => (raw += c)); req.on('end', () => { let b = {}; try { b = JSON.parse(raw) } catch { /* empty */ } then(b) }) }

export function developerRoute(req, res, p) {
  if (p !== '/developer' && !p.startsWith('/developer/')) return false
  const h = page(req), d = h.d
  if (req.method === 'GET' && p === '/developer') { send(res, d); return true }
  if (h.code && p !== '/developer' && req.headers['x-hub-code'] !== '1234') { send(res, { detail: 'code' }, 401); return true }
  if (req.method === 'GET' && p === '/developer/github-keys') {
    const user = new URL(req.url, 'http://x').searchParams.get('user') || ''
    if (user.toLowerCase() !== 'jordan') send(res, { detail: `GitHub has no keys for ${user}.` }, 404)
    else send(res, { keys: KEYS })
    return true
  }
  read(req, b => {
    const now = Math.floor(Date.now() / 1000)
    if (p === '/developer/show') d.shown = true
    else if (p === '/developer/hide') d.shown = false
    else if (p === '/developer/channel') {
      if (b.channel === 'nope') return send(res, { detail: 'There’s no branch called nope on GitHub.' }, 400)
      d.requested.channel = b.channel
    } else if (p === '/developer/ssh/keys' && req.method === 'POST') {
      for (const line of b.keys || []) {
        const k = KEYS.find(x => x.line === line) ?? { name: line.split(' ')[2] || 'A key with no name', type: 'ed25519', fingerprint: 'SHA256:' + line.slice(20, 63) }
        if (!d.ssh.keys.some(x => x.fingerprint === k.fingerprint)) d.ssh.keys.push({ name: k.name, type: k.type, fingerprint: k.fingerprint, added: now, source: b.source || 'pasted' })
      }
      d.ssh.on = true
    } else if (p.startsWith('/developer/ssh/keys/') && req.method === 'DELETE') {
      const fp = decodeURIComponent(p.slice('/developer/ssh/keys/'.length))
      d.ssh.keys = d.ssh.keys.filter(k => k.fingerprint !== fp)
      if (!d.ssh.keys.length) d.ssh.on = false
    } else if (p === '/developer/ssh') {
      if (b.on && !d.ssh.keys.length) return send(res, { detail: 'Add a key first: SSH with no key lets nobody in.' }, 400)
      d.ssh.on = !!b.on; if (!b.on) d.ssh.keys = []
    }
    else if (p === '/developer/screens/update') d.screens.forEach(s => { if (s.current === false) s.updating = true })
    else if (/^\/developer\/screens\/[^/]+\/update$/.test(p)) {
      const s = d.screens.find(x => x.id === decodeURIComponent(p.split('/')[3]))
      if (!s) return send(res, { detail: 'That screen isn’t in this house.' }, 404)
      s.updating = true
    } else return send(res, { detail: 'Not Found' }, 404)
    send(res, d)
  })
  return true
}
