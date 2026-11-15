#!/usr/bin/env node
// Writes latest.json, the file the updater reads (ADR 0030), from a folder holding a release's
// update packages and their .sig files.
//
// Which package serves which install: the macOS universal archive is listed under both Mac
// architectures (the updater has no universal lookup); each Windows installer kind under its own
// key, so an install updates in its own format. Nothing is listed under plain windows-x86_64,
// so the portable .exe never finds a package to install.
//
// Usage:
//   node scripts/latest-json.mjs --dir release --version 0.2.0 --base https://host/path \
//     [--notes-file notes.md] [--out release/latest.json]
// --base is where the files will be downloaded from; each URL is base + / + file name.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// File name pattern → updater keys. Names are Tauri's bundle names for productName Oversay.
const KINDS = [
  { match: (f) => f === 'Oversay.app.tar.gz', keys: ['darwin-aarch64', 'darwin-x86_64'] },
  { match: (f) => /^Oversay_.+_x64-setup\.exe$/.test(f), keys: ['windows-x86_64-nsis'] },
  { match: (f) => /^Oversay_.+_x64_[a-zA-Z-]+\.msi$/.test(f), keys: ['windows-x86_64-msi'] },
]

// files: names in the folder; sig: reads a .sig file's contents.
export function latestJson({ files, sig, version, notes, base, date }) {
  const platforms = {}
  for (const f of files) {
    if (!files.includes(`${f}.sig`)) continue
    const kind = KINDS.find((k) => k.match(f))
    if (!kind) continue
    for (const key of kind.keys) {
      if (platforms[key]) throw new Error(`two packages for ${key}: ${platforms[key].file} and ${f}`)
      platforms[key] = { file: f, signature: sig(`${f}.sig`).trim(), url: `${base.replace(/\/+$/, '')}/${encodeURIComponent(f)}` }
    }
  }
  if (!Object.keys(platforms).length) throw new Error('no signed update packages found')
  return {
    version,
    notes,
    pub_date: date.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platforms: Object.fromEntries(Object.entries(platforms).sort().map(([k, { signature, url }]) => [k, { signature, url }])),
  }
}

function main(argv) {
  const opt = {}
  for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1]
  for (const k of ['dir', 'version', 'base'])
    if (!opt[k]) {
      console.error(`latest-json: --${k} is required`)
      process.exit(1)
    }
  const json = latestJson({
    files: readdirSync(opt.dir),
    sig: (f) => readFileSync(join(opt.dir, f), 'utf8'),
    version: opt.version,
    notes: opt['notes-file'] ? readFileSync(opt['notes-file'], 'utf8').trim() : '',
    base: opt.base,
    date: new Date(),
  })
  const out = opt.out ?? join(opt.dir, 'latest.json')
  writeFileSync(out, JSON.stringify(json, null, 2) + '\n')
  console.log(`latest-json: ${out} lists ${Object.keys(json.platforms).join(', ')}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
