// What a window shows about the running session, worked out from the session the Rust engine
// broadcasts (src-tauri/src/session.rs) and the current time. The engine timestamps every event
// and nothing ticks across windows: each window recomputes this from its own clock (spec §5).
import { readable, type Readable } from 'svelte/store'
import { segmentActuals } from '../project/derived'
import { formatDuration } from '../project/duration'
import type { PlannedSegment, Segment, SegmentKind, SessionEvent, Talk } from '../project/types'

/** The `session` channel's value: the same shape as `Session` in session.rs (tested there). */
export interface SessionState {
  status: 'ready' | 'running' | 'finished'
  /** The current segment while running; 0 before the start. */
  index: number
  /** Running but stopped for an interruption: no time counts until Resume. */
  paused: boolean
  plan: PlannedSegment[]
  events: SessionEvent[]
  /** The talk being presented, as it was when the session opened. */
  talk: Talk | null
  /** This session's hotkeys, action → accelerator (lib/session/shortcuts.ts). */
  shortcuts: Record<string, string>
  /** Actions whose hotkey couldn't be registered: another app or the system has it. */
  unavailable: string[]
  /** A quick note shown on screen, not a talk: it counts up, stays on its last topic and is never recorded. */
  note?: boolean
  /** A deck of flashcards on the flashcard widget: opens Ready, stays on its last card until Stop, not recorded into a project. */
  deck?: boolean
  /** A deck on screen only to be looked at: the Look card's sample deck (ADR 0051) or the deck editor's preview; never recorded. */
  preview?: boolean
  /** The preview is the Look card's sample deck, not the deck editor's (ADR 0051). */
  lookPreview?: boolean
}

export interface SessionClock {
  /** The segment being presented, or null before the start and after the end. */
  current: PlannedSegment | null
  /** Seconds spent in the current segment, including earlier visits after a Previous. */
  inSegment: number
  /** Seconds since the start, not counting time after the end. */
  inTalk: number
  /** When the talk is now expected to finish (ms since 1970), or when it did; null before the start. */
  projectedEnd: number | null
  /**
   * How long the talk itself is now expected to run, in seconds: time in the talk plus the plan
   * still to go. Paused time isn't talk time, so this holds still during a pause; compare it with
   * `plannedLength` to see how late or early the talk is running (the projected end, a time of
   * day, still moves on while paused).
   */
  projectedLength: number
  /** The plan's length, in seconds: what the talk is measured against while it runs (talk your plan). */
  plannedLength: number
  /** A fixed segment has run past its planned length (an open-ended one never overruns). */
  overrun: boolean
  /**
   * The current segment is open-ended (a demo, Q&A): the rest of the plan waits for Next while
   * it counts up (spec §5 "plan paused"). Its length is only an estimate, used in the projected
   * end until it runs past it; after that the end moves with the clock.
   */
  planPaused: boolean
}

/** The furthest segment the session has reached (-1 before the start). Later ones were never presented. */
export function furthestSegment(session: SessionState): number {
  let at = -1
  let furthest = -1
  for (const e of session.events) {
    if (e.type === 'start') at = 0
    else if (e.type === 'next') at += 1
    else if (e.type === 'previous') at -= 1
    furthest = Math.max(furthest, Math.min(at, session.plan.length - 1))
  }
  return furthest
}

/**
 * The segment being presented, with its notes from the talk the session was opened with: the
 * first one before the start, none once finished. `index` is its place in the plan (-1 for none).
 */
export function presentedSegment(session: SessionState): { index: number; planned: PlannedSegment | null; notes: Segment | undefined } {
  const index = session.status === 'finished' ? -1 : session.status === 'ready' ? 0 : session.index
  const planned = session.plan[index] ?? null
  return { index, planned, notes: planned ? session.talk?.segments.find((s) => s.id === planned.segmentId) : undefined }
}

/** A segment's hints worth showing: the editor's blank rows are not. */
export const shownHints = (hints: string[]): string[] => hints.filter((h) => h.trim() !== '')

/** A planned segment's kind, from the talk the session was opened with ('topic' if it's gone). */
export function segmentKind(session: SessionState, segmentId: string): SegmentKind {
  return session.talk?.segments.find((s) => s.id === segmentId)?.kind ?? 'topic'
}

