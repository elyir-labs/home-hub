<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* A hold for what cannot be undone (design/leaving/): long enough that it cannot happen by brushing the screen, and
   the fill is the time left. Enter does it at once, for a keyboard. */
import { onUnmounted, ref } from 'vue'
const props = defineProps<{ label: string; busy?: boolean }>()
const emit = defineEmits<{ done: [] }>()
const HOLD = 1600
const held = ref(0)
let started = 0, frame = 0
function press() {
  if (props.busy) return
  started = performance.now()
  const step = () => {
    held.value = Math.min(1, (performance.now() - started) / HOLD)
    if (held.value >= 1) { held.value = 0; return emit('done') }
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}
function release() { cancelAnimationFrame(frame); held.value = 0 }
onUnmounted(() => cancelAnimationFrame(frame))
</script>

<template>
  <button class="hold-button" @pointerdown.prevent="press" @pointerup="release" @pointerleave="release" @pointercancel="release"
          @keydown.enter.prevent="busy || emit('done')" :aria-label="label">
    <i :style="{ width: `${held * 100}%` }"></i><span>{{ label }}</span>
  </button>
</template>

<style scoped>
.hold-button { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; width: 100%; height: 54px;
               border-radius: 999px; border: 1px solid rgba(var(--danger-rgb), 0.55); background: none; color: var(--danger); font: inherit;
               font-size: 16.5px; font-weight: 500; touch-action: none; user-select: none; -webkit-user-select: none; }
.hold-button i { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(var(--danger-rgb), 0.22); }
.hold-button span { position: relative; }
</style>
