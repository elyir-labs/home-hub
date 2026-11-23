// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Renaming and removing a room, pinned to the board the household chose on 22 November (design/room-edit/, A):
   the question, what follows, the button that says the whole act, and the drained card. */
import { describe, expect, it } from 'vitest'
import { asking, following, goneLine, goneSaid, removeLabel, theRoom } from '../src/roomEdit'

const kitchen = { id: 'kitchen', name: 'Kitchen', things: 12, screens: ['Hallway screen'], routines_going: ['Morning kitchen', 'Last light'], routines_trimmed: [] }

describe('removing a room', () => {
  it('asks where its things go, and says nothing needs asking when it is empty', () => {
    expect(asking(12)).toBe('Its 12 things need a room first. Where should they go?')
    expect(asking(1)).toBe('Its one thing needs a room first. Where should it go?')
    expect(asking(0)).toBe('Nothing is in it.')
  })

  it('says what else follows, one sentence each', () => {
    expect(following(kitchen, 'Living room')).toEqual([
      'The Hallway screen will open on the Living room.',
      'Morning kitchen and Last light are only for the Kitchen, so they go with it.',
    ])
    expect(following({ ...kitchen, routines_going: [] }, null)).toEqual(['The Hallway screen will ask which room it’s in.'])
    expect(following({ ...kitchen, screens: [], routines_going: [], routines_trimmed: ['Evenings'] }, 'Living room'))
      .toEqual(['Evenings will carry on in its other rooms.'])
  })

  it('writes the whole act on the button', () => {
    expect(removeLabel('Kitchen', 12, 'Living room')).toBe('Remove the Kitchen, move 12 things to the Living room')
    expect(removeLabel('Kitchen', 1, null)).toBe('Remove the Kitchen, leave one thing to place later')
    expect(removeLabel('Bathroom', 0, null)).toBe('Remove the Bathroom')
  })

  it('leaves a card that says what was done', () => {
    expect(goneLine(12, 'Living room')).toBe('Removed just now. Its 12 things are in the Living room.')
    expect(goneLine(1, null)).toBe('Removed just now. Its one thing is waiting in New devices.')
    expect(goneLine(0, null)).toBe('Removed just now.')
    expect(goneSaid('Kitchen', 12, 'Living room')).toBe('The Kitchen is removed. Its 12 things are in the Living room.')
    expect(goneSaid('Bathroom', 0, null)).toBe('The Bathroom is removed.')
  })

  it('does not put "the" in front of a room that is somebody’s', () => {
    expect(theRoom('Jordan’s room')).toBe('Jordan’s room')
    expect(removeLabel("Sam's room", 0, null)).toBe("Remove Sam's room")
  })
})
