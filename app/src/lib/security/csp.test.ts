import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Content Security Policy every window loads with (finding 2 of the October 2026
// review). These fail if the policy is removed or loosened; `make shots` loads every page under
// the dev policy and fails on any violation.
const conf = JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const policies: [string, Record<string, string>][] = [
  ['csp', conf.app.security.csp],
  ['devCsp', conf.app.security.devCsp],
]
const sources = (policy: Record<string, string>, directive: string) => (policy[directive] ?? policy['default-src'] ?? '').split(/\s+/)

describe('Content Security Policy', () => {
  it.each(policies)('%s is set', (_, policy) => {
    expect(policy).toBeTypeOf('object')
    expect(sources(policy, 'default-src')).toEqual(["'self'"])
  })

  it.each(policies)('%s runs only the app’s own scripts: no eval, no inline or remote script', (_, policy) => {
    expect(sources(policy, 'script-src')).toEqual(["'self'"])
    const all = Object.values(policy).join(' ').split(/\s+/)
    expect(all.filter((s) => /eval|^\*$|^https?:$|^https?:\/\/(?!ipc\.localhost$)/.test(s))).toEqual([])
  })

  it.each(policies)('%s talks only to the app itself and its IPC', (name, policy) => {
    const allowed = ["'self'", 'ipc:', 'http://ipc.localhost', ...(name === 'devCsp' ? ['ws://localhost:*'] : [])]
    expect(sources(policy, 'connect-src')).toEqual(allowed)
  })

  it.each(policies)('%s allows no plugins, frames, forms or <base>', (_, policy) => {
    for (const directive of ['object-src', 'frame-src', 'base-uri', 'form-action']) expect(policy[directive]).toBe("'none'")
  })

  it('lets Tauri add nonces to scripts, so only inline styles are allowed', () => {
    expect(conf.app.security.dangerousDisableAssetCspModification).toEqual(['style-src'])
  })
})
