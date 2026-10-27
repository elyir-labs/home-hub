<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* The drive beside a hub on its USB stick, as the hub can describe it: what it is, how big, and what is on
   it in a household's words (design/move-to-drive/). First run's question and This hub's sheet both show it. */
import type { Drive } from './api'
import { chips, title } from './drive'
defineProps<{ drive: Drive }>()
</script>

<template>
  <div class="drv-card">
    <span class="drv-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 12h.01M11 12h6" /></svg></span>
    <span>
      <b>{{ title(drive) }}</b>
      <small>This computer’s own drive</small>
      <span class="drv-chips"><span v-for="c in chips(drive)" :key="c">{{ c }}</span></span>
    </span>
  </div>
</template>

<style scoped>
.drv-card { display: flex; gap: 14px; align-items: flex-start; padding: 16px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--edge); }
.drv-ic { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; background: var(--surface-hi); color: var(--ink-2); flex: none; }
.drv-card b { display: block; font-size: 16.5px; font-weight: 500; }
.drv-card small { display: block; font-size: 14px; color: var(--ink-2); margin-top: 2px; }
.drv-chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.drv-chips span { font-size: 12.5px; padding: 4px 10px; border-radius: 999px; background: var(--surface-hi); border: 1px solid var(--edge); color: var(--ink-2); }
</style>
