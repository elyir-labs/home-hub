<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* The hub's own Wi-Fi as the label would show it: a code a phone's camera joins, and its name and password in
   words for a camera that doesn't read codes. Only ever on the screen plugged into the hub (design/screen-wifi/, C);
   the brain draws the code and refuses it to anything else. `side` is C's card beside the question, and without it
   this is the whole answer, on a screen nobody can touch. */
import { setupWifiQrUrl } from './api'

defineProps<{ ssid: string; password: string; side?: boolean }>()
</script>

<template>
  <div class="wifi-code" :class="{ side }">
    <span class="wifi-code-or" v-if="side">Or from your phone</span>
    <img class="wifi-code-qr" :src="setupWifiQrUrl" alt="" />
    <div>
      <p class="wifi-code-say">Point your phone’s camera at this code.</p>
      <p class="wifi-code-more" v-if="side">Easier for a long password. Your phone joins the hub, then asks the same question.</p>
      <p class="wifi-code-more" v-else>Your phone joins the hub, then asks which Wi&#8209;Fi is yours.</p>
      <div class="wifi-code-pair">
        <span>Network<b>{{ ssid }}</b></span>
        <span>Password<b>{{ password }}</b></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wifi-code { display: flex; gap: 24px; align-items: center; padding: 20px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--edge); }
.wifi-code.side { flex-direction: column; align-items: flex-start; gap: 0; padding: 26px; }
.wifi-code-or { font-size: 11.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-bottom: 18px; }
.wifi-code-qr { flex: none; width: 168px; height: 168px; padding: 10px; border-radius: 14px; background: #fff; }
.side .wifi-code-qr { width: 196px; height: 196px; padding: 11px; margin-bottom: 20px; }
.wifi-code-say { margin: 0; font-size: 19px; line-height: 1.3; letter-spacing: -0.01em; color: var(--ink); }
.wifi-code-more { margin: 6px 0 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
.wifi-code-pair { display: flex; gap: 28px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--edge); font-size: 12.5px; color: var(--muted); }
.side .wifi-code-pair { align-self: stretch; margin-top: 18px; }
.wifi-code-pair b { display: block; margin-top: 3px; font-size: 17px; font-weight: 600; letter-spacing: 0.02em; color: var(--ink); }
</style>
