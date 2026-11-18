import { describe, expect, it } from 'vitest'
import type { DeckSession } from '../decks/sessions'
import { sessionName } from '../decks/sessions'
import {
  NO_BROWSE,
  barShape,
  deckChoices,
  deckStats,
  decksInScope,
  filterMarked,
  groupMarked,
  isTestRun,
  markRuns,
  trendCaption,
  trendPoints,
  type DeckChoice,
  type MarkedRun,
} from './browse'
import { everyRun, type RunDeck } from './runs'

const NOW = new Date(2026, 10, 18, 12, 0).getTime() // Wed 18 Nov 2026
const DAY = 86_400_000

const session = (daysAgo: number, seconds = [60, 180, 120], planned: (number | null)[] = [60, 180, 120], note?: string): DeckSession => {
  const at = new Date(NOW - daysAgo * DAY)
  return {
    startedAt: at.toISOString(),
    endedAt: new Date(at.getTime() + seconds.reduce((a, b) => a + b, 0) * 1000).toISOString(),
    cards: seconds.map((s, i) => ({ name: `Card ${i + 1}`, kind: 'topic', plannedSeconds: planned[i] ?? null, seconds: s })),
    ...(note ? { note } : {}),
  }
}
const atlas: RunDeck = { path: '/D/Atlas/deck.md', id: 'd_atlas001', name: 'Atlas kickoff', audience: '', workspaces: ['w_one', 'w_two'] }
const standup: RunDeck = { path: '/D/Standup/deck.md', id: 'd_stand001', name: 'Weekly stand-up', audience: '', workspaces: ['w_one'] }

type Files = { transcripts: string[]; reviews: string[]; recordings: string[] }
const marked = (decks: { deck: RunDeck; sessions: DeckSession[]; files?: Partial<Files> }[]): MarkedRun[] => {
  const by = new Map(decks.map((d) => [d.deck.path, { sessions: d.sessions, files: { transcripts: [], reviews: [], recordings: [], ...d.files } }]))
  return markRuns(everyRun(decks.map((d) => ({ deck: d.deck, sessions: d.sessions }))), (p) => by.get(p))
}

describe('what a run has, and Needs a review', () => {
  it('needs a review with a note and no review', () => {
    const [r] = marked([{ deck: atlas, sessions: [session(1, undefined, undefined, 'Ran over')] }])
    expect(r.marks).toEqual({ note: true, transcript: false, recording: false, review: false })
    expect(r.needsReview).toBe(true)
  })

  it('needs a review with a transcript and no note', () => {
    const s = session(1)
    const [r] = marked([{ deck: atlas, sessions: [s], files: { transcripts: [sessionName([s], s)] } }])
    expect(r.marks.transcript).toBe(true)
    expect(r.needsReview).toBe(true)
  })

  it('does not once reviewed, with nothing written, or when it was a test run', () => {
    const reviewed = session(1, undefined, undefined, 'x')
    const bare = session(2)
    const test = session(3, [20, 0, 0], undefined, 'poked at it')
    const rs = marked([{ deck: atlas, sessions: [reviewed, bare, test], files: { reviews: [sessionName([reviewed, bare, test], reviewed)] } }])
    expect(rs.map((r) => r.needsReview)).toEqual([false, false, false])
    expect(rs[2].test).toBe(true)
  })

  it('calls a run under a minute, or one that reached under half its cards, a test run', () => {
    expect(isTestRun(session(1, [10, 20, 5]))).toBe(true)
    expect(isTestRun(session(1, [120, 0, 0]))).toBe(true)
    expect(isTestRun(session(1, [120, 90, 0]))).toBe(false)
  })

  it('keeps a recording that is waiting, and finds files by the session name when two start in a minute', () => {
    const a = session(1)
    const b = { ...a, startedAt: new Date(Date.parse(a.startedAt) + 5000).toISOString() }
    const rs = marked([{ deck: atlas, sessions: [a, b], files: { recordings: [sessionName([a, b], b)] } }])
    expect(rs.map((r) => r.marks.recording)).toEqual([true, false])
  })
})

