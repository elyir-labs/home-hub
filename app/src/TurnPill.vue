<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ask, here, putBack, turn } from './thisScreen'
import Icon from './Icon.vue'

/* On the first thing a new screen shows: one pill drawn the other way up, so a screen hung upside down
   reads it the right way on the day it goes up (design/this-screen/, C's pill on A). Once tapped it turns
   upright, because the screen now is, and stays as the way back. Any other turn is on This screen. */
onMounted(() => { if (!here.value) ask() })
const turned = ref(false), busy = ref(false)
async function go(fn: () => Promise<void>, now: boolean) {
  busy.value = true
  try { await fn(); turned.value = now } catch { /* the screen didn't turn; the pill stays as it was */ } finally { busy.value = false }
}
</script>

<template>
  <button v-if="here?.turns && !turned" class="turn-pill upside" :class="{ busy }" @click="go(() => turn(180), true)">
    <span class="turn-pill-ic"><Icon name="turn" :size="15" /></span>Upside down? Tap to turn it
  </button>
  <button v-else-if="here?.turns" class="turn-pill" :class="{ busy }" @click="go(putBack, false)">
    <span class="turn-pill-ic"><Icon name="turn" :size="15" /></span>Turned over. Put it back
  </button>
</template>

<style scoped>
/* drawn the other way up at the screen's top edge, which is its foot when the screen hangs upside down */
.turn-pill { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 40; display: inline-flex; align-items: center; gap: 10px;
             padding: 11px 18px 11px 14px; border-radius: 999px; background: rgba(12, 13, 16, .55); border: 1px solid var(--edge-hi);
             color: var(--ink); font-size: 15px; white-space: nowrap; }
.turn-pill.upside { bottom: auto; top: 26px; transform: translateX(-50%) rotate(180deg); }
.turn-pill.busy { opacity: .6; }
.turn-pill-ic { width: 26px; height: 26px; border-radius: 50%; background: var(--ink); color: var(--bg); display: grid; place-items: center; }
</style>
