import { describe, expect, it } from 'vitest'
import { specExample } from './example'
import { newId, isValidId, ID_PREFIXES } from './ids'
import { validateProject } from './schema'

describe('project schema', () => {
  it('accepts the spec §3 example', () => {
    expect(validateProject(specExample)).toEqual({ ok: true })
  })

  it('round-trips the example through JSON unchanged', () => {
    const copy = JSON.parse(JSON.stringify(specExample))
    expect(copy).toEqual(specExample)
    expect(validateProject(copy)).toEqual({ ok: true })
  })

  it('keeps fields it does not know about', () => {
    const withExtra = { ...specExample, futureField: { a: 1 } }
    expect(validateProject(withExtra)).toEqual({ ok: true })
  })

  it.each([
    ['unknown segment kind', (p: any) => (p.talks[0].segments[0].kind = 'rant')],
    ['negative duration', (p: any) => (p.talks[0].segments[0].plannedSeconds = -1)],
    ['fractional duration', (p: any) => (p.talks[0].segments[0].plannedSeconds = 1.5)],
    ['missing talks', (p: any) => delete p.talks],
    ['unknown event type', (p: any) => (p.talks[0].sessions[0].events[0].type = 'jump')],
    ['wrong id prefix', (p: any) => (p.talks[0].id = 's_a91c')],
    ['schemaVersion 2', (p: any) => (p.schemaVersion = 2)],
  ])('rejects %s', (_name, mutate) => {
    const bad = JSON.parse(JSON.stringify(specExample))
    mutate(bad)
    const result = validateProject(bad)
    expect(result.ok).toBe(false)
  })

  it('accepts optional audience, target and sessions being absent', () => {
    const minimal = {
      schemaVersion: 1,
      id: 'p_1',
      name: 'x',
      talks: [{ id: 't_1', name: 'y', segments: [], sessions: [] }],
    }
    expect(validateProject(minimal)).toEqual({ ok: true })
  })
})

describe('id generator', () => {
  it.each(Object.entries(ID_PREFIXES))('%s ids carry the %s prefix', (kind, prefix) => {
    const id = newId(kind as keyof typeof ID_PREFIXES)
    expect(id.startsWith(prefix)).toBe(true)
    expect(isValidId(kind as keyof typeof ID_PREFIXES, id)).toBe(true)
  })

  it('does not repeat over many calls', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => newId('segment')))
    expect(seen.size).toBe(5000)
  })

  it('rejects ids with the wrong prefix or characters', () => {
    expect(isValidId('talk', 's_abcd')).toBe(false)
    expect(isValidId('talk', 't_')).toBe(false)
    expect(isValidId('talk', 't_AB CD')).toBe(false)
    expect(isValidId('talk', 't_a91c')).toBe(true)
  })
})
