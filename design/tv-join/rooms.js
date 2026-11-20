/* A house with fifteen rooms, which is what a real one has once its setup has named them all (the NUC on
   20 November had more). The words under each are roomLine()'s from app/src/screen.ts. */
window.ROOMS = [
  ['Living room', 'speaker · TV', 2], ['Kitchen', '3 lights · plug', 4], ['Main bedroom', '2 lights · TV', 3],
  ['Kids’ room', 'speaker', 1], ['Office', '2 lights · plug', 3], ['Dining room', ''], ['Hallway', ''],
  ['Bathroom', ''], ['Garage', 'camera', 1], ['Backyard', ''], ['Basement', ''], ['Workshop', ''],
  ['Theater', ''], ['Guest room', ''], ['Laundry', ''],
].map(([name, line, n = 0]) => ({ name, line: line || 'nothing in it yet', n }))
window.openOn = (name) => /['’]/.test(name) ? `Open on ${name}` : `Open on the ${name.toLowerCase()}`
window.roomCard = (r, i, cls = 'room') => `<div class="card ${cls}" data-f ${i === 0 ? 'data-f-start' : ''} data-hint="OK|${openOn(r.name)}"><div class="nm">${r.name}</div><div class="st">${r.line}</div></div>`
