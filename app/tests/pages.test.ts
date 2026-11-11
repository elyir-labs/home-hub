// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* This house's doors in their four groups (design/every-screen/, This house B). */
import { describe, expect, it } from 'vitest'
import { grouped } from '../src/pages'

const door = (id: any) => ({ id })
const all = ['location', 'look', 'screen', 'routines', 'signals', 'people', 'accounts', 'things', 'printers', 'add', 'share', 'hub', 'happened', 'code', 'notes', 'power', 'developer'].map(door)
const names = (g: ReturnType<typeof grouped>) => g.map(x => `${x.name}: ${x.doors.map(d => d.id).join(' ')}`)

describe('the doors of This house, grouped', () => {
  it('sorts every door into the four groups, in the order drawn', () => {
    expect(names(grouped(all, true))).toEqual([
      'Every day: routines happened signals',
      'People: people share accounts',
      'The house: location things printers power',
      'The hub and this screen: screen look hub code developer',
    ])
  })

  it('leaves Add and Needs a look out: one has its own door, the other is said first', () => {
    const ids = grouped(all, true).flatMap(g => g.doors.map(d => d.id))
    expect(ids).not.toContain('add')
    expect(ids).not.toContain('notes')
  })

  it('calls the last group only the hub where there is no screen to speak of', () => {
    expect(grouped(all.filter(d => d.id !== 'screen'), false).at(-1)!.name).toBe('The hub')
  })

  it('drops a group with nothing in it rather than heading an empty list', () => {
    expect(names(grouped([door('routines'), door('hub')], false))).toEqual(['Every day: routines', 'The hub: hub'])
  })
})
