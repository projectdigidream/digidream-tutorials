#!/usr/bin/env node
// Pack an example module from modules/<id> into a pack the studio's Home can
// open with "⇩ import pack" -- for an example the studio does not bundle yet
// (Cinderfall, while it is being tested). It takes the same files
// studio/tools/make_template.mjs packs for a bundled example, plus the
// module's fonts (assets/ui/fonts), which a style names.
//
//   node tutorials/tools/pack-example.mjs cinderfall [out.zip]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { writePack } = await import(join(ROOT, 'studio/src/pack.js'))
const [id, outArg] = process.argv.slice(2)
if (!id || !existsSync(join(ROOT, 'modules', id))) { console.error('usage: node tutorials/tools/pack-example.mjs <module id> [out.zip]'); process.exit(2) }
const isPacked = (rel) => rel === 'module.studio.json' || /^maps\/[^/]+\.studio\.json$/.test(rel) ||
  (rel.startsWith('assets/') && /\.(png|json|mstk|sfxproj|ttf|otf|woff2?)$/.test(rel) && !/(^|\/)index\.json$/.test(rel)) || rel.startsWith('sources/')
const walk = (d) => readdirSync(d).sort().flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const SRC = join(ROOT, 'modules', id)
const entries = walk(SRC).map((p) => relative(SRC, p).split('\\').join('/')).filter(isPacked)
  .map((path) => ({ path, bytes: new Uint8Array(readFileSync(join(SRC, path))) }))
const out = outArg || `${id}.zip`
writeFileSync(out, await writePack(entries))
console.log(`wrote ${out}: ${entries.length} files, ${(statSync(out).size / 1048576).toFixed(1)} MB -- open it from the studio's Home with "⇩ import pack"`)
