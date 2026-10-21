/* The chips under a board: each names a state, and shows only what is marked data-when for it. */
function show(at) {
  document.querySelectorAll('[data-when]').forEach(el => { el.hidden = !el.dataset.when.split(' ').includes(at) })
  document.querySelectorAll('.flip').forEach(f => f.classList.toggle('on', f.dataset.to === at))
}
document.querySelectorAll('.flip').forEach(f => f.addEventListener('click', () => show(f.dataset.to)))
show(document.querySelector('.flip.on')?.dataset.to)
