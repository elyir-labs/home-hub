<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { store } from './store'
import type { Act } from './adding'
import SwitchSetup from './SwitchSetup.vue'
import Icon from './Icon.vue'

/* The switch on the wall behind a light, opened from the light's own screen: the same page its setup ended
   on, so there is one place a switch is set up (design/switch-setup/, dimming is your choice, A). */
const acts = ref<Act[]>([])
const head = ref('')

function close() { store.switchSettings = null }
function key(e: KeyboardEvent) { if (e.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', key))
onUnmounted(() => window.removeEventListener('keydown', key))
</script>

<template>
  <div class="sheet-back" @click.self="close" v-if="store.switchSettings">
    <div class="sheet sw-sheet" role="dialog" aria-label="The switch on the wall">
      <div class="sheet-head">
        <h2 class="display">{{ head || store.switchSettings.name }}</h2>
        <button class="round sheet-close" @click="close" aria-label="Close"><Icon name="close" :size="20" /></button>
      </div>
      <div class="sheet-body">
        <SwitchSetup settings :addr="store.switchSettings.addr" :device-id="store.switchSettings.deviceId" :name="store.switchSettings.name"
                     @acts="(a: Act[]) => acts = a" @head="(h: string) => head = h" @done="close" />
        <div class="flow-actions">
          <button v-for="a in acts" :key="a.label" class="button" :class="{ ghost: !a.primary }" @click="a.run()">{{ a.label }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
