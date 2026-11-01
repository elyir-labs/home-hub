/* The drawings for design/leaving/: each board is the shipped panel on the mock house (LOCKED=1, NAMES=plain, light,
   1:00 PM) with that board's rows and sheets put into it, so every color, size and radius is panel.css's own.
   app/mock/leaving-shots.mjs opens the page each board names, runs draw(id) here, and keeps the picture. */
window.LEAVING = {
  /* where each board is drawn, as a panel address */
  at: {
    today: '/?sheet=hub', 'today-people': '/?sheet=people',
    'a-row': '/?sheet=hub', 'a-ask': '/?sheet=hub', 'a-stays': '/?sheet=hub', 'a-next': '/?setup=1&page=welcome',
    'b-hub': '/?sheet=hub', 'b-people': '/?sheet=people', 'b-hand': '/?sheet=people',
    'c-row': '/?sheet=hub', 'c-erase': '/?sheet=hub',
  },
  draw(id) {
    const css = document.createElement('style')
    css.textContent = STYLE
    document.head.append(css)
    const fn = BOARDS[id]
    if (fn) fn()
    toBottom()
  },
}

const STYLE = `
.lv-row-danger .hub-k { color: var(--danger-text); }
.lv-choices { display: grid; gap: 10px; margin: 6px 0 14px; }
.lv-choice { display: grid; grid-template-columns: 40px 1fr; gap: 4px 14px; align-items: start; padding: 16px 18px; border-radius: var(--r-md);
             border: 1px solid var(--edge); background: var(--surface); text-align: left; }
.lv-choice b { font-size: 16.5px; font-weight: 500; color: var(--ink); grid-column: 2; }
.lv-choice span { font-size: 14.5px; line-height: 1.45; color: var(--ink-2); grid-column: 2; }
.lv-choice i { grid-row: 1 / span 2; width: 40px; height: 40px; border-radius: 13px; display: grid; place-items: center; background: var(--surface-hi); color: var(--ink-2); font-style: normal; }
.lv-choice.hard i { background: rgba(var(--danger-rgb), .14); color: var(--danger-text); }
.lv-foot { font-size: 14px; color: var(--muted); margin: 4px 0 0; }
.lv-foot a { color: var(--lamp-text); text-decoration: none; font-weight: 500; }
.dsh-means { list-style: none; margin: 12px 0 14px; padding: 0; }
.dsh-means li { font-size: 15px; line-height: 1.45; color: var(--ink-2); padding: 9px 0 9px 22px; position: relative; }
.dsh-means li + li { border-top: 1px solid var(--edge); }
.dsh-means li::before { content: ''; position: absolute; left: 2px; top: 16px; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.dsh-means li.hard { color: var(--ink); }
.dsh-means li.hard::before { background: var(--danger); }
.dsh-means li.keep::before { background: var(--live); }
.dsh-hold { position: relative; overflow: hidden; width: 100%; height: 54px; border-radius: 999px; border: 1px solid rgba(var(--danger-rgb), 0.55);
            display: flex; align-items: center; justify-content: center; background: none; color: var(--danger); font: inherit; font-size: 16.5px; font-weight: 500; }
.dsh-hold i { position: absolute; left: 0; top: 0; bottom: 0; width: 38%; background: rgba(var(--danger-rgb), 0.22); }
.dsh-hold span { position: relative; }
.dsh-foot { text-align: center; margin: 10px 0 0; font-size: 13.5px; color: var(--muted); }
`

const X = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
const ICON = {
  house: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/></svg>',
  box: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/></svg>',
  restart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg>',
}

