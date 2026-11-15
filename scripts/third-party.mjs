#!/usr/bin/env node
// Writes app/src/generated/third-party.json: the Cargo and npm packages Oversay ships with and
// the licence each declares (013/03). About shows it. It is generated from Cargo.lock and
// package-lock.json on every dev run, build, test and type check (npm pre-scripts), never
// written by hand, and not committed.
//
// Cargo: `cargo metadata` for the macOS (both architectures) and Windows targets, normal
// dependencies only. Linux is not built yet (the epic notes it as later).
//
// Usage: node scripts/third-party.mjs   (env CARGO overrides how cargo is run)

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLED, fromCargoMetadata, fromNpmLock, merge } from '../app/src/lib/about/notices.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc']

// Cargo is on PATH in CI; locally it comes from mise (make passes CARGO the same way).
function cargoCommand() {
  const candidates = [process.env.CARGO, 'cargo', 'mise exec -- cargo'].filter(Boolean).map((c) => c.split(' '))
  for (const [cmd, ...args] of candidates) {
    try {
      execFileSync(cmd, [...args, '--version'], { stdio: 'ignore' })
      return [cmd, ...args]
    } catch {}
  }
  throw new Error('third-party: cargo not found (set CARGO, or install it with mise)')
}

const [cargo, ...cargoArgs] = cargoCommand()
const fromTarget = (target) =>
  fromCargoMetadata(
    JSON.parse(
      execFileSync(
        cargo,
        [...cargoArgs, 'metadata', '--format-version', '1', '--locked', '--filter-platform', target, '--manifest-path', join(root, 'app/src-tauri/Cargo.toml')],
        { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' },
      ),
    ),
  )

const lock = JSON.parse(readFileSync(join(root, 'app/package-lock.json'), 'utf8'))
const components = merge([...TARGETS.flatMap(fromTarget), ...fromNpmLock(lock), ...BUNDLED])

const out = join(root, 'app/src/generated/third-party.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ components }, null, 1) + '\n')
const missing = components.filter((c) => c.licence === null)
console.log(`third-party: ${components.length} components, ${missing.length} without a declared licence → ${out}`)
