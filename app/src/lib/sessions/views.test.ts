import { describe, expect, it } from 'vitest'
import { NO_BROWSE } from './browse'
import { BUILT_IN_VIEWS, canSaveView, parseSessionViews, sameFilters, suggestedName, tabFor, withView, withoutView } from './views'

describe('the tabs', () => {
  it('are All, This week and Needs a review', () => {
    expect(BUILT_IN_VIEWS.map((v) => v.name)).toEqual(['All', 'This week', 'Needs a review'])
  })

  it('light the tab the chips exactly match, whatever their order', () => {
    expect(tabFor(NO_BROWSE, [])?.name).toBe('All')
    expect(tabFor({ ...NO_BROWSE, when: 'week' }, [])?.name).toBe('This week')
    expect(tabFor({ ...NO_BROWSE, status: ['review'] }, [])?.name).toBe('Needs a review')
    const saved = withView([], 'Atlas', { workspaces: ['a', 'b'], decks: [], status: [], when: 'any' }, 'v1')
    expect(tabFor({ workspaces: ['b', 'a'], decks: [], status: [], when: 'any' }, saved)?.name).toBe('Atlas')
  })

  it('offer "Save this view" only when chips are on that match no tab', () => {
    expect(canSaveView(NO_BROWSE, [])).toBe(false)
    expect(canSaveView({ ...NO_BROWSE, when: 'week' }, [])).toBe(false)
    expect(canSaveView({ ...NO_BROWSE, workspaces: ['w'] }, [])).toBe(true)
    expect(canSaveView({ ...NO_BROWSE, status: ['review'], when: '30' }, [])).toBe(true)
  })
})

describe('saved views', () => {
  it('are added after the others, a repeated name numbered, a blank one not added', () => {
    let v = withView([], 'Atlas this month', { ...NO_BROWSE, workspaces: ['w'] }, 'v1')
    v = withView(v, 'atlas this month', { ...NO_BROWSE, decks: ['d'] }, 'v2')
    v = withView(v, 'All', { ...NO_BROWSE, decks: ['d'] }, 'v3')
    expect(v.map((x) => x.name)).toEqual(['Atlas this month', 'atlas this month 2', 'All 2'])
    expect(withView(v, '  ', NO_BROWSE, 'v4')).toHaveLength(3)
  })

  it('can be taken away', () => {
    const v = withView([], 'A', NO_BROWSE, 'v1')
    expect(withoutView(v, 'v1')).toEqual([])
  })

  it('are read from settings leniently', () => {
    const read = parseSessionViews([
      { id: 'v1', name: 'Ok', filters: { workspaces: ['w', 4], decks: 'x', status: ['review', 'bogus'], when: '90' } },
      { id: 'v1', name: 'Same id', filters: {} },
      { id: 'v2', name: '  ', filters: {} },
      { id: 'v3', name: 'No filters' },
      { id: 'v4', name: 'Odd when', filters: { when: 'forever' } },
      'nope',
      null,
    ])
    expect(read).toEqual([
      { id: 'v1', name: 'Ok', filters: { workspaces: ['w'], decks: [], status: ['review'], when: '90' } },
      { id: 'v4', name: 'Odd when', filters: { workspaces: [], decks: [], status: [], when: 'any' } },
    ])
    expect(parseSessionViews(undefined)).toEqual([])
    expect(parseSessionViews({})).toEqual([])
  })

  it('compare chips ignoring order', () => {
    expect(sameFilters({ ...NO_BROWSE, status: ['review', 'rec'] }, { ...NO_BROWSE, status: ['rec', 'review'] })).toBe(true)
    expect(sameFilters(NO_BROWSE, { ...NO_BROWSE, when: '30' })).toBe(false)
  })

  it('are named from their chips to start from', () => {
    const names = { workspace: (id: string) => `W ${id}`, deck: (k: string) => `D ${k}` }
    expect(suggestedName({ workspaces: ['1'], decks: ['2'], status: ['review'], when: '30' }, names)).toBe('W 1 · D 2 · Needs a review · Last 30 days')
  })
})
