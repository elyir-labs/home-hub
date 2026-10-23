<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/*
 * For working on the hub (design/developer/, B, shown by default on a hub not on releases). Three cards: what
 * the hub follows, SSH, and the wall screens in the house. Nothing here is needed to run a house, and the page
 * says so first. A key is added from a phone or computer and never typed on a shared screen: there the SSH card
 * offers a code for this page on a phone instead (the phone board).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { store, notify, loadDeveloper } from './store'
import { allowKeys, followChannel, githubKeys, hideDeveloper, qrUrl, removeKey, turnSsh, updateScreen, updateScreens, type DevKey, type DevScreen, type GithubKey } from './api'
import { behindScreens, choices, keySource, keyUrl, readKey, screenBuild, screenState, screenWhere, shortPrint, type Choice } from './developer'
import { isScreen } from './screen'
import { onWall } from './keys'
import { locale } from './lang'
import Icon from './Icon.vue'

const d = computed(() => store.developer)
const shared = isScreen() || onWall()
const now = ref(Date.now() / 1000)
let poll: number | undefined
onMounted(() => {
  if (shared) store.devKey = false
  loadDeveloper()
  poll = window.setInterval(() => { now.value = Date.now() / 1000; loadDeveloper() }, 20_000)
})
onUnmounted(() => { window.clearInterval(poll); store.devKey = false })

const busy = ref('')
async function act(what: string, run: () => Promise<unknown>, done = '') {
  if (busy.value) return false
  busy.value = what
  try { await run(); await loadDeveloper(); if (done) notify(done); return true }
  catch (e: any) { if (!e?.canceled) notify(e.message, 'error'); return false }
  finally { busy.value = '' }
}

/* What it follows. Choosing another asks first, in the row: moving is a reinstall and a restart. */
const opts = computed(() => d.value ? choices(d.value) : [])
const moving = computed(() => d.value?.requested.channel ?? null)
const asking = ref<string | null>(null)
const branch = ref('')
function pick(c: Choice) {
  if (c.on || moving.value) return
  asking.value = c.other ? '' : c.id
  branch.value = ''
}
const target = computed(() => asking.value === '' ? branch.value.trim() : asking.value ?? '')
async function move() {
  const to = target.value
  if (!to) return
  if (await act('channel', () => followChannel(to))) asking.value = null
}

/* SSH. The command is the thing to copy; a shared screen has nothing to paste it into, so it only shows it. */
const ssh = computed(() => d.value?.ssh)
const command = computed(() => ssh.value ? `ssh ${ssh.value.user}@${ssh.value.host}` : '')
const canCopy = !shared && !!navigator.clipboard
async function copy() {
  try { await navigator.clipboard.writeText(command.value); notify('Copied.') } catch { notify('Couldn’t copy it here.', 'error') }
}
const keyLine = (k: DevKey) => [k.type, shortPrint(k.fingerprint),
  k.source === 'pasted' && k.added ? `pasted ${new Date(k.added * 1000).toLocaleDateString(locale(), { month: 'long', day: 'numeric' })}` : keySource(k.source)].join(' · ')
const qrBroken = ref(false)

/* Adding a key, on a phone or computer: from GitHub, ticking which by name, or one pasted line. */
const how = ref<'github' | 'paste'>('github')
const user = ref(''), found = ref<GithubKey[]>([]), looked = ref(''), ticked = ref<Set<string>>(new Set())
let lookTimer: number | undefined
watch(user, u => { window.clearTimeout(lookTimer); lookTimer = window.setTimeout(() => look(u), 500) })
async function look(u: string) {
  const name = u.trim()
  if (!name || name === looked.value) return
  try { found.value = await githubKeys(name); looked.value = name; ticked.value = new Set() }
  catch (e: any) { found.value = []; looked.value = ''; if (!e?.canceled) notify(e.message, 'error') }
}
function tick(k: GithubKey) {
  const s = new Set(ticked.value)
  s.has(k.line) ? s.delete(k.line) : s.add(k.line)
  ticked.value = s
}
const pasted = ref('')
const read = computed(() => readKey(pasted.value))
const allowing = computed(() => how.value === 'github' ? found.value.filter(k => ticked.value.has(k.line)).map(k => k.line) : read.value ? [read.value.line] : [])
const allowWords = computed(() => how.value === 'paste' ? 'Allow this key' : allowing.value.length === 1 ? 'Allow 1 key' : `Allow ${allowing.value.length || ''} keys`.replace('  ', ' '))
async function allow() {
  if (!allowing.value.length) return
  const source = how.value === 'github' ? `github:${looked.value}` : 'pasted'
  if (await act('keys', () => allowKeys(allowing.value, source), `SSH is on: ${command.value}`)) {
    store.devKey = false; pasted.value = ''; ticked.value = new Set()
  }
}

