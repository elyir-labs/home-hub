// The Living room and its Ceiling light, under the dock, for body[data-shape] and body[data-dir]. ?view=pane
// opens the lamp; the flips under the board switch between the two.
(() => {
  const P = {
    house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
    rooms: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7 10 4.5h4L15.5 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', menu: '<path d="M5 8h14M5 12h14M5 16h9"/>',
    bulb: '<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    blinds: '<path d="M4 4h16M5 4v12h14V4M5 8h14M5 12h14M12 16v4"/>',
    pause: '<path d="M9 6v12M15 6v12"/>', play: '<path d="M8 5v14l11-7z"/>',
    back: '<path d="m15 6-6 6 6 6"/>', pencil: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    spark: '<path d="M12 4v5M12 15v5M4 12h5M15 12h5"/>', moon: '<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>',
    power: '<path d="M12 3v8M6.3 7a8 8 0 1 0 11.4 0"/>', sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    therm: '<path d="M14 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0z"/>', speaker: '<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="14" r="3"/>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 20h6"/>', motion: '<path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="12" r="1"/>',
  }
  const svg = (n, s = 20, w = 1.7) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`
  const body = document.body, shape = body.dataset.shape, dir = body.dataset.dir
  const tall = ['tall10', 'tablet', 'tall7', 'phone'].includes(shape)
  const pane = (new URLSearchParams(location.search).get('view') || body.dataset.view) === 'pane'
  const screen = document.querySelector('.screen')

  const PLACES = [['house', 'Your evening'], ['rooms', 'Rooms'], ['camera', 'Cameras']]
  const dock = `<nav class="dock"><span class="orb"></span><div class="tabs">${PLACES.map(([ic, nm], i) =>
    `<span class="tab ${i === 1 ? 'on' : ''}"><span class="ic">${svg(ic, 20)}</span><span>${nm}</span></span>`).join('')}</div>
    <span class="now"><b></b><span>The Bear<small>Living room</small></span></span><span class="door waiting">${svg('plus', 20)}</span><span class="door">${svg('menu', 20)}</span></nav>`

  const SCENES = [['film', 'Movie', 'Lights low, screen on', 1], ['spark', 'Guests', 'Lights up bright'], ['moon', 'Sleep', 'Lights and screens off'], ['power', 'All off', 'Lights and music off']]
  const head = `<header class="rh"><div class="clock">7:40 PM<small>Sunday, November 1</small></div>
    <span class="rb">${svg('back', 18)}</span><h1>Living room</h1><span class="rb">${svg('pencil', 16)}</span>
    <p class="sum">2 lights on · The Bear · Blind open · Motion</p>
    <div class="chips"><span class="chip2">${svg('spark', 14)}Movie · by a routine <u>Why?</u></span><span class="chip2 motion">${svg('motion', 14)}Motion</span><span class="chip2 temp">${svg('therm', 14)}73°</span></div></header>`
  const card = {
    tv: `<div class="c tv"><span class="tag">TV</span><div class="nm">The Bear</div><div class="st">Season 3, Episode 4 · Disney+</div><div class="play"><b>${svg('pause', 18, 2.6)}</b><span><i></i></span></div></div>`,
    scenes: `<div class="c scenes"><h4>IN THE LIVING ROOM</h4>${SCENES.map(([ic, nm, ht, on]) => `<div class="scb ${on ? 'on' : ''}">${svg(ic, 18)}<span><b>${nm}</b><small>${ht}</small></span></div>`).join('')}</div>`,
    ceil: `<div class="c lamp pink ceil ${pane && dir === 'B' && tall ? 'ring' : ''}"><span class="chip">${svg('bulb', 18)}</span><span class="tag r">PHILIPS HUE</span><i class="art"></i><div class="nm">Ceiling light</div><div class="st">On, 35%</div><div class="bar"><i style="width:35%"></i></div></div>`,
    sonos: `<div class="c music"><div class="top"><span class="art2"></span><span><small>SONOS</small><span class="nm">Blue in Green</span><span class="st sub2">Miles Davis</span></span></div><div class="pl"><b>${svg('play', 12)}</b>Paused</div></div>`,
    floor: `<div class="c lamp warm floor"><span class="chip">${svg('bulb', 18)}</span><i class="art"></i><div class="nm">Floor lamp</div><div class="st">On, 24%</div><div class="bar"><i style="width:24%"></i></div></div>`,
    blinds: `<div class="c plain blinds"><span class="chip">${svg('blinds', 18)}</span><div class="nm">Blinds</div><div class="st">70% open</div><div class="bar" style="color:var(--ink-2)"><i style="width:70%"></i></div></div>`,
    clim: `<div class="c clim"><div class="ring">71<sup>°F</sup></div><div class="pm"><b>−</b><b>+</b></div><div class="big">71</div><div class="nm" style="font-size:15px">Thermostat</div><div class="st">°F · cooling, 74 now</div></div>`,
    read: `<div class="c offl"><span class="chip">${svg('bulb', 18)}</span><div class="nm">Reading lamp</div><div class="st">Off</div></div>`,
  }

  let room
  if (!tall) {
    room = `${head}<section class="rrow">${card.tv}${card.scenes}<div class="lane2">${card.ceil}${card.sonos}</div><div class="lane2 trio">${card.floor}${card.blinds}${card.clim}</div>${card.read}</section>`
  } else if (dir === 'C') {
    const lr = (cls, ic, nm, st, end, fill) => `<div class="lr ${cls}">${fill ? `<i class="fill" style="width:${fill}"></i>` : ''}<span class="si">${svg(ic, 18)}</span><span class="lt"><b>${nm}</b><small>${st}</small></span>${end}</div>`
    const tog = on => `<span class="tog ${on ? 'on' : ''}"></span>`
    const open = `<div class="lr pink open"><div class="row1"><span class="si">${svg('bulb', 18)}</span><span class="lt"><b>Ceiling light</b><small>On at 35%, by hand at 8:10 AM</small></span>${tog(1)}</div>
      <div class="hbar"><i></i><span>BRIGHTNESS</span></div>
      <div class="three"><span class="u">Reading<small>Bright, cooler</small></span><span class="u on">Evening<small>Where it is now</small></span><span class="u">Night<small>Enough to see by</small></span></div>
      <div class="dots">${['#e25c6c', '#ec8a45', '#f2cd48', '#86d65a', '#58d6a0', '#58a9e0', '#8a63d8', '#de5ad2'].map((c, i) => `<i style="background:${c}" class="${i === 7 ? 'on' : ''}"></i>`).join('')}<span class="more">More</span></div>
      <span class="all">Everything about this light</span></div>`
    room = `${head}<div class="scrow">${SCENES.map(([ic, nm, , on]) => `<span class="scp ${on ? 'on' : ''}">${svg(ic, 16)}${nm}</span>`).join('')}</div><section class="rlist">
      ${lr('tvr', 'tv', 'The Bear', 'TV · Season 3, Episode 4', `<span class="go lit">${svg('pause', 16, 2.6)}</span>`)}
      ${pane ? open : lr('pink', 'bulb', 'Ceiling light', 'On, 35%', tog(1), '35%')}
      ${lr('warm', 'bulb', 'Floor lamp', 'On, 24%', tog(1), '24%')}
      ${lr('', 'blinds', 'Blinds', '70% open', `<span class="go">${svg('blinds', 16)}</span>`)}
      ${lr('blue', 'therm', 'Thermostat', '71 °F · cooling, 74 now', `<span class="go">−</span><span class="go">+</span>`)}
      ${lr('', 'speaker', 'Sonos', 'Blue in Green · Paused', `<span class="go">${svg('play', 14)}</span>`)}
      ${lr('', 'bulb', 'Reading lamp', 'Off', tog(0))}</section>`
  } else {
    const chips = `<div class="scrow">${SCENES.map(([ic, nm, , on]) => `<span class="scp ${on ? 'on' : ''}">${svg(ic, 16)}${nm}</span>`).join('')}</div>`
    room = `${head}${dir === 'A' ? chips : ''}<section class="rgrid">${card.tv}${card.ceil}${card.floor}${card.blinds}${card.sonos}${card.clim}${card.read}</section>`
  }

  const colors = n => `<div class="dots">${['#e25c6c', '#ec8a45', '#f2cd48', '#86d65a', '#58d6a0', '#58a9e0', '#8a63d8', '#de5ad2', '#f59a3c', '#f7c98e', '#fde6cc', '#dbe6ff'].slice(0, n).map((c, i) => `<i style="background:${c}" class="${i === 7 ? 'on' : ''}"></i>`).join('')}<span class="more">More colors</span></div>`
  const usual = `<div class="usual">${[['sun', 'Reading', 'Bright, and cooler'], ['bulb', 'Evening', 'Where it is now', 1], ['moon', 'Night', 'Enough to see by']].map(([ic, nm, ht, on]) =>
    `<div class="u ${on ? 'on' : ''}"><span class="si">${svg(ic, 16)}</span><span><b>${nm}</b><small>${ht}</small></span></div>`).join('')}</div>`
  const name = `<div class="pname"><small>Living room</small><h2>Ceiling light</h2></div>`
  const btns = `<div class="pbtns"><b class="pw">${svg('power', 20)}</b><b>${svg('spark', 18)}</b><b>${svg('pencil', 16)}</b></div>`
  const num = `<div><div class="pnum">35%</div><p>On at 35%, by hand at 8:10 AM.</p></div>`
  const hist = `<div class="hist"><span><small>TODAY</small></span><span><small>8:10 AM</small><b>On at 35%, by hand</b></span><span><small>7:16 AM</small><b>On</b></span><span><small>3:34 AM</small><b>Off</b></span><span><small>Yesterday, 10:46 PM</small><b>On</b></span></div>`
  const made = `<div class="made"><span><b>Philips Hue</b><small>MADE BY</small></span><span><b>Movie</b><small>ROOM SET TO</small></span></div>`
  const x = `<span class="px">${svg('close', 18)}</span>`

  let over = ''
  if (pane && !tall) {
    over = `<div class="scrim"></div><div class="pane wide">${x}<div class="left">${name}${btns}${num}<span style="flex:1"></span>${made}</div>
      <div class="ctl"><div style="display:flex;flex-direction:column;min-height:0"><div class="bcol" style="flex:1"><i></i></div><div class="bcap">BRIGHTNESS</div></div>
      <div><div class="auto"><i></i><span><b>Automatic</b><small>Follows daylight</small></span></div><div class="cap2">COLORS</div>${colors(12)}</div>
      <div><div class="cap2" style="margin-top:0">THE USUAL THREE</div>${usual}</div></div>${hist}</div>`
  } else if (pane && dir === 'A') {
    over = `<div class="scrim"></div><div class="pane stack">${x}<div class="top">${name}${btns}</div>${num}
      <div class="mid"><div><div class="bcol"><i></i></div><div class="bcap">BRIGHTNESS</div></div>
      <div><div class="auto"><i></i><span><b>Automatic</b><small>Follows daylight</small></span></div><div class="cap2">COLORS</div>${colors(shape === 'phone' ? 8 : 12)}<div class="cap2">THE USUAL THREE</div>${usual}</div></div>
      <div>${made}${hist}</div></div>`
  } else if (pane && dir === 'B') {
    screen.classList.add('dimmed')
    over = `<div class="pane half">${x}<div class="top">${name}<div class="pnum">35%</div></div>
      <div class="mid"><div class="bcol"><i></i></div><div><div class="cap2" style="margin-top:0">THE USUAL THREE</div>${usual}</div></div>
      <div class="foot">${colors(8).replace('<span class="more">More colors</span>', '')}<span class="all">Colors and more</span></div></div>`
  }

  screen.innerHTML = `${dock}<main class="room">${room}</main>${tall && dir === 'B' ? `<div class="strip">${SCENES.map(([ic, nm, , on]) => `<span class="scp ${on ? 'on' : ''}">${svg(ic, 16)}${nm}</span>`).join('')}</div>` : ''}${over}`
  screen.insertAdjacentHTML('afterend', `<div class="flips"><span style="padding: 0 6px">Showing</span><a class="flip ${pane ? '' : 'on'}" href="?view=room">the room</a><a class="flip ${pane ? 'on' : ''}" href="?view=pane">its ceiling light</a></div>`)
})()
