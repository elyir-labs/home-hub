// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* An update that put configuration.yaml back to the repository's GENERATE never costs the house its Zigbee network
   (zigbee2mqtt-keep.mjs). Run: node --test driver-layer/zigbee2mqtt-keep.test.mjs */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { restore } from './zigbee2mqtt-keep.mjs'

const SEED = readFileSync(new URL('./zigbee2mqtt/configuration.yaml', import.meta.url), 'utf8')
const KEY = '0102030405060708090a0b0c0d0e0f10'
const BACKUP = { network_key: { key: KEY }, pan_id: '6efa', extended_pan_id: '3e7e308a0066f897', channel: 25 }

test('the repository\'s GENERATE is replaced with the network the house already has', () => {
  const { cfg, changed } = restore(SEED, BACKUP)
  assert.deepEqual(changed, ['network_key', 'pan_id', 'ext_pan_id'])
  assert.match(cfg, /network_key: \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16\]/)
  assert.match(cfg, /pan_id: 28410\b/)
  assert.match(cfg, /ext_pan_id: \[62, 126, 48, 138, 0, 102, 248, 151\]/)
  assert.match(cfg, /channel: 25\b/)
  assert.doesNotMatch(cfg, /GENERATE/)
})

test('a file that already has the house\'s network is left exactly as it is', () => {
  const kept = SEED.replace('network_key: GENERATE', 'network_key:\n    - 9\n    - 9').replace('pan_id: GENERATE', 'pan_id: 1').replace('ext_pan_id: GENERATE', 'ext_pan_id: [1]')
  assert.deepEqual(restore(kept, BACKUP), { cfg: kept, changed: [] })
})

test('run before Zigbee2MQTT: with a backup it writes the network back; with none it leaves a new hub to make its first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'z2m-'))
  writeFileSync(join(dir, 'configuration.yaml'), SEED)
  const run = () => execFileSync('node', [new URL('./zigbee2mqtt-keep.mjs', import.meta.url).pathname], { env: { ...process.env, Z2M_DATA: dir } }).toString()
  run()
  assert.equal(readFileSync(join(dir, 'configuration.yaml'), 'utf8'), SEED)
  writeFileSync(join(dir, 'coordinator_backup.json'), JSON.stringify(BACKUP))
  assert.match(run(), /put the house's own network back/)
  assert.match(readFileSync(join(dir, 'configuration.yaml'), 'utf8'), /pan_id: 28410/)
  assert.equal(run(), '')          // the second start finds nothing to do
})
