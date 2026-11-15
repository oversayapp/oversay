// The waveform (style A, ADR 0029): the talk drawn
// as one line, each segment in its kind's pattern at its planned width,
// as whole cycles so every boundary is a node. As the talk goes, the wave's inverse is added up to
// the playhead and cancels it: what has been said is a flat line, with the pattern kept behind it as
// a faint shadow. Worked out here, away from the component, so it can be tested.
import type { SegmentKind } from '../../lib/project/types'
import type { TimelineBlock, TimelineLayout } from '../../lib/session/timeline'

export interface WavePattern {
  shape: 'sine' | 'square'
  /** Of the full height, 0 to 1. */
  amplitude: number
  /** In px: the segment fits whole cycles of about this length. */
  wavelength: number
  dashed: boolean
}

/**
 * A pattern for each kind (John, 2026-10-20): the intro low and quick, a talk starts with energy;
 * topics full and steady at one frequency, every other one dashed so a change of topic shows; a
 * demo a low, dashed square wave; the outro the same as a break, one long, slow wave.
 */
export const PATTERNS: Record<SegmentKind, WavePattern> & { nextTopic: WavePattern } = {
  intro: { shape: 'sine', amplitude: 0.5, wavelength: 22, dashed: false },
  topic: { shape: 'sine', amplitude: 1, wavelength: 66, dashed: false },
  nextTopic: { shape: 'sine', amplitude: 1, wavelength: 66, dashed: true },
  demo: { shape: 'square', amplitude: 0.5, wavelength: 40, dashed: true },
  outro: { shape: 'sine', amplitude: 1, wavelength: 200, dashed: false },
  break: { shape: 'sine', amplitude: 1, wavelength: 200, dashed: false },
}

/** The pattern for the block at `index`: every other topic, counting topics only, is dashed. */
export function patternFor(blocks: readonly Pick<TimelineBlock, 'kind'>[], index: number): WavePattern {
  const kind = blocks[index].kind
  if (kind !== 'topic') return PATTERNS[kind]
  const topicsBefore = blocks.slice(0, index).filter((b) => b.kind === 'topic').length
  return topicsBefore % 2 === 1 ? PATTERNS.nextTopic : PATTERNS.topic
}

export interface WaveSpan {
  block: TimelineBlock
  pattern: WavePattern
  /** Where it starts and ends, in px. */
  x0: number
  x1: number
  cycles: number
}

/** The blocks laid along `width` px at their planned lengths, each fitted to whole cycles. */
export function waveSpans(layout: TimelineLayout, width: number): WaveSpan[] {
  return layout.blocks.map((block, i) => {
    const pattern = patternFor(layout.blocks, i)
    const x0 = (block.start / layout.total) * width
    const x1 = ((block.start + block.plannedSeconds) / layout.total) * width
    return { block, pattern, x0, x1, cycles: Math.max(1, Math.round((x1 - x0) / pattern.wavelength)) }
  })
}

/** The wave at `x` in a span, -1 to 1 times its amplitude (up is negative, as on screen). */
export function shapeAt(span: WaveSpan, x: number): number {
  const v = Math.sin((2 * Math.PI * span.cycles * (x - span.x0)) / Math.max(1e-6, span.x1 - span.x0))
  const level = span.pattern.shape === 'square' ? (Math.abs(v) < 1e-6 ? 0 : Math.sign(v)) : v
  return -span.pattern.amplitude * level
}

/** Over this many px behind the playhead the inverse fades in, so the wave dies down rather than being cut. */
export const CANCEL_FRONT = 26

export interface WaveRun {
  /** Said (flat), still to say in the current segment, or ahead. */
  part: 'done' | 'current' | 'ahead'
  dashed: boolean
  points: string
  /** The kind of the segment it is in, so a deck's waveform can be drawn by kind. */
  kind: SegmentKind
}

export interface SineDrawing {
  runs: WaveRun[]
  /** The pattern where it has been cancelled, drawn faintly behind the flat line. */
  shadows: { dashed: boolean; points: string }[]
  /** Where one segment meets the next, in px. */
  nodes: number[]
  /** The playhead in px, or null outside a running talk. */
  playhead: number | null
}

/**
 * The wave as lines for an SVG `width` × `height` px, centred, with `amplitude` px at full height.
 * Blocks that are done are cancelled to the centre line; the current one up to the playhead, with a
 * soft front; blocks ahead keep their pattern.
 */
export function sineDrawing(layout: TimelineLayout, width: number, height: number, amplitude: number): SineDrawing {
  const spans = waveSpans(layout, width)
  const mid = height / 2
  const playhead = layout.playhead === null ? null : (layout.playhead / layout.total) * width
  const cancelled = (span: WaveSpan, x: number): number => {
    if (span.block.state === 'ahead') return 0
    if (playhead === null) return span.block.state === 'done' ? 1 : 0
    if (x >= playhead) return 0
    if (x <= playhead - CANCEL_FRONT) return 1
    const t = (playhead - x) / CANCEL_FRONT
    return t * t * (3 - 2 * t)
  }
  const at = (x: number, y: number) => `${x.toFixed(2)},${(mid + y).toFixed(2)}`
  const runs: WaveRun[] = []
  const shadows: SineDrawing['shadows'] = []
  for (const span of spans) {
    // A square wave needs finer steps for its edges to stand up straight.
    const step = span.pattern.shape === 'square' ? 0.5 : 1.5
    let run: WaveRun | null = null
    let runPoints: string[] = []
    const shadow: string[] = []
    const flush = () => {
      if (run && runPoints.length > 1) runs.push({ ...run, points: runPoints.join(' ') })
    }
    for (let px = span.x0; px <= span.x1 + 1e-6; px += step) {
      const x = Math.min(px, span.x1)
      const y = shapeAt(span, x) * amplitude
      const c = cancelled(span, x)
      const part: WaveRun['part'] = c > 0.999 ? 'done' : span.block.state === 'ahead' ? 'ahead' : 'current'
      const point = at(x, y * (1 - c))
      if (!run || run.part !== part) {
        flush()
        // Each run starts where the last ended, so the line has no gaps.
        const last = runPoints.at(-1)
        run = { part, dashed: span.pattern.dashed && part !== 'done', points: '', kind: span.block.kind }
        runPoints = last ? [last, point] : [point]
      } else runPoints.push(point)
      if (c > 0) shadow.push(at(x, y))
    }
    flush()
    if (shadow.length > 1) shadows.push({ dashed: span.pattern.dashed, points: shadow.join(' ') })
  }
  return { runs, shadows, nodes: spans.slice(1).map((s) => s.x0), playhead }
}