describe('filters', () => {
  const runs = marked([
    { deck: atlas, sessions: [session(1, undefined, undefined, 'n'), session(40)] },
    { deck: standup, sessions: [session(3), session(100)] },
  ])

  it('keeps everything with no chips', () => {
    expect(filterMarked(runs, NO_BROWSE, NOW)).toHaveLength(4)
  })

  it('keeps a deck in any chosen workspace, so a deck in two workspaces shows under each', () => {
    const two = filterMarked(runs, { ...NO_BROWSE, workspaces: ['w_two'] }, NOW)
    expect(two.map((r) => r.deck.name)).toEqual(['Atlas kickoff', 'Atlas kickoff'])
    expect(filterMarked(runs, { ...NO_BROWSE, workspaces: ['w_one'] }, NOW)).toHaveLength(4)
  })

  it('keeps chosen decks, by id', () => {
    expect(filterMarked(runs, { ...NO_BROWSE, decks: ['d_stand001'] }, NOW)).toHaveLength(2)
  })

  it('keeps a run with any chosen status', () => {
    expect(filterMarked(runs, { ...NO_BROWSE, status: ['review'] }, NOW)).toHaveLength(1)
    expect(filterMarked(runs, { ...NO_BROWSE, status: ['nonote'] }, NOW)).toHaveLength(3)
    expect(filterMarked(runs, { ...NO_BROWSE, status: ['review', 'nonote'] }, NOW)).toHaveLength(4)
    expect(filterMarked(runs, { ...NO_BROWSE, status: ['ready'] }, NOW)).toHaveLength(0)
  })

  it('keeps by when: this week from Monday, 30 days, 3 months', () => {
    expect(filterMarked(runs, { ...NO_BROWSE, when: 'week' }, NOW)).toHaveLength(1) // Tue; Sun the 15th is last week
    expect(filterMarked(runs, { ...NO_BROWSE, when: '30' }, NOW).map((r) => Math.round((NOW - r.startedMs) / DAY))).toEqual([1, 3])
    expect(filterMarked(runs, { ...NO_BROWSE, when: '90' }, NOW)).toHaveLength(3)
  })

  it('combines chips with and between kinds', () => {
    expect(filterMarked(runs, { workspaces: ['w_one'], decks: ['d_atlas001'], status: ['nonote'], when: '90' }, NOW)).toHaveLength(1)
  })
})

describe('the Deck chip', () => {
  const all: DeckChoice[] = [
    { key: 'd_a', name: 'Atlas kickoff', workspaces: ['w_one', 'w_two'], runs: 2 },
    { key: 'd_b', name: 'budget', workspaces: ['w_one'], runs: 0 },
    { key: 'd_c', name: 'Course Q&A', workspaces: ['w_three'], runs: 3 },
    { key: 'd_d', name: 'Loose deck', workspaces: [], runs: 1 },
  ]

  it('lists every deck, A-Z, run or not', () => {
    expect(deckChoices(all, [], '').shown.map((d) => d.name)).toEqual(['Atlas kickoff', 'budget', 'Course Q&A', 'Loose deck'])
  })

  it('is scoped to the chosen workspaces and to what is typed', () => {
    expect(deckChoices(all, ['w_one'], '').shown.map((d) => d.key)).toEqual(['d_a', 'd_b'])
    expect(deckChoices(all, [], 'COURSE').shown.map((d) => d.key)).toEqual(['d_c'])
  })

  it('says how many there are when it shows only some', () => {
    const many = Array.from({ length: 70 }, (_, i): DeckChoice => ({ key: `d${i}`, name: `Deck ${i}`, workspaces: [], runs: 1 }))
    const r = deckChoices(many, [], '')
    expect([r.shown.length, r.total]).toEqual([40, 70])
  })

  it('drops a chosen deck once its workspace is no longer chosen', () => {
    expect(decksInScope(['d_a', 'd_c'], all, ['w_one'])).toEqual(['d_a'])
    expect(decksInScope(['d_a', 'd_c'], all, [])).toEqual(['d_a', 'd_c'])
  })
})

