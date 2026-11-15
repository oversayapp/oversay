import { describe, expect, it } from 'vitest'
import { addRecent, MAX_RECENT, parseRecent, removeRecent, serializeRecent, type RecentProject } from './recent'

const entry = (path: string, openedAt = '2026-10-07T10:00:00Z', name = path): RecentProject => ({
  path,
  name,
  openedAt,
})

describe('addRecent', () => {
  it('puts a newly opened project at the top', () => {
    const list = addRecent([entry('/a'), entry('/b')], entry('/c'))
    expect(list.map((e) => e.path)).toEqual(['/c', '/a', '/b'])
  })

  it('moves a re-opened project to the top without duplicating it, taking the new name and time', () => {
    const list = addRecent(
      [entry('/a', '2026-10-01T00:00:00Z', 'Old'), entry('/b')],
      entry('/b', '2026-10-08T00:00:00Z', 'New'),
    )
    expect(list).toEqual([entry('/b', '2026-10-08T00:00:00Z', 'New'), entry('/a', '2026-10-01T00:00:00Z', 'Old')])
  })

  it('keeps at most MAX_RECENT, dropping the oldest', () => {
    let list: RecentProject[] = []
    for (let i = 0; i < MAX_RECENT + 3; i++) list = addRecent(list, entry(`/p${i}`))
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0].path).toBe(`/p${MAX_RECENT + 2}`)
    expect(list.some((e) => e.path === '/p0')).toBe(false)
  })

  it('does not change the list it was given', () => {
    const before = [entry('/a')]
    addRecent(before, entry('/b'))
    expect(before).toEqual([entry('/a')])
  })
})

describe('removeRecent', () => {
  it('removes by path', () => {
    expect(removeRecent([entry('/a'), entry('/b')], '/a').map((e) => e.path)).toEqual(['/b'])
  })
  it('ignores an unknown path', () => {
    expect(removeRecent([entry('/a')], '/zzz')).toEqual([entry('/a')])
  })
})

describe('persistence format', () => {
  it('round-trips', () => {
    const list = [entry('/a', '2026-10-07T10:00:00Z', 'A'), entry('/b')]
    expect(parseRecent(serializeRecent(list))).toEqual(list)
  })

  it.each([
    ['empty text', ''],
    ['broken JSON', '{ nope'],
    ['wrong shape', '{"recent": 3}'],
    ['not a list', '"hi"'],
  ])('treats %s as an empty list instead of failing', (_n, text) => {
    expect(parseRecent(text)).toEqual([])
  })

  it('keeps the talk count and accepts older entries without one', () => {
    const list = [{ ...entry('/a'), talks: 3 }, entry('/b')]
    expect(parseRecent(serializeRecent(list))).toEqual(list)
    expect(parseRecent(JSON.stringify({ version: 1, recent: [{ ...entry('/a'), talks: 'x' }] }))).toEqual([])
  })

  it('drops malformed entries but keeps good ones', () => {
    const text = JSON.stringify({ version: 1, recent: [entry('/a'), { path: 5 }, null, entry('/b')] })
    expect(parseRecent(text).map((e) => e.path)).toEqual(['/a', '/b'])
  })
})
