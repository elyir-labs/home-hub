/* The way back from the box (page 2): the TV's home as built (A, with the Watch row), and what happens around an app
   being opened. A board sets window.WAY before this loads: what the handover band says, what the box's screen says the
   way back is, and which keys stand in for it. */
(function () {
  const W = window.WAY
  const I = {
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    blind: '<path d="M4 4h16M5 4v11h14V4M5 8h14M5 12h14M12 15v4"/>',
    speaker: '<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7" r="1"/>',
    temp: '<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/>',
  }
  const svg = (k) => `<span class="ic"><svg viewBox="0 0 24 24">${I[k]}</svg></span>`
  const apps = [['Netflix', '150, 45, 50'], ['Disney+', '60, 120, 90'], ['YouTube', '45, 75, 150'], ['Prime Video', '160, 75, 60'], ['Max', '85, 60, 160'], ['Hulu', '170, 60, 95']]
  const here = [['Ceiling light', 'bulb', 'On, 35%', 1], ['Floor lamp', 'bulb', 'On, 24%', 1], ['Reading lamp', 'bulb', 'Off', 0], ['Blinds', 'blind', '70% open', 0], ['Speaker', 'speaker', 'Quiet', 0], ['Thermostat', 'temp', '71° · cooling', 0]]

  let h = '<section class="row here"><h2>Watch on the Apple TV</h2><div class="cards">'
  h += `<div class="card last" data-f data-f-start data-hint="OK|Back to Harbor Lights"><div class="still"></div>
    <div class="body"><div><div class="lbl">Last on</div><div class="nm">Harbor Lights</div></div><div class="where">In Max</div></div></div>`
  for (const [n, t] of apps) h += `<div class="card app" data-f data-app="${n}" data-t="${t}" style="--t:${t}" data-hint="OK|Watch ${n}"><div><div class="nm">${n}</div><div class="st">&nbsp;</div></div></div>`
  h += '</div></section><section class="row"><h2>In the living room</h2><div class="cards">'
  for (const [n, ic, st, on] of here)
    h += `<div class="card thing ${on ? 'light on' : ''}" data-f style="--c-rgb:233,184,114;--c:rgb(233,184,114);--v:${on ? 30 : 0}%;--g:${on ? .6 : 0}" data-hint="OK|${on ? 'Turn off' : 'Open'}">
      <div class="glow"></div>${svg(ic)}<div><div class="nm">${n}</div><div class="st">${st}</div></div>${on ? '<div class="bar"><i></i></div>' : ''}</div>`
  h += '</div></section>'
  const rowsEl = document.getElementById('rows'); rowsEl.innerHTML = h

  const band = document.createElement('div'); band.className = 'handover'
  document.querySelector('.screen').appendChild(band)
  const hint = document.getElementById('hint')

  let busy = false
  function open(card) {
    const n = card.dataset.app
    busy = true
    band.innerHTML = `<div class="tile" style="--t:${card.dataset.t}">${n}</div><div><b>Opening ${n} on the Apple TV</b><p>${W.line}</p></div><div class="bar"><i></i></div>`
    hint.style.visibility = 'hidden'
    band.classList.remove('on'); void band.offsetWidth; band.classList.add('on')
    setTimeout(() => {
      band.classList.remove('on'); hint.style.visibility = ''
      window.tvBox.open(n, () => {
        busy = false
        card.querySelector('.st').textContent = 'Just now'
        card.classList.add('was')
        W.back?.(card)
        window.tvLight(card)
      }, { way: W.boxWay, keys: W.keys })
    }, 2300)
  }
  window.tvKeys = (k, cur) => {
    if (window.tvBox.key(k)) return true
    if (busy) return true
    if (k === 'Enter' && cur.dataset.app) { open(cur); return true }
    return false
  }
  rowsEl.addEventListener('click', (ev) => { const e = ev.target.closest('[data-f]'); if (e?.classList.contains('f')) window.tvKeys('Enter', e) })
})()
