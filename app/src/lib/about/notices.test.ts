import { describe, expect, it } from 'vitest'
import { filterComponents, fromCargoMetadata, fromNpmLock, merge, normaliseLicence, summarise, type Component } from './notices'
import generated from '../../generated/third-party.json'
import capabilities from '../../../src-tauri/capabilities/default.json'

describe('third-party components from Cargo', () => {
  // The part of `cargo metadata` that matters: packages, and the resolved graph with dependency kinds.
  const meta = {
    packages: [
      { id: 'root', name: 'oversay', version: '0.1.0', license: '' },
      { id: 'a', name: 'serde', version: '1.0.1', license: 'MIT OR Apache-2.0', repository: 'https://github.com/serde-rs/serde' },
      { id: 'b', name: 'no-licence', version: '0.2.0', license: null },
      { id: 'c', name: 'build-only', version: '1.0.0', license: 'MIT' },
      { id: 'd', name: 'dev-only', version: '1.0.0', license: 'MIT' },
      { id: 'e', name: 'deep', version: '3.0.0', license: 'ISC' },
    ],
    resolve: {
      root: 'root',
      nodes: [
        {
          id: 'root',
          deps: [
            { pkg: 'a', dep_kinds: [{ kind: null }] },
            { pkg: 'b', dep_kinds: [{ kind: null }] },
            { pkg: 'c', dep_kinds: [{ kind: 'build' }] },
            { pkg: 'd', dep_kinds: [{ kind: 'dev' }] },
          ],
        },
        { id: 'a', deps: [{ pkg: 'e', dep_kinds: [{ kind: null }] }] },
        { id: 'b', deps: [] },
        { id: 'c', deps: [] },
        { id: 'd', deps: [] },
        { id: 'e', deps: [] },
      ],
    },
  }

  it('lists what the app ships: normal dependencies, direct and indirect, not the app itself', () => {
    const names = fromCargoMetadata(meta).map((c) => c.name)
    expect(names).toEqual(['deep', 'no-licence', 'serde'])
  })

  it('flags a package with no declared licence instead of dropping it', () => {
    const flagged = fromCargoMetadata(meta).find((c) => c.name === 'no-licence')
    expect(flagged).toMatchObject({ licence: null, source: 'cargo' })
  })

  it('links each to its page on crates.io', () => {
    expect(fromCargoMetadata(meta).find((c) => c.name === 'serde')?.url).toBe('https://crates.io/crates/serde/1.0.1')
  })
})

describe('third-party components from the npm lockfile', () => {
  const lock = {
    packages: {
      '': { name: 'oversay' },
      'node_modules/ajv': { version: '8.20.0', license: 'MIT' },
      'node_modules/@tauri-apps/api': { version: '2.12.1', license: 'MIT OR Apache-2.0' },
      'node_modules/vite': { version: '8.3.0', license: 'MIT', dev: true },
      'node_modules/ajv/node_modules/json-schema-traverse': { version: '1.0.0' },
    },
  }

  it('lists the runtime packages, with scoped and nested names, and not the dev ones', () => {
    const got = fromNpmLock(lock)
    expect(got.map((c) => c.name)).toEqual(['@tauri-apps/api', 'ajv', 'json-schema-traverse'])
  })

  it('flags a package with no declared licence', () => {
    expect(fromNpmLock(lock).find((c) => c.name === 'json-schema-traverse')?.licence).toBeNull()
  })
})

describe('licence expressions', () => {
  it('writes the same alternatives the same way, so each licence is counted once', () => {
    expect(normaliseLicence('MIT/Apache-2.0')).toBe('Apache-2.0 OR MIT')
    expect(normaliseLicence('MIT OR Apache-2.0')).toBe('Apache-2.0 OR MIT')
    expect(normaliseLicence('Zlib OR Apache-2.0 OR MIT')).toBe('Apache-2.0 OR MIT OR Zlib')
    expect(normaliseLicence('Unlicense/MIT')).toBe('MIT OR Unlicense')
  })

  it('keeps a compound expression as declared', () => {
    expect(normaliseLicence('(MIT OR Apache-2.0) AND Unicode-3.0')).toBe('(MIT OR Apache-2.0) AND Unicode-3.0')
    expect(normaliseLicence('MIT')).toBe('MIT')
  })
})

describe('merging and summarising', () => {
  const list: Component[] = [
    { name: 'b', version: '1', licence: 'MIT', source: 'npm', url: 'u' },
    { name: 'a', version: '1', licence: null, source: 'cargo', url: 'u' },
    { name: 'a', version: '1', licence: null, source: 'cargo', url: 'u' },
    { name: 'c', version: '2', licence: 'MIT', source: 'cargo', url: 'u' },
  ]

  it('drops exact duplicates (one crate pulled in by several targets) and sorts by name', () => {
    expect(merge(list).map((c) => c.name)).toEqual(['a', 'b', 'c'])
  })

  it('counts components, those with no licence, and each licence', () => {
    const s = summarise(merge(list))
    expect(s.total).toBe(3)
    expect(s.withoutLicence).toBe(1)
    expect(s.byLicence).toEqual([{ licence: 'MIT', count: 2 }])
  })

  it('filters by name or licence, ignoring case, and lists the flagged ones first', () => {
    const all = merge(list)
    expect(filterComponents(all, '').map((c) => c.name)).toEqual(['a', 'b', 'c'])
    expect(filterComponents(all, 'mit').map((c) => c.name)).toEqual(['b', 'c'])
    expect(filterComponents(all, 'B').map((c) => c.name)).toEqual(['b'])
  })
})

describe('the generated list', () => {
  it('is not empty, and every entry names its package and version', () => {
    expect(generated.components.length).toBeGreaterThan(50)
    expect(generated.components.every((c) => c.name && c.version)).toBe(true)
  })

  it('has both the Rust and npm sides, and what is bundled besides', () => {
    expect(new Set(generated.components.map((c) => c.source))).toEqual(new Set(['cargo', 'npm', 'bundled']))
    // Whisper (ADR 0041): whisper.cpp and its model are listed though neither is a package.
    expect(generated.components.filter((c) => c.source === 'bundled').map((c) => c.licence)).toEqual(['MIT', 'MIT'])
  })
})

describe('opening a component page', () => {
  // The links are opened by the opener plugin, which only opens what capabilities/default.json
  // allows: the hosts are written on both sides, so this keeps them in step (CODING_STANDARDS.md).
  const allowed = capabilities.permissions
    .filter((p): p is { identifier: string; allow: { url: string }[] } => typeof p === 'object' && 'allow' in p)
    .filter((p) => p.identifier === 'opener:allow-open-url')
    .flatMap((p) => p.allow.map((a) => a.url))

  const matches = (url: string) =>
    allowed.some((pattern) => url.startsWith(pattern.replace(/\*$/, '')))

  it('only links to hosts the manager window may open', () => {
    expect(allowed.length).toBeGreaterThan(0)
    expect(generated.components.filter((c) => !matches(c.url))).toEqual([])
  })

  it('builds links the capability allows', () => {
    const cargo = fromCargoMetadata({
      packages: [{ id: 'r', name: 'oversay', version: '0' }, { id: 'a', name: 'x', version: '1.0.0' }],
      resolve: { root: 'r', nodes: [{ id: 'r', deps: [{ pkg: 'a', dep_kinds: [{ kind: null }] }] }, { id: 'a', deps: [] }] },
    })
    const npm = fromNpmLock({ packages: { 'node_modules/@s/y': { version: '2.0.0' } } })
    expect([...cargo, ...npm].every((c) => matches(c.url))).toBe(true)
  })
})
