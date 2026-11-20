<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* Asked once, the first time two speakers in a room play the same song (design/speaker-pair/, B): are they one pair?
   One pair makes them one card for good; Two speakers keeps two whole cards. Leaving it unanswered asks again on a
   later visit, and until then the second speaker is a line under the first (C). */
import { ref } from 'vue'
import { pairSpeakers, type Device, type Room } from './api'
import { notify, shortName } from './store'

const props = defineProps<{ lead: Device; other: Device; room: Room }>()
const emit = defineEmits<{ done: [] }>()
const busy = ref(false)
const n = (d: Device) => shortName(d, props.room)
async function answer(pair: boolean) {
  if (busy.value) return
  busy.value = true
  try { await pairSpeakers([props.lead.id, props.other.id], pair); emit('done') } catch (e) { notify((e as Error).message, 'error') }
  busy.value = false
}
</script>

<template>
  <div class="sheet-back pair-ask-back" @click.self="emit('done')">
    <div class="sheet pair-ask" role="dialog" aria-label="Are these two one pair?">
      <h2 class="pair-ask-title">Are these two one pair?</h2>
      <p class="pair-ask-lede">The {{ n(lead) }} and the {{ n(other) }} are playing the same song in the {{ room.name.toLowerCase() }}. As a pair, they're one card that plays, pauses and turns up together.</p>
      <div class="pair-ask-opts">
        <button class="button big" :class="{ busy }" @click="answer(true)">One pair</button>
        <button class="button ghost big" :class="{ busy }" @click="answer(false)">Two speakers</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pair-ask { max-width: 460px; padding: 24px 22px 20px; }
.pair-ask-title { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.pair-ask-lede { margin: 10px 0 0; font-size: 16px; line-height: 1.4; color: var(--ink-2); }
.pair-ask-opts { display: grid; gap: 10px; margin-top: 18px; }
</style>
