// The front page's few behaviors: copying the command, starting the pretend house in place, joining the list. It is a
// file rather than inline so the page's policy can refuse every script that isn't the site's own (_headers).

document.getElementById('copy').addEventListener('click', async (e) => {
  const code = document.getElementById('cmd')
  try { await navigator.clipboard.writeText(code.textContent); e.target.textContent = 'Copied' }
  catch { getSelection().selectAllChildren(code); e.target.textContent = 'Selected' }
  setTimeout(() => { e.target.textContent = 'Copy' }, 2000)
})

/* On a computer the pretend house starts in place of its picture, drawn at the wall's own size and shrunk to fit;
   on a phone it is too small to use there, so the link opens it on its own page. */
const veil = document.querySelector('.pretend .veil')
veil.addEventListener('click', (e) => {
  if (matchMedia('(max-width: 960px)').matches) return
  e.preventDefault()
  const live = document.createElement('div'), frame = document.createElement('iframe')
  live.className = 'live'; frame.src = veil.getAttribute('href'); frame.title = 'A pretend house'
  live.append(frame)
  veil.previousElementSibling.querySelector('img').replaceWith(live)
  veil.remove()
  const fit = () => { frame.style.transform = `scale(${live.clientWidth / 1440})` }
  fit(); addEventListener('resize', fit)
})

for (const form of document.querySelectorAll('form.list')) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = form.email.value.trim()
    const say = (text, ok) => {
      let p = form.parentElement.querySelector('.said')
      if (!p) { p = document.createElement('p'); p.className = 'said'; p.setAttribute('role', 'status'); form.after(p) }
      p.textContent = text
      p.classList.toggle('no', !ok)
      if (ok) form.hidden = true
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say("That doesn't look like an email address.", false)
    form.querySelector('button').disabled = true
    try {
      const res = await fetch('/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: form.website.value }) })
      if (res.ok) say("Thanks. We'll write to you once, when it's ready.", true)
      else say(res.status === 400 ? "That doesn't look like an email address." : "That didn't go through. Try again in a minute.", false)
    } catch {
      say("That didn't go through. Try again in a minute.", false)
    } finally {
      form.querySelector('button').disabled = false
    }
  })
}
