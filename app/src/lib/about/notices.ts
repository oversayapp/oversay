// The third-party components Oversay ships with and their licences, for About (013/03).
// Generated at build time from the Cargo and npm dependency trees by scripts/third-party.mjs
// (which imports this file), never written by hand. A component that declares no licence
// is flagged (`licence: null`), not left out.

export type Source = 'cargo' | 'npm' | 'bundled'

export interface Component {
  name: string
  version: string
  /** The SPDX expression the package declares, or null when it declares none. */
  licence: string | null
  source: Source
  /** Its page on crates.io or npmjs.com, or its project's page. */
  url: string
}

/**
 * What Oversay ships or downloads that is not a Cargo or npm package (ADR 0041): whisper.cpp,
 * built into the app by whisper-rs-sys, and Whisper's model, downloaded once when first needed.
 */
export const BUNDLED: Component[] = [
  { name: 'whisper.cpp', version: '1.8.3', licence: 'MIT', source: 'bundled', url: 'https://github.com/ggml-org/whisper.cpp' },
  { name: 'Whisper small.en model (ggml-small.en-q5_1)', version: '2024', licence: 'MIT', source: 'bundled', url: 'https://huggingface.co/ggerganov/whisper.cpp' },
]

interface CargoPackage {
  id: string
  name: string
  version: string
  license?: string | null
}

interface CargoMetadata {
  packages: CargoPackage[]
  resolve: {
    root: string | null
    nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[]
  }
}

/**
 * Packages spell the same licence several ways: "MIT/Apache-2.0" (Cargo's old form for OR),
 * "Apache-2.0 OR MIT" and "MIT OR Apache-2.0". A plain list of alternatives is written the one
 * way, sorted, so the summary counts each licence once. Anything with parentheses or mixed
 * operators is kept as declared.
 */
export function normaliseLicence(expression: string): string {
  const e = expression.trim().replace(/\s*\/\s*/g, ' OR ').replace(/\s+/g, ' ')
  for (const op of [' OR ', ' AND ']) {
    const other = op === ' OR ' ? ' AND ' : ' OR '
    if (e.includes(op) && !e.includes(other) && !/[()]/.test(e)) return e.split(op).sort().join(op)
  }
  return e
}

const declared = (s: string | null | undefined): string | null => (s && s.trim() ? normaliseLicence(s) : null)

/** What the app ships: the root package's normal dependencies, followed transitively. Build and dev dependencies are not shipped. */
export function fromCargoMetadata(meta: CargoMetadata): Component[] {
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]))
  const byId = new Map(meta.packages.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const queue = meta.resolve.root ? [meta.resolve.root] : []
  while (queue.length > 0) {
    const id = queue.pop()!
    for (const dep of nodes.get(id)?.deps ?? []) {
      if (!dep.dep_kinds.some((k) => k.kind === null) || seen.has(dep.pkg)) continue
      seen.add(dep.pkg)
      queue.push(dep.pkg)
    }
  }
  return [...seen]
    .map((id) => byId.get(id))
    .filter((p): p is CargoPackage => p !== undefined)
    .map((p) => ({
      name: p.name,
      version: p.version,
      licence: declared(p.license),
      source: 'cargo' as const,
      url: `https://crates.io/crates/${p.name}/${p.version}`,
    }))
    .sort(byName)
}

interface NpmLock {
  packages: Record<string, { name?: string; version?: string; license?: string; dev?: boolean }>
}

/** The runtime packages in package-lock.json: everything not marked `dev`. */
export function fromNpmLock(lock: NpmLock): Component[] {
  const out: Component[] = []
  for (const [path, p] of Object.entries(lock.packages)) {
    if (path === '' || p.dev || !p.version) continue
    // "node_modules/a/node_modules/@scope/b" is @scope/b.
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
    out.push({
      name,
      version: p.version,
      licence: declared(p.license),
      source: 'npm',
      url: `https://www.npmjs.com/package/${name}/v/${p.version}`,
    })
  }
  return out.sort(byName)
}

const byName = (a: Component, b: Component) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)

/** One entry per package and version (a crate several targets pull in is listed once), by name. */
export function merge(components: readonly Component[]): Component[] {
  const unique = new Map(components.map((c) => [`${c.source}:${c.name}@${c.version}`, c]))
  return [...unique.values()].sort(byName)
}

export interface Summary {
  total: number
  withoutLicence: number
  /** Declared licences with their counts, most used first. */
  byLicence: { licence: string; count: number }[]
}

export function summarise(components: readonly Component[]): Summary {
  const counts = new Map<string, number>()
  let withoutLicence = 0
  for (const c of components) {
    if (c.licence === null) withoutLicence += 1
    else counts.set(c.licence, (counts.get(c.licence) ?? 0) + 1)
  }
  return {
    total: components.length,
    withoutLicence,
    byLicence: [...counts].map(([licence, count]) => ({ licence, count })).sort((a, b) => b.count - a.count || a.licence.localeCompare(b.licence)),
  }
}

/** Components whose name or licence contains `query` (ignoring case), those with no licence first. */
export function filterComponents(components: readonly Component[], query: string): Component[] {
  const q = query.trim().toLowerCase()
  const hit = q
    ? components.filter((c) => c.name.toLowerCase().includes(q) || (c.licence ?? 'no licence declared').toLowerCase().includes(q))
    : [...components]
  return hit.sort((a, b) => Number(a.licence !== null) - Number(b.licence !== null))
}
