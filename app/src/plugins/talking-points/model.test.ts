import { describe, expect, it } from 'vitest'
import type { SessionState } from '../../lib/session/clock'
import { talkingPointsModel } from './model'

const t = (time: string) => `2026-10-20T${time}.000Z`

// Intro with two points and a hint, Topic with nothing, Demo with one point.
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
      { id: 's_1', name: 'Intro', kind: 'intro', plannedSeconds: 120, openEnded: false, points: ['Why now', 'The plan'], hints: ['', 'Under two minutes', ' '] },
      { id: 's_2', name: 'Topic', kind: 'topic', plannedSeconds: 300, openEnded: false, points: [], hints: [] },
      { id: 's_3', name: 'Demo', kind: 'demo', plannedSeconds: 180, openEnded: true, points: ['Show it'], hints: [] },
    ],
  },
  shortcuts: {},
  unavailable: [],
}

describe('talkingPointsModel', () => {
  it('shows nothing without a session', () => {
    expect(talkingPointsModel(null)).toEqual({ status: 'none', talkName: null, segment: null, position: 0, count: 0, looking: false })
  })

  it('shows the first segment before the start', () => {
    const m = talkingPointsModel({ ...base, status: 'ready', events: [] })
    expect(m.status).toBe('ready')
    expect(m.segment).toEqual({ name: 'Intro', points: ['Why now', 'The plan'], hints: ['Under two minutes'] })
    expect([m.position, m.count]).toEqual([1, 3])
  })

  it('follows the current segment while running', () => {
    const m = talkingPointsModel({ ...base, index: 2 })
    expect(m.segment).toEqual({ name: 'Demo', points: ['Show it'], hints: [] })
    expect([m.position, m.count]).toEqual([3, 3])
  })

  it('shows a segment with no notes by its name alone', () => {
    expect(talkingPointsModel({ ...base, index: 1 }).segment).toEqual({ name: 'Topic', points: [], hints: [] })
  })

  it('shows the talk and no segment once finished', () => {
    const m = talkingPointsModel({ ...base, status: 'finished', index: 2 })
    expect([m.status, m.talkName, m.segment]).toEqual(['finished', 'Launch', null])
  })

  it('still names a segment whose talk is gone', () => {
    expect(talkingPointsModel({ ...base, talk: null }).segment).toEqual({ name: 'Intro', points: [], hints: [] })
  })
})

describe('looking back along the wave', () => {
  const running = { ...base, index: 2 }

  it('shows the segment looked at, marked as looking', () => {
    const m = talkingPointsModel(running, { index: 0, seconds: 60 })
    expect(m.looking).toBe(true)
    expect(m.position).toBe(1)
    expect(m.segment).toEqual({ name: 'Intro', points: ['Why now', 'The plan'], hints: ['Under two minutes'] })
  })

  it('shows a finished talk’s segments too, and nothing before the start', () => {
    expect(talkingPointsModel({ ...running, status: 'finished' }, { index: 1, seconds: 200 }).segment?.name).toBe('Topic')
    expect(talkingPointsModel({ ...base, status: 'ready', events: [] }, { index: 1, seconds: 200 }).looking).toBe(false)
  })

  it('goes back to the current segment when let go', () => {
    const m = talkingPointsModel(running, null)
    expect(m.looking).toBe(false)
    expect(m.segment?.name).toBe('Demo')
  })
})
