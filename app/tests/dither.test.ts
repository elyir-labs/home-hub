// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { cssLine, GRAIN_SHADES } from '../src/dither'

const src = (p: string) => readFileSync(`src/${p}`, 'utf8')

describe('dark gradients on a TV, without bands', () => {
  it('grain about three quarters of a shade either way: the strength the living room TV showed clean', () => {
    expect(GRAIN_SHADES).toBe(1.5)
  })

  it('reads a CSS angle the way CSS does', () => {
    expect(cssLine(100, 200, 180)).toEqual([50, 0, 50, 200].map(n => expect.closeTo(n, 6)))
    expect(cssLine(100, 200, 90)).toEqual([0, 100, 100, 100].map(n => expect.closeTo(n, 6)))
  })

  it('draws the sky\'s veil itself on a TV, stop for stop as the page\'s, so it is rounded once with the grain', () => {
    const css = src('panel.css').match(/\n\.sky-veil \{([^}]*)\}/)![1]
    const stops = [...css.matchAll(/rgba\(12, 13, 16, ([\d.]+)\) (\d+)%/g)].map(m => [+m[1], +m[2] / 100])
    const sky = src('Sky.vue')
    const n = (v: number) => String(v).replace(/^0\./, '.')
    expect(stops).toHaveLength(3)
    for (const [a, at] of stops) expect(sky).toContain(`addColorStop(${n(at)}, \`rgba(12, 13, 16, \${${n(a)} * veilNow})\`)`)
    expect(sky).toMatch(/props\.resting \? \.25 : 1/)
    expect(src('App.vue')).toMatch(/class="sky-veil" v-if="!tv"/)
  })

  it('draws every dark resting background on a TV between shades, and keeps the CSS on a wall', () => {
    const rest = src('TvRest.vue')
    expect(rest).not.toMatch(/<div[^>]*class="tvrest-(night|boardbg|wash)"/)
    for (const k of ['night', 'board', 'wash']) expect(rest).toContain(`kind="${k}"`)
    expect(rest).toMatch(/const dithered = !props\.wall && canFloat\(\)/)
    const back = src('TvBackdrop.vue')
    const css = src('panel.css')
    expect(css).toMatch(/\.tvrest-night \{[^}]*radial-gradient\(60% 50% at 30% 100%, #1a1830, transparent 70%\), #08090e/)
    expect(back).toContain("ctx.translate(W * .3, H); ctx.scale(W * .6, H * .5)")
    expect(css).toMatch(/\.tvrest-boardbg \{[^}]*linear-gradient\(160deg, #1b2030, #11131b\)/)
    expect(back).toContain("cssLine(W, H, 160)")
  })
})
