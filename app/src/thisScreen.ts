// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* What a screen can be asked about itself, rather than about the house (design/this-screen/, A).

   The hub serves this panel but cannot reach the glass it is drawn on, so a screen answers for itself:
   startup/screen-helper.py, on the screen's own address, which way up it is drawn, a restart, and whether
   it runs the house or shows another hub's. A screen without it -- a tablet, or a phone -- has nothing
   to say here, and the page shows only what the panel keeps itself. ?helper= points it elsewhere for a
   preview. */
import { ref } from 'vue'

export type Turn = 0 | 90 | 180 | 270
export type Role = 'hub' | 'screen'
export type Here = { role: Role; turn: Turn; turns: boolean; other: { home: string } | null }

const base = new URLSearchParams(location.search).get('helper') || 'http://127.0.0.1:8380'

/** What this screen said about itself, or null when nothing on it answers. */
export const here = ref<Here | null>(null)

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(base + path, body === undefined ? { signal: AbortSignal.timeout(2500) }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) })
  const out = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(out.error || 'This screen didn’t answer.')
  return out as T
}

export async function ask(): Promise<Here | null> {
  try { here.value = await call<Here>('/this') } catch { here.value = null }
  return here.value
}

/* The four pictures, each the panel turned that far from how it is drawn now. On a screen hung sideways the
   right answer is the one that looks upright from where somebody is standing, so nobody has to work out
   which way left is. Their order is the board's and is pinned by tests/thisScreen.test.ts. */
export const WAYS: { by: Turn; name: string }[] = [
  { by: 0, name: 'As it is' }, { by: 90, name: 'Turn right' }, { by: 180, name: 'Turn over' }, { by: 270, name: 'Turn left' },
]

export const turned = (from: Turn, by: Turn): Turn => ((from + by) % 360) as Turn

/** What the row says under the pictures once a turn has been made, beside its Put it back. */
export function turnedLine(by: Turn): string {
  return by === 180 ? 'Turned over a moment ago.' : by === 90 ? 'Turned right a moment ago.' : 'Turned left a moment ago.'
}

/** The last turn made here, so Put it back can undo it. Cleared when the screen goes to rest. */
export const lastTurn = ref<{ by: Turn; from: Turn } | null>(null)

export async function turn(by: Turn) {
  const from = here.value?.turn ?? 0
  if (by === 0) return
  const r = await call<{ turn: Turn }>('/turn', { turn: turned(from, by) })
  if (here.value) here.value = { ...here.value, turn: r.turn }
  lastTurn.value = { by, from }
}

export async function putBack() {
  const t = lastTurn.value; if (!t) return
  const r = await call<{ turn: Turn }>('/turn', { turn: t.from })
  if (here.value) here.value = { ...here.value, turn: r.turn }
  lastTurn.value = null
}

export const restartScreen = () => call('/restart', {})
export const becomeRole = (to: Role) => call('/role', { to })

/** The line under This screen's door: where it is, and what it does. */
export function doorHint(room: string | null, role: Role | null, home: string): string {
  const what = role === 'hub' ? 'runs the house' : role === 'screen' ? `shows ${home}` : ''
  return [room, what].filter(Boolean).join(' · ') || 'This screen'
}
