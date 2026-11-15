import { describe, expect, it } from 'vitest'
import { folderLabel, folderOf, groupRecent, whenLabel } from './recent-view'

const at = (iso: string) => ({ path: '/p', name: 'n', openedAt: iso })
const now = new Date('2026-10-07T15:00:00')

describe('groupRecent', () => {
  it('splits today from earlier, keeping the order it was given', () => {
    const list = [at('2026-10-07T09:00:00'), at('2026-10-07T01:00:00'), at('2026-10-06T23:00:00'), at('2026-09-01T10:00:00')]
    const groups = groupRecent(list, now)
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Today', 2],
      ['Earlier', 2],
    ])
  })

  it('puts pinned projects first, newest pin first', () => {
    const one = { path: '/a', name: 'a', openedAt: '2026-10-07T09:00:00' }
    const two = { path: '/b', name: 'b', openedAt: '2026-09-01T10:00:00' }
    const three = { path: '/c', name: 'c', openedAt: '2026-10-07T08:00:00' }
    const groups = groupRecent([one, two, three], now, ['/c', '/b'])
    expect(groups.map((g) => [g.label, g.items.map((i) => i.path)])).toEqual([
      ['Pinned', ['/c', '/b']],
      ['Today', ['/a']],
    ])
  })

  it('leaves out empty groups', () => {
    expect(groupRecent([at('2026-01-01T00:00:00')], now).map((g) => g.label)).toEqual(['Earlier'])
    expect(groupRecent([], now)).toEqual([])
  })
})

describe('whenLabel', () => {
  it('shows a time for today and a date otherwise', () => {
    expect(whenLabel('2026-10-07T09:05:00', now)).toMatch(/9:05/)
    expect(whenLabel('2026-10-06T09:05:00', now)).not.toMatch(/9:05/)
  })
})

describe('folderOf', () => {
  it.each([
    ['/Users/alex/Documents/launch.oversay.json', '/Users/alex/Documents'],
    ['C:\\Users\\alex\\talks\\launch.oversay.json', 'C:\\Users\\alex\\talks'],
    ['launch.oversay.json', ''],
    ['/launch.oversay.json', '/'],
  ])('%s is in %j', (path, folder) => expect(folderOf(path)).toBe(folder))
})

describe('folderLabel', () => {
  it.each([
    ['/Users/alex/Documents/Oversay/Projects/Spring keynote/Spring keynote.oversay.json', 'Documents › Oversay › Projects › Spring keynote'],
    ['C:\\Users\\alex\\Documents\\talks\\launch.oversay.json', 'Documents › talks'],
    ['/home/alex/talks/launch.oversay.json', 'talks'],
    ['/Users/alex/launch.oversay.json', 'Home folder'],
    ['/Volumes/Shared/launch.oversay.json', 'Volumes › Shared'],
    ['/launch.oversay.json', '/'],
  ])('%s is shown as %j', (path, label) => expect(folderLabel(path)).toBe(label))
})
