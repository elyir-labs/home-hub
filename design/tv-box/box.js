/* The other input, on a board: OK on an app shows the box's own screen in place of the hub's, and Home on the
   box's remote (H or Escape here, or a click) brings the house back, the way the hub would take the TV back. */
(function () {
  const el = document.createElement('div')
  el.className = 'box'
  el.innerHTML = `<div><div class="is">The Apple TV's own screen</div><div class="app-nm"></div>
    <p class="note">Drawn by the box, not the hub: its picture, its menus, its remote. The hub switched the TV over and woke the box on the way.</p></div>
    <div class="back"><span>Home on its remote<kbd>H</kbd>or<kbd>Esc</kbd>brings the house back</span></div>`
  document.querySelector('.screen').appendChild(el)
  let done = null
  const close = () => { el.classList.remove('open'); const d = done; done = null; d?.() }
  el.addEventListener('click', (ev) => { ev.stopPropagation(); close() })
  window.tvBox = {
    open(name, back) { el.querySelector('.app-nm').textContent = name; el.classList.add('open'); done = back },
    key(k) {
      if (!el.classList.contains('open')) return false
      if (['h', 'H', 'Escape', 'Home', 'Backspace'].includes(k)) close()
      return true
    },
  }
})()
