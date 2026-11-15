import { describe, expect, it } from 'vitest'
import { matchScore, searchEverything, type Searchable } from './everything'

const items: Searchable[] = [
  { kind: 'deck', id: 'a.md', label: 'Stand-up 23 Oct', terms: ['Platform team', 'weekly'] },
  { kind: 'deck', id: 'b.md', label: 'Atlas launch review', terms: ['Leadership', 'Atlas', 'launch'] },
  { kind: 'workspace', id: 'Atlas', label: 'Atlas', terms: [] },
  { kind: 'template', id: 't1', label: 'Weekly stand-up', terms: [] },
  { kind: 'setting', id: 'shortcuts', label: 'Shortcuts', terms: ['Settings'] },
  { kind: 'page', id: 'decks', label: 'Decks', terms: [] },
]

const labels = (q: string) => searchEverything(q, items).map((g) => [g.kind, g.items.map((i) => i.label)])

describe('one search for the whole app', () => {
  it('finds nothing for an empty query', () => {
    expect(searchEverything('  ', items)).toEqual([])
  })

  it('scores a name start above a word start above anywhere, and a match in other terms lowest', () => {
    expect(matchScore('atl', 'Atlas', [])).toBeGreaterThan(matchScore('lau', 'Atlas launch review', []))
    expect(matchScore('lau', 'Atlas launch review', [])).toBeGreaterThan(matchScore('tla', 'Atlas', []))
    expect(matchScore('tla', 'Atlas', [])).toBeGreaterThan(matchScore('lead', 'Atlas launch review', ['Leadership']))
    expect(matchScore('zzz', 'Atlas', ['x'])).toBe(0)
  })

  it('groups matches by kind, in a fixed order, best first in each', () => {
    expect(labels('atlas')).toEqual([
      ['deck', ['Atlas launch review']],
      ['workspace', ['Atlas']],
    ])
    expect(labels('weekly')).toEqual([
      ['deck', ['Stand-up 23 Oct']],
      ['template', ['Weekly stand-up']],
    ])
    expect(labels('short')).toEqual([['setting', ['Shortcuts']]])
  })

  it('ignores case and keeps at most five of a kind', () => {
    const many = Array.from({ length: 8 }, (_, i): Searchable => ({ kind: 'deck', id: `${i}`, label: `Deck ${i}`, terms: [] }))
    expect(searchEverything('DECK', many)[0].items).toHaveLength(5)
  })

  it("finds sessions by their deck's name, keeping the order given (newest first)", () => {
    const runs: Searchable[] = [
      { kind: 'session', id: 'a#2', label: 'Stand-up', terms: ['28 Oct'] },
      { kind: 'session', id: 'a#1', label: 'Stand-up', terms: ['27 Oct'] },
    ]
    const found = searchEverything('stand', [...items, ...runs])
    expect(found.map((g) => g.kind)).toEqual(['deck', 'session', 'template'])
    expect(found[1].items.map((i) => i.id)).toEqual(['a#2', 'a#1'])
  })

  it('finds a workspace by its tags', () => {
    const found = searchEverything('research', [{ kind: 'workspace', id: 'w_1', label: 'Prompt injection', terms: ['research'] }])
    expect(found.map((g) => g.kind)).toEqual(['workspace'])
  })
})
