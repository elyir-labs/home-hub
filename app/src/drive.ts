// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A hub running from its USB stick, beside a drive with something on it (design/move-to-drive/, A with B's
   sheet, decided 20 October 2026). First run asks once; somebody who kept the drive can change their mind
   from This hub. These are the words and the rules; the screens are Setup.vue's and DriveSheet.vue's. */
import type { Drive, DriveState } from './api'

/* Which screen first run opens on, if this is any of its business. */
export function firstPage(s: DriveState | null): 'drive' | 'moved' | null {
  if (s?.moved) return 'moved'
  if (s?.ask && s.drive) return 'drive'
  return null
}

/* Sizes the way a drive is sold, in thousands, and never twice: a model that already says 500GB keeps its
   name and the size is said once, after it. */
export function size(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1).replace(/\.0$/, '')} TB`
  return `${Math.round(bytes / 1e9)} GB`
}
export function title(d: Drive): string {
  const model = d.model.replace(/\s*\d+(\.\d+)?\s*[GT]B$/i, '').trim() || 'A drive'
  return `${model} · ${size(d.bytes)}`
}

function ago(at: number, now: number): string {
  const days = Math.floor((now - at) / 86400)
  if (days < 1) return 'last used today'
  if (days < 2) return 'last used yesterday'
  if (days < 30) return `last used ${days} days ago`
  return `last used in ${new Date(at * 1000).toLocaleString('en-US', { month: 'long', year: new Date(now * 1000).getFullYear() === new Date(at * 1000).getFullYear() ? undefined : 'numeric' })}`
}

/* What is on it, as chips: the system by its own name, how much is stored, when it was last written. */
export function chips(d: Drive, now = Date.now() / 1000): string[] {
  const out = [d.system ?? 'Something the hub can’t read']
  if (d.used) out.push(`${size(d.used)} of files`)
  if (d.last) out.push(ago(d.last, now))
  return out
}

/* The sentence that names what erasing loses. Never "all data": the thing itself, by name. */
export function lost(d: Drive): string {
  const files = d.used ? `${size(d.used)} of files` : ''
  if (d.system && files) return `${d.system} and ${files}`
  return d.system || files || 'everything on it'
}

/* The word that wakes the erase button. Slow on purpose. */
export const confirmed = (typed: string) => typed.trim().toLowerCase() === 'erase'

/* This hub's row, while it runs from the stick. */
export function rowLine(d: Drive): string {
  return `It works, but it’s slower, and the stick has to stay in. This computer’s drive has ${d.system ?? 'something'} on it.`
}
