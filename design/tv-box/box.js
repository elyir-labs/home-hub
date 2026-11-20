/* The other input, on a board: OK on an app shows the box's own screen in place of the hub's, and the way back brings
   the house back. By default that is Home on the box's remote (H or Escape here, or a click); a board can name its own
   way back and its own keys: open(name, back, { way: 'html', keys: ['r', 'g'] }). */
(function () {
  const el = document.createElement('div')
  el.className = 'box'
  const WAY = 'Home on its remote<kbd>H</kbd>or<kbd>Esc</kbd>brings the house back'
  el.innerHTML = `<div><div class="is">The Apple TV's own screen</div><div class="app-nm"></div>
    <p class="note">Drawn by the box, not the hub: its picture, its menus, its remote. The hub switched the TV over and woke the box on the way.</p></div>
    <div class="back"><span class="way"></span></div>`
  document.querySelector('.screen').appendChild(el)
  let done = null, keys = ['h', 'H', 'Escape', 'Home', 'Backspace']
  const close = () => { el.classList.remove('open'); const d = done; done = null; d?.() }
  el.addEventListener('click', (ev) => { ev.stopPropagation(); close() })
  window.tvBox = {
    open(name, back, opts = {}) {
      el.querySelector('.app-nm').textContent = name
      el.querySelector('.way').innerHTML = opts.way || WAY
      keys = opts.keys || ['h', 'H', 'Escape', 'Home', 'Backspace']
      el.classList.add('open'); done = back
    },
    key(k) {
      if (!el.classList.contains('open')) return false
      if (keys.includes(k)) close()
      return true
    },
  }
})()
