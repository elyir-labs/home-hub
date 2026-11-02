// The flips under each board. A row of .flip[data-v] inside .flips[data-k] sets body[data-<k>], and anything
// marked data-if="step:before,after" shows only while every one of those holds. Each .turn-icon gets the
// panel's turn icon (Icon.vue, "turn").
(() => {
  const turn = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/></svg>'
  document.querySelectorAll('.turn-icon').forEach(el => { el.innerHTML = turn })
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
