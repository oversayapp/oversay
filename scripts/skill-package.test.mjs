// Tests for scripts/skill-package.mjs: the plugin and marketplace made from skills/oversay, and the
// checks that catch a copy, a manifest or a version drifting from it (epic 038, ADR 0048).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pluginManifest, marketplaceManifest, pluginFiles, skillVersion, checkPackaging, writePackaging } from './skill-package.mjs'

const PKG = { name: 'oversay', description: 'Decks', author: { name: 'Oversay' } }

// A repository with the one source, at version v, and nothing generated yet.
function repo(v = '0.4.0') {
  const root = mkdtempSync(join(tmpdir(), 'pkg-'))
  const put = (p, s) => {
    mkdirSync(dirname(join(root, p)), { recursive: true })
    writeFileSync(join(root, p), s)
  }
  put('app/package.json', JSON.stringify({ version: v }))
  put('skills/plugin-manifest.json', JSON.stringify(PKG))
  put('skills/oversay/SKILL.md', `---\nname: oversay\nmetadata:\n  version: ${v}\n---\nBody\n`)
  put('skills/oversay/references/a.md', 'a')
  put('skills/oversay/.hidden', 'x')
  put('skills/oversay/oversay-local.json', '{}')
  return { root, put }
}

test('the plugin manifest and the marketplace entry carry the version they are given', () => {
  assert.deepEqual(pluginManifest(PKG, '1.2.3'), { name: 'oversay', version: '1.2.3', description: 'Decks', author: { name: 'Oversay' } })
  const m = marketplaceManifest(PKG, '1.2.3')
  assert.equal(m.name, 'oversay')
  assert.equal(m.plugins[0].name, 'oversay')
  assert.equal(m.plugins[0].version, '1.2.3')
  assert.equal(m.plugins[0].source, './plugins/oversay')
})

test('the plugin holds the skill without dot-files or this computer\'s Decks file', () => {
  const { root } = repo()
  const names = [...pluginFiles(root, '0.4.0').keys()]
  assert.deepEqual(names, ['.claude-plugin/plugin.json', 'skills/oversay/SKILL.md', 'skills/oversay/references/a.md'])
})

test('skillVersion reads metadata.version', () => {
  assert.equal(skillVersion('---\nname: x\nmetadata:\n  version: 0.4.0\n---\n'), '0.4.0')
  assert.equal(skillVersion('---\nname: x\n---\n'), null)
})

test('nothing generated yet is fine, as long as SKILL.md has the app\'s version', () => {
  const { root, put } = repo()
  assert.deepEqual(checkPackaging(root), [])
  put('skills/oversay/SKILL.md', '---\nname: oversay\nmetadata:\n  version: 0.3.0\n---\n')
  assert.match(checkPackaging(root).join('\n'), /skills\/oversay\/SKILL\.md has 0\.3\.0.*0\.4\.0/)
})

test('written files pass; a hand edit anywhere names the file', () => {
  const { root, put } = repo()
  writePackaging(root)
  assert.deepEqual(checkPackaging(root), [])
  put('plugins/oversay/.claude-plugin/plugin.json', JSON.stringify({ ...pluginManifest(PKG, '0.4.0'), version: '0.9.9' }))
  assert.match(checkPackaging(root).join('\n'), /plugins\/oversay\/\.claude-plugin\/plugin\.json/)
  writePackaging(root)
  put('plugins/oversay/skills/oversay/references/a.md', 'edited')
  assert.match(checkPackaging(root).join('\n'), /plugins\/oversay\/skills\/oversay\/references\/a\.md differs/)
  writePackaging(root)
  put('plugins/oversay/skills/oversay/extra.md', 'new')
  assert.match(checkPackaging(root).join('\n'), /extra\.md.*not in skills\/oversay/)
  writePackaging(root)
  assert.deepEqual(checkPackaging(root), [])
  const m = marketplaceManifest(PKG, '0.4.0')
  m.plugins[0].version = '0.1.0'
  put('.claude-plugin/marketplace.json', JSON.stringify(m))
  assert.match(checkPackaging(root).join('\n'), /\.claude-plugin\/marketplace\.json/)
})

test('a plugin without its marketplace, or the reverse, is named', () => {
  const { root, put } = repo()
  put('.claude-plugin/marketplace.json', JSON.stringify(marketplaceManifest(PKG, '0.4.0')))
  assert.match(checkPackaging(root).join('\n'), /plugins\/oversay.*missing/)
})
