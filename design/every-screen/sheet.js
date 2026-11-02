// This house, opened from the dock (B, chosen 1 November). Runs after every.js: lights the dock's This house
// door, dims the home under it and draws body[data-sheet]'s way of laying out the pages. The pages are the
// shipped ones (HousePanel.vue's doors), sorted into four groups; Add is left out because the dock has it.
(() => {
  const P = {
    pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    spark: '<path d="M12 4v5M12 15v5M4 12h5M15 12h5"/>',
    bulb: '<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.5M18 14c1.8.6 3 2.2 3 5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    screen: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 20h6"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
    chev: '<path d="m9 6 6 6-6 6"/>', back: '<path d="m15 6-6 6 6 6"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
  }
  const svg = (n, s = 17) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`

  const GROUPS = [
    ['Every day', [['spark', 'Routines', '5 routines, 1 off'], ['clock', 'What happened', '14 things today'], ['bulb', 'What the lights tell you', '2 of 4 on · 1 of your own']]],
    ['People', [['people', 'People and phones', '3 people, 2 home'], ['share', 'Share this house', 'Apple Home, Google Home, Alexa'], ['lock', 'Accounts', '2 need a look', 'warn']]],
    ['The house', [['pin', 'Where home is', 'Cedar Falls, IA'], ['box', 'What this house has', '37 things, and what brought each']]],
    ['The hub and this screen', [['screen', 'This screen', 'Hallway · runs the house'], ['sun', 'How it looks', 'Nightfall'], ['house', 'The hub', 'v0.3.0'], ['lock', 'Passcode', 'Not set', 'warn']]],
  ]
  const NEEDS = [['lock', 'Accounts', '2 need a look'], ['lock', 'Set a passcode', 'Anyone on your Wi-Fi can change the house']]

  const body = document.body, shape = body.dataset.shape, way = body.dataset.sheet
  const narrow = shape === 'tall7' || shape === 'phone'
  const screen = document.querySelector('.screen')
  const doors = screen.querySelectorAll('.dock .door'); doors[doors.length - 1]?.classList.add('on')

  const row = ([ic, nm, ht, cls], on) => `<div class="sr ${cls || ''} ${on ? 'on' : ''}"><span class="si">${svg(ic)}</span><span class="st2"><span class="sn">${nm}</span><span class="sh">${ht}</span></span><span class="sc">${svg('chev', 15)}</span></div>`
  const group = ([cap, items], onName) => `<section class="sg"><h3>${cap}</h3>${items.map(i => row(i, i[1] === onName)).join('')}</section>`
  const head = (title, sub, back) => `<header class="shd">${back ? `<span class="sbk">${svg('back', 18)}<span>${back}</span></span>` : ''}<div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><span class="sx">${svg('close', 18)}</span></header>`
  const needs = `<div class="needs">${NEEDS.map(([ic, nm, ht]) => `<div class="need"><span class="si">${svg(ic)}</span><span><b>${nm}</b><small>${ht}</small></span><span class="sc">${svg('chev', 15)}</span></div>`).join('')}</div>`
  const page = `<div class="pg">
      <p class="lede">Everyone who lives here, and the phones that can change the house.</p>
      ${[['J', 'Jordan', 'Home · this phone and the wall'], ['S', 'Sam', 'Away since 8:10 AM'], ['A', 'Alex', 'Home · a phone']].map(([i, n, s]) =>
        `<div class="pr"><b class="av">${i}</b><span><span class="sn">${n}</span><span class="sh">${s}</span></span><span class="pill">Change</span></div>`).join('')}
      <span class="pill solid">Add a phone</span></div>`

  const pageOpen = (new URLSearchParams(location.search).get('view') || body.dataset.view) === 'page'
  screen.insertAdjacentHTML('afterend', `<div class="flips"><span style="padding: 0 6px">Showing</span><a class="flip ${pageOpen ? '' : 'on'}" href="?view=menu">This house</a><a class="flip ${pageOpen ? 'on' : ''}" href="?view=page">a page open</a></div>`)
  let html = ''
  if (way === 'A') {
    html = `<div class="scrim"></div><div class="sheet sa ${pageOpen ? 'page' : 'rise'}">${pageOpen
      ? head('People and phones', '', 'This house') + page
      : head('This house', 'Maple Court') + needs + `<div class="sgs">${GROUPS.map(g => group(g)).join('')}</div>`}</div>`
  } else if (way === 'B') {
    const list = `<nav class="slist">${narrow ? '' : '<p class="cap">This house</p>'}${GROUPS.map(g => group(g, pageOpen ? 'People and phones' : '')).join('')}</nav>`
    if (narrow) {
      html = `<div class="scrim"></div><div class="sheet sb one">${pageOpen ? head('People and phones', '', 'This house') + page : head('This house', 'Maple Court') + needs + list}</div>`
    } else {
      html = `<div class="scrim"></div><div class="sheet sb two">${list}<div class="smain">${pageOpen
        ? head('People and phones') + page
        : head('This house', 'Maple Court') + needs + `<div class="ov"><div class="ovr"><span class="k">HOME</span><span>Cedar Falls, IA · Jordan and Alex are home</span></div><div class="ovr"><span class="k">SOFTWARE</span><span>v0.3.0, up to date</span></div><div class="ovr"><span class="k">THIS SCREEN</span><span>Hallway · runs the house</span></div></div>`}</div></div>`
    }
  } else if (way === 'C') {
    html = pageOpen
      ? `<div class="scrim"></div><div class="sheet sa">${head('People and phones', '', 'This house') + page}</div>`
      : `<div class="scrim light"></div><div class="pop">${GROUPS.map(([cap, items]) => `<section class="pg2"><h3>${cap}</h3>${items.map(([ic, nm, , cls]) =>
          `<div class="pi ${cls || ''}"><span class="si">${svg(ic, 16)}</span><span>${nm}</span>${cls === 'warn' ? '<i></i>' : ''}</div>`).join('')}</section>`).join('')}</div>`
  }
  screen.insertAdjacentHTML('beforeend', html)
})()