describe('grouping', () => {
  const runs = marked([
    { deck: atlas, sessions: [session(0), session(1), session(12), session(75)] },
    { deck: standup, sessions: [session(2), session(21)] },
  ])

  it('groups recent first like Decks: Today, Yesterday, then the month', () => {
    const { groups } = groupMarked(runs, 'recent', NOW, 100)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'This week', 'Earlier this month', 'October 2026', 'September 2026'])
  })

  it('groups by month, by day, by deck, or not at all', () => {
    expect(groupMarked(runs, 'month', NOW, 100).groups.map((g) => [g.label, g.total])).toEqual([
      ['November 2026', 4],
      ['October 2026', 1],
      ['September 2026', 1],
    ])
    expect(groupMarked(runs, 'day', NOW, 100).groups[0].label).toBe('Wed, 18 November 2026')
    expect(groupMarked(runs, 'deck', NOW, 100).groups.map((g) => [g.label, g.total])).toEqual([
      ['Atlas kickoff', 4],
      ['Weekly stand-up', 2],
    ])
    expect(groupMarked(runs, 'none', NOW, 100).groups).toHaveLength(1)
  })

  it('shows a page of runs and says how many are left, a group counting those not shown', () => {
    const { groups, hidden } = groupMarked(runs, 'month', NOW, 5)
    expect(hidden).toBe(1)
    expect(groups.map((g) => [g.label, g.total, g.runs.length])).toEqual([
      ['November 2026', 4, 4],
      ['October 2026', 1, 1],
    ])
  })

  it('copes with hundreds of runs', () => {
    const many = marked([{ deck: atlas, sessions: Array.from({ length: 300 }, (_, i) => session(i)) }])
    const { groups, hidden } = groupMarked(many, 'month', NOW, 30)
    expect(hidden).toBe(270)
    expect(groups.reduce((n, g) => n + g.runs.length, 0)).toBe(30)
  })
})

describe('the bar and the words', () => {
  it('shows the plan as a tick and the overtime after it', () => {
    const b = barShape(240, 360, 400)
    expect(b.tick).toBeCloseTo(66.7, 1)
    expect(b.fill).toBeCloseTo(66.7, 1)
    expect(b.over.from).toBeCloseTo(66.7, 1)
    expect(b.over.width).toBeCloseTo(33.3, 1)
  })

  it('has no overtime when under plan, and the plan ends past the ran time', () => {
    const b = barShape(300, 200, 200)
    expect(b.tick).toBe(100)
    expect(b.fill).toBeCloseTo(66.7, 1)
    expect(b.over.width).toBe(0)
  })

  it('has no tick when untimed', () => {
    expect(barShape(0, 0, 900)).toEqual({ tick: null, fill: 50, over: { from: 0, width: 0 } })
  })
})

describe("one deck's stats and trend", () => {
  const runs = marked([{ deck: atlas, sessions: [session(0, [60, 180, 200]), session(7, [60, 180, 160]), session(14, [60, 180, 100]), session(20, [5, 5, 5])] }])

  it('counts runs, the last, the average against plan and what needs a review', () => {
    const s = deckStats(runs)
    expect(s.runs).toBe(4)
    expect(s.lastMs).toBe(runs[0].startedMs)
    expect(s.average).toBe(Math.round((80 + 40 - 20) / 3))
    expect(s.toReview).toBe(0)
  })

  it('has no average for an untimed deck', () => {
    const u = marked([{ deck: atlas, sessions: [session(1, [100, 100], [null, null])] }])
    expect(deckStats(u).average).toBeNull()
  })

  it('plots the real runs, oldest first, against their plan', () => {
    const p = trendPoints(runs)
    expect(p.map((x) => x.ran)).toEqual([340, 400, 440])
    expect(p.every((x) => x.planned === 360)).toBe(true)
  })

  it('says whether the runs are getting closer to plan', () => {
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    expect(trendCaption(trendPoints(runs), mmss)).toBe('First run 5:40 (-0:20 under), latest 7:20 (+1:20 over). Drifting from plan.')
    expect(trendCaption(trendPoints(runs).slice(0, 1), mmss)).toBe('')
  })
})
