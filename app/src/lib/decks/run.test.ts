import { describe, expect, it } from 'vitest'
import type { SessionState } from '../session/clock'
import type { SessionEventType } from '../project/types'
import { WARN_SECONDS, deckRun } from './run'

// A fake clock: times are seconds after T0.
const T0 = Date.parse('2026-10-23T09:30:00.000Z')
const at = (s: number) => T0 + s * 1000
const ev = (type: SessionEventType, s: number) => ({ type, at: new Date(at(s)).toISOString() })

// Intro 1:00, Atlas 3:00, Questions untimed, Close 2:00.
const plan = [
  { segmentId: 'a', name: 'Intro', plannedSeconds: 60, openEnded: false },
  { segmentId: 'b', name: 'Atlas', plannedSeconds: 180, openEnded: false },
  { segmentId: 'c', name: 'Questions', plannedSeconds: 0, openEnded: true },
  { segmentId: 'd', name: 'Close', plannedSeconds: 120, openEnded: false },
]

function deck(index: number, events: ReturnType<typeof ev>[], extra: Partial<SessionState> = {}): SessionState {
  return { status: 'running', index, paused: false, plan, events, talk: null, shortcuts: {}, unavailable: [], deck: true, ...extra }
}

describe('a deck run', () => {
  it('is Ready at the first card full time before the start', () => {
    const r = deckRun(deck(0, [], { status: 'ready' }), at(50), true)
    expect(r).toMatchObject({ mode: 'ready', seconds: 60, due: false })
  })

  it('counts a timed card down, rounding up', () => {
    expect(deckRun(deck(0, [ev('start', 0)]), at(19.2), true)).toMatchObject({ mode: 'left', seconds: 41, due: false })
  })

  it('turns amber in the last ten seconds', () => {
    expect(WARN_SECONDS).toBe(10)
    expect(deckRun(deck(0, [ev('start', 0)]), at(49), true).mode).toBe('left')
    expect(deckRun(deck(0, [ev('start', 0)]), at(50.5), true)).toMatchObject({ mode: 'warn', seconds: 10 })
  })

  it('is due to move on at 0:00 when Auto-advance is on', () => {
    expect(deckRun(deck(0, [ev('start', 0)]), at(60), true)).toMatchObject({ due: true })
  })

  it('with Auto-advance off stays, counting on in red, and waits for Next', () => {
    const r = deckRun(deck(0, [ev('start', 0)]), at(72), false)
    expect(r).toMatchObject({ mode: 'over', seconds: 12, due: false, waiting: true })
  })

  it('on the last card counts on in red until Stop, whatever Auto-advance says', () => {
    const r = deckRun(deck(3, [ev('start', 0), ev('next', 60), ev('next', 240), ev('next', 300)]), at(443), true)
    expect(r).toMatchObject({ mode: 'over', seconds: 23, due: false, waiting: false, last: true })
  })

  it('carries a card on from where it was left after Next or Previous', () => {
    // Intro 20 s, Atlas 30 s, back to Intro for 5 s (25 of its 60 used), then Atlas again.
    const events = [ev('start', 0), ev('next', 20), ev('previous', 50)]
    expect(deckRun(deck(0, events), at(55), true)).toMatchObject({ mode: 'left', seconds: 35 })
    expect(deckRun(deck(1, [...events, ev('next', 56)]), at(56), true)).toMatchObject({ seconds: 150 })
  })

  it('brings a card that ran out back over its time, waiting for Next, so the time adds up', () => {
    // Intro ran its minute and moved on; 40 s into Atlas, Previous: Intro is 1:00 in, then 1:12.
    const events = [ev('start', 0), ev('next', 60), ev('previous', 100)]
    expect(deckRun(deck(0, events), at(100), true)).toMatchObject({ mode: 'over', seconds: 1, due: false, waiting: true })
    expect(deckRun(deck(0, events), at(112), true)).toMatchObject({ mode: 'over', seconds: 12, due: false, waiting: true })
    // Atlas keeps the 40 s it had.
    expect(deckRun(deck(1, [...events, ev('next', 112)]), at(112), true)).toMatchObject({ mode: 'left', seconds: 140 })
  })

  it('still moves on by itself from a card gone back to with time left', () => {
    const events = [ev('start', 0), ev('next', 30), ev('previous', 40)]
    expect(deckRun(deck(0, events), at(69), true)).toMatchObject({ mode: 'warn', seconds: 1 })
    expect(deckRun(deck(0, events), at(70), true)).toMatchObject({ due: true })
  })

  it('does not count pauses, on this visit or an earlier one', () => {
    const events = [ev('start', 0), ev('pause', 10), ev('resume', 100), ev('next', 110), ev('previous', 120)]
    expect(deckRun(deck(0, events), at(125), true)).toMatchObject({ mode: 'left', seconds: 35 })
  })

  it('freezes while paused, and carries on from there', () => {
    const events = [ev('start', 0), ev('pause', 30)]
    expect(deckRun(deck(0, events, { paused: true }), at(500), true)).toMatchObject({ mode: 'left', seconds: 30, due: false, paused: true })
    expect(deckRun(deck(0, [...events, ev('resume', 500)]), at(510), true)).toMatchObject({ seconds: 20 })
  })

  it('holds the deck editor preview at each card full time, never moving on', () => {
    const r = deckRun(deck(1, [ev('start', 0)], { preview: true }), at(500), true)
    expect(r).toMatchObject({ mode: 'left', seconds: 180, due: false })
  })

  it('with timing off runs a timed card as untimed: counting up, never moving on', () => {
    const r = deckRun(deck(0, [ev('start', 0)]), at(90), true, false)
    expect(r).toMatchObject({ mode: 'up', seconds: 90, due: false, left: 0 })
  })

  it('counts an untimed card up and never moves on by itself', () => {
    const r = deckRun(deck(2, [ev('start', 0), ev('next', 60), ev('next', 240)]), at(1000), true)
    expect(r).toMatchObject({ mode: 'up', seconds: 760, due: false })
  })

  it('says what is left in the deck and when it ends', () => {
    // 41 s of Intro, then Atlas and Close; the untimed card adds nothing.
    const r = deckRun(deck(0, [ev('start', 0)]), at(19), true)
    expect(r.left).toBe(41 + 180 + 120)
    expect(r.endsAt).toBe(at(19) + r.left * 1000)
  })
})
