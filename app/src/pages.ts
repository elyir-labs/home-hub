// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The pages of This house, and the store.sheet values that open the panel on
   one of them. 'house' is the panel's own front page. See HousePanel.vue. */
export type PageId = 'house' | 'location' | 'look' | 'screen' | 'routines' | 'signals' | 'people' | 'accounts' | 'things' | 'printers' | 'add' | 'share' | 'hub' | 'code' | 'notes' | 'happened' | 'changes' | 'developer'
export const PAGES: PageId[] = ['house', 'location', 'look', 'screen', 'routines', 'signals', 'people', 'accounts', 'things', 'printers', 'add', 'share', 'hub', 'code', 'notes', 'happened', 'changes', 'developer']
/* 'changes' has no door of its own: it is reached from inside What happened, and the door for that
   one stays lit while it is open. LIT says which door a page belongs to where it is not itself one. */
export const LIT: Partial<Record<PageId, PageId>> = { changes: 'happened' }
export const isPage = (v: unknown): v is PageId => (PAGES as unknown[]).includes(v)

/* The doors in four groups, in the words a household would use (design/every-screen/, This house B, chosen
   1 November 2026), rather than one list in the order the pages were built. 'power' is Solar and battery, a door
   to a pane rather than a page. Add is in no group: the dock and the phone's bar each have a door of their own
   for it. Needs a look is in none either, because what needs somebody is said first, above the groups. A screen
   that is not a wall has no This screen, so its last group is only the hub's. */
type DoorId = PageId | 'power'
const GROUPS: { name: string; doors: DoorId[] }[] = [
  { name: 'Every day', doors: ['routines', 'happened', 'signals'] },
  { name: 'People', doors: ['people', 'share', 'accounts'] },
  { name: 'The house', doors: ['location', 'things', 'printers', 'power'] },
  { name: 'The hub and this screen', doors: ['screen', 'look', 'hub', 'code', 'developer'] },
]
export function grouped<D extends { id: DoorId }>(doors: D[], onScreen: boolean): { name: string; doors: D[] }[] {
  return GROUPS.map(g => ({
    name: g.name === 'The hub and this screen' && !onScreen ? 'The hub' : g.name,
    doors: g.doors.flatMap(id => doors.filter(d => d.id === id)),
  })).filter(g => g.doors.length)
}
