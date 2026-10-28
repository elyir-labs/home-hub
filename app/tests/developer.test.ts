// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* For working on the hub, as design/developer/ chose it on 22 October 2026: B, a page of its own, and on This
   house's list by default whenever the hub is not on releases. These fail on purpose if the rules drift from
   PageB.dc.html and KeyPhone.dc.html. */
import { describe, expect, it } from 'vitest'
import type { Developer, DevScreen } from '../src/api'
import { behindScreens, choices, keySource, keyUrl, QUIET_AFTER, readKey, screenBuild, screenState, screenWhere, sha256, shortPrint, sshHint, tapper, TAPS, versionLabel } from '../src/developer'

const SHA = 'e39341a161495b2f26826c292bc0bbdb1a213aeb'
const now = 1_792_800_000
const dev = (over: Partial<Developer> = {}): Developer => ({ shown: true, channel: 'pi-image-wall', version: `pi-image-wall-${SHA}`, commit: SHA,
  landed: null, behind: null, ssh: { on: true, user: 'pi', host: 'hub.local', ip: '192.168.1.20', keys: [], pending: false },
  screens: [], requested: { channel: null }, ...over })
const screen = (over: Partial<DevScreen> = {}): DevScreen => ({ id: 'kitchen', name: 'Kitchen wall screen', host: 'screen.local', ip: '192.168.1.41',
  version: 'development-8c40702', commit: '8c40702bc43e', channel: 'development', landed: false, current: true, seen: now - 60, updating: false, ...over })

describe('the version reads as its name', () => {
  it('shortens a branch build to the branch and seven characters', () => {
    expect(versionLabel(`pi-image-wall-${SHA}`)).toBe('pi-image-wall · e39341a')
    expect(versionLabel('development-8c40702')).toBe('development · 8c40702')
  })
  it('leaves a release, and says what a build from a working copy is', () => {
    expect(versionLabel('v0.6.4')).toBe('v0.6.4')
    expect(versionLabel('0.6.4')).toBe('0.6.4')
    expect(versionLabel('dev')).toBe('Development build')
    expect(versionLabel(undefined)).toBe('Development build')
  })
})

describe('what the hub follows', () => {
  it('lists releases, main and development, then the branch it was flashed from, lit', () => {
    const c = choices(dev())
    expect(c.map(x => x.title)).toEqual(['Releases', 'main', 'development', 'pi-image-wall'])
    expect(c.filter(x => x.on).map(x => x.id)).toEqual(['pi-image-wall'])
    expect(c[3].say).toBe('Flashed from it, built on the hub. Until it lands, then development.')
  })
  it('says a landed branch moves to development on the next update, in the lamp color', () => {
    const b = choices(dev({ landed: 'pi-image-wall' }))[3]
    expect(b.say).toBe('Landed in development: the next update moves this hub there.')
    expect(b.warn).toBe(true)
  })
  it('on a named channel, says where the hub is on it and offers another branch', () => {
    const c = choices(dev({ channel: 'development', commit: '8c40702bc43e', behind: 2 }))
    expect(c.find(x => x.on)?.say).toBe('Every commit, once its build is ready. On 8c40702, 2 behind.')
    expect(c[3]).toMatchObject({ title: 'Another branch…', other: true, on: false })
    expect(choices(dev({ channel: 'release', version: 'v0.6.4', behind: 0 }))[0].say).toBe('What a house runs. On v0.6.4, up to date.')
  })
})

describe('the door and SSH', () => {
  it('names whether SSH is on', () => {
    expect(sshHint(dev())).toBe('SSH on')
    expect(sshHint(dev({ ssh: { ...dev().ssh, on: false } }))).toBe('SSH off')
  })
  it('sends a phone to this page with the key form open, at the hub’s own name', () => {
    expect(keyUrl('hub.local')).toBe('http://hub.local/?sheet=developer&key=1')
  })
  it('shows enough of a fingerprint to tell keys apart, and where each came from', () => {
    expect(shortPrint('SHA256:Xk3vAbCdEfGh9Qe')).toBe('SHA256:Xk3v…9Qe')
    expect(keySource('github:jordan')).toBe('from github.com/jordan')
    expect(keySource('pasted')).toBe('pasted')
  })
})

describe('a pasted key is read back before it is sent', () => {
  it('names its kind, its comment and its real fingerprint', () => {
    const k = readKey('  ssh-ed25519   AAAAC3NzaC1lZDI1NTE5AAAAICUwO0ZRXGdyfYiTnqm0v8rV4Ov2AQwXIi04Q05ZZG96 jordan@laptop\n')
    expect(k).toEqual({ line: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICUwO0ZRXGdyfYiTnqm0v8rV4Ov2AQwXIi04Q05ZZG96 jordan@laptop',
      type: 'ed25519', name: 'jordan@laptop', fingerprint: 'SHA256:jMtLbcm6rO027qTX3y5wqQfpU7jF2C0mTrXHNrnJ/zk' })
  })
  it('refuses what is not a public key', () => {
    expect(readKey('-----BEGIN OPENSSH PRIVATE KEY-----')).toBeNull()
    expect(readKey('ssh-ed25519 not*base64')).toBeNull()
    expect(readKey('')).toBeNull()
  })
  it('hashes as SHA-256 does, because a phone over http has no crypto.subtle', () => {
    const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hex(sha256(new Uint8Array(0)))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('the screens', () => {
  it('says each one is up to date, behind, updating or not answering', () => {
    expect(screenState(screen(), now)).toBe('current')
    expect(screenState(screen({ current: false }), now)).toBe('behind')
    expect(screenState(screen({ current: false, updating: true }), now)).toBe('updating')
    expect(screenState(screen({ seen: now - QUIET_AFTER - 1 }), now)).toBe('quiet')
    expect(screenState(screen({ seen: null }), now)).toBe('quiet')
  })
  it('gives a quiet one when it was last seen in place of its address', () => {
    expect(screenWhere(screen(), now)).toBe('screen.local · 192.168.1.41')
    expect(screenWhere(screen({ host: 'screen-3.local', seen: now - 2 * 86400 }), now)).toBe('screen-3.local · last seen 2 days ago')
  })
  it('marks a build whose branch has landed', () => {
    expect(screenBuild(screen({ commit: SHA, landed: true }))).toBe('e39341a · landed')
  })
  it('offers Update all only over the ones that are behind', () => {
    const d = dev({ screens: [screen(), screen({ id: 'hall', current: false }), screen({ id: 'bed', current: false, seen: now - 2 * 86400 })] })
    expect(behindScreens(d, now).map(s => s.id)).toEqual(['hall'])
  })
})

describe('seven taps on the version', () => {
  it('fire on the seventh, and start over after a pause', () => {
    const tap = tapper()
    const fired = Array.from({ length: TAPS }, (_, i) => tap(1000 + i * 300))
    expect(fired).toEqual([false, false, false, false, false, false, true])
    const slow = tapper()
    for (let i = 0; i < 6; i++) slow(1000 + i * 300)
    expect(slow(1000 + 5 * 300 + 2000)).toBe(false)
  })
})
