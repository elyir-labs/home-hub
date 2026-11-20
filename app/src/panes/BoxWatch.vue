<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* Watch on the TV, in a streaming box's pane on the wall and the phone (design/box-card/, B): what was last on when the
   house knows it, then every app, the used ones first, the same choice the TV's own Watch row gives. A tap opens it on
   the box, which wakes and switches the TV over; the app tapped stays marked, saying it is on the TV now. */
import { computed, ref } from 'vue'
import type { Device } from '../api'
import { perform } from '../store'
import { appsOf, appTint, lastOn } from '../boxes'

const props = defineProps<{ device: Device }>()
const all = ref(false)
const apps = computed(() => { const a = appsOf(props.device); return all.value ? [...a.shown, ...a.more] : a.shown })
const more = computed(() => all.value ? 0 : appsOf(props.device).more.length)
const last = computed(() => lastOn(props.device))
const sent = ref<string | null>(null)
function open(app: string | null) {
  sent.value = app ?? ''
  if (app && apps.value.includes(app)) perform(props.device, 'app', { source: app })
  else perform(props.device, 'on', undefined, { state: 'idle' })
}
const line = (app: string) => sent.value === app ? 'On the TV now' : last.value?.app === app && last.value.title !== app ? last.value.title : ''
</script>

<template>
  <section class="watch">
    <h2>Watch on the TV</h2>
    <button v-if="last" class="watch-last" :class="{ sent: sent === (last.app ?? '') }" @click="open(last.app)">
      <span class="watch-still"></span>
      <span class="watch-last-t">
        <span><span class="watch-lbl">{{ sent === (last.app ?? '') ? 'On the TV now' : last.label }}</span><b>{{ last.title }}</b></span>
        <small>{{ last.where }}</small>
      </span>
    </button>
    <div class="watch-apps">
      <button v-for="a in apps" :key="a" class="watch-app" :class="{ sent: sent === a }" :style="{ '--t': appTint(a) }" @click="open(a)">
        <small>{{ line(a) }}</small><b>{{ a }}</b>
      </button>
      <button v-if="more" class="watch-app watch-all" @click="all = true"><small>{{ more }} more</small><b>All apps</b></button>
    </div>
    <p class="watch-foot">The TV switches over by itself.</p>
  </section>
</template>

<style scoped>
.watch { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.watch h2 { margin: 0; font-size: 13px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--lamp); }
.watch-last { display: flex; flex: none; height: 132px; border-radius: var(--r-md); overflow: hidden; padding: 0; text-align: left; font: inherit; color: inherit; cursor: pointer;
  background: var(--surface-hi); border: 1px solid var(--edge); }
.watch-still { width: 42%; flex: none;
  background: radial-gradient(70% 90% at 25% 30%, rgba(var(--lamp-rgb), 0.55), transparent 70%), linear-gradient(160deg, #2a3142, #151a24); }
.watch-last-t { padding: 16px 18px; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.watch-lbl { display: block; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--lamp); }
.watch-last b { display: block; font-size: 22px; font-weight: 500; margin-top: 2px; }
.watch-last small { font-size: 14px; color: var(--muted); }
.watch-apps { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.watch-app { height: 104px; border-radius: var(--r-md); padding: 14px; display: flex; flex-direction: column; justify-content: flex-end; text-align: left;
  font: inherit; color: inherit; cursor: pointer;
  background: linear-gradient(160deg, rgba(var(--t), 0.55), rgba(var(--t), 0.16) 75%, var(--surface-hi)); border: 1px solid rgba(var(--t), 0.35); }
:root[data-shade='light'] .watch-app { background: linear-gradient(160deg, rgba(var(--t), 0.3), rgba(var(--t), 0.08)); }
.watch-app b { font-size: 17px; font-weight: 500; }
.watch-app small { font-size: 13px; color: var(--lamp); min-height: 1.2em; }
.watch-app.sent, .watch-last.sent { box-shadow: 0 0 0 2px var(--lamp); }
.watch-all { background: var(--surface-hi); border-color: var(--edge); }
.watch-all small { color: var(--muted); }
@media (min-width: 601px) { .watch { min-height: 0; overflow-y: auto; } }
.watch-foot { margin: 0; font-size: 14px; color: var(--muted); }
@media (max-width: 600px) {
  .watch { flex: none; }
  .watch-apps { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .watch-app { height: 76px; }
  .watch-last { height: 96px; }
  .watch-last b { font-size: 17px; }
}
</style>
