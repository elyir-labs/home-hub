// The house from startup/sequence.mjs, drawn into every .house on the board, its lamp at the strength data-lamp gives.
for (const h of document.querySelectorAll('.house')) {
  const k = Number(h.dataset.lamp ?? 0.86)
  const c = [74, 64, 52].map((v, i) => Math.round(v + ([233, 184, 114][i] - v) * k))
  const line = 'fill="none" stroke="#f1eee8" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"'
  h.innerHTML = `<div class="glow" style="opacity:${k}"></div><svg viewBox="0 0 512 512">
    <path d="M112 248 256 120l144 128" ${line}/><path d="M148 226v170h216V226" ${line}/>
    <circle cx="256" cy="306" r="30" fill="rgb(${c})"/></svg>`
}
