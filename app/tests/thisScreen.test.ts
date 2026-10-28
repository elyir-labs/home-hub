// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* This screen (design/this-screen/, A, chosen 22 October 2026). The board is OwnPageA.dc.html and, for a
   screen moved from a table to a tall wall, TurnTallA.dc.html: four pictures in this order, each the panel
   turned that far from how it is drawn now, so the one that looks upright is the answer. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { doorHint, here, lastTurn, putBack, turn, turned, turnedLine, WAYS } from '../src/thisScreen'

describe('which way up', () => {
  it('offers the four turns in the order the board draws them', () => {
    expect(WAYS.map(w => [w.by, w.name])).toEqual([[0, 'As it is'], [90, 'Turn right'], [180, 'Turn over'], [270, 'Turn left']])
  })

  it('counts each picture from how the screen is drawn now, by quarters, all the way round', () => {
    expect(turned(0, 270)).toBe(270)
    expect(turned(90, 270)).toBe(0)
    expect(turned(270, 180)).toBe(90)
    expect(turned(180, 0)).toBe(180)
  })

  it('says what was just done, beside its Put it back', () => {
    expect(turnedLine(180)).toBe('Turned over a moment ago.')
    expect(turnedLine(90)).toBe('Turned right a moment ago.')
    expect(turnedLine(270)).toBe('Turned left a moment ago.')
  })
})

describe('turning, and putting it back', () => {
  afterEach(() => { vi.unstubAllGlobals(); here.value = null; lastTurn.value = null })
  const answering = () => {
    const sent: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')); sent.push(body)
      return new Response(JSON.stringify({ turn: body.turn }), { status: 200 })
    }))
    return sent
  }

  it('asks the screen for where the picture points, not for the picture', async () => {
    const sent = answering()
    here.value = { role: 'screen', turn: 90, turns: true, other: null }
    await turn(270)
    expect(sent).toEqual([{ turn: 0 }])
    expect(here.value.turn).toBe(0)
    expect(lastTurn.value).toEqual({ by: 270, from: 90 })
  })

  it('puts it back where it was, once', async () => {
    const sent = answering()
    here.value = { role: 'screen', turn: 0, turns: true, other: null }
    await turn(180)
    await putBack()
    expect(sent).toEqual([{ turn: 180 }, { turn: 0 }])
    expect(lastTurn.value).toBeNull()
  })

  it('does nothing for As it is', async () => {
    const sent = answering()
    here.value = { role: 'screen', turn: 0, turns: true, other: null }
    await turn(0)
    expect(sent).toEqual([])
  })
})

describe('the door', () => {
  it('says where the screen is and what it does before anybody opens it', () => {
    expect(doorHint('Hallway', 'screen', 'Maple Court')).toBe('Hallway · shows Maple Court')
    expect(doorHint('Hallway', 'hub', 'Maple Court')).toBe('Hallway · runs the house')
    expect(doorHint(null, null, 'Maple Court')).toBe('This screen')
  })
})
