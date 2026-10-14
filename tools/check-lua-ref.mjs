#!/usr/bin/env node
// Holds the Lua reference (assets/data/lua-api*.js) to the engine: every name
// a script can reach is read from the engine's own source and must have an
// entry, or be listed in the data's `internal` (runtime plumbing that is not
// for module authors). An entry naming something the engine no longer has is
// reported too.
//
//   node tutorials/tools/check-lua-ref.mjs        exit 1 when they differ
//   node tutorials/tools/check-lua-ref.mjs --list print what the engine exposes
//
// What is read:
//   engine/server/src/lua/world_binding.cpp   luaL_Reg DNP_FUNCS, ENTITY_METHODS,
//                                             PROP_METHODS, SECTOR_METHODS; dnp.button
//   engine/server/src/lua/fx_binding.cpp      the fx and vec3 tables
//   engine/server/src/lua/weapon_binding.cpp  WEAPON_FUNCS (dnp.*)
//   engine/server/src/mobs/mob_binding.cpp    MOB_FUNCS (dnp.*)
//   engine/server/src/lua/vm.cpp              HOOK_NAMES
//   engine/maps/scripts/{mobs,triggers,graphs,weapons}.lua   function M.x / M.x = function
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ENGINE = path.resolve(here, '../../engine')
const read = (p) => fs.readFileSync(path.join(ENGINE, p), 'utf8')

function regTable(src, name) {
  const m = new RegExp(`const luaL_Reg ${name}\\[\\]\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(src)
  if (!m) throw new Error(`no luaL_Reg ${name}`)
  return [...m[1].matchAll(/\{\s*"([A-Za-z0-9_]+)"\s*,/g)].map((x) => x[1])
}

const exposed = new Map() // id -> where
const add = (id, where) => exposed.set(id, where)

const world = read('server/src/lua/world_binding.cpp')
for (const n of regTable(world, 'DNP_FUNCS')) add(`dnp.${n}`, 'world_binding DNP_FUNCS')
for (const n of regTable(world, 'ENTITY_METHODS')) add(`entity.${n}`, 'world_binding ENTITY_METHODS')
for (const n of regTable(world, 'PROP_METHODS')) add(`prop.${n}`, 'world_binding PROP_METHODS')
for (const n of regTable(world, 'SECTOR_METHODS')) add(`sector.${n}`, 'world_binding SECTOR_METHODS')
for (const n of regTable(read('server/src/lua/weapon_binding.cpp'), 'WEAPON_FUNCS')) add(`dnp.${n}`, 'weapon_binding WEAPON_FUNCS')
for (const n of regTable(read('server/src/mobs/mob_binding.cpp'), 'MOB_FUNCS')) add(`dnp.${n}`, 'mob_binding MOB_FUNCS')

// dnp.button: the block that builds the table before setfield "button".
const btn = /lua_newtable\(L\);([\s\S]*?)lua_setfield\(L, -2, "button"\)/.exec(world)
if (btn) for (const m of btn[1].matchAll(/"([A-Z_]+)"/g)) add(`dnp.button.${m[1]}`, 'world_binding dnp.button')

const fxsrc = read('server/src/lua/fx_binding.cpp')
const fxTab = /lua_newtable\(L\);([\s\S]*?)lua_setglobal\(L, "fx"\)/.exec(fxsrc)
for (const m of fxTab[1].matchAll(/setfield\(L, -2, "([a-z_]+)"\)/g)) add(`fx.${m[1]}`, 'fx_binding')
const vTab = /lua_setglobal\(L, "fx"\);([\s\S]*?)lua_setglobal\(L, "vec3"\)/.exec(fxsrc)
for (const m of vTab[1].matchAll(/setfield\(L, -2, "([a-z_]+)"\)/g)) add(`vec3.${m[1]}`, 'fx_binding')

const hooks = /HOOK_NAMES\[\]\s*=\s*\{([\s\S]*?)\};/.exec(read('server/src/lua/vm.cpp'))
for (const m of hooks[1].replace(/\/\/.*$/gm, '').matchAll(/"([a-z_]+)"/g)) add(`hook.${m[1]}`, 'vm HOOK_NAMES')

for (const lib of ['mobs', 'triggers', 'graphs', 'weapons']) {
  const src = read(`maps/scripts/${lib}.lua`)
  // The library's local alias for its global table: `local M = mobs` (or W for weapons).
  const alias = (new RegExp(`^local ([A-Za-z_]+) *= *${lib}\\b`, 'm').exec(src) || [, 'M'])[1]
  const re = new RegExp(`^function ${alias}\\.([a-z_]+(?:\\.[a-z_]+)?)\\s*\\(|^${alias}\\.([a-z_]+)\\s*=\\s*function`, 'gm')
  for (const m of src.matchAll(re)) add(`${lib}.${m[1] || m[2]}`, `${lib}.lua`)
}

if (process.argv.includes('--list')) {
  for (const [id, where] of [...exposed].sort()) console.log(id.padEnd(36), where)
  console.log(`${exposed.size} names`)
  process.exit(0)
}

// The reference's data may be split over several files (assets/data/lua-api*.js),
// each adding groups to window.DNP_LUA_API.
const dataDir = path.resolve(here, '../assets/data')
const dataFiles = fs.readdirSync(dataDir).filter((f) => /^lua-api.*\.js$/.test(f)).sort()
if (!dataFiles.length) { console.error('no assets/data/lua-api*.js yet'); process.exit(1) }
const sandbox = { window: {} }
for (const f of dataFiles) vm.runInNewContext(fs.readFileSync(path.join(dataDir, f), 'utf8'), sandbox)
const api = sandbox.window.DNP_LUA_API
const documented = new Set(api.groups.flatMap((g) => g.entries.map((e) => e.id)))
const internal = new Set(api.internal || [])

const missing = [...exposed.keys()].filter((id) => !documented.has(id) && !internal.has(id)).sort()
const stale = [...documented].filter((id) => /^(dnp|entity|prop|sector|fx|vec3|hook|mobs|triggers|graphs|weapons)\./.test(id) && !exposed.has(id) && !(api.extra || []).includes(id)).sort()
const both = [...internal].filter((id) => documented.has(id))
console.log(`engine exposes ${exposed.size} names; documented ${documented.size}; internal ${internal.size}`)
if (missing.length) console.log(`MISSING (${missing.length}): ` + missing.join(', '))
if (stale.length) console.log(`NOT IN THE ENGINE (${stale.length}): ` + stale.join(', '))
if (both.length) console.log(`BOTH DOCUMENTED AND INTERNAL: ` + both.join(', '))
process.exit(missing.length || stale.length ? 1 : 0)
