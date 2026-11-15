import { describe, expect, it } from 'vitest'
import { segmentReadout, sessionClock, type SessionState } from './clock'
import { formatSigned, formatTalkStatus, isWrapUp, talkStatus, timelineLayout } from './timeline'

const t = (time: string) => `2026-10-20T${time}.000Z`
const at = (time: string) => Date.parse(t(time))

// Intro 2:00, Topic 5:00, Demo open-ended (est. 3:00); target 10:00.
const base: SessionState = {
  status: 'running',
  index: 0,
  paused: false,
  plan: [
    { segmentId: 's_1', name: 'Intro', plannedSeconds: 120, openEnded: false },
    { segmentId: 's_2', name: 'Topic', plannedSeconds: 300, openEnded: false },
    { segmentId: 's_3', name: 'Demo', plannedSeconds: 180, openEnded: true },
  ],
  events: [{ at: t('14:00:00'), type: 'start' }],
  talk: {
    id: 't_1',
    name: 'Launch',
    targetSeconds: 600,
    sessions: [],
    segments: [
      { id: 's_1', name: 'Intro', kind: 'intro', plannedSeconds: 120, openEnded: false, points: [], hints: [] },
      { id: 's_2', name: 'Topic', kind: 'topic', plannedSeconds: 300, openEnded: false, points: [], hints: [] },
      { id: 's_3', name: 'Demo', kind: 'demo', plannedSeconds: 180, openEnded: true, points: [], hints: [] },
    ],
  },
  shortcuts: {},
  unavailable: [],
}
const inTopic = { ...base, index: 1, events: [...base.events, { at: t('14:02:30'), type: 'next' as const }] }

const layoutAt = (session: SessionState, time: string) => timelineLayout(session, at(time))

describe('timelineLayout', () => {
  it('lays out the plan with no playhead before the start', () => {
    const layout = layoutAt({ ...base, status: 'ready', events: [] }, '14:00:00')
    expect(layout.blocks.map((b) => [b.start, b.plannedSeconds, b.state, b.kind])).toEqual([
      [0, 120, 'ahead', 'intro'],
      [120, 300, 'ahead', 'topic'],
      [420, 180, 'ahead', 'demo'],
    ])
    expect(layout.playhead).toBeNull()
    expect(layout.total).toBe(600)
  })

  it('keeps every block at its planned length and fills the current one as it is presented', () => {
    const layout = layoutAt(inTopic, '14:03:30') // Intro ran 2:30; a minute into Topic
    expect(layout.blocks.map((b) => [b.start, b.state, b.presented, b.beyond])).toEqual([
      [0, 'done', 120, 30],
      [120, 'current', 60, 0],
      [420, 'ahead', 0, 0],
    ])
    expect(layout.playhead).toBe(180)
    expect(layout.total).toBe(600)
  })

  it('reports an overrun beyond the block, with the playhead stopped at its end', () => {
    const layout = layoutAt(inTopic, '14:08:00') // 5:30 into Topic's 5:00
    expect(layout.blocks[1]).toMatchObject({ start: 120, presented: 300, beyond: 30 })
    expect(layout.blocks[2].start).toBe(420)
    expect(layout.playhead).toBe(420)
  })

  it('leaves the unused part of a segment finished early', () => {
    const early = { ...inTopic, events: [base.events[0], { at: t('14:01:00'), type: 'next' as const }] }
    const layout = layoutAt(early, '14:01:30') // Intro took 1:00 of 2:00
    expect(layout.blocks[0]).toMatchObject({ state: 'done', presented: 60, beyond: 0 })
  })

  it('shows the segments presented as they ran once finished, and those never reached as still to come', () => {
    const done = { ...inTopic, status: 'finished' as const, events: [...inTopic.events, { at: t('14:04:30'), type: 'end' as const }] }
    const layout = layoutAt(done, '14:30:00')
    expect(layout.blocks.map((b) => [b.state, b.presented, b.beyond])).toEqual([
      ['done', 120, 30],
      ['done', 120, 0],
      ['ahead', 0, 0],
    ])
    expect(layout.playhead).toBeNull()
  })
})

describe('talkStatus', () => {
  it('measures the talk against its plan, not its target, in whole seconds rounded up', () => {
    // Intro ran 2:30 of 2:00; the plan (10:00) is the same as the target here.
    expect(talkStatus(sessionClock(inTopic, at('14:03:30')))).toEqual({ status: 'late', seconds: 30 })
    expect(talkStatus(sessionClock(inTopic, at('14:09:00')))).toEqual({ status: 'late', seconds: 120 }) // intro +30, topic +90
    // A plan longer than its target isn't "late": only drift from the plan is.
    const longPlan = { ...inTopic, talk: { ...inTopic.talk!, targetSeconds: 500 } }
    expect(talkStatus(sessionClock(longPlan, at('14:03:30')))).toEqual({ status: 'late', seconds: 30 })
  })

  it('rounds up: 10.6 s over is 0:11, 47.4 s early is 0:47 (as 2:12.6 shows as 2:13 of 3:00), and only an exact match is on time', () => {
    const tenPointSix = { ...base, index: 1, events: [base.events[0], { at: '2026-10-20T14:02:10.600Z', type: 'next' as const }] }
    expect(talkStatus(sessionClock(tenPointSix, at('14:02:11')))).toEqual({ status: 'late', seconds: 11 })
    const early = { ...base, index: 1, events: [base.events[0], { at: t('14:01:30'), type: 'next' as const }] }
    expect(talkStatus(sessionClock(early, at('14:01:31')))).toEqual({ status: 'early', seconds: -30 })
    const fractionEarly = { ...base, index: 1, events: [base.events[0], { at: '2026-10-20T14:01:12.600Z', type: 'next' as const }] }
    expect(talkStatus(sessionClock(fractionEarly, at('14:01:13')))).toEqual({ status: 'early', seconds: -47 })
    expect(talkStatus(sessionClock({ ...base, status: 'ready', events: [] }, at('14:00:00')))).toEqual({ status: 'on-time', seconds: 0 })
  })
})

describe('isWrapUp', () => {
  it('is the last 30 seconds of a fixed segment', () => {
    expect(isWrapUp(segmentReadout(sessionClock(inTopic, at('14:07:00'))))).toBe(true) // 30 s left
    expect(isWrapUp(segmentReadout(sessionClock(inTopic, at('14:06:59'))))).toBe(false)
    expect(isWrapUp(segmentReadout(sessionClock(inTopic, at('14:08:00'))))).toBe(false) // over
  })
})

describe('formatTalkStatus', () => {
  it('writes late, early and on time the same way everywhere, never −0:00', () => {
    expect(formatTalkStatus({ status: 'late', seconds: 10 })).toBe('+0:10 late')
    expect(formatTalkStatus({ status: 'early', seconds: -45 })).toBe('−0:45 early')
    expect(formatTalkStatus({ status: 'on-time', seconds: 0 })).toBe('on time')
    expect(formatSigned(0)).toBe('0:00')
    expect(formatSigned(-61)).toBe('−1:01')
  })
})
