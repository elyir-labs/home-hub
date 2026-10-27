<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* Moving the hub off its USB stick onto this computer's drive, after the household first chose to keep the
   drive (design/move-to-drive/, B's sheet, reached from This hub). The drive named, what is lost, and a hold:
   long enough that it cannot happen by brushing the screen, and the fill is the time left. The house has a
   passcode by now and erasing a drive is a change to it, so `request` asks for the code on the way. */
import { onUnmounted, ref } from 'vue'
import { getDrive, moveToDrive, type DriveState } from './api'
import { lost } from './drive'
import DriveCard from './DriveCard.vue'
import Icon from './Icon.vue'

const props = defineProps<{ state: DriveState }>()
const emit = defineEmits<{ close: [] }>()
const HOLD = 1600
const held = ref(0), moving = ref(false), error = ref('')
let started = 0, frame = 0, poll = 0

function press() {
  if (moving.value) return
  started = performance.now()
  const step = () => {
    held.value = Math.min(1, (performance.now() - started) / HOLD)
    if (held.value >= 1) return go()
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}
function release() { cancelAnimationFrame(frame); if (!moving.value) held.value = 0 }

async function go() {
  const d = props.state.drive
  if (!d) return
  moving.value = true; error.value = ''
  try { await moveToDrive(d.name, d.serial) }
  catch (e: any) { moving.value = false; held.value = 0; error.value = e.message; return }
  // The hub restarts to copy itself; when it answers again it answers from the drive.
  poll = window.setInterval(async () => {
    let s: DriveState
    try { s = await getDrive() } catch { return }
    if (s.from === 'drive') { clearInterval(poll); location.reload() }
    else if (s.failed || s.refused) { clearInterval(poll); moving.value = false; held.value = 0; error.value = s.failed || s.refused || '' }
  }, 3000)
}
onUnmounted(() => { cancelAnimationFrame(frame); clearInterval(poll) })
</script>

<template>
  <div class="sheet-back" @click.self="moving || emit('close')">
    <div class="sheet" role="dialog" aria-label="Move the hub onto this computer’s drive">
      <template v-if="!moving">
        <div class="sheet-head">
          <h2 class="display">Move the hub onto this computer’s drive</h2>
          <button class="round sheet-close" @click="emit('close')" aria-label="Close"><Icon name="close" :size="20" /></button>
        </div>
        <div class="sheet-body" v-if="state.drive">
          <DriveCard :drive="state.drive" />
          <ul class="dsh-means">
            <li class="hard">Everything on the drive is deleted for good: <b>{{ lost(state.drive) }}</b>. The house comes with the hub: rooms, phones and passcode.</li>
            <li>The hub restarts to move, for about four minutes. Switches on the wall keep working.</li>
            <li>Afterwards the stick can come out.</li>
          </ul>
          <p class="error" v-if="error">{{ error }}</p>
          <button class="dsh-hold" @pointerdown.prevent="press" @pointerup="release" @pointerleave="release" @pointercancel="release"
                  @keydown.enter.prevent="go" aria-label="Hold to erase the drive">
            <i :style="{ width: `${held * 100}%` }"></i><span>Hold to erase the drive</span>
          </button>
          <p class="dsh-foot">Needs the passcode</p>
        </div>
      </template>
      <div class="sheet-body dsh-moving" v-else>
        <h2 class="display">The house is moving to its own drive.</h2>
        <p class="sheet-lede">About four minutes. Switches on the wall keep working, and this screen comes back on its own.</p>
        <div class="dsh-bar"><i></i></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dsh-means { list-style: none; margin: 12px 0 14px; padding: 0; }
.dsh-means li { font-size: 15px; line-height: 1.45; color: var(--ink-2); padding: 9px 0 9px 22px; position: relative; }
.dsh-means li + li { border-top: 1px solid var(--edge); }
.dsh-means li::before { content: ''; position: absolute; left: 2px; top: 16px; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.dsh-means li.hard { color: var(--ink); }
.dsh-means li.hard::before { background: var(--danger); }
.dsh-hold { position: relative; overflow: hidden; width: 100%; height: 54px; border-radius: 999px; border: 1px solid rgba(var(--danger-rgb), 0.55);
            background: none; color: var(--danger); font: inherit; font-size: 16.5px; font-weight: 500; touch-action: none; user-select: none; -webkit-user-select: none; }
.dsh-hold i { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(var(--danger-rgb), 0.22); }
.dsh-hold span { position: relative; }
.dsh-foot { text-align: center; margin: 10px 0 0; font-size: 13.5px; color: var(--muted); }
.dsh-moving { padding-top: 8px; }
.dsh-bar { height: 6px; border-radius: 999px; background: var(--surface-hi); overflow: hidden; margin-top: 18px; }
.dsh-bar i { display: block; width: 30%; height: 100%; border-radius: 999px; background: var(--lamp); animation: dsh-slide 1.6s ease-in-out infinite; }
@keyframes dsh-slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) { .dsh-bar i { animation: none; margin-left: 35%; } }
</style>
