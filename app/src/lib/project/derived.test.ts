import { describe, expect, it } from 'vitest'
import { plannedTotalSeconds, targetDifferenceSeconds, segmentActuals } from './derived'
import type { PlannedSegment, SessionEvent, Segment, Talk } from './types'

const seg = (plannedSeconds: number, openEnded = false): Segment => ({
  id: 's_x',
  name: 'x',
  kind: openEnded ? 'demo' : 'topic',
  plannedSeconds,
  openEnded,
  points: [],
  hints: [],
})
const talk = (segments: Segment[], targetSeconds?: number): Talk => ({
  id: 't_x',
  name: 'x',
  segments,
  sessions: [],
  ...(targetSeconds === undefined ? {} : { targetSeconds }),
})

describe('planned total', () => {
  it('is 0 for an empty talk', () => {
    expect(plannedTotalSeconds(talk([]))).toBe(0)
  })
  it('sums fixed durations and open-ended estimates', () => {
    expect(plannedTotalSeconds(talk([seg(120), seg(300, true), seg(180)]))).toBe(600)
  })
})

describe('target difference', () => {
  it('is undefined without a target', () => {
    expect(targetDifferenceSeconds(talk([seg(60)]))).toBeUndefined()
  })
  it('is positive when over target and negative when under', () => {
    expect(targetDifferenceSeconds(talk([seg(700)], 600))).toBe(100)
    expect(targetDifferenceSeconds(talk([seg(500)], 600))).toBe(-100)
    expect(targetDifferenceSeconds(talk([seg(600), seg(60, true)], 660))).toBe(0)
  })
})

const plan: PlannedSegment[] = ['a', 'b', 'c'].map((n) => ({
  segmentId: `s_${n}`,
  name: n,
  plannedSeconds: 60,
  openEnded: false,
}))
const t = (s: number) => new Date(Date.UTC(2026, 9, 20, 14, 0, s)).toISOString()
const ev = (s: number, type: SessionEvent['type']): SessionEvent => ({ at: t(s), type })

describe('segment actuals', () => {
  it('attributes time to each segment on a straight run', () => {
    const events = [ev(0, 'start'), ev(70, 'next'), ev(100, 'next'), ev(160, 'end')]
    expect(segmentActuals(plan, events)).toEqual([70, 30, 60])
  })

  it('gives the time since an accidental Next back to the segment Previous returns to', () => {
    const events = [ev(0, 'start'), ev(60, 'next'), ev(64, 'previous'), ev(80, 'next'), ev(100, 'end')]
    // The 4 s in b after the Next belong to a: a 0-80 = 80; b starts again at 80: 80-100 = 20.
    expect(segmentActuals(plan, events)).toEqual([80, 20, 0])
  })

  it('moves only the latest visit back, pauses not counted, and keeps earlier visits', () => {
    const events = [
      ev(0, 'start'),
      ev(10, 'next'), // b: 10-30 = 20, kept
      ev(30, 'next'),
      ev(40, 'previous'), // c's 10 go back to b
      ev(50, 'next'), // c again: 50-55
      ev(55, 'pause'),
      ev(90, 'resume'),
      ev(95, 'previous'), // c's visit, 5 + 5 around the pause (10, the limit), goes back to b
      ev(100, 'end'),
    ]
    // a 10; b 20 + 10 + 10 (40-50) + 10 + 5 (95-100) = 55; c 0
    expect(segmentActuals(plan, events)).toEqual([10, 55, 0])
  })

  it('keeps a visit longer than the hand-back limit with its segment: it was really presented', () => {
    const events = [ev(0, 'start'), ev(10, 'next'), ev(30, 'next'), ev(150, 'previous'), ev(160, 'end')]
    // c keeps its two minutes; b carries on from 150: 20 + 10.
    expect(segmentActuals(plan, events)).toEqual([10, 30, 120])
    const justOver = [ev(0, 'start'), ev(60, 'next'), ev(71, 'previous'), ev(80, 'end')]
    expect(segmentActuals(plan, justOver)).toEqual([69, 11, 0])
  })

  it('does not count paused time', () => {
    const events = [ev(0, 'start'), ev(30, 'pause'), ev(90, 'resume'), ev(120, 'next'), ev(150, 'end')]
    expect(segmentActuals(plan, events)).toEqual([60, 30, 0])
  })

  it('handles an early end, leaving unreached segments at 0', () => {
    const events = [ev(0, 'start'), ev(45, 'next'), ev(50, 'end')]
    expect(segmentActuals(plan, events)).toEqual([45, 5, 0])
  })

  it('ignores time after end and Next past the last segment', () => {
    const events = [ev(0, 'start'), ev(10, 'next'), ev(20, 'next'), ev(30, 'next'), ev(99, 'end')]
    expect(segmentActuals(plan, events)).toEqual([10, 10, 10])
  })

  it('keeps previous on the first segment on the first segment', () => {
    const events = [ev(0, 'start'), ev(5, 'previous'), ev(15, 'end')]
    expect(segmentActuals(plan, events)).toEqual([15, 0, 0])
  })

  it('ends a pause at end without counting it', () => {
    const events = [ev(0, 'start'), ev(20, 'pause'), ev(80, 'end')]
    expect(segmentActuals(plan, events)).toEqual([20, 0, 0])
  })

  it('runs an unfinished session up to `until`', () => {
    const events = [ev(0, 'start'), ev(30, 'next')]
    expect(segmentActuals(plan, events, t(50))).toEqual([30, 20, 0])
  })

  it('returns zeros for an empty log', () => {
    expect(segmentActuals(plan, [])).toEqual([0, 0, 0])
  })
})
