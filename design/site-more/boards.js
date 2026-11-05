/* The drawings for design/site-more/: hub.elyir.com as built (site/dist), with each board's sections put into it, so
   every color, size and word around them is the page's own. app/mock/site-more-shots.mjs opens the page each board
   names, runs draw(id) here, and keeps the picture. Boards on /try/ draw over the pretend house on a phone. */
window.SITE_MORE = {
  draw(id) {
    const css = document.createElement('style')
    css.textContent = STYLE
    document.head.append(css)
    const fn = BOARDS[id.replace(/-(phone|try)$/, '')]
    if (fn) fn()
  },
}

const STYLE = `
.does { display: grid; gap: 26px }
.does .four { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px }
.does .one { display: grid; gap: 10px; align-content: start }
.does .one svg { color: var(--lamp-text) }
.does .one h3 { font-weight: 500; font-size: 19px; letter-spacing: -.01em; margin: 0 }
.does .one p { color: var(--quiet); font-size: 15px }
.does .pics4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px }
.does figure { margin: 0; display: grid; gap: 12px; align-content: start }
.does figure .card { background: var(--bezel); border: 1px solid rgba(255, 255, 255, .09); border-radius: 18px; padding: 10px; aspect-ratio: 4 / 3;
  display: grid; place-items: center; overflow: hidden }
.does figure .card img { max-width: 100%; max-height: 100%; border-radius: 12px; display: block }
.does figure h3 { font-weight: 500; font-size: 18px; margin: 0 }
.does figure p { color: var(--quiet); font-size: 15px; margin-top: -6px }
.works { display: grid; grid-template-columns: minmax(0, 480px) minmax(0, 1fr); gap: 56px; align-items: start }
.works .lines { display: grid; gap: 14px }
.works .lines p:not(.label) { color: var(--quiet); font-size: 18px }
.kinds { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 32px; margin: 0; padding: 0; list-style: none }
.kinds li { padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 16px }
.chips { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none }
.chips li { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line);
  background: var(--surface); font-size: 15px }
.chips li svg { color: var(--lamp-text) }
.brands { color: var(--faint); font-size: 14.5px; margin-top: 16px; max-width: 70ch }
.brands b { color: var(--quiet); font-weight: 500 }
.faq h2 { margin-bottom: 26px }
.faq .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 30px 56px }
.faq .q { display: grid; gap: 6px; align-content: start }
.faq .q b { font-weight: 500; font-size: 17px }
.faq .q p { color: var(--quiet); font-size: 15.5px }
.faq a, .asks a { color: var(--lamp-text); text-decoration: none }
.faq details { border-top: 1px solid var(--line); padding: 18px 0; max-width: 820px }
.faq details:last-of-type { border-bottom: 1px solid var(--line) }
.faq summary { list-style: none; display: flex; justify-content: space-between; gap: 16px; font-size: 18px; font-weight: 500; cursor: pointer }
.faq summary::-webkit-details-marker { display: none }
.faq summary::after { content: '+'; color: var(--faint); font-weight: 400; font-size: 22px; line-height: 1 }
.faq details[open] summary::after { content: '–' }
.faq details p { color: var(--quiet); font-size: 15.5px; margin-top: 10px; max-width: 64ch }
.asks .head { display: grid; gap: 12px; margin-bottom: 26px; max-width: 760px }
.asks .row { display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); gap: 40px; padding: 24px 0; border-top: 1px solid var(--line) }
.asks .row h3 { font-weight: 500; font-size: 22px; letter-spacing: -.015em; margin: 0 }
.asks .row .a { display: grid; gap: 12px; color: var(--quiet); font-size: 16.5px; max-width: 70ch }
.asks .row .a .brands { margin: 0 }
@media (max-width: 960px) {
  .does .four, .does .pics4 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 18px }
  .works { grid-template-columns: minmax(0, 1fr); gap: 24px }
  .faq .two { grid-template-columns: minmax(0, 1fr) }
  .asks .row { grid-template-columns: minmax(0, 1fr); gap: 10px }
}
@media (max-width: 640px) {
  .does .four { grid-template-columns: minmax(0, 1fr) }
  .does .one { grid-template-columns: 28px 1fr; gap: 4px 12px }
  .does .one svg { grid-row: span 2; margin-top: 3px }
  .kinds { grid-template-columns: minmax(0, 1fr) }
}
.try-bar { position: fixed; left: 0; right: 0; top: 0; height: 44px; z-index: 9999; display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; background: #f1eee8; color: #1c1a16; font: 500 14.5px 'Instrument Sans', system-ui, sans-serif }
.try-bar span { color: #57534b; font-weight: 400 }
.try-bar a { color: #1c1a16; text-decoration: none; display: inline-flex; align-items: center; gap: 4px }
.try-pill { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(18px + env(safe-area-inset-bottom)); z-index: 9999;
  display: inline-flex; align-items: center; gap: 12px; height: 46px; padding: 0 7px 0 18px; border-radius: 999px; background: rgba(241, 238, 232, .96);
  color: #1c1a16; font: 500 15px 'Instrument Sans', system-ui, sans-serif; box-shadow: 0 12px 30px rgba(0, 0, 0, .45); white-space: nowrap }
.try-pill a { display: inline-flex; align-items: center; height: 32px; padding: 0 14px; border-radius: 999px; background: #1c1a16; color: #f1eee8; text-decoration: none }
`

