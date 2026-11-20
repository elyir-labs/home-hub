// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Zigbee2MQTT never makes a new network over the house's own (run before it starts, by docker-compose.yml).

   configuration.yaml is in the repository with `network_key: GENERATE`, and Zigbee2MQTT writes the house's real key
   into that same file on its first start. An update moves the code with `git reset --hard`, which puts the file back
   as the repository has it -- and Zigbee2MQTT, finding GENERATE again, would make a NEW network, and every device in
   the house would be on the old one. install.sh now keeps the file across the reset, but an update is run by the
   install.sh the hub already has, so the first update after that fix still resets it. This is the other half, and it
   runs from the new code whatever ran the update: Zigbee2MQTT keeps its own copy of the network beside the file
   (coordinator_backup.json, which the reset never touches), and when the file says GENERATE and that copy exists, the
   network it describes is written back before Zigbee2MQTT reads the file. A hub that has never had a network (no
   copy yet) is left to make its first one, as before. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.Z2M_DATA || '/app/data'
const cfgPath = join(dir, 'configuration.yaml'), backupPath = join(dir, 'coordinator_backup.json')

export function restore(cfg, backup) {
  const net = {
    network_key: `[${[...Buffer.from(backup.network_key.key, 'hex')].join(', ')}]`,
    pan_id: String(parseInt(backup.pan_id, 16)),
    ext_pan_id: `[${[...Buffer.from(backup.extended_pan_id, 'hex')].join(', ')}]`,
  }
  let out = cfg, changed = []
  for (const [k, v] of Object.entries(net)) {
    const re = new RegExp(`^(\\s*${k}:\\s*)GENERATE\\b`, 'm')
    if (re.test(out)) { out = out.replace(re, `$1${v}`); changed.push(k) }
  }
  // the channel the network is on, where the file still has the one the repository started with
  if (changed.length && backup.channel) out = out.replace(/^(\s*channel:\s*)\d+/m, `$1${backup.channel}`)
  return { cfg: out, changed }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (existsSync(cfgPath) && existsSync(backupPath)) {
    const { cfg, changed } = restore(readFileSync(cfgPath, 'utf8'), JSON.parse(readFileSync(backupPath, 'utf8')))
    if (changed.length) { writeFileSync(cfgPath, cfg); console.log(`zigbee2mqtt: put the house's own network back (${changed.join(', ')})`) }
  }
}