function row(k, v, sub, button, cls = '') {
  const li = document.createElement('li')
  if (cls) li.className = cls
  li.innerHTML = `<span class="hub-k">${k}</span><span class="hub-v">${v}<span class="hub-sub line">${sub}</span></span>${button}`
  return li
}
function hubRow(...a) { document.querySelector('.hub-rows').append(row(...a)) }
function pageRow(...a) {
  const ul = document.createElement('ul')
  ul.className = 'hub-rows'
  ul.append(row(...a))
  document.querySelector('.page').append(ul)
}
function sheet(title, body) {
  const back = document.createElement('div')
  back.className = 'sheet-back'
  back.innerHTML = `<div class="sheet" role="dialog"><div class="sheet-head"><h2 class="display">${title}</h2>
    <button class="round sheet-close" aria-label="Close">${X}</button></div><div class="sheet-body">${body}</div></div>`
  document.body.append(back)
}
function toBottom() {
  const page = document.querySelector('.page')
  for (let el = page; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') { el.scrollTop = el.scrollHeight; break }
}
const hold = (word, foot = 'Needs the passcode') => `<button class="dsh-hold"><i></i><span>${word}</span></button><p class="dsh-foot">${foot}</p>`

/* What every direction erases, and what the next people find, said once so the boards agree. */
const PEOPLE_GO = '<b>Erased:</b> the 3 phones that can use the house, the passcode, Jordan, Sam and Alex, the services the house signed into, what happened here, and camera recordings.'
const HOUSE_STAYS = '<b>Stays:</b> 8 rooms, the 30 lights, switches and cameras in them, 5 routines, and the bridges.'
const ADDRESS_STOPS = 'If the house has a web address, it stops, and nothing more is charged.'
const RADIO = 'Lights that joined through the hub itself have to be reset, one by one, before they can join again. Ones on your Wi-Fi are found again.'

const handOver = (title) => sheet(title, `
  <p class="sheet-lede">For the next people who live here. The house keeps working the whole time.</p>
  <ul class="dsh-means">
    <li class="hard">${PEOPLE_GO}</li>
    <li class="keep">${HOUSE_STAYS}</li>
    <li>${ADDRESS_STOPS}</li>
    <li>Then this screen asks the new people who they are and for a passcode of their own.</li>
  </ul>
  ${hold('Hold to hand the house over')}`)

const eraseAll = (title, lede) => sheet(title, `
  <p class="sheet-lede">${lede}</p>
  <ul class="dsh-means">
    <li class="hard"><b>Erased:</b> everything. Rooms, routines, phones, the passcode, the services the house signed into, what happened here and camera recordings.</li>
    <li class="hard">${RADIO}</li>
    <li>${ADDRESS_STOPS}</li>
    <li>Switches on the wall keep working. The hub restarts and opens on Welcome, for about four minutes.</li>
  </ul>
  ${hold('Hold to erase the hub')}
  <p class="lv-foot" style="text-align:center">Might you want this house back? <a>Back up first</a></p>`)

const BOARDS = {
  /* A -- ONE QUESTION: where is the hub going? */
  'a-row': () => hubRow('Moving out', 'Leaving this house, or passing the hub on.',
    'Choose what goes with you and what stays for the next people.', '<button class="button small ghost">Start…</button>'),
  'a-ask': () => {
    BOARDS['a-row']()
    sheet('Where is the hub going?', `
      <div class="lv-choices">
        <button class="lv-choice"><i>${ICON.house}</i><b>It stays with the house</b><span>For the next people who live here. The rooms, lights and routines stay; your phones, the passcode and your sign-ins go.</span></button>
        <button class="lv-choice"><i>${ICON.box}</i><b>It comes with me</b><span>To your next home. Your phones, passcode and routines come along; the lights and cameras stay behind, so the hub forgets them.</span></button>
        <button class="lv-choice hard"><i>${ICON.restart}</i><b>Erase everything</b><span>Giving it away, or starting over. It goes back to how it came out of the box.</span></button>
      </div>
      <p class="lv-foot">Want a copy of the house first? <a>Back up</a></p>`)
  },
  'a-stays': () => { BOARDS['a-row'](); handOver('Leave the hub for the next people') },

  /* B -- EACH WHERE IT BELONGS: erasing is the computer's, handing over is about people */
  'b-hub': () => hubRow('Start over', 'Erase everything and set the hub up as new.',
    'For giving the hub away. Back up first if you might want this house back.', '<button class="button small ghost" style="color:var(--danger-text)">Start over…</button>'),
  'b-people': () => pageRow('Moving out', 'Leaving the hub here for the next people?',
    'Your phones, passcode and sign-ins are erased. The rooms, lights and routines stay for them.', '<button class="button small ghost">Hand it over…</button>'),
  'b-hand': () => { BOARDS['b-people'](); handOver('Hand the house over') },

  /* C -- ERASE ONLY: handing over waits for the Elyir account */
  'c-row': () => hubRow('Erase', 'Erase this hub.',
    'Everything goes, as if it were new. For giving it away or starting over.', '<button class="button small ghost" style="color:var(--danger-text)">Erase…</button>'),
  'c-erase': () => { BOARDS['c-row'](); eraseAll('Erase this hub', 'For giving the hub away, or for the next people to set up as their own.') },

  /* what the next people see, in A and B: first run, with the house already in it */
  'a-next': () => {
    const s = document.querySelector('.setup-page')
    if (!s) return
    const h = s.querySelector('h1'), p = s.querySelector('.setup-lede'), b = s.querySelector('.setup-actions .button')
    if (h) h.textContent = 'This house is ready for you.'
    if (p) p.textContent = 'The rooms, lights and routines from before are already here. Tell it who you are and choose a passcode, and it’s yours.'
    if (b) b.textContent = 'Start'
    s.querySelectorAll('.setup-foot, .setup-step').forEach(e => e.remove())
    const ul = document.createElement('ul')
    ul.className = 'dsh-means'
    ul.style.cssText = 'max-width:520px;margin:18px 0 22px'
    ul.innerHTML = '<li class="keep">8 rooms · 30 lights, switches and cameras · 5 routines</li><li>Sign in to the thermostat and the cameras again, when you’re ready.</li>'
    p?.after(ul)
  },
}
