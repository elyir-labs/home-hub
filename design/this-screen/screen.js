// The flips under each board. A row of .flip[data-v] inside .flips[data-k] sets body[data-<k>], and
// anything marked data-if="unit:screen step:ask,done" shows only while every one of those holds.
(() => {
  // The sheet's nav column, as shipped (HousePanel.vue). <nav class="nav" data-on="look" data-screen> also
  // draws the This screen entry that direction A adds; data-on can name it.
  const I = {
    pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    spark: '<path d="M12 4v5M12 15v5M4 12h5M15 12h5"/>',
    bulb: '<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.5M18 14c1.8.6 3 2.2 3 5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    screen: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 20h6"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  }
  const svg = n => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`
  document.querySelectorAll('nav.nav').forEach(nav => {
    const items = [
      ['location', 'pin', 'Where home is', 'Cedar Falls, IA'], ['look', 'sun', 'How it looks', 'Nightfall'],
      ['routines', 'spark', 'Routines', '5 routines, 1 off'], ['signals', 'bulb', 'What the lights tell you', '2 of 4 on · 1 of your own'],
      ['people', 'people', 'People and phones', '3 people, 2 home'], ['accounts', 'lock', 'Accounts', 'All working'],
      ['things', 'house', 'What this house has', '37 things, and what brought each'], ['add', 'plus', 'Add to the house', 'Lights, plugs, cameras, locks'],
      ['share', 'share', 'Share this house', 'Apple Home, Google Home, Alexa'], ['hub', 'house', 'The hub', 'v0.3.0'],
      ['happened', 'clock', 'What happened', ''],
    ]
    if (nav.dataset.screen !== undefined) items.splice(2, 0, ['screen', 'screen', 'This screen', nav.dataset.screen || 'Hallway', 'new'])
    nav.innerHTML = '<p class="cap">This house</p><div class="its">' + items.map(([id, ic, nm, ht, cls]) =>
      `<div class="it ${id === nav.dataset.on ? 'on' : ''} ${cls || ''}"><span class="ic">${svg(ic)}</span><span><span class="nm">${nm}</span><span class="ht">${ht}</span></span></div>`).join('') +
      '</div><div class="conn">CONNECTED</div>'
  })
  document.querySelectorAll('.close').forEach(c => { c.innerHTML = '&times;' })

  const show = () => document.querySelectorAll('[data-if]').forEach(el => {
    const ok = el.dataset.if.split(/\s+/).every(c => { const [k, vs] = c.split(':'); return vs.split(',').includes(document.body.dataset[k]) })
    el.style.display = ok ? '' : 'none'
  })
  document.querySelectorAll('.flips[data-k]').forEach(row => row.querySelectorAll('.flip').forEach(f => {
    f.classList.toggle('on', document.body.dataset[row.dataset.k] === f.dataset.v)
    f.addEventListener('click', () => {
      document.body.dataset[row.dataset.k] = f.dataset.v
      row.querySelectorAll('.flip').forEach(g => g.classList.toggle('on', g === f))
      show()
    })
  }))
  show()
})()
