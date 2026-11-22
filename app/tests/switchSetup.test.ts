// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { foundLine, nameFor, next, progress, said, steps, switchLine } from '../src/switchSetup'

/* Setting a wall switch up on its light, pinned to the board that was picked (design/switch-setup/, C).
   The order is the argument: what can be seen first, what has to be said last. */
describe('the steps of setting a switch up', () => {
  it('goes light, dim, the other switch, walking in, then room and name', () => {
    expect(steps({ light: true })).toEqual(['light', 'dim', 'other', 'walkin', 'room', 'end'])
  })

  it('skips dimming and walking in for the far switch of a pair, which has no light of its own', () => {
    expect(steps({ light: false })).toEqual(['light', 'other', 'room', 'end'])
    expect(next('light', { light: false })).toBe('other')
  })

  it('counts five steps, and never the end', () => {
    expect(progress('dim', { light: true })).toEqual({ n: 2, of: 5 })
    expect(progress('other', { light: false })).toEqual({ n: 2, of: 3 })
  })

  it('keeps the answers so far above the question, in sentences', () => {
    const rows = said('other', { light: true, dims: true })
    expect(rows.map(r => r.answer)).toEqual(['it controls a light', 'it dimmed'])
  })

  it('names a light after its room unless somebody typed a name of their own', () => {
    expect(nameFor('Hallway', 'Brilliant switch 0020', '')).toBe('Brilliant switch 0020')
    expect(nameFor('Hallway', '', '')).toBe('Hallway light')
    expect(nameFor('Kitchen', 'Hallway light', 'Hallway light')).toBe('Kitchen light')
  })
})

describe('dimming is a choice, apart from what the bulbs can do (dimming is your choice, A)', () => {
  it('says what was found under the choice, and nothing when it was never found', () => {
    expect(foundLine({ canDim: true })).toBe('Its bulbs can dim · you saw it')
    expect(foundLine({ canDim: false })).toBe('Its bulbs can’t dim · you saw it')
    expect(foundLine({})).toBe('')
  })

  it('says how the switch is set up in one line on the light', () => {
    expect(switchLine({ light: true, dims: true, walkin: 'on_off' })).toBe('Wall switch · dims · comes on when someone walks in')
    expect(switchLine({ light: true, dims: false, walkin: 'nothing' })).toBe('Wall switch · on and off only')
  })
})

describe('the board it was built from', () => {
  const canvas = JSON.parse(readFileSync('../design/switch-setup/canvas.json', 'utf8'))

  it('is the one that was decided', () => {
    expect(canvas.pages[0].decided.chose).toMatch(/^C/)
  })

  it('asks about the bulbs by what was seen on the way down, with the four answers the board draws', () => {
    const board = readFileSync('../design/switch-setup/DimDownA.dc.html', 'utf8')
    const vue = readFileSync('src/SwitchSetup.vue', 'utf8')
    for (const answer of ['It got dimmer, smoothly, all the way down', 'It stayed bright, then went off near the end',
                          'It flickered or buzzed', 'I can&rsquo;t see it from here']) {
      expect(board).toContain(answer)
      expect(vue).toContain(answer.replace('&rsquo;', '’'))
    }
  })

  it('names the row for the choice it is, and the light points back to it', () => {
    const choose = canvas.pages.find((p: { id: string }) => p.id === 'choose')
    expect(choose.decided.chose).toMatch(/^A/)
    expect(readFileSync('src/SwitchSetup.vue', 'utf8')).toContain('From the switch')
    expect(readFileSync('src/Opened.vue', 'utf8')).toContain('pane-switch')
  })

  it('never sends anybody to the tab in the middle of the dim test (dim test A, picked 22 November)', () => {
    const dimTest = canvas.pages.find((p: { id: string }) => p.id === 'dim-test')
    expect(dimTest.decided.chose).toMatch(/^A/)
    const vue = readFileSync('src/SwitchSetup.vue', 'utf8')
    expect(vue).not.toContain('Watch again')
    expect(vue).not.toContain('It didn’t change')
  })
})
