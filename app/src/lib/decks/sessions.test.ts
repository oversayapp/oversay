import { describe, expect, it } from 'vitest'
import type { SessionState } from '../session/clock'
import type { SessionEventType } from '../project/types'
import { KEEP_SESSIONS, deckSessionOf, parseSessions, sessionName, withChangedSession, withSession, withoutSession, type DeckSession } from './sessions'

const T0 = Date.parse('2026-10-23T09:30:00.000Z')
const ev = (type: SessionEventType, s: number) => ({ type, at: new Date(T0 + s * 1000).toISOString() })
/** The moment `s` seconds after the start. */
const moment = (s: number) => ({ at: new Date(T0 + s * 1000).toISOString() })
const plan = [
  { segmentId: 'a', name: 'Intro', plannedSeconds: 60, openEnded: false },
  { segmentId: 'b', name: 'Atlas', plannedSeconds: 180, openEnded: false },
  { segmentId: 'c', name: 'Questions', plannedSeconds: 0, openEnded: true },
]
const deck = (events: ReturnType<typeof ev>[], extra: Partial<SessionState> = {}): SessionState => ({
  status: 'finished',
  index: 2,
  paused: false,
  plan,
  events,
  talk: { id: 'deck', name: 'Stand-up', sessions: [], segments: [{ kind: 'intro' }, { kind: 'topic' }, { kind: 'outro' }] } as never,
  shortcuts: {},
  unavailable: [],
  deck: true,
  ...extra,
})

describe('a deck session', () => {
  it('records each card’s time over every visit, less pauses, timed or not', () => {
    // Intro 70 s, Atlas 40 s, back to Intro 10 s, Atlas 100 s with 30 s paused, Questions 90 s.
    const events = [ev('start', 0), ev('next', 70), ev('previous', 110), ev('next', 120), ev('pause', 150), ev('resume', 180), ev('next', 250), ev('end', 340)]
    expect(deckSessionOf(deck(events))).toEqual({
      startedAt: events[0].at,
      endedAt: events[7].at,
      cards: [
        { name: 'Intro', kind: 'intro', plannedSeconds: 60, seconds: 80 },
        { name: 'Atlas', kind: 'topic', plannedSeconds: 180, seconds: 140 },
        { name: 'Questions', kind: 'outro', plannedSeconds: null, seconds: 90 },
      ],
      // When each card was up, a visit ending at a move or a pause, for lining up a transcript (ADR 0041).
      visits: [
        { card: 0, from: moment(0).at, to: moment(70).at },
        { card: 1, from: moment(70).at, to: moment(110).at },
        { card: 0, from: moment(110).at, to: moment(120).at },
        { card: 1, from: moment(120).at, to: moment(150).at },
        { card: 1, from: moment(180).at, to: moment(250).at },
        { card: 2, from: moment(250).at, to: moment(340).at },
      ],
      pausedSeconds: 30,
    })
  })

  it('ends a visit at Stop even while paused, counting the pause up to Stop', () => {
    const events = [ev('start', 0), ev('pause', 20), ev('end', 50)]
    const run = deckSessionOf(deck(events, { index: 0 }))!
    expect(run.visits).toEqual([{ card: 0, from: moment(0).at, to: moment(20).at }])
    expect(run.pausedSeconds).toBe(30)
  })

  it('records nothing for a deck never started, a preview, or one still running', () => {
    expect(deckSessionOf(deck([ev('end', 5)]))).toBeNull()
    expect(deckSessionOf(deck([ev('start', 0), ev('end', 5)], { preview: true }))).toBeNull()
    expect(deckSessionOf(deck([ev('start', 0)]))).toBeNull()
  })

  it('keeps the newest twenty, and reads an empty or broken file as none', () => {
    const run = (n: number): DeckSession => ({ startedAt: `t${n}`, endedAt: `t${n}`, cards: [] })
    let text = ''
    for (let n = 0; n < KEEP_SESSIONS + 3; n++) text = withSession(text, run(n))
    const kept = parseSessions(text)
    expect(KEEP_SESSIONS).toBe(20)
    expect(kept).toHaveLength(20)
    expect(kept[0].startedAt).toBe('t3')
    expect(kept.at(-1)!.startedAt).toBe('t22')
    expect(parseSessions('not json')).toEqual([])
    expect(parseSessions('')).toEqual([])
  })

  it('keeps every session with a note, or one the caller says to keep, past the newest twenty', () => {
    const run = (n: number, note = ''): DeckSession => ({ startedAt: `t${String(n).padStart(2, '0')}`, endedAt: '', cards: [], ...(note ? { note } : {}) })
    let text = withSession('', run(0, 'Ran over'))
    text = withSession(text, run(1))
    for (let n = 2; n < KEEP_SESSIONS + 5; n++) text = withSession(text, run(n), (s) => s.startedAt === 't01')
    const kept = parseSessions(text).map((s) => s.startedAt)
    expect(kept.slice(0, 2)).toEqual(['t00', 't01'])
    expect(kept).toHaveLength(22)
    expect(kept.at(-1)).toBe('t24')
  })
})

describe("a session's name and changes (ADR 0041)", () => {
  const at = (h: number, m: number, s = 0) => new Date(2026, 9, 28, h, m, s).toISOString()
  const run = (startedAt: string): DeckSession => ({ startedAt, endedAt: startedAt, cards: [] })

  it('is its start in local time, with -2 for a second Start in the same minute', () => {
    const sessions = [run(at(9, 0, 5)), run(at(9, 0, 40)), run(at(9, 1)), run(at(9, 0, 50))]
    expect(sessions.map((s) => sessionName(sessions, s))).toEqual(['2026-10-28 09-00', '2026-10-28 09-00 -2', '2026-10-28 09-01', '2026-10-28 09-00 -3'])
  })

  it('changes or drops one session by its start, keeping fields and sessions it does not know', () => {
    const text = JSON.stringify({ version: 1, kept: 'yes', sessions: [{ ...run('a'), extra: 1 }, run('b')] })
    const noted = JSON.parse(withChangedSession(text, 'a', { note: 'Too long on Atlas' }))
    expect(noted.kept).toBe('yes')
    expect(noted.sessions[0]).toEqual({ ...run('a'), extra: 1, note: 'Too long on Atlas' })
    const cleared = JSON.parse(withChangedSession(JSON.stringify(noted), 'a', { note: '' }))
    expect('note' in cleared.sessions[0]).toBe(false)
    expect(parseSessions(withoutSession(text, 'a')).map((s) => s.startedAt)).toEqual(['b'])
  })
})