const svg = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const ICON = {
  home: svg('<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>'),
  words: svg('<path d="M4 6h16v10H9l-5 4z"/>'),
  music: svg('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  camera: svg('<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>'),
  light: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  heat: svg('<path d="M12 3v11"/><circle cx="12" cy="17" r="3.5"/><path d="M10 6h4M10 9h4"/>'),
  blind: svg('<path d="M4 4h16M5 4v12h14V4M5 8h14M5 12h14"/><path d="M12 16v4"/>'),
  speaker: svg('<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7" r="1"/>'),
  sensor: svg('<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/>'),
  back: svg('<path d="M15 6l-6 6 6 6"/>'),
}

/* Said once, so the three directions argue about where and how, never about what. */
const DOES = [
  ['home', 'Works when the internet doesn’t', 'Everything runs on the hub in your house. If the internet goes down, the lights, switches and routines don’t notice.'],
  ['words', 'Tell it in words', 'Type “kitchen lights off” or “movie in the living room” and it happens, the same as a tap.'],
  ['music', 'Music in every room', 'Play something on the speakers you already have, in one room or in several at once.'],
  ['camera', 'Cameras on the wall', 'See the front door and the yard on the wall and on every phone in the house.'],
]
const KINDS = [
  ['light', 'Lights and plugs'], ['light', 'Switches and dimmers'], ['lock', 'Locks'], ['heat', 'Thermostats'],
  ['camera', 'Cameras and doorbells'], ['blind', 'Blinds and shades'], ['speaker', 'Speakers and TVs'], ['sensor', 'Motion and door sensors'],
]
const BRANDS = 'Including <b>Philips Hue, IKEA, Sonos, Google Nest, Ring, ecobee, Lutron Caséta, TP-Link Kasa, Shelly, WiZ, Chromecast, Roku</b> and <b>Samsung and LG TVs</b>, anything that works with <b>Matter</b>, and <b>Zigbee</b> or <b>Z-Wave</b> things with a USB radio. It finds most of them on its own.'
const FAQ = [
  ['Do I need to know Home Assistant?', 'No. The hub runs it for you, and nothing in the house ever asks you to open it.'],
  ['What happens when the internet is down?', 'The house keeps working: the wall, the phones at home and the routines. Only using it away from home waits for the internet to come back.'],
  ['What does it cost?', 'Nothing at home: the software is free, on a computer you have. Using it away from home is $3 a month, and stopping only stops that.'],
  ['What leaves my house?', 'Nothing unless you ask for it. <a href="/privacy">What leaves your house</a> says exactly what does when you do.'],
  ['Does it work with Apple Home or Google Home?', 'Yes. Share the house with either from the hub, and the lights you choose show up there too.'],
  ['What screen goes on the wall?', 'Any tablet or touchscreen with a web browser. Every phone in the house gets the same house.'],
]

/* D's, after the pick: only the makers the hub's own code knows by name, and the question Moving out answers. */
const BRANDS_D = 'Including <b>Philips Hue, Sonos, Google Nest, Ring, ecobee, WiZ, TP-Link Kasa, Chromecast</b> and <b>Roku</b>, <b>Samsung, LG and Android TVs</b>, anything that works with <b>Matter</b>, <b>Zigbee</b> or <b>Z-Wave</b> things with a USB radio, and most of what Home Assistant works with.'
const FAQ_D = [...FAQ, ['What if I move?', 'Leave the hub for the next people: your phones, passcode and sign-ins go, and the rooms, lights and routines stay for them. Or erase it and take it with you.']]

function section(id, cls, html) {
  const s = document.createElement('section')
  s.id = id
  s.className = cls
  s.innerHTML = html
  return s
}
const after = (sel, el) => document.querySelector(sel).after(el)
const onTry = () => location.pathname.startsWith('/try')

/* The words every direction fixes: nobody signs in to a house, and "let in" is our phrase, not theirs. */
function wording() {
  const signin = document.querySelector('nav a.signin')
  if (signin) signin.textContent = 'Open your house'
  const price = document.querySelector('#anywhere p')
  if (price) price.textContent = 'Your house gets its own web address, so your household’s phones work away from home. Stop any time: only using it away from home stops, and the house carries on. Have a server of your own? Run that part yourself, free.'
}

const HEAD = '<div style="display:grid;gap:12px"><p class="label">What it does</p><h2>Everything in the house, from one place</h2></div>'
const doesText = () => section('does', 'does', `${HEAD}
  <div class="four">${DOES.map(([i, h, p]) => `<div class="one">${ICON[i]}<h3>${h}</h3><p>${p}</p></div>`).join('')}</div>`)

const PICS = { home: 'crop-routines', words: 'crop-say', music: 'crop-music', camera: 'crop-camera' }
const doesPictures = () => section('does', 'does', `${HEAD}
  <div class="pics4">${DOES.map(([i, h, p]) => `<figure><div class="card"><img src="/board/shots/${PICS[i]}.jpg" alt=""></div><h3>${h}</h3><p>${p}</p></figure>`).join('')}</div>`)

const worksList = () => section('works', 'works', `
  <div class="lines"><p class="label">Works with</p><h2>What’s already in your house</h2><p>Bring the lights, locks and speakers you have. The hub finds them and asks which room each is in.</p></div>
  <div><ul class="kinds">${KINDS.map(([, k]) => `<li>${k}</li>`).join('')}</ul><p class="brands">${BRANDS}</p></div>`)

const worksChips = () => section('works', '', `
  <div style="display:grid;gap:12px;margin-bottom:22px"><p class="label">Works with</p><h2>What’s already in your house</h2></div>
  <ul class="chips">${KINDS.map(([i, k]) => `<li>${ICON[i]}${k}</li>`).join('')}</ul><p class="brands">${BRANDS}</p>`)

const worksChipsBeside = () => section('works', 'works', `
  <div class="lines"><p class="label">Works with</p><h2>What’s already in your house</h2><p>Bring the lights, locks and speakers you have. The hub finds them and asks which room each is in.</p></div>
  <div><ul class="chips">${KINDS.map(([i, k]) => `<li>${ICON[i]}${k}</li>`).join('')}</ul><p class="brands">${BRANDS_D}</p></div>`)

const faqOpen = (list = FAQ) => section('faq', 'faq', `<h2>Questions</h2>
  <div class="two">${list.map(([q, a]) => `<div class="q"><b>${q}</b><p>${a}</p></div>`).join('')}</div>`)

const faqFolded = () => section('faq', 'faq', `<h2>Questions</h2>
  ${FAQ.map(([q, a], n) => `<details${n === 0 ? ' open' : ''}><summary>${q}</summary><p>${a}</p></details>`).join('')}`)

/* The pretend house on a phone is a page of its own, and nothing on it leads back. */
function tryBar() {
  const bar = document.createElement('div')
  bar.className = 'try-bar'
  bar.innerHTML = `<b>A pretend house</b><a href="/">${ICON.back}Back to the site</a>`
  document.body.append(bar)
  document.body.style.cssText += ';padding-top:44px;box-sizing:border-box'
}
function tryPill() {
  const pill = document.createElement('div')
  pill.className = 'try-pill'
  pill.innerHTML = 'A pretend house <a href="/">Back to the site</a>'
  document.body.append(pill)
}

const BOARDS = {
  /* A -- SAID PLAINLY: three short sections in words, each where a visitor looks for it */
  a: () => {
    wording()
    if (onTry()) return tryBar()
    after('header.hero', doesText())
    after('#try', worksList())
    after('#anywhere', faqOpen())
  },
  /* B -- SHOWN ON THE PANEL: what it does is the panel's own cards; the questions fold away */
  b: () => {
    wording()
    if (onTry()) return tryPill()
    after('#day', doesPictures())
    after('#try', worksChips())
    after('#anywhere', faqFolded())
  },
  /* D -- CHOSEN: A, with B's chips for what it works with */
  d: () => {
    wording()
    if (onTry()) return tryBar()
    after('header.hero', doesText())
    after('#try', worksChipsBeside())
    after('#anywhere', faqOpen(FAQ_D))
  },
  /* C -- THE QUESTIONS FIRST: one section under the top that answers what a buyer asks, in their order */
  c: () => {
    wording()
    if (onTry()) return tryBar()
    const rows = [
      ['Will it work with what I have?', `<p>Very likely: lights and plugs, switches, locks, thermostats, cameras and doorbells, blinds, speakers and TVs, and motion and door sensors.</p><p class="brands">${BRANDS}</p>`],
      ['What does it do?', '<p>Every room on one screen on the wall and on every phone in the house. Routines like Bedtime. Type “kitchen lights off” and it happens. Music on the speakers you have, in one room or several.</p>'],
      ...FAQ.map(([q, a]) => [q, `<p>${a}</p>`]),
    ]
    after('header.hero', section('asks', 'asks', `
      <div class="head"><p class="label">Before you ask</p><h2>What people want to know first</h2></div>
      ${rows.map(([q, a]) => `<div class="row"><h3>${q}</h3><div class="a">${a}</div></div>`).join('')}`))
  },
}
