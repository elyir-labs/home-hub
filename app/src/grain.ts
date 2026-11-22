// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A fixed grain over the sky. Its dark ramps have only a few shades to step through, and on a TV each step showed as
   a ring in the glow along the foot (22 November 2026). Noise a shade or two either side of middle gray, laid with
   overlay, turns the steps into a smooth ramp without lightening anything; it never moves, so nothing shimmers. */

export const GRAIN = 128      // pixels a side, one per device pixel
export const SPREAD = 14      // how far either side of middle gray: about two shades at the dark end

let made = ''
export function grainUrl(rand = Math.random): string {
  if (made) return made
  if (typeof document === 'undefined') return ''
  const c = document.createElement('canvas')
  c.width = c.height = GRAIN
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(GRAIN, GRAIN)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + Math.round((rand() * 2 - 1) * SPREAD)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  made = c.toDataURL('image/png')
  return made
}

/* One grain to a device pixel, whatever the screen's scale, so it is as fine as the glass allows. */
export const grainStyle = (dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1) => {
  const url = grainUrl()
  return url ? { backgroundImage: `url(${url})`, backgroundSize: `${GRAIN / dpr}px ${GRAIN / dpr}px` } : {}
}
