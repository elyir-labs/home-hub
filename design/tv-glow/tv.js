/* The remote, on a board: the arrow keys move the highlight to the nearest thing that way, OK
   (Enter) does what the hint says, and Back (Escape or Backspace) goes back. A click lights a thing
   too, so the board can be read with a mouse. A board can set window.tvKeys to take a key first. */
(function () {
  const screen = document.querySelector('.screen, .shot')
  screen.tabIndex = 0
  const all = () => [...screen.querySelectorAll('[data-f]')].filter((e) => e.offsetParent !== null && !e.closest('[hidden]'))
  let cur = screen.querySelector('[data-f-start]') || all()[0]

  function hint() {
    const box = document.getElementById('hint')
    if (!box || !cur) return
    box.innerHTML = (cur.dataset.hint || '').split(';').filter(Boolean).map((p) => {
      const [k, v] = p.split('|')
      const keys = k.split(' ').map((x) => x.startsWith('●') ? `<kbd class="dot" style="background:${x.slice(1)}"></kbd>`
        : x.startsWith('~') ? x.slice(1) : `<kbd>${x}</kbd>`).join('')
      return `<span>${keys}${v}</span>`
    }).join('')
    if (box.dataset.follow != null) {
      const r = cur.getBoundingClientRect(), s = screen.getBoundingClientRect(), z = s.width / screen.offsetWidth
      const top = (r.bottom - s.top) / z + 22, left = (r.left - s.left) / z
      box.style.top = Math.min(top, 1080 - 70) + 'px'
      box.style.left = Math.max(40, Math.min(left, 1920 - box.offsetWidth - 40)) + 'px'
    }
  }
  function light(e) {
    if (!e) return
    cur?.classList.remove('f'); cur = e; cur.classList.add('f')
    window.tvLit?.(cur)
    hint()
  }
  function center(e) { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r } }
  function move(dx, dy) {
    const a = center(cur)
    let best = null, score = Infinity
    for (const e of all()) {
      if (e === cur) continue
      const b = center(e)
      const along = dx ? (b.x - a.x) * dx : (b.y - a.y) * dy
      if (along <= 4) continue
      // overlap on the other axis counts as in line, so a row of different heights still moves straight
      const across = dx ? Math.max(0, Math.max(a.r.top, b.r.top) - Math.min(a.r.bottom, b.r.bottom)) ? Math.abs(b.y - a.y) : 0
                        : Math.max(0, Math.max(a.r.left, b.r.left) - Math.min(a.r.right, b.r.right)) ? Math.abs(b.x - a.x) : 0
      const s = along + across * 3
      if (s < score) { score = s; best = e }
    }
    if (best) light(best)
  }
  screen.addEventListener('keydown', (ev) => {
    if (window.tvKeys?.(ev.key, cur, light)) { ev.preventDefault(); hint(); return }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]
    if (d) { ev.preventDefault(); move(...d) }
    else if (ev.key === 'Enter') { ev.preventDefault(); cur?.click(); hint() }
  })
  screen.addEventListener('click', (ev) => { const e = ev.target.closest('[data-f]'); if (e && e !== cur) light(e); screen.focus() })
  screen.addEventListener('mouseenter', () => screen.focus())
  window.tvLight = light
  window.tvHint = hint
  requestAnimationFrame(() => { light(cur); screen.focus({ preventScroll: true }) })
})()
