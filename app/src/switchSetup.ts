/*
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
*/

/*
 * SETTING A WALL SWITCH UP, ON THE LIGHT ITSELF (design/switch-setup/, C, picked 22 November).
 *
 * After a switch joins, every question is about what the person can see: the house switches the light,
 * dims it, listens while they press the other switch, and asks what happened. Nobody is asked what
 * their bulbs are. Walking in, and the room and name, are the only things asked in words.
 *
 * The steps depend on the first answer: a switch with no light of its own is the far end of a pair, so
 * it has nothing to dim and nothing to come on, and its only job is to find the switch that has one.
 */

export type Step = 'light' | 'dim' | 'other' | 'walkin' | 'room' | 'end'
export type WalkIn = 'nothing' | 'on' | 'on_off'

export type Answers = {
  light?: boolean | null       // a light came on when the house tried it
  dims?: boolean | null        // what the switch does: dims (true) or only turns it on and off (false), chosen
  canDim?: boolean | null      // what its bulbs can do, found by the dim test; null for a switch set up before it asked
  partner?: string | null      // the other switch for the same light, as the house calls it
  walkin?: WalkIn
  restartOwed?: boolean        // dimming was chosen since the last time the switch was restarted
}

export function steps(a: Answers): Step[] {
  if (a.light === false) return ['light', 'other', 'room', 'end']
  return ['light', 'dim', 'other', 'walkin', 'room', 'end']
}

export function next(at: Step, a: Answers): Step {
  const s = steps(a)
  return s[Math.min(s.indexOf(at) + 1, s.length - 1)]
}

/** "2 of 5": the end is not a step anybody counts. */
export function progress(at: Step, a: Answers): { n: number; of: number } {
  const s: Step[] = steps(a).filter(x => x !== 'end')
  return { n: Math.max(1, s.indexOf(at) + 1), of: s.length }
}

export const WALKIN_WORDS: Record<WalkIn, string> = {
  on_off: 'On, then off after they leave',
  on: 'Turn it on',
  nothing: 'Nothing',
}

/** The answers so far, as sentences above the question, each with Change beside it. */
export function said(at: Step, a: Answers): { step: Step; lead: string; answer: string }[] {
  const out: { step: Step; lead: string; answer: string }[] = []
  const before = steps(a).slice(0, steps(a).indexOf(at))
  if (before.includes('light') && a.light != null)
    out.push({ step: 'light', lead: a.light ? 'A light came on when the house tried it:' : 'Nothing came on when the house tried it:',
               answer: a.light ? 'it controls a light' : 'it’s the other switch for a light' })
  if (before.includes('dim') && a.dims != null)
    out.push({ step: 'dim', lead: 'When the house dimmed it,', answer: a.dims ? 'it dimmed' : 'it stays on and off' })
  if (before.includes('other'))
    out.push({ step: 'other', lead: 'Other switches for this light:', answer: a.partner ? a.partner : 'just this one' })
  if (before.includes('walkin') && a.walkin)
    out.push({ step: 'walkin', lead: 'When someone walks in:', answer: WALKIN_WORDS[a.walkin].toLowerCase() })
  return out
}

/** Under "From the switch" on the settings page: what the house found, so the choice above it reads as one. */
export function foundLine(a: Answers): string {
  if (a.canDim === true) return 'Its bulbs can dim · you saw it'
  if (a.canDim === false) return 'Its bulbs can’t dim · you saw it'
  return ''
}

/** The one line on a light's own screen about the switch on the wall behind it. */
export function switchLine(a: Answers): string {
  const parts = ['Wall switch', a.dims ? 'dims' : 'on and off only']
  if (a.light !== false && a.walkin === 'on_off') parts.push('comes on when someone walks in')
  else if (a.light !== false && a.walkin === 'on') parts.push('turns on when someone walks in')
  return parts.join(' · ')
}

/** A room's light, named after the room, unless somebody already typed a name of their own. */
export function nameFor(room: string, typed: string, suggested: string): string {
  return !typed.trim() || typed === suggested ? `${room} light` : typed
}
