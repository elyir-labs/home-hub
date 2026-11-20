/* What a tap does on these boards. [data-app] opens that app on the TV (the box wakes and switches the TV over by
   itself; the hub's TV screen helps where it was already awake), [data-pane] opens the box's pane, [data-x] closes it.
   Holding a card for half a second (or a right click) opens its pane too, as everywhere on the panel. */
(function () {
  const shot = document.querySelector('.shot'), pane = shot.querySelector('.pane')
  const APPS = [['Disney+', '60, 120, 90', 'The Bear'], ['Netflix', '150, 45, 50'], ['YouTube', '45, 75, 150'], ['Prime Video', '160, 75, 60'],
                ['Max', '85, 60, 160'], ['Hulu', '170, 60, 95'], ['Peacock', '105, 110, 125'], ['Plex', '160, 120, 40']]
  window.APPS = APPS
  if (pane) {
    pane.innerHTML = `<div class="x" data-x>&times;</div>
      <div class="left"><div class="where">Living room</div><h1>Apple TV</h1><div class="state">Asleep · the TV is on the house</div></div>
      <div class="right"><h2>Watch on the TV</h2>
        <div class="last" data-app="Disney+"><div class="still"></div><div class="t"><div><div class="lbl">Last on</div><b>The Bear</b></div><small>In Disney+</small></div></div>
        <div class="apps">${APPS.map(([n, t, s]) => `<div class="app" data-app="${n}" style="--t:${t}"><small>${s || ''}</small><b>${n}</b></div>`).join('')}</div>
        <div class="foot">The TV switches to the Apple TV by itself. A colored button on the TV's remote comes back to the house.</div></div>`
  }
  const toast = document.createElement('div'); toast.className = 'toast'; shot.appendChild(toast)
  let t
  const say = (s) => { toast.textContent = s; toast.classList.add('on'); clearTimeout(t); t = setTimeout(() => toast.classList.remove('on'), 2200) }
  shot.addEventListener('click', (e) => {
    const a = e.target.closest('[data-app]'), p = e.target.closest('[data-pane]'), x = e.target.closest('[data-x]')
    if (x) { pane.classList.remove('open'); return }
    if (a) {
      e.stopPropagation()
      shot.querySelectorAll('.sent').forEach((s) => s.classList.remove('sent'))
      a.classList.add('sent')
      say(`${a.dataset.app} is opening on the living room TV`)
      return
    }
    if (p && pane) pane.classList.add('open')
  })
  let hold
  shot.querySelectorAll('.box').forEach((b) => {
    b.addEventListener('pointerdown', () => { hold = setTimeout(() => pane?.classList.add('open'), 500) })
    b.addEventListener('pointerup', () => clearTimeout(hold))
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); pane?.classList.add('open') })
  })
})()
