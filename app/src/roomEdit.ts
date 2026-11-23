// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/*
 * The words for renaming and removing a room (design/room-edit/, A).
 *
 * Removing asks one question -- where the room's things go -- and says in a sentence each what else follows,
 * so nobody learns afterward that the hallway screen now opens on a different room or a routine has gone.
 * The button says the whole act, and the drained card left on the Rooms tab says what was done and is the
 * undo. Pinned by tests/roomEdit.test.ts.
 */
import { bringRoomBack, type Removing } from './api'
import { failed } from './code'
import { forgetRemoved, notify, removedRooms } from './store'

/** "the Kitchen", but "Jordan's room": a possessive name already says whose. */
export const theRoom = (name: string) => /['’]s\b/.test(name) ? name : `the ${name}`

const count = (n: number) => n === 1 ? 'one thing' : `${n} things`
const list = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

export function asking(things: number): string {
  if (!things) return 'Nothing is in it.'
  return things === 1 ? 'Its one thing needs a room first. Where should it go?' : `Its ${things} things need a room first. Where should they go?`
}

export function following(f: Removing, to: string | null): string[] {
  const out = f.screens.map(s => to ? `The ${s} will open on ${theRoom(to)}.` : `The ${s} will ask which room it’s in.`)
  const going = f.routines_going, trimmed = f.routines_trimmed
  if (going.length) out.push(`${list(going)} ${going.length === 1 ? 'is' : 'are'} only for ${theRoom(f.name)}, so ${going.length === 1 ? 'it goes' : 'they go'} with it.`)
  if (trimmed.length) out.push(`${list(trimmed)} will carry on in ${trimmed.length === 1 ? 'its' : 'their'} other rooms.`)
  return out
}

export function removeLabel(name: string, things: number, to: string | null): string {
  if (!things) return `Remove ${theRoom(name)}`
  return to ? `Remove ${theRoom(name)}, move ${count(things)} to ${theRoom(to)}` : `Remove ${theRoom(name)}, leave ${count(things)} to place later`
}

/** What the drained card on the Rooms tab says. */
export function goneLine(things: number, to: string | null): string {
  if (!things) return 'Removed just now.'
  const are = things === 1 ? 'is' : 'are'
  return to ? `Removed just now. Its ${count(things)} ${are} in ${theRoom(to)}.` : `Removed just now. Its ${count(things)} ${are} waiting in New devices.`
}

/** The same, as one sentence, where there is no card to say it on. */
export function goneSaid(name: string, things: number, to: string | null): string {
  const room = theRoom(name), first = room[0].toUpperCase() + room.slice(1)
  return `${first} is removed.${goneLine(things, to).slice('Removed just now.'.length)}`
}

/** Bring it back, from the drained card or, where there is no Rooms tab, from the line that says it went. */
export async function bringBack(id: string): Promise<boolean> {
  const name = removedRooms[id]?.name ?? 'room'
  try { await bringRoomBack(id) } catch (e: any) { notify(failed(`Couldn’t bring ${theRoom(name)} back`, e), 'error'); return false }
  forgetRemoved(id)
  notify(`${name} is back.`)
  return true
}
