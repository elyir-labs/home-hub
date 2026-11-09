/* The drawings for design/restart/: each board is the shipped panel on the mock house (LOCKED=1, NAMES=plain, light,
   1:00 PM) with that board's Restart row drawn into it, so every color, size and radius is panel.css's own. The
   words are restart.py's wherever restart.py already has them. app/mock/restart-shots.mjs opens the page each board
   names, runs draw(id) here, and keeps the picture. */
window.RESTART = {
  at: {
    today: '/?sheet=hub', 'today-ask': '/?sheet=hub', 'today-weary': '/?sheet=hub', owed: '/?sheet=hub',
    'a-again': '/?sheet=hub', 'b-ask': '/?sheet=hub', 'b-machine': '/?sheet=hub', 'c-dev': '/?sheet=developer',
  },
  draw(id) {
    const css = document.createElement('style')
    css.textContent = STYLE
    document.head.append(css)
    BOARDS[id]?.()
    restartRow()?.scrollIntoView({ block: 'center' })
  },
}

const STYLE = `
.rs-owed .hub-k { color: var(--lamp-text); }
.rs-owed .hub-k::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--lamp); margin: 0 8px 1px 0; }
.rs-deeper { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--edge); }
.rs-deeper a { color: var(--lamp-text); font-weight: 500; text-decoration: none; }
.rs-col { display: grid; gap: 20px; align-content: start; }
`

function restartRow() {
  return [...document.querySelectorAll('.hub-rows li')].find((li) => li.querySelector('.hub-k')?.textContent.trim() === 'Restart')
}
/* The row as HubPage.vue draws it while asking: what it is, what keeps working, what stops, then the buttons. */
function ask({ title, lines, warn = [], more = '', buttons }) {
  const li = restartRow()
  li.classList.add('asking')
  li.innerHTML = `<span class="hub-k">Restart</span>
    <span class="hub-v"><b>${title}</b>${lines.map((l) => `<span class="hub-sub line">${l}</span>`).join('')}${warn.map((l) => `<span class="hub-sub line warn">${l}</span>`).join('')}${more}</span>
    <span class="note-ask">${buttons.map(([word, ghost]) => `<button class="button small${ghost ? ' ghost' : ''}">${word}</button>`).join('')}</span>`
}

/* restart.py's sentences for this house: it has motion rules and is shared with Apple Home, Google Home and Alexa. */
const QUICK = ['Lights and switches keep working. The screen goes dark for about 30 seconds.', 'Motion lights and schedules pause.',
  'Apple Home, Google Home and Alexa say “no response” until it’s back.']
const POWER = ['Switches on the wall keep working. The screen goes dark for about 3 minutes.',
  'Everything the hub talks to goes quiet until it’s back — lights, sensors and the radios.',
  'Apple Home, Google Home and Alexa say “no response” until it’s back.']

const BOARDS = {
  today: () => {},
  'today-ask': () => ask({ title: 'Restart the hub?', lines: QUICK, buttons: [['Quick restart'], ['Not now', 1]] }),
  'today-weary': () => ask({ title: 'Restart the hub?', lines: QUICK,
    warn: ['The hub has restarted 3 times in the past hour. Something is wrong that restarting isn’t fixing.'],
    buttons: [['Quick restart'], ['Full restart', 1], ['Not now', 1]] }),

  /* IN EVERY DIRECTION: a change that only takes effect when the hub powers off and on says so, on this row. */
  owed: () => {
    const li = restartRow()
    li.classList.add('rs-owed')
    li.innerHTML = `<span class="hub-k">Restart</span>
      <span class="hub-v">The hub needs to restart to finish an update.<span class="hub-sub line">It powers off and on, which takes about 3 minutes. Switches on the wall keep working. If you leave it, it does this by itself tonight at 3 AM.</span></span>
      <button class="button small">Restart now</button>`
  },

  /* A -- THE NEXT ONE, SOONER: one restart that didn't help is enough to offer the next */
  'a-again': () => ask({ title: 'Power the hub off and on?',
    lines: ['You did a full restart 10 minutes ago. If something’s still stuck, powering it off and on starts it fresh, radios included.', ...POWER],
    buttons: [['Power off and on'], ['Full restart again', 1], ['Not now', 1]] }),

  /* B -- ALWAYS THERE, QUIETLY: the smallest first, the others one line under it */
  'b-ask': () => ask({ title: 'Restart the hub?', lines: QUICK,
    more: '<span class="hub-sub line rs-deeper">Still stuck after restarting? <a>Full restart</a> · <a>Power off and on</a></span>',
    buttons: [['Quick restart'], ['Not now', 1]] }),
  'b-machine': () => ask({ title: 'Power the hub off and on?',
    lines: [...POWER, 'For when restarting hasn’t helped.'], buttons: [['Power off and on'], ['Not now', 1]] }),

  /* C -- FOR WHOEVER IS WORKING ON IT: the household keeps today's row; all three are on the developer page */
  'c-dev': () => {
    const screens = document.querySelector('.dev-cards > section.dev-card[aria-label="Screens in this house"]')
    if (!screens) return
    const col = document.createElement('div')
    col.className = 'dev-col rs-col'
    screens.replaceWith(col)
    col.append(screens)
    const card = document.createElement('section')
    card.className = 'dev-card'
    card.innerHTML = `<h3>Restart</h3>
      <p class="dev-say">Up 6 days. Last restarted Tuesday at 9:14 PM, by the hub itself.</p>
      <div class="dev-key"><span>Quick restart<span>The hub’s own software. About 30 seconds.</span></span><button class="button small ghost">Restart</button></div>
      <div class="dev-key"><span>Full restart<span>Everything the hub runs, the radios included. About 2 minutes.</span></span><button class="button small ghost">Restart</button></div>
      <div class="dev-key"><span>Power off and on<span>The machine itself. About 3 minutes.</span></span><button class="button small ghost">Restart</button></div>`
    col.append(card)
  },
}
