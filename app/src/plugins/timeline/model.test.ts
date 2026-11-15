import { describe, expect, it } from 'vitest'
import type { SessionState } from '../../lib/session/clock'
import { timelineModel } from './model'

const t = (time: string) => `2026-10-20T${time}.000Z`
const at = (time: string) => Date.parse(t(time))

// Intro 2:00, Topic 5:00, Demo open-ended (est. 3:00).
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
      { id: 's_1', name: 'Intro', kind: 'intro', plannedSeconds: 120, openEnded: false, points: ['Why now', 'The plan'], hints: ['', 'Under two minutes'] },
      { id: 's_2', name: 'Topic', kind: 'topic', plannedSeconds: 300, openEnded: false, points: [], hints: [] },
      { id: 's_3', name: 'Demo', kind: 'demo', plannedSeconds: 180, openEnded: true, points: ['Show it'], hints: [] },
    ],
  },
  shortcuts: {},
  unavailable: [],
}

describe('timelineModel', () => {
  it('has nothing to show without a session', () => {
    const m = timelineModel(null, at('14:00:00'))
    expect([m.status, m.segment, m.layout, m.word]).toEqual(['none', null, null, ''])
  })

  it('shows the first segment, its points and the next one while ready', () => {
    const m = timelineModel({ ...base, status: 'ready', events: [] }, at('14:00:00'))
    expect(m.status).toBe('ready')
    expect(m.segment?.name).toBe('Intro')
    expect(m.segment?.points).toEqual(['Why now', 'The plan'])
    expect(m.next?.name).toBe('Topic')
    expect([m.position, m.count]).toEqual([1, 3])
  })

  it('says what is left, with the first hint that has words', () => {
    const m = timelineModel(base, at('14:00:30'))
    expect([m.readout?.mode, m.readout?.seconds, m.word]).toEqual(['left', 90, 'left'])
    expect(m.segment?.hint).toBe('Under two minutes')
    expect(m.segmentShare).toBeCloseTo(0.25)
    expect(m.standing?.status).toBe('on-time')
  })

  it('says wrap up in the last 30 seconds, then over', () => {
    expect(timelineModel(base, at('14:01:40')).word).toBe('wrap up')
    const over = timelineModel(base, at('14:02:10'))
    expect([over.readout?.mode, over.readout?.seconds, over.word, over.segmentShare]).toEqual(['over', 10, 'over', 1])
    expect(over.standing).toEqual({ status: 'late', seconds: 10 })
  })

  it('counts an open-ended segment up and says the plan is paused', () => {
    const demo = { ...base, index: 2, events: [...base.events, { at: t('14:02:00'), type: 'next' as const }, { at: t('14:07:00'), type: 'next' as const }] }
    const m = timelineModel(demo, at('14:08:00'))
    expect([m.readout?.mode, m.word, m.segment?.openEnded, m.next]).toEqual(['so-far', 'so far · plan paused', true, null])
  })

  it('flags a paused session and a talk past its plan', () => {
    const paused = timelineModel({ ...base, paused: true, events: [...base.events, { at: t('14:00:30'), type: 'pause' as const }] }, at('14:01:00'))
    expect(paused.paused).toBe(true)
    const long = timelineModel({ ...base, index: 2, events: [...base.events, { at: t('14:02:00'), type: 'next' as const }, { at: t('14:07:00'), type: 'next' as const }] }, at('14:11:00'))
    expect(long.talkOver).toBe(true)
    expect(long.talkShare).toBe(1)
  })

  it('has no segment once finished', () => {
    const done = { ...base, status: 'finished' as const, events: [...base.events, { at: t('14:01:00'), type: 'end' as const }] }
    const m = timelineModel(done, at('14:05:00'))
    expect([m.status, m.segment, m.next, m.paused]).toEqual(['finished', null, null, false])
  })
})
