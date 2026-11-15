import { describe, expect, it } from 'vitest'
import { furthestSegment, planProgress, segmentReadout, sessionClock, type SessionState } from './clock'

// Same example as `session_payload_matches_the_frontend` in src-tauri/src/session.rs.
const SESSION_EXAMPLE =
  '{"status":"running","index":1,"paused":false,"plan":[{"segmentId":"s_1","name":"Intro","plannedSeconds":120,"openEnded":false},{"segmentId":"s_2","name":"Topic","plannedSeconds":300,"openEnded":false}],"events":[{"at":"2026-10-20T14:00:00.000Z","type":"start"},{"at":"2026-10-20T14:02:30.000Z","type":"next"}],"talk":{"id":"t_1","name":"Launch"},"shortcuts":{"next":"Control+Alt+ArrowRight"},"unavailable":["end"],"note":false,"preview":false}'

const at = (time: string) => Date.parse(`2026-10-20T${time}Z`)

describe('sessionClock', () => {
  const running: SessionState = JSON.parse(SESSION_EXAMPLE)

  it('reads the session the Rust engine sends', () => {
    expect(running.note).toBe(false)
    // Intro ran 2:30 (30 s over), Topic has been running a minute.
    const clock = sessionClock(running, at('14:03:30'))
    expect(clock.current?.name).toBe('Topic')
    expect(clock.inSegment).toBe(60)
    expect(clock.inTalk).toBe(210)
    expect(clock.overrun).toBe(false)
    // 4:00 of Topic left: the talk ends at 14:07:30, 30 s later than planned.
    expect(clock.projectedEnd).toBe(at('14:07:30'))
  })

  it('moves the projected end later while a segment overruns', () => {
    const clock = sessionClock(running, at('14:08:30'))
    expect(clock.inSegment).toBe(360)
    expect(clock.overrun).toBe(true)
    expect(clock.projectedEnd).toBe(at('14:08:30'))
  })

  it('gives the time after an accidental Next back to the segment Previous returns to', () => {
    const back: SessionState = {
      ...running,
      index: 0,
      events: [...running.events, { at: '2026-10-20T14:02:40.000Z', type: 'previous' }],
    }
    const clock = sessionClock(back, at('14:03:00'))
    expect(clock.current?.name).toBe('Intro')
    // 2:30, the 10 s spent in Topic by mistake, and 20 s since going back.
    expect(clock.inSegment).toBe(180)
  })

  it('shows nothing running before the start, and the end time after it', () => {
    expect(sessionClock({ ...running, status: 'ready', index: 0, events: [] }, at('14:00:00')).projectedEnd).toBeNull()
    const finished: SessionState = {
      ...running,
      status: 'finished',
      events: [...running.events, { at: '2026-10-20T14:06:00.000Z', type: 'end' }],
    }
    const clock = sessionClock(finished, at('15:00:00'))
    expect(clock.current).toBeNull()
    expect(clock.inTalk).toBe(360)
    expect(clock.projectedEnd).toBe(at('14:06:00'))
  })
})

describe('furthestSegment', () => {
  const plan = JSON.parse(SESSION_EXAMPLE).plan
  const session = (types: string[]): SessionState => ({
    status: 'running',
    index: 0,
    paused: false,
    plan,
    talk: null,
    shortcuts: {},
    unavailable: [],
    events: types.map((type, i) => ({ at: `2026-10-20T14:0${i}:00.000Z`, type: type as never })),
  })
  it('is the furthest segment presented, not where Previous went back to', () => {
    expect(furthestSegment(session([]))).toBe(-1)
    expect(furthestSegment(session(['start']))).toBe(0)
    expect(furthestSegment(session(['start', 'next', 'previous']))).toBe(1)
    expect(furthestSegment(session(['start', 'next', 'end']))).toBe(1)
  })
})

describe('sessionClock on an open-ended segment', () => {
  // Intro 2:00, Demo open-ended with a 5:00 estimate, Close 3:00.
  const plan = [
    { segmentId: 's_1', name: 'Intro', plannedSeconds: 120, openEnded: false },
    { segmentId: 's_2', name: 'Demo', plannedSeconds: 300, openEnded: true },
    { segmentId: 's_3', name: 'Close', plannedSeconds: 180, openEnded: false },
  ]
  const inDemo: SessionState = {
    status: 'running',
    index: 1,
    paused: false,
    plan,
    talk: null,
    shortcuts: {},
    unavailable: [],
    events: [
      { at: '2026-10-20T14:00:00.000Z', type: 'start' },
      { at: '2026-10-20T14:02:00.000Z', type: 'next' },
    ],
  }

  it('reports the plan paused and counts the demo time up', () => {
    const clock = sessionClock(inDemo, at('14:04:00'))
    expect(clock.planPaused).toBe(true)
    expect(clock.inSegment).toBe(120)
    expect(clock.overrun).toBe(false)
  })

  it('keeps the estimate in the projected end until the demo runs past it', () => {
    // 2:00 in: 3:00 of estimate left, then Close: ends 14:10, as planned.
    expect(sessionClock(inDemo, at('14:04:00')).projectedEnd).toBe(at('14:10:00'))
    // 7:00 in, 2:00 past the estimate: the rest of the plan waits, so the end moves with the clock.
    const late = sessionClock(inDemo, at('14:09:00'))
    expect(late.overrun).toBe(false)
    expect(late.projectedEnd).toBe(at('14:12:00'))
  })

  it('counts the demo as it ran once Next leaves it', () => {
    const after: SessionState = {
      ...inDemo,
      index: 2,
      events: [...inDemo.events, { at: '2026-10-20T14:09:00.000Z', type: 'next' }],
    }
    const clock = sessionClock(after, at('14:10:00'))
    expect(clock.planPaused).toBe(false)
    expect(clock.inTalk).toBe(600)
    // Close has 2:00 left.
    expect(clock.projectedEnd).toBe(at('14:12:00'))
  })

  it('is not paused on a fixed segment', () => {
    expect(sessionClock(JSON.parse(SESSION_EXAMPLE), at('14:03:30')).planPaused).toBe(false)
  })
})

