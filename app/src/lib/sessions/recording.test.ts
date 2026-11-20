import { describe, expect, it } from 'vitest'
import type { SessionState } from '../session/clock'
import { canRecord, nextStep, recordButton, type RecordingState } from './recording'

const START = '2026-10-28T09:00:00.000Z'
const deck = (extra: Partial<SessionState> = {}): SessionState => ({
  status: 'running',
  index: 0,
  paused: false,
  plan: [],
  events: [{ type: 'start', at: START }],
  talk: { id: 'deck', name: 'Stand-up', sessions: [], segments: [], deck: {}, deckPath: '/Decks/Stand-up/deck.md' } as never,
  shortcuts: {},
  unavailable: [],
  deck: true,
  ...extra,
})

describe('Record my voice follows the run', () => {
  it('can record any deck in its folder, never a preview', () => {
    expect(canRecord(deck())).toBe(true)
    expect(canRecord(deck({ preview: true }))).toBe(false)
    expect(canRecord(deck({ deck: false }))).toBe(false)
    expect(canRecord(null)).toBe(false)
  })

  it('starts at Start with Auto record on, once per run', () => {
    expect(nextStep(deck({ status: 'ready', events: [] }), null, false, false, true)).toBeNull()
    expect(nextStep(deck(), null, false, false, true)).toBe('start')
    expect(nextStep(deck(), START, true, false, true)).toBeNull()
    // Stopped from the widget: the same run is not started again.
    expect(nextStep(deck(), START, false, false, true)).toBeNull()
    // Auto record off: nothing records until the record button is pressed.
    expect(nextStep(deck(), null, false, false, false)).toBeNull()
    expect(nextStep(deck({ preview: true }), null, false, false, true)).toBeNull()
  })

  it('pauses and resumes with the deck, and stops at Stop or when the deck closes', () => {
    expect(nextStep(deck({ paused: true }), START, true, false, false)).toBe('pause')
    expect(nextStep(deck({ paused: false }), START, true, true, false)).toBe('resume')
    expect(nextStep(deck({ status: 'finished' }), START, true, false, false)).toBe('stop')
    expect(nextStep(null, START, true, false, false)).toBe('stop')
    expect(nextStep(null, START, false, false, false)).toBeNull()
  })
})

describe('the deck widget\'s record button (ADR 0042)', () => {
  const now = (state: RecordingState['state'], path = '/Decks/Stand-up/deck.md'): RecordingState => ({ state, deck: path, name: '2026-10-28 09-00', why: '' })

  it('is red while recording, dimmed while paused, grey when not, and struck through when refused', () => {
    expect(recordButton(deck(), now('recording'))).toBe('recording')
    expect(recordButton(deck({ paused: true }), now('paused'))).toBe('paused')
    expect(recordButton(deck(), now('stopped'))).toBe('stopped')
    expect(recordButton(deck(), now('failed'))).toBe('stopped')
    expect(recordButton(deck(), now('refused'))).toBe('refused')
  })

  it('is on every running deck, grey when nothing has recorded it, or another deck is recording', () => {
    expect(recordButton(deck(), null)).toBe('stopped')
    expect(recordButton(deck(), now('recording', '/Decks/Other/deck.md'))).toBe('stopped')
  })

  it('is there before the start and in a preview, armed when the deck will record from Start', () => {
    const ready = deck({ status: 'ready', events: [] })
    expect(recordButton(ready, null, true)).toBe('armed')
    expect(recordButton(ready, null, false)).toBe('idle')
    // The deck's own Record on start wins over Auto record.
    const on = deck({ status: 'ready', events: [], talk: { deck: { recordOnStart: 'on' } } as never })
    const off = deck({ status: 'ready', events: [], talk: { deck: { recordOnStart: 'off' } } as never })
    expect(recordButton(on, null, false)).toBe('armed')
    expect(recordButton(off, null, true)).toBe('idle')
    // A preview never records, but shows what a run would do.
    expect(recordButton(deck({ preview: true }), now('recording'), true)).toBe('armed')
  })

  it('is not there with nothing on screen, after the run, or for a note', () => {
    expect(recordButton(null, null, true)).toBeNull()
    expect(recordButton(deck({ status: 'finished' }), null, true)).toBeNull()
    expect(recordButton(deck({ deck: false, status: 'ready', events: [] }), null, true)).toBeNull()
  })
})
