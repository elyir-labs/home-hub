// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* For working on the hub (design/developer/, B, shown by default on a hub that is not on releases), as rules
   rather than drawing. DeveloperPage.vue draws them; these are the parts a test can hold. Nothing here reaches a
   household: the page is on This house's list only when the brain says `shown`. */
import type { Developer, DevScreen } from './api'

/** A build's name as people read it: "pi-image-wall · e39341a" for a branch build, a release as it is. */
export function versionLabel(v?: string | null): string {
  if (!v || v === 'dev') return 'Development build'
  const m = /^(?!v?\d+\.\d)(.+)-([0-9a-f]{7,40})$/i.exec(v)
  return m ? `${m[1]} · ${m[2].slice(0, 7).toLowerCase()}` : v
}

export const NAMED = ['release', 'main', 'development'] as const
export type Choice = { id: string; title: string; say: string; on: boolean; warn?: boolean; other?: boolean }

/** What this hub could follow, the one it does lit and saying where it is on it. */
export function choices(d: Developer): Choice[] {
  const here = d.behind === 0 ? 'up to date' : d.behind ? `${d.behind} behind` : ''
  const at = (what: string) => ` On ${what}${here ? `, ${here}` : ''}.`
  const branch = !(NAMED as readonly string[]).includes(d.channel)
  const out: Choice[] = [
    { id: 'release', title: 'Releases', say: 'What a house runs.' + (d.channel === 'release' ? at(versionLabel(d.version)) : ''), on: d.channel === 'release' },
    { id: 'main', title: 'main', say: 'What is about to be released.' + (d.channel === 'main' ? at(d.commit.slice(0, 7)) : ''), on: d.channel === 'main' },
    { id: 'development', title: 'development', say: 'Every commit, once its build is ready.' + (d.channel === 'development' ? at(d.commit.slice(0, 7)) : ''), on: d.channel === 'development' },
  ]
  if (branch) out.push({ id: d.channel, title: d.channel, on: true, warn: !!d.landed,
    say: d.landed ? 'Landed in development: the next update moves this hub there.' : 'Flashed from it, built on the hub. Until it lands, then development.' })
  else out.push({ id: '', title: 'Another branch…', say: 'Any branch on GitHub, built on the hub.', on: false, other: true })
  return out
}

/** The door's second line. */
export const sshHint = (d: Developer) => d.ssh.pending ? (d.ssh.on ? 'SSH turning off' : 'SSH turning on') : d.ssh.on ? 'SSH on' : 'SSH off'

/* A screen reports in on a short timer (startup/screen-update.sh), so one silent this long has stopped answering. */
export const QUIET_AFTER = 15 * 60
export type ScreenState = 'updating' | 'quiet' | 'current' | 'behind' | 'unknown'
export function screenState(s: DevScreen, now = Date.now() / 1000): ScreenState {
  if (s.updating) return 'updating'
  if (!s.seen || now - s.seen > QUIET_AFTER) return 'quiet'
  return s.current === true ? 'current' : s.current === false ? 'behind' : 'unknown'
}
export function ago(ts: number, now = Date.now() / 1000): string {
  const s = Math.max(0, now - ts)
  if (s < 3600) { const m = Math.max(1, Math.round(s / 60)); return m === 1 ? 'a minute ago' : `${m} minutes ago` }
  if (s < 86400 * 2) { const h = Math.round(s / 3600); return h === 1 ? 'an hour ago' : h < 36 ? `${h} hours ago` : 'yesterday' }
  return `${Math.round(s / 86400)} days ago`
}
/** Where a screen is, or when it was last heard from. */
export function screenWhere(s: DevScreen, now = Date.now() / 1000): string {
  if (screenState(s, now) === 'quiet') return s.seen ? `${s.host} · last seen ${ago(s.seen, now)}` : `${s.host} · not heard from yet`
  return [s.host, s.ip].filter(Boolean).join(' · ')
}
export const screenBuild = (s: DevScreen) => s.commit.slice(0, 7) + (s.landed ? ' · landed' : '')
export const behindScreens = (d: Developer | null, now = Date.now() / 1000) => (d?.screens ?? []).filter(s => screenState(s, now) === 'behind')

/** "SHA256:Xk3v…9Qe": enough of a fingerprint to tell two keys apart at a glance. */
export function shortPrint(fp: string): string {
  const [algo, body] = fp.includes(':') ? [fp.slice(0, fp.indexOf(':') + 1), fp.slice(fp.indexOf(':') + 1)] : ['', fp]
  return body.length > 10 ? `${algo}${body.slice(0, 4)}…${body.slice(-3)}` : fp
}
export function keySource(source: string): string {
  return source.startsWith('github:') ? `from github.com/${source.slice(7)}` : 'pasted'
}

/** Where a phone or computer adds a key: the hub's own name, on this page with the key form open. */
export const keyUrl = (host: string) => `http://${host}/?sheet=developer&key=1`

/* Seven taps on the version, as a phone turns on its developer options. A pause longer than this starts over. */
export const TAPS = 7, TAP_GAP = 1500
export function tapper(n = TAPS, gap = TAP_GAP) {
  let count = 0, last = 0
  return (now = Date.now()) => {
    count = now - last > gap ? 1 : count + 1
    last = now
    if (count < n) return false
    count = 0
    return true
  }
}

/* One pasted line, read back before it is sent: what kind of key and whose. The brain checks it again. */
const TYPES: Record<string, string> = { 'ssh-ed25519': 'ed25519', 'ssh-rsa': 'rsa', 'ecdsa-sha2-nistp256': 'ecdsa', 'ecdsa-sha2-nistp384': 'ecdsa',
  'ecdsa-sha2-nistp521': 'ecdsa', 'sk-ssh-ed25519@openssh.com': 'ed25519-sk', 'sk-ecdsa-sha2-nistp256@openssh.com': 'ecdsa-sk' }
export type Pasted = { line: string; type: string; name: string; fingerprint: string }
export function readKey(text: string): Pasted | null {
  const line = text.trim().replace(/\s+/g, ' ')
  const m = /^(\S+) ([A-Za-z0-9+/]+={0,3})(?: (.+))?$/.exec(line)
  if (!m || !TYPES[m[1]]) return null
  let blob: Uint8Array
  try { blob = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) } catch { return null }
  if (blob.length < 20) return null
  return { line, type: TYPES[m[1]], name: m[3] ?? 'A key with no name', fingerprint: 'SHA256:' + btoa(String.fromCharCode(...sha256(blob))).replace(/=+$/, '') }
}

/* SHA-256, because a phone opening hub.local over http is not a secure context and has no crypto.subtle, and the
   fingerprint is what a person compares against `ssh-keygen -lf`. */
const K = Uint32Array.from([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138,
  0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624,
  0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f,
  0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2])
export function sha256(data: Uint8Array): Uint8Array {
  const len = data.length, padded = new Uint8Array(((len + 9 + 63) >> 6) << 6)
  padded.set(data); padded[len] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000)); view.setUint32(padded.length - 4, (len << 3) >>> 0)
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64), rot = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(o + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2]
      w[i] = (w[i - 16] + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + w[i - 7] + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10))) >>> 0
    }
    let [a, b, c, d, e, f, g, k] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer)
  h.forEach((x, i) => ov.setUint32(i * 4, x))
  return out
}