describe('planProgress', () => {
  const running: SessionState = JSON.parse(SESSION_EXAMPLE)

  it('fills segments behind, the current one by its time, and nothing ahead', () => {
    // Intro done; Topic 60 s of 300 in.
    expect(planProgress(running, at('14:03:30'))).toEqual([1, 0.2])
  })

  it('after Previous, the segment left behind is empty again: its time went back', () => {
    const back: SessionState = {
      ...running,
      index: 0,
      events: [...running.events, { at: '2026-10-20T14:02:38.000Z', type: 'previous' }],
    }
    // Back in Intro (now over its 2:00, so full); Topic's 8 s went back to Intro.
    expect(planProgress(back, at('14:03:00'))).toEqual([1, 0])
  })

  it('is empty before the start and full for every segment reached after the end', () => {
    expect(planProgress({ ...running, status: 'ready', index: 0, events: [] }, at('14:00:00'))).toEqual([0, 0])
    const ended: SessionState = {
      ...running,
      status: 'finished',
      events: [running.events[0], { at: '2026-10-20T14:01:00.000Z', type: 'end' }],
    }
    expect(planProgress(ended, at('14:05:00'))).toEqual([1, 0])
  })
})

describe('sessionClock while paused', () => {
  it('stops the time in the segment and moves the projected end later as the pause goes on', () => {
    const paused: SessionState = {
      ...JSON.parse(SESSION_EXAMPLE),
      paused: true,
      events: [...JSON.parse(SESSION_EXAMPLE).events, { at: '2026-10-20T14:03:00.000Z', type: 'pause' }],
    }
    // Topic ran 30 s before the pause; still 30 s two minutes later.
    expect(sessionClock(paused, at('14:05:00')).inSegment).toBe(30)
    // 4:30 of Topic left, from now.
    expect(sessionClock(paused, at('14:05:00')).projectedEnd).toBe(at('14:09:30'))
  })

  it('holds the talk length against its target still: paused time is not talk time', () => {
    const paused: SessionState = {
      ...JSON.parse(SESSION_EXAMPLE),
      paused: true,
      events: [...JSON.parse(SESSION_EXAMPLE).events, { at: '2026-10-20T14:03:00.000Z', type: 'pause' }],
    }
    // 3:00 in the talk (Intro 2:30, Topic 0:30) + 4:30 of Topic to go = 7:30, both now and later.
    expect(sessionClock(paused, at('14:03:10')).projectedLength).toBe(450)
    expect(sessionClock(paused, at('14:10:00')).projectedLength).toBe(450)
  })
})

describe('segmentReadout', () => {
  const running: SessionState = JSON.parse(SESSION_EXAMPLE) // Topic, 300 s, from 14:02:30
  const readout = (s: SessionState, time: string) => segmentReadout(sessionClock(s, at(time)))

  it('counts down what is left of a fixed segment, then the time over, in whole seconds rounded up', () => {
    expect(readout(running, '14:03:30.700')).toEqual({ mode: 'left', seconds: 240 })
    expect(readout(running, '14:07:40.900')).toEqual({ mode: 'over', seconds: 11 })
  })

  it('counts an open-ended segment up', () => {
    const demo = { ...running, plan: running.plan.map((p) => ({ ...p, openEnded: true })) }
    expect(readout(demo, '14:03:30.700')).toEqual({ mode: 'so-far', seconds: 61 })
  })

  it('is nothing before the start', () => {
    expect(segmentReadout(sessionClock({ ...running, status: 'ready', events: [] }, at('14:00:00')))).toBeNull()
  })

  it('is over by at least a second the moment a segment runs over (never +0:00)', () => {
    const running: SessionState = JSON.parse(SESSION_EXAMPLE) // Topic, 300 s, from 14:02:30
    expect(segmentReadout(sessionClock(running, at('14:07:30.001')))).toEqual({ mode: 'over', seconds: 1 })
  })
})
