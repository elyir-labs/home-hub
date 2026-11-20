// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Is every word on the screen readable against what is actually behind it?

   The sky changes with the hour and the weather, and the cards over it are glass, so a color that reads at night
   can vanish at noon (the resting TV's record, 20 November). Picking colors by eye cannot hold that, so this
   measures it: each piece of text's color, at its real opacity, against the pixels under it with the letters taken
   away but their shadow left, since a soft shadow is part of what the letters sit on, as the WCAG contrast ratio. Small text needs 4.5, large text (24px, or 18.66px bold) 3. The worst tenth of
   the pixels under a word decide, so one bright star does not fail it and a pale band across half of it does. */
import type { Page } from '@playwright/test'

export type Unreadable = { text: string; ratio: number; need: number; size: number }

export async function unreadable(page: Page, root = 'body'): Promise<Unreadable[]> {
  const texts = await page.evaluate((sel) => {
    const out: { text: string; rect: { x: number; y: number; w: number; h: number }; color: string; op: number; size: number; weight: number }[] = []
    const top = document.querySelector(sel)
    if (!top) return out
    const walk = document.createTreeWalker(top, NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      const n = walk.currentNode, el = n.parentElement
      if (!el || !n.textContent?.trim()) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      const range = document.createRange(); range.selectNodeContents(n)
      const r = range.getBoundingClientRect()
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue
      let op = 1
      for (let e: Element | null = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity)
      if (op < 0.05) continue
      out.push({ text: n.textContent.trim().slice(0, 60), rect: { x: r.left, y: r.top, w: r.width, h: r.height }, color: cs.color, op,
                 size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight) || 400 })
    }
    return out
  }, root)
  if (!texts.length) return []
  const hide = await page.addStyleTag({ content: '* { color: transparent !important; -webkit-text-fill-color: transparent !important; }' })
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const shot = await page.screenshot()
  await hide.evaluate(e => e.remove())
  return page.evaluate(async ({ b64, texts }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0)
    const dpr = img.width / innerWidth
    const one = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgba = (css: string) => { one.clearRect(0, 0, 1, 1); one.fillStyle = css; one.fillRect(0, 0, 1, 1); const d = one.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
    const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    const lum = (r: number, gg: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b)
    return texts.map(t => {
      const [r, gg, b, a] = rgba(t.color), alpha = a * t.op
      const d = g.getImageData(Math.floor(t.rect.x * dpr), Math.floor(t.rect.y * dpr), Math.max(1, Math.round(t.rect.w * dpr)), Math.max(1, Math.round(t.rect.h * dpr))).data
      const ratios: number[] = []
      for (let i = 0; i < d.length; i += 4 * 5) {
        const tr = r * alpha + d[i] * (1 - alpha), tg = gg * alpha + d[i + 1] * (1 - alpha), tb = b * alpha + d[i + 2] * (1 - alpha)
        const L1 = lum(tr, tg, tb), L2 = lum(d[i], d[i + 1], d[i + 2])
        ratios.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05))
      }
      ratios.sort((x, y) => x - y)
      const ratio = ratios[Math.floor(ratios.length * 0.1)]
      const large = t.size >= 24 || (t.size >= 18.66 && t.weight >= 600)
      return { text: t.text, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, size: t.size }
    }).filter(x => x.ratio < x.need)
  }, { b64: shot.toString('base64'), texts })
}
