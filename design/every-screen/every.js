// Writes Your evening into .screen for body[data-shape] with body[data-nav]'s menu. One set of parts, so
// what changes between boards is only where the menu sits and how the shape arranges the cards.
(() => {
  const P = {
    house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
    rooms: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7 10 4.5h4L15.5 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M5 8h14M5 12h14M5 16h9"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M7 7l2 2M15 15l2 2M7 17l2-2M15 9l2-2"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    bulb: '<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    blinds: '<path d="M4 4h16M5 4v12h14V4M5 8h14M5 12h14M12 16v4"/>',
    fan: '<circle cx="12" cy="12" r="1.5"/><path d="M12 10.5C11 6 13 3 15.5 4.5S14 10 12 10.5zM13.5 12c4.5-1 7.5 1 6 3.5S14 14 13.5 12zM10.5 12c-4.5 1-7.5-1-6-3.5S10 10 10.5 12zM12 13.5c1 4.5-1 7.5-3.5 6S10 14 12 13.5z"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.5M18 14c1.8.6 3 2.2 3 5"/>',
  }
  const svg = (n, s = 22, w = 1.7) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`
  const cloud = (w = 96) => `<svg width="${w}" viewBox="0 0 96 64"><path d="M72 4a16 16 0 1 0 16 24A13 13 0 0 1 72 4z" fill="#cfd3dd" opacity=".85"/><g fill="#9aa1b2"><ellipse cx="40" cy="46" rx="30" ry="14"/><circle cx="32" cy="36" r="14"/><circle cx="52" cy="31" r="17"/></g></svg>`

  const shape = document.body.dataset.shape, nav = document.body.dataset.nav
  const tall = ['tall10', 'tablet', 'tall7', 'phone'].includes(shape), wide = !tall
  const small = shape === 'tall7' || shape === 'phone'

  const PLACES = [['house', 'Your evening'], ['rooms', 'Rooms'], ['camera', 'Cameras']]
  const tab = ([ic, nm], i, size = 22) => `<span class="tab ${i === 0 ? 'on' : ''}"><span class="ic">${svg(ic, size)}</span><span>${nm}</span></span>`
  const add = `<span class="door waiting" title="Add">${svg('plus', 20)}</span>`
  const house = `<span class="door" title="This house">${svg('menu', 20)}</span>`
  const orb = '<span class="orb" title="Tell the house"></span>'

  let menu = '', doorsTop = ''
  if (nav === 'rail') {
    menu = wide
      ? `<nav class="rail side"><div class="tabs">${PLACES.map((p, i) => tab(p, i)).join('')}</div><div class="end">${add}${house}${orb}</div></nav>`
      : `<nav class="rail foot">${orb}<div class="tabs">${PLACES.map((p, i) => tab(p, i)).join('')}</div><div class="end">${add}${house}</div></nav>`
  } else if (nav === 'dock') {
    const now = '<span class="now"><b></b><span>The Bear<small>Living room</small></span></span>'
    menu = `<nav class="dock">${orb}<div class="tabs">${PLACES.map((p, i) => tab(p, i, 20)).join('')}</div>${now}${add}${house}</nav>`
  } else if (nav === 'side') {
    if (wide) {
      const room = (nm, on) => `<span class="it sub"><span>${nm}</span>${on ? `<em>${on}</em>` : ''}</span>`
      menu = `<nav class="side"><div class="hn">Maple Court</div>
        <span class="it on"><span class="ic">${svg('house', 20)}</span><span>Your evening</span></span>
        <span class="it"><span class="ic">${svg('rooms', 20)}</span><span>Rooms</span><em>5 on</em></span>
        ${room('Living room', '4 on')}${room('Kitchen', '1 on')}${room('Bedroom', '2 on')}${room('Office', '2 on')}${room('Front door')}${room('Garage')}
        <span class="it"><span class="ic">${svg('camera', 20)}</span><span>Cameras</span><em>3</em></span>
        <div class="cap">EVERY DAY</div>
        <span class="it"><span class="ic">${svg('music', 20)}</span><span>Music</span><span class="mini">Paused</span></span>
        <span class="it"><span class="ic">${svg('spark', 20)}</span><span>Routines</span><em>Dusk, 4:42</em></span>
        <span class="it"><span class="ic">${svg('clock', 20)}</span><span>What happened</span></span>
        <div class="ft">${orb}<span style="flex:1"></span>${add}${house}</div></nav>`
    } else {
      const five = [...PLACES, ['music', 'Music'], ...(small ? [] : [['spark', 'Routines']])]
      menu = `<nav class="sidebar-foot">${orb}${five.map((p, i) => tab(p, i, 20)).join('')}</nav>`
      doorsTop = `<div class="topdoors">${add}${house}</div>`
    }
  }

  const who = `<div class="who"><span class="dot">CONNECTED</span>${shape === 'wall' ? '<span>Jordan and Alex are home</span>' : ''}<span class="faces"><b>J</b><b>S</b><b>A</b><b>+</b></span></div>`
  const shown = { wall: 99, wide7: 99, tall10: 9, tablet: 9, tall7: 5, phone: 99 }[shape]
  const card = {
    tv: '<div class="c tv"><span class="tag">TV</span><div class="nm">The Bear</div><div class="st">Season 3, Episode 4 · Disney+</div><div class="play"><b>' + svg('pause', 18, 2.6) + '</b><span><i></i></span></div></div>',
    door: '<div class="c cam"><span class="tag r">50S AGO</span><div class="nm"><i>' + svg('camera', 16) + '</i>Doorbell</div></div>',
    clim: '<div class="c clim"><div class="ring">71<sup>°F</sup></div><div class="pm"><b>−</b><b>+</b></div><div class="st">Currently 74°F · Cooling</div></div>',
    ceil: '<div class="c lamp pink ceil"><span class="chip">' + svg('bulb', 18) + '</span><span class="tag r">PHILIPS HUE</span><i class="art"></i><div class="nm">Ceiling light</div><div class="st">On, 35%</div><div class="bar"><i style="width:35%"></i></div></div>',
    floor: '<div class="c lamp warm floor"><span class="chip">' + svg('bulb', 18) + '</span><i class="art"></i><div class="nm">Floor lamp</div><div class="st">Living room · On, 24%</div><div class="bar"><i style="width:24%"></i></div></div>',
    blinds: '<div class="c plain blinds"><span class="chip">' + svg('blinds', 18) + '</span><div class="nm">Blinds</div><div class="st">Living room · 70% open</div></div>',
    kit: '<div class="c lamp warm kit"><span class="chip">' + svg('bulb', 18) + '</span><div class="nm">Lights</div><div class="st">Kitchen · On, 100%</div><div class="bar"><i style="width:100%"></i></div></div>',
    fan: '<div class="c plain fan"><span class="chip">' + svg('fan', 18) + '</span><div class="nm">Fan</div><div class="st">Bedroom · 40%</div></div>',
    desk: '<div class="c lamp warm desk"><span class="chip">' + svg('bulb', 18) + '</span><div class="nm">Desk lamp</div><div class="st">Office · On, 71%</div><div class="bar"><i style="width:71%"></i></div></div>',
    more: `<div class="c more"><div class="nm">and ${11 - shown} more on</div><div class="go">In Rooms &rarr;</div><div class="st">Plug, Bedroom Fan Light${11 - shown > 2 ? ', and others' : ''}</div></div>`,
  }
  const bigwx = shape === 'wall' ? `<div class="bigwx">${cloud(220)}<div class="pill"><div class="deg">78°</div><div class="what">Partly cloudy</div><div class="sm">Sunrise 6:46 AM</div><div class="sm">Humidity 48%</div></div></div>` : ''
  const cards = bigwx + card.tv + `<div class="lane">${card.door}${card.clim}</div>` + card.ceil + card.floor + card.blinds + card.kit + card.fan + card.desk + (wide ? '' : card.more)

  document.querySelector('.screen').innerHTML = `${menu}
    <main class="home">
      <header class="hd">
        <div class="clock">7:40 PM<small>Sunday, November 1</small></div>
        ${doorsTop || who}
        <div class="hi"><h1>Good evening</h1><p>Something is on in 5 rooms.</p><p class="next"><i>✦</i>Next: Living room lights on at dusk, tomorrow 4:42 PM</p></div>
        <div class="wx">${cloud(small ? 72 : 96)}<div><div class="deg">78°</div><div class="what">Partly cloudy</div></div></div>
      </header>
      <section class="bento">${cards}</section>
    </main>`
})()
