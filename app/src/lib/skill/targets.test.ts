import { describe, expect, it } from 'vitest'
import { compareVersions, sharing, SKILL_TARGETS, skillState, ZIP_KINDS } from './targets'

describe('the skill in each AI app', () => {
  it('has the ids skill.rs has', () => {
    expect(SKILL_TARGETS).toEqual(['claude-code', 'codex', 'gemini-cli'])
    expect(ZIP_KINDS).toEqual(['claude-plugin', 'skill'])
  })

  it.each([
    // [app found, installed version, bundled version, state]
    [false, null, '0.2.0', 'no-app'],
    [true, null, '0.2.0', 'not-installed'],
    [true, '0.2.0', '0.2.0', 'installed'],
    [false, '0.2.0', '0.2.0', 'installed'], // a copy there counts, whatever else is
    [true, '0.1.9', '0.2.0', 'update'],
    [true, '0.10.0', '0.9.0', 'installed'], // newer than this Oversay: left alone
    [true, 'garbled', '0.2.0', 'update'],
  ] as const)('found %s, copy %s, carried %s → %s', (found, installedVersion, bundled, state) => {
    expect(skillState({ found, installedVersion }, bundled)).toBe(state)
  })

  it('knows which apps share one copy', () => {
    const targets = [
      { id: 'claude-code' as const, dir: '/h/.claude/skills/oversay' },
      { id: 'codex' as const, dir: '/h/.agents/skills/oversay' },
      { id: 'gemini-cli' as const, dir: '/h/.agents/skills/oversay' },
    ]
    expect(sharing(targets, 'codex')).toEqual(['gemini-cli'])
    expect(sharing(targets, 'gemini-cli')).toEqual(['codex'])
    expect(sharing(targets, 'claude-code')).toEqual([])
  })

  it('compares versions by number, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('x', '0.0.0')).toBeLessThan(0)
  })
})