/* The screens, each with what it is on and whether it is behind this hub. */
const screens = computed(() => d.value?.screens ?? [])
const behind = computed(() => behindScreens(d.value, now.value))
const state = (s: DevScreen) => screenState(s, now.value)

async function takeAway() {
  if (await act('hide', hideDeveloper)) store.sheet = 'house'
}
</script>

<template>
  <div class="page" v-if="d && store.devKey && !shared">
    <button class="dev-back" @click="store.devKey = false"><Icon name="back" :size="16" />For working on the hub</button>
    <p class="page-lede">A key added here can sign in to this hub as <span class="dev-mono">{{ d.ssh.user }}</span>. Nothing else about the hub changes.</p>
    <div class="dev-seg" role="tablist">
      <button role="tab" :aria-selected="how === 'github'" :class="{ on: how === 'github' }" @click="how = 'github'">From GitHub</button>
      <button role="tab" :aria-selected="how === 'paste'" :class="{ on: how === 'paste' }" @click="how = 'paste'">Paste one</button>
    </div>
    <div v-if="how === 'github'" class="dev-form">
      <label class="dev-flabel" for="dev-user">GitHub username</label>
      <input id="dev-user" class="input" v-model="user" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="search" @keydown.enter="look(user)" />
      <template v-if="looked">
        <p class="dev-flabel dev-found">github.com/{{ looked }}.keys has {{ found.length || 'no keys' }}</p>
        <button v-for="k in found" :key="k.line" class="dev-pk" role="checkbox" :aria-checked="ticked.has(k.line)" :class="{ on: ticked.has(k.line) }" @click="tick(k)">
          <span class="dev-box"><Icon v-if="ticked.has(k.line)" name="check" :size="13" /></span>
          <span><b>{{ k.name }}</b><span class="dev-mono">{{ k.type }} · {{ shortPrint(k.fingerprint) }}</span></span>
        </button>
      </template>
    </div>
    <div v-else class="dev-form">
      <label class="dev-flabel" for="dev-paste">The public key, one line</label>
      <textarea id="dev-paste" class="input dev-paste dev-mono" v-model="pasted" rows="4" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="ssh-ed25519 AAAA… you@laptop"></textarea>
      <div class="dev-pk on" v-if="read">
        <span class="dev-box"><Icon name="check" :size="13" /></span>
        <span><b>{{ read.name }}</b><span class="dev-mono">{{ read.type }} · {{ shortPrint(read.fingerprint) }}</span></span>
      </div>
      <p class="dev-flabel dev-warn" v-else-if="pasted.trim()">That isn’t a public key. One starts with ssh-ed25519, ssh-rsa or ecdsa.</p>
    </div>
    <button class="button big dev-cta" :class="{ busy: busy === 'keys' }" :disabled="!allowing.length" @click="allow">{{ allowWords }}</button>
    <p class="dev-foot">It asks for the passcode, then SSH is on:<br><span class="dev-mono">{{ command }}</span></p>
  </div>

  <div class="page" v-else-if="d">
    <div class="dev-head">
      <p class="page-lede">Nothing here is needed to run a house.</p>
      <button class="button small ghost" :class="{ busy: busy === 'hide' }" @click="takeAway">Take this page away</button>
    </div>
    <div class="dev-cards">
      <div class="dev-col">
        <section class="dev-card" aria-label="What this hub follows">
          <h3>What this hub follows</h3>
          <template v-for="c in opts" :key="c.id || 'other'">
            <button class="dev-opt" :class="{ on: moving ? c.id === moving : c.on }" :disabled="!!moving && c.id !== moving" @click="pick(c)">
              <span class="dev-dot"></span>
              <span><b>{{ c.title }}</b><span :class="{ 'dev-warn': c.warn }">{{ moving === c.id ? 'Moving here now. The hub page shows how far it has got.' : c.say }}</span></span>
            </button>
            <div class="dev-ask" v-if="asking !== null && (c.other ? asking === '' : asking === c.id)">
              <input v-if="c.other" class="input" v-model="branch" placeholder="The branch's name" autocapitalize="off" autocomplete="off" spellcheck="false" @keydown.enter="move" />
              <p>Move this hub to {{ c.other ? (branch.trim() || 'that branch') : c.title }}? It installs that code and restarts. Lights and switches keep working.</p>
              <span class="dev-acts">
                <button class="button small" :disabled="!target" :class="{ busy: busy === 'channel' }" @click="move">Move it</button>
                <button class="button small ghost" @click="asking = null">Not now</button>
              </span>
            </div>
          </template>
        </section>

        <section class="dev-card" aria-label="SSH">
          <h3>SSH</h3>
          <template v-if="ssh?.on">
            <div class="dev-cmd"><span class="dev-mono">{{ command }}</span><span class="dev-sub">{{ ssh.ip }}<button v-if="canCopy" class="dev-copy" aria-label="Copy the command" @click="copy"><Icon name="copy" :size="15" /></button></span></div>
            <div class="dev-key" v-for="k in ssh.keys" :key="k.fingerprint">
              <span>{{ k.name }}<span>{{ keyLine(k) }}</span></span>
              <button class="button small ghost" :class="{ busy: busy === k.fingerprint }" @click="act(k.fingerprint, () => removeKey(k.fingerprint))">Remove</button>
            </div>
            <p class="dev-sub dev-none" v-if="!ssh.keys.length">No keys added here. One added when the hub was flashed still signs in.</p>
            <div class="dev-row">
              <span class="dev-sub" v-if="shared">Add a key from a phone or computer.</span>
              <button class="button small ghost" v-else @click="store.devKey = true">Add a key</button>
              <button class="button small ghost" :class="{ busy: busy === 'ssh' }" :disabled="ssh.pending" @click="act('ssh', () => turnSsh(false))">Turn SSH off</button>
            </div>
          </template>
          <template v-else-if="ssh">
            <p class="dev-say">{{ ssh.pending ? 'Turning on.' : 'Off. Nothing can sign in over the network.' }}</p>
            <div class="dev-off" v-if="shared">
              <img v-if="!qrBroken" class="dev-qr" :src="qrUrl(keyUrl(ssh.host))" alt="A code that opens this page on a phone, ready to add a key" width="92" height="92" @error="qrBroken = true" />
              <span class="dev-sub">To turn it on, add a key. Open <span class="dev-ink">{{ ssh.host }}</span> on your phone or computer, then For working on the hub, where a key can be pasted rather than typed. It asks for the passcode.</span>
            </div>
            <div class="dev-row" v-else>
              <span class="dev-sub">To turn it on, add a key. It asks for the passcode.</span>
              <button class="button small" @click="store.devKey = true">Add a key</button>
            </div>
          </template>
        </section>
      </div>

      <section class="dev-card" aria-label="Screens in this house">
        <h3>Screens in this house</h3>
        <p class="dev-say">{{ screens.length ? 'Each keeps up with this hub by itself, overnight, after the hub’s own update.' : 'No wall screens have joined this house yet.' }}</p>
        <table class="dev-table" v-if="screens.length">
          <thead><tr><th>Screen</th><th>Follows</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in screens" :key="s.id">
              <td>{{ s.name }}<span class="dev-m dev-mono">{{ screenWhere(s, now) }}</span></td>
              <td>{{ s.channel }}<span class="dev-m dev-mono">{{ screenBuild(s) }}</span></td>
              <td class="dev-end">
                <span class="dev-ok" v-if="state(s) === 'current'"><Icon name="check" :size="14" /> Up to date</span>
                <button class="button small" v-else-if="state(s) === 'behind'" :class="{ busy: busy === s.id }" @click="act(s.id, () => updateScreen(s.id))">Update now</button>
                <span class="dev-sub" v-else-if="state(s) === 'updating'">Updating…</span>
                <span class="dev-sub" v-else-if="state(s) === 'quiet'">Not answering</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="dev-row" v-if="screens.length">
          <span class="dev-sub">An update restarts that screen’s wall, nothing else.</span>
          <button class="button small ghost" v-if="behind.length" :class="{ busy: busy === 'all' }" @click="act('all', updateScreens)">Update all</button>
        </div>
      </section>
    </div>
  </div>
</template>