export function sessionClock(session: SessionState, now: number): SessionClock {
  const plannedLength = session.plan.reduce((sum, s) => sum + s.plannedSeconds, 0)
  if (session.status === 'ready' || session.events.length === 0) {
    return { current: null, inSegment: 0, inTalk: 0, projectedEnd: null, projectedLength: plannedLength, plannedLength, overrun: false, planPaused: false }
  }
  const actuals = segmentActuals(session.plan, session.events, new Date(now).toISOString())
  const inTalk = actuals.reduce((a, b) => a + b, 0)
  if (session.status === 'finished') {
    const ended = session.events.at(-1)!
    return {
      current: null,
      inSegment: 0,
      inTalk,
      projectedEnd: Date.parse(ended.at),
      projectedLength: inTalk,
      plannedLength,
      overrun: false,
      planPaused: false,
    }
  }
  const current = session.plan[session.index]
  const inSegment = actuals[session.index]
  // The rest of this segment (none once it has overrun), then the later segments as planned.
  const left =
    Math.max(0, current.plannedSeconds - inSegment) +
    session.plan.slice(session.index + 1).reduce((sum, s) => sum + s.plannedSeconds, 0)
  return {
    current,
    inSegment,
    inTalk,
    projectedEnd: now + left * 1000,
    projectedLength: inTalk + left,
    plannedLength,
    overrun: !current.openEnded && inSegment > current.plannedSeconds,
    planPaused: current.openEnded,
  }
}

/**
 * How full each block of the live plan bar is, 0 to 1. Segments behind the current one are
 * full; the current one fills as it runs (toward its estimate when open-ended); those ahead show
 * only time they kept from earlier visits (Previous hands back a short latest one). After the end,
 * every segment reached is full.
 */
export function planProgress(session: SessionState, now: number): number[] {
  if (session.status === 'ready' || session.events.length === 0) return session.plan.map(() => 0)
  const furthest = furthestSegment(session)
  if (session.status === 'finished') return session.plan.map((_, i) => (i <= furthest ? 1 : 0))
  const actuals = segmentActuals(session.plan, session.events, new Date(now).toISOString())
  return session.plan.map((p, i) => (i < session.index ? 1 : Math.min(1, actuals[i] / Math.max(1, p.plannedSeconds))))
}

/** The current time, updated every `ms` while something is subscribed: what each window's clock runs on. */
export function ticking(ms = 250): Readable<number> {
  return readable(Date.now(), (set) => {
    const timer = setInterval(() => set(Date.now()), ms)
    return () => clearInterval(timer)
  })
}

/** The current segment's time as every window shows it. */
export interface SegmentReadout {
  /** Counting up an open-ended segment, over a fixed one's length, or what's left of it. */
  mode: 'so-far' | 'over' | 'left'
  /** Whole seconds, rounded up (`wholeSeconds`), so every window shows the same second. */
  seconds: number
}

export function segmentReadout(clock: SessionClock): SegmentReadout | null {
  const current = clock.current
  if (!current) return null
  if (clock.planPaused) return { mode: 'so-far', seconds: wholeSeconds(clock.inSegment) }
  // Over by a moment is still over: never "+0:00" (ADR 0016).
  if (clock.overrun) return { mode: 'over', seconds: Math.max(1, wholeSeconds(clock.inSegment - current.plannedSeconds)) }
  return { mode: 'left', seconds: wholeSeconds(current.plannedSeconds - clock.inSegment) }
}

/**
 * Seconds as whole seconds, rounded up (John, 007/01): 9.2 s over counts as 10, and a countdown
 * shows 3:00 until a whole second has gone. A thousandth is allowed for timestamp arithmetic.
 */
export const wholeSeconds = (seconds: number) => Math.ceil(seconds - 0.001)

/** Seconds as `m:ss`, rounded up like the session's readouts. */
export const formatElapsed = (seconds: number) => formatDuration(wholeSeconds(seconds))

/** A time of day, `14:05`, as the projected end is shown. */
export const formatTimeOfDay = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
