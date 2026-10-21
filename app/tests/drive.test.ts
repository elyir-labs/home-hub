// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A hub on its USB stick beside a drive with something on it (design/move-to-drive/, A with B's sheet,
   decided 20 October 2026). These pin the board's words: the drive named the way it was sold, what is on
   it, what erasing loses, and the word that has to be typed. */
import { describe, expect, it } from 'vitest'
import type { Drive, DriveState } from '../src/api'
import { chips, confirmed, firstPage, lost, rowLine, size, title } from '../src/drive'

const ubuntu: Drive = { name: 'nvme0n1', serial: 'S6P7NS0T', model: 'Samsung SSD 980 500GB', bytes: 500107862016, empty: false,
  system: 'Ubuntu 24.04', used: 61e9, last: 1792400000 }
const state = (over: Partial<DriveState> = {}): DriveState =>
  ({ from: 'stick', drives: [ubuntu], drive: ubuntu, ask: true, kept: false, moved: false, moving: false, ...over })

describe('where first run starts', () => {
  it('asks about a drive with something on it', () => expect(firstPage(state())).toBe('drive'))
  it('says the move happened, once, on the drive', () => expect(firstPage(state({ from: 'drive', ask: false, drive: null, moved: true }))).toBe('moved'))
  it('is none of its business otherwise', () => {
    expect(firstPage(state({ ask: false, kept: true }))).toBe(null)
    expect(firstPage(null)).toBe(null)
  })
})

describe('the drive, in a household’s words', () => {
  it('is named the way it was sold, with its size said once', () => expect(title(ubuntu)).toBe('Samsung SSD 980 · 500 GB'))
  it('counts in thousands, like the box', () => { expect(size(2e12)).toBe('2 TB'); expect(size(1.5e12)).toBe('1.5 TB'); expect(size(256060514304)).toBe('256 GB') })
  it('says what is on it and when it was last used', () =>
    expect(chips(ubuntu, 1792400000 + 86400 + 3600)).toEqual(['Ubuntu 24.04', '61 GB of files', 'last used yesterday']))
  it('says when it cannot read a drive, rather than nothing', () =>
    expect(chips({ ...ubuntu, system: null, used: null, last: null })).toEqual(['Something the hub can’t read']))
  it('names what erasing loses, never “all data”', () => {
    expect(lost(ubuntu)).toBe('Ubuntu 24.04 and 61 GB of files')
    expect(lost({ ...ubuntu, system: null, used: null })).toBe('everything on it')
  })
  it('puts it on This hub’s row in the same words', () =>
    expect(rowLine(ubuntu)).toBe('It works, but it’s slower, and the stick has to stay in. This computer’s drive has Ubuntu 24.04 on it.'))
})

describe('erasing', () => {
  it('wakes only on the word, typed', () => {
    expect(confirmed('eras')).toBe(false)
    expect(confirmed(' Erase ')).toBe(true)
    expect(confirmed('yes')).toBe(false)
  })
})
