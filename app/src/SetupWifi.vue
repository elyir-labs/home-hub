<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* The hub's own Wi-Fi asking for the house's (design/setup-network/, A; the logic and words are wifi.ts's).
   Mounted instead of the whole panel at the setup address, because nothing else of the house is open to
   a phone here, and the house may not even have started. */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { getNetwork, moveHub, scanNetworks, type NetState, type SeenNetwork } from './api'
import { afterJoin, bars, firstScreen, houseAddress, offered, wrongLine, type WifiScreen } from './wifi'
import Icon from './Icon.vue'

const net = ref<NetState | null>(null)
const seen = ref<SeenNetwork[]>([])
const screen = ref<WifiScreen>('which')
const ssid = ref(''), password = ref(''), typed = ref(''), typing = ref(false)
const error = ref(''), busy = ref(false), copied = ref(false), show = ref(false)
const passField = ref<HTMLInputElement | null>(null)

const networks = computed(() => offered(seen.value, net.value?.setup?.ssid))
const secure = computed(() => networks.value.find(n => n.ssid === ssid.value)?.secure ?? true)
const address = computed(() => houseAddress(net.value))
const ICONS = ['wifi-low', 'wifi-low', 'wifi-mid', 'wifi-mid', 'wifi']

async function look() {
  try { seen.value = (await scanNetworks()).networks } catch { /* the list the hub saw before it started its own is still on it */ }
  if (!seen.value.length) try { net.value = await getNetwork() } catch {}
}

onMounted(async () => {
  try { net.value = await getNetwork() } catch {}
  const at = firstScreen(net.value)
  screen.value = at.screen; ssid.value = at.ssid ?? ''; error.value = at.error ?? ''
  look()
})

function pick(n: SeenNetwork) {
  ssid.value = n.ssid; password.value = ''; error.value = ''
  if (!n.secure) return join()
  screen.value = 'password'
  nextTick(() => passField.value?.focus())
}
function other() {
  const name = typed.value.trim()
  if (!name) return
  pick({ ssid: name, secure: true })
}
function back() { screen.value = 'which'; error.value = ''; password.value = '' }

let polling = 0
async function join() {
  if (busy.value) return
  if (secure.value && !password.value) { error.value = `${ssid.value} needs its password.`; return }
  busy.value = true; error.value = ''
  try { await moveHub(ssid.value, password.value) }
  catch (e: any) { error.value = e.message; busy.value = false; return }
  // A card that can't do both takes its own Wi-Fi down to try, and this phone with it: say what
  // happens next while there is still somebody here to read it.
  if (net.value?.setup && !net.value.setup.both) { screen.value = 'leaving'; busy.value = false; return }
  const until = Date.now() + 90_000
  polling = window.setInterval(async () => {
    let now: NetState
    try { now = await getNetwork() } catch { return }   // the hub's Wi-Fi moving channel: the phone is back in a moment
    const how = afterJoin(now, ssid.value)
    if (how === 'waiting' && Date.now() < until) return
    clearInterval(polling); busy.value = false; net.value = now
    if (how === 'done') screen.value = 'done'
    else { error.value = wrongLine(ssid.value, how === 'wrong' ? now.reverted_why : 'unreachable'); nextTick(() => passField.value?.select()) }
  }, 1500)
}
onUnmounted(() => clearInterval(polling))

/* The setup address is plain http, where the clipboard API is not offered, so copy the old way. */
function copy() {
  const t = document.createElement('textarea')
  t.value = 'hub.local'; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'
  document.body.appendChild(t); t.select()
  try { copied.value = document.execCommand('copy') } catch {}
  t.remove()
  if (copied.value) window.setTimeout(() => (copied.value = false), 2500)
}
</script>

<template>
  <main class="setup wifi-setup">
    <Transition name="view" mode="out-in">
      <section class="setup-page" v-if="screen === 'which'" key="which">
        <span class="setup-mark"><Icon name="home" :size="30" /></span>
        <h1 class="display">Which Wi&#8209;Fi is yours?</h1>
        <p class="setup-lede">The hub will use it from now on.</p>
        <ul class="wifi-list" v-if="!typing">
          <li v-for="n in networks" :key="n.ssid" role="button" tabindex="0" @click="pick(n)" @keydown.enter="pick(n)">
            <Icon v-if="n.secure" name="lock" :size="15" class="wifi-lock" /><span v-else class="wifi-lock"></span>
            <span class="wifi-name">{{ n.ssid }}</span>
            <Icon :name="ICONS[bars(n.signal)]" :size="18" class="wifi-strength" />
          </li>
          <li class="wifi-other" role="button" tabindex="0" @click="typing = true" @keydown.enter="typing = true">
            <Icon name="plus" :size="15" class="wifi-lock" /><span class="wifi-name">A network that isn’t listed</span><span></span>
          </li>
        </ul>
        <template v-else>
          <label class="field"><span class="field-label">Its name, exactly as it’s written</span>
            <input class="input" v-model="typed" autocapitalize="none" autocorrect="off" spellcheck="false" @keydown.enter="other" /></label>
          <div class="setup-actions">
            <button class="button big" @click="other">Continue</button>
            <button class="button big ghost" @click="typing = false">Back to the list</button>
          </div>
        </template>
        <p class="setup-foot">Or plug a cable from the hub into your router, and this step goes by itself.</p>
      </section>

      <section class="setup-page" v-else-if="screen === 'password'" key="password">
        <button class="wifi-back" @click="back"><Icon name="back" :size="18" />Other networks</button>
        <h1 class="display">{{ ssid }}’s password</h1>
        <p class="setup-lede">The one you’d give a guest.</p>
        <div class="wifi-secret" :class="{ 'wifi-bad': !!error }">
          <input ref="passField" class="input" :type="show ? 'text' : 'password'" v-model="password" autocapitalize="none" autocorrect="off"
                 spellcheck="false" autocomplete="current-password" :disabled="busy" @keydown.enter="join" />
          <button class="wifi-eye" type="button" :aria-label="show ? 'Hide the password' : 'Show the password'" @click="show = !show"><Icon :name="show ? 'eye-off' : 'eye'" :size="20" /></button>
        </div>
        <p class="setup-note wifi-wrong" v-if="error"><Icon name="alert" :size="16" /><span>{{ error }}</span></p>
        <div class="setup-actions"><button class="button big wifi-wide" :class="{ busy }" :disabled="busy" @click="join">{{ busy ? 'Joining…' : 'Join' }}</button></div>
      </section>

      <section class="setup-page" v-else-if="screen === 'done'" key="done">
        <span class="setup-mark done"><Icon name="check" :size="30" /></span>
        <h1 class="display">The hub is on {{ ssid }}.</h1>
        <p class="setup-lede">In a minute your phone goes back to {{ ssid }} by itself. The rest of setup is at this address, in your browser.</p>
        <div class="wifi-where"><span>hub.local</span><button class="wifi-copy" @click="copy"><Icon :name="copied ? 'check' : 'copy'" :size="15" />{{ copied ? 'Copied' : 'Copy' }}</button></div>
        <p class="setup-foot" v-if="address">If that doesn’t open, try {{ address }}.</p>
      </section>

      <section class="setup-page" v-else key="leaving">
        <span class="setup-mark"><Icon name="wifi" :size="30" /></span>
        <h1 class="display">The hub is joining {{ ssid }}.</h1>
        <p class="setup-lede">Your phone goes back to {{ ssid }} in a moment. The rest of setup is at this address, in your browser.</p>
        <div class="wifi-where"><span>hub.local</span><button class="wifi-copy" @click="copy"><Icon :name="copied ? 'check' : 'copy'" :size="15" />{{ copied ? 'Copied' : 'Copy' }}</button></div>
        <p class="setup-note"><Icon name="alert" :size="16" /><span>If the password was wrong, the hub’s own Wi&#8209;Fi comes back in a minute. Scan the code on the hub again to try once more.</span></p>
      </section>
    </Transition>
  </main>
</template>

<style scoped>
/* One card of rows, as on the board: a network is a name and how well the hub hears it, nothing else. */
.wifi-list { list-style: none; margin: 0; padding: 0; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--edge); overflow: hidden; }
.wifi-list li { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 12px; min-height: 56px; padding: 0 16px; font-size: 16.5px; cursor: pointer; }
.wifi-list li + li { border-top: 1px solid var(--edge); }
.wifi-list li:active { background: var(--surface-press); }
.wifi-list .wifi-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wifi-list .wifi-lock { color: var(--muted); }
.wifi-list .wifi-strength { color: var(--ink-2); }
.wifi-list .wifi-other { color: var(--ink-2); }
.wifi-back { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; margin: 0 0 14px; padding: 0; background: none; border: 0; color: var(--ink-2); font: inherit; font-size: 15px; }
.wifi-secret { position: relative; }
.wifi-secret .input { height: 56px; padding-right: 52px; font-size: 18px; }
.wifi-secret.wifi-bad .input { border-color: rgba(var(--danger-rgb), 0.7); }
.wifi-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; display: grid; place-items: center; background: none; border: 0; color: var(--muted); }
.wifi-wrong { margin: 12px 0 0; border-color: rgba(var(--danger-rgb), 0.4); background: rgba(var(--danger-rgb), 0.08); }
.wifi-wrong :deep(svg) { color: var(--danger); }
.wifi-wide { flex: 1; justify-content: center; }
.wifi-where { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 0 12px 0 20px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--edge-hi); font-size: 24px; letter-spacing: -0.01em; }
.wifi-copy { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border-radius: 999px; background: var(--surface-hi); border: 1px solid var(--edge); color: var(--ink-2); font: inherit; font-size: 14.5px; }
.wifi-setup .setup-note { margin-top: 16px; }
</style>
