// What people install is made from skills/oversay, never edited (epic 038, ADR 0049). This builds
// the Claude and Codex plugin (plugins/oversay) and the marketplace (.claude-plugin/marketplace.json)
// from the skill, skills/plugin-manifest.json and app/package.json's version, and finds any
// copy, manifest or version that has drifted from them. version.mjs --check and make skills use it.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const SKILL_DIR = 'skills/oversay'
export const MANIFEST_SOURCE = 'skills/plugin-manifest.json'
export const PLUGIN_DIR = 'plugins/oversay'
export const MARKETPLACE = '.claude-plugin/marketplace.json'
const SKILL_NAME = 'oversay'
const LOCAL_FILE = 'oversay-local.json'

const json = (v) => JSON.stringify(v, null, 2) + '\n'

/** The `metadata.version` line of a SKILL.md. */
export function skillVersion(skill) {
  const m = /^ {2}version: (\S+)\s*$/m.exec(skill)
  return m ? m[1] : null
}

export function pluginManifest(pkg, version) {
  return { name: pkg.name, version, description: pkg.description, author: pkg.author }
}

/** The Claude Code and Codex marketplace: one plugin, found inside this repository. */
export function marketplaceManifest(pkg, version) {
  return {
    name: pkg.name,
    owner: pkg.author,
    description: pkg.description,
    plugins: [{ name: pkg.name, source: `./${PLUGIN_DIR}`, description: pkg.description, version, author: pkg.author }],
  }
}

// Every file of the skill, as the app copies it: no dot-files, none of this computer's folders.
function skillFiles(dir, prefix = '') {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name.startsWith('.') || e.name === LOCAL_FILE) continue
    if (e.isDirectory()) out.push(...skillFiles(join(dir, e.name), `${prefix}${e.name}/`))
    else out.push([`${prefix}${e.name}`, readFileSync(join(dir, e.name))])
  }
  return out
}

/** The plugin tree as path (inside plugins/oversay) -> contents. */
export function pluginFiles(root, version) {
  const pkg = JSON.parse(readFileSync(join(root, MANIFEST_SOURCE), 'utf8'))
  const files = new Map([['.claude-plugin/plugin.json', json(pluginManifest(pkg, version))]])
  for (const [path, body] of skillFiles(join(root, SKILL_DIR))) files.set(`skills/${SKILL_NAME}/${path}`, body)
  return files
}

const appVersion = (root) => JSON.parse(readFileSync(join(root, 'app/package.json'), 'utf8')).version

function walk(dir, prefix = '') {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  )
}

const same = (a, b) => Buffer.from(a).equals(Buffer.from(b))

/** Everything that differs from what the source and the version make; an empty list means in line. */
export function checkPackaging(root) {
  const version = appVersion(root)
  const problems = []
  const skillPath = `${SKILL_DIR}/SKILL.md`
  const have = skillVersion(readFileSync(join(root, skillPath), 'utf8'))
  if (have !== version) problems.push(`${skillPath} has ${have}, app/package.json has ${version}: run make skills`)

  const hasPlugin = existsSync(join(root, PLUGIN_DIR))
  const hasMarketplace = existsSync(join(root, MARKETPLACE))
  if (!hasPlugin && !hasMarketplace) return problems
  if (!hasPlugin) problems.push(`${PLUGIN_DIR} is missing: run make skills`)
  if (!hasMarketplace) problems.push(`${MARKETPLACE} is missing: run make skills`)

  if (hasPlugin) {
    const want = pluginFiles(root, version)
    for (const [path, body] of want) {
      const file = `${PLUGIN_DIR}/${path}`
      if (!existsSync(join(root, file))) problems.push(`${file} is missing: run make skills`)
      else if (!same(readFileSync(join(root, file)), body)) problems.push(`${file} differs from ${path === '.claude-plugin/plugin.json' ? `${MANIFEST_SOURCE} and app/package.json` : `${SKILL_DIR}/${path.slice(`skills/${SKILL_NAME}/`.length)}`}: run make skills, and edit only ${SKILL_DIR}`)
    }
    for (const path of walk(join(root, PLUGIN_DIR))) {
      if (!want.has(path)) problems.push(`${PLUGIN_DIR}/${path} is not in ${SKILL_DIR}: run make skills`)
    }
  }
  if (hasMarketplace) {
    const pkg = JSON.parse(readFileSync(join(root, MANIFEST_SOURCE), 'utf8'))
    if (!same(readFileSync(join(root, MARKETPLACE)), json(marketplaceManifest(pkg, version)))) {
      problems.push(`${MARKETPLACE} differs from ${MANIFEST_SOURCE} and app/package.json: run make skills`)
    }
  }
  return problems
}

/** Writes the plugin and the marketplace from the source, replacing what was there. */
export function writePackaging(root) {
  const version = appVersion(root)
  const pkg = JSON.parse(readFileSync(join(root, MANIFEST_SOURCE), 'utf8'))
  rmSync(join(root, PLUGIN_DIR), { recursive: true, force: true })
  for (const [path, body] of pluginFiles(root, version)) {
    const file = join(root, PLUGIN_DIR, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  mkdirSync(join(root, '.claude-plugin'), { recursive: true })
  writeFileSync(join(root, MARKETPLACE), json(marketplaceManifest(pkg, version)))
}

// `node scripts/skill-package.mjs --write` (make skills) writes the plugin and the marketplace.
import { fileURLToPath } from 'node:url'
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--write') {
  writePackaging(join(dirname(fileURLToPath(import.meta.url)), '..'))
  console.log(`skill-package: wrote ${PLUGIN_DIR} and ${MARKETPLACE}`)
}
