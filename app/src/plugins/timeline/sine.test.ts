import { describe, expect, it } from 'vitest'
import type { SegmentKind } from '../../lib/project/types'
import type { TimelineBlock, TimelineLayout } from '../../lib/session/timeline'
import { PATTERNS, patternFor, shapeAt, sineDrawing, waveSpans } from './sine'

// A talk of 24 minutes: a welcome, three topics in a row, a demo and questions.
const PLAN: [string, SegmentKind, number][] = [
  ['Welcome', 'intro', 120],
  ['Revenue', 'topic', 240],
  ['Hiring', 'topic', 180],
  ['Roadmap', 'topic', 300],
  ['Live demo', 'demo', 360],
  ['Questions', 'outro', 240],
]

function layout(current: number, inSegment: number, finished = false): TimelineLayout {
  let start = 0
  const blocks = PLAN.map(([name, kind, plannedSeconds], i): TimelineBlock => {
    const state = finished ? 'done' : current < 0 ? 'ahead' : i < current ? 'done' : i === current ? 'current' : 'ahead'
    const presented = state === 'done' ? plannedSeconds : state === 'current' ? Math.min(inSegment, plannedSeconds) : 0
    const block = { segmentId: name, name, kind, openEnded: kind === 'demo', plannedSeconds, start, state, presented, beyond: 0 } satisfies TimelineBlock
    start += plannedSeconds
    return block
  })
  const cur = blocks[current]
  return { blocks, total: start, playhead: !finished && cur ? cur.start + cur.presented : null }
}

const ys = (points: string) => points.split(' ').map((p) => Number(p.split(',')[1]))

describe('the Waveform wave', () => {
  it('draws each kind in its pattern, every other topic dashed', () => {
    const blocks = layout(-1, 0).blocks
    expect(patternFor(blocks, 0)).toEqual(PATTERNS.intro)
    expect(patternFor(blocks, 1).dashed).toBe(false)
    expect(patternFor(blocks, 2).dashed).toBe(true)
    expect(patternFor(blocks, 3).dashed).toBe(false)
    expect(patternFor(blocks, 4)).toEqual({ shape: 'square', amplitude: 0.5, wavelength: 40, dashed: true })
    expect(PATTERNS.outro).toEqual(PATTERNS.break)
    expect(PATTERNS.intro.amplitude).toBe(0.5)
    expect(PATTERNS.intro.wavelength).toBeLessThan(PATTERNS.topic.wavelength)
  })

  it('fits whole cycles, so every segment starts and ends on the line', () => {
    for (const span of waveSpans(layout(-1, 0), 1040)) {
      expect(Number.isInteger(span.cycles)).toBe(true)
      expect(Math.abs(shapeAt(span, span.x0))).toBeLessThan(1e-6)
      expect(Math.abs(shapeAt(span, span.x1))).toBeLessThan(1e-6)
    }
  })

  it('marks each run with its segment’s kind, so a deck’s waveform can be drawn by kind', () => {
    const d = sineDrawing(layout(-1, 0), 1040, 40, 14)
    expect([...new Set(d.runs.map((r) => r.kind))]).toEqual(['intro', 'topic', 'demo', 'outro'])
  })

  it('keeps every segment’s pattern before the talk starts, with no playhead', () => {
    const d = sineDrawing(layout(-1, 0), 1040, 40, 14)
    expect(d.playhead).toBeNull()
    expect(d.shadows).toEqual([])
    expect(d.runs.every((r) => r.part === 'ahead')).toBe(true)
    expect(Math.max(...d.runs.flatMap((r) => ys(r.points)))).toBeGreaterThan(30)
  })

  it('cancels what has been said to a flat line, keeps a shadow of it, and leaves the rest', () => {
    const d = sineDrawing(layout(2, 90), 1040, 40, 14)
    const done = d.runs.filter((r) => r.part === 'done')
    expect(done.length).toBeGreaterThan(0)
    expect(done.flatMap((r) => ys(r.points)).every((y) => Math.abs(y - 20) < 1e-6)).toBe(true)
    expect(done.every((r) => !r.dashed)).toBe(true)
    // Welcome, Revenue and half of Hiring are behind the playhead: their pattern stays as a shadow.
    expect(d.shadows).toHaveLength(3)
    expect(d.shadows[2].dashed).toBe(true)
    expect(d.runs.some((r) => r.part === 'current' && r.dashed)).toBe(true)
    expect(d.runs.filter((r) => r.part === 'ahead').some((r) => ys(r.points).some((y) => Math.abs(y - 20) > 6))).toBe(true)
  })

  it('puts the playhead at the time presented, at planned widths', () => {
    const d = sineDrawing(layout(2, 90), 1440, 40, 14)
    // 120 + 240 + 90 seconds of 1440: 450 px of 1440.
    expect(d.playhead).toBeCloseTo(450)
    expect(d.nodes.map(Math.round)).toEqual([120, 360, 540, 840, 1200])
  })

  it('is flat end to end once the talk has finished', () => {
    const d = sineDrawing(layout(0, 0, true), 1040, 40, 14)
    expect(d.playhead).toBeNull()
    expect(d.runs.every((r) => r.part === 'done')).toBe(true)
    expect(d.runs.flatMap((r) => ys(r.points)).every((y) => Math.abs(y - 20) < 1e-6)).toBe(true)
    expect(d.shadows).toHaveLength(PLAN.length)
  })
})
