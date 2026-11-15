import { describe, expect, it } from 'vitest'
import type { DeckSession } from '../decks/sessions'
import { NO_SESSION_FILTERS, difference, everyRun, filterRuns, groupRunsByDay, runTimes, type RunDeck } from './runs'

const NOW = new Date(2026, 9, 28, 12, 0).getTime() // Wed 28 Oct 2026, local time

const run = (startedAt: Date, seconds: number[], planned: (number | null)[] = [60, 180, 120]): DeckSession => ({
  startedAt: startedAt.toISOString(),
  endedAt: new Date(startedAt.getTime() + seconds.reduce((a, b) => a + b, 0) * 1000).toISOString(),
  cards: seconds.map((s, i) => ({ name: `Card ${i + 1}`, kind: 'topic', plannedSeconds: planned[i] ?? null, seconds: s })),
})

const standup: RunDeck = { path: '/Decks/Stand-up/deck.md', id: 'd_standup1', name: 'Stand-up', audience: 'Platform team', workspaces: ['w_comet001'] }
const talk: RunDeck = { path: '/Decks/Talk/deck.md', id: 'd_talk0001', name: 'Conference talk', audience: '', workspaces: [] }

describe("every deck's runs", () => {
  it('lists every session of every deck, newest first', () => {
    const runs = everyRun([
      { deck: standup, sessions: [run(new Date(2026, 9, 27, 9), [60, 180, 120]), run(new Date(2026, 9, 28, 9), [60, 180, 120])] },
      { deck: talk, sessions: [run(new Date(2026, 9, 28, 8, 10), [90, 300])] },
    ])
    expect(runs.map((r) => [r.deck.name, new Date(r.session.startedAt).getHours()])).toEqual([
      ['Stand-up', 9],
      ['Conference talk', 8],
      ['Stand-up', 9],
    ])
    expect(new Date(runs[2].session.startedAt).getDate()).toBe(27)
  })

  it("adds up a run's time against its plan, comparing only the timed cards", () => {
    const t = runTimes(run(new Date(NOW), [74, 260, 400], [60, 180, null]))
    expect(t).toEqual({ planned: 240, ran: 734, timed: 334, untimed: 1 })
  })

  it('says over, under or on time, within ten seconds', () => {
    expect(difference(240, 334)).toEqual({ text: '+1:34 over', over: true })
    expect(difference(240, 200)).toEqual({ text: '0:40 under', over: false })
    expect(difference(240, 249)).toEqual({ text: 'on time', over: null })
    expect(difference(240, 231)).toEqual({ text: 'on time', over: null })
    expect(difference(0, 30)).toEqual({ text: '', over: null })
  })

  it('groups runs by the day they started, as Decks groups by when they changed', () => {
    const runs = everyRun([
      { deck: standup, sessions: [run(new Date(2026, 9, 28, 9), [60]), run(new Date(2026, 9, 27, 9), [60]), run(new Date(2026, 9, 20, 9), [60]), run(new Date(2026, 8, 3, 9), [60])] },
    ])
    expect(groupRunsByDay(runs, NOW).map((g) => [g.label, g.runs.length])).toEqual([
      ['Today', 1],
      ['Yesterday', 1],
      ['Last week', 1],
      ['September 2026', 1],
    ])
  })
})

describe('filtering runs', () => {
  const runs = everyRun([
    { deck: standup, sessions: [run(new Date(2026, 9, 28, 9), [60]), run(new Date(2026, 6, 1, 9), [60])] },
    { deck: talk, sessions: [run(new Date(2026, 9, 26, 8), [60])] },
  ])
  const names = (f: Parameters<typeof filterRuns>[1]) => filterRuns(runs, f, NOW).map((r) => `${r.deck.name} ${r.session.startedAt.slice(5, 7)}`)

  it('keeps everything with no filters', () => {
    expect(filterRuns(runs, NO_SESSION_FILTERS, NOW)).toHaveLength(3)
  })

  it('narrows by workspace and deck, each any of those picked', () => {
    expect(names({ ...NO_SESSION_FILTERS, workspaces: ['w_comet001'] })).toEqual(['Stand-up 10', 'Stand-up 07'])
    expect(names({ ...NO_SESSION_FILTERS, decks: ['d_talk0001'] })).toEqual(['Conference talk 10'])
    expect(names({ ...NO_SESSION_FILTERS, decks: ['d_talk0001', 'd_standup1'] })).toHaveLength(3)
  })

  it('narrows by when it ran: this week, or between two dates inclusive', () => {
    expect(names({ ...NO_SESSION_FILTERS, range: 'week' })).toEqual(['Stand-up 10', 'Conference talk 10'])
    expect(names({ ...NO_SESSION_FILTERS, range: 'dates', from: '2026-07-01', to: '2026-07-01' })).toEqual(['Stand-up 07'])
    expect(names({ ...NO_SESSION_FILTERS, range: 'dates', from: '2026-10-27', to: '' })).toEqual(['Stand-up 10'])
  })

  it('finds a deck that has no id by its path', () => {
    const lone = { ...talk, id: '' }
    const r = everyRun([{ deck: lone, sessions: [run(new Date(NOW), [60])] }])
    expect(filterRuns(r, { ...NO_SESSION_FILTERS, decks: [lone.path] }, NOW)).toHaveLength(1)
  })
})
