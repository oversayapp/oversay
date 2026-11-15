import { describe, expect, it } from 'vitest'
import { NO_FILTERS, dateGroup, filterChoices, filterDecks, groupByDate, isFiltered } from './list'

// Saturday 24 October 2026, mid-afternoon, local time; the week starts on Monday the 19th.
const NOW = new Date(2026, 9, 24, 15, 0).getTime()
const on = (month: number, day: number, hour = 10) => new Date(2026, month, day, hour).getTime()

const deck = (name: string, modifiedMs: number, extra: Partial<{ audience: string; workspaces: string[]; tags: string[] }> = {}) => ({
  name,
  modifiedMs,
  audience: '',
  workspaces: [] as string[],
  tags: [] as string[],
  ...extra,
})

describe('grouping decks by when they last changed', () => {
  it('names the group for each date', () => {
    expect(dateGroup(on(9, 24, 9), NOW)).toBe('Today')
    expect(dateGroup(on(9, 23), NOW)).toBe('Yesterday')
    expect(dateGroup(on(9, 19), NOW)).toBe('This week')
    expect(dateGroup(on(9, 13), NOW)).toBe('Last week')
    expect(dateGroup(on(9, 5), NOW)).toBe('Earlier this month')
    expect(dateGroup(on(8, 30), NOW)).toBe('September 2026')
    expect(dateGroup(on(0, 3), NOW)).toBe('January 2026')
  })

  it('puts the newest groups first, each newest first', () => {
    const groups = groupByDate([deck('old', on(8, 2)), deck('today', on(9, 24, 9)), deck('also today', on(9, 24, 11)), deck('last week', on(9, 14))], NOW)
    expect(groups.map((g) => [g.label, g.decks.map((d) => d.name)])).toEqual([
      ['Today', ['also today', 'today']],
      ['Last week', ['last week']],
      ['September 2026', ['old']],
    ])
  })
})

describe('filtering decks', () => {
  const decks = [
    deck('Stand-up', on(9, 23), { audience: 'Platform team', workspaces: ['w_atlas001', 'w_appsec01'], tags: ['weekly', 'platform'] }),
    deck('1-1', on(9, 2), { audience: 'Sam', tags: ['1-1'] }),
    deck('Board prep', on(6, 1), { workspaces: ['w_atlas001'], tags: ['Board'] }),
  ]
  const names = (f: Partial<typeof NO_FILTERS>) => filterDecks(decks, { ...NO_FILTERS, ...f }, NOW).map((d) => d.name)

  it('keeps everything with no filter', () => {
    expect(isFiltered(NO_FILTERS)).toBe(false)
    expect(names({})).toEqual(['Stand-up', '1-1', 'Board prep'])
  })

  it('keeps a deck with any of the tags picked, ignoring case', () => {
    expect(names({ tags: ['WEEKLY'] })).toEqual(['Stand-up'])
    expect(names({ tags: ['1-1', 'board'] })).toEqual(['1-1', 'Board prep'])
  })

  it('narrows by audience, workspace and date range, all together', () => {
    expect(names({ audience: 'Sam' })).toEqual(['1-1'])
    expect(names({ workspace: 'w_atlas001' })).toEqual(['Stand-up', 'Board prep'])
    expect(names({ range: 'week' })).toEqual(['Stand-up'])
    expect(names({ range: 'month' })).toEqual(['Stand-up', '1-1'])
    expect(names({ range: 'quarter', workspace: 'w_atlas001' })).toEqual(['Stand-up'])
    expect(isFiltered({ ...NO_FILTERS, range: 'week' })).toBe(true)
  })

  it('offers each tag, audience and workspace in use once, sorted', () => {
    expect(filterChoices([...decks, deck('x', NOW, { tags: ['Weekly'] })])).toEqual({
      tags: ['1-1', 'Board', 'platform', 'weekly'],
      audiences: ['Platform team', 'Sam'],
      workspaces: ['w_appsec01', 'w_atlas001'],
    })
  })
})
