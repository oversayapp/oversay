import type { PlannedSegment, SessionEvent, Talk } from './types'

/** Fixed durations plus the estimates of open-ended segments (both live in `plannedSeconds`). */
export function plannedTotalSeconds(talk: Talk): number {
  return talk.segments.reduce((sum, s) => sum + s.plannedSeconds, 0)
}

/** Planned total minus target: positive means over target. Undefined when no target is set. */
export function targetDifferenceSeconds(talk: Talk): number | undefined {
  if (talk.targetSeconds === undefined) return undefined
  return plannedTotalSeconds(talk) - talk.targetSeconds
}

/**
 * The longest visit Previous treats as an accidental Next, in seconds of talk time: the visit's
 * time goes back to the segment returned to. A longer visit was really presented and keeps its
 * time (006 review: two minutes on a segment shouldn't move with a stray Previous).
 */
export const HAND_BACK_SECONDS = 10

/**
 * Actual seconds spent on each planned segment, derived from the event log.
 *
 * Time counts against the current segment. `next` advances (past the last segment
 * nothing is counted). `previous` is for an accidental Next: if the visit it leaves was no
 * longer than HAND_BACK_SECONDS, that time goes back to the segment it returns to, which
 * carries on counting (006 hands-on); a longer visit keeps its time. A segment
 * visited again later adds to what it had. Paused time counts for nothing, and the clock
 * stops at `end`. For a log with no `end`, pass `until` (ISO timestamp) to count up to
 * that moment; without it the last event is where counting stops.
 */
export function segmentActuals(
  plan: PlannedSegment[],
  events: SessionEvent[],
  until?: string,
): number[] {
  const actuals = plan.map(() => 0)
  let current = 0
  let running = false
  let lastAt = 0
  // Seconds counted against the current segment since it was entered (this visit only).
  let visit = 0

  const accrue = (at: number) => {
    if (running && current < plan.length) {
      const seconds = (at - lastAt) / 1000
      actuals[current] += seconds
      visit += seconds
    }
    lastAt = at
  }

  for (const event of events) {
    const at = Date.parse(event.at)
    switch (event.type) {
      case 'start':
        current = 0
        running = true
        lastAt = at
        visit = 0
        break
      case 'next':
        accrue(at)
        current = Math.min(current + 1, plan.length)
        visit = 0
        break
      case 'previous':
        accrue(at)
        if (current > 0) {
          // A short visit: the Next that started it was a mistake, so hand its time back.
          if (visit <= HAND_BACK_SECONDS) {
            if (current < plan.length) actuals[current] -= visit
            actuals[current - 1] += visit
          }
          current -= 1
        }
        visit = 0
        break
      case 'pause':
        accrue(at)
        running = false
        break
      case 'resume':
        lastAt = at
        running = true
        break
      case 'end':
        accrue(at)
        running = false
        break
    }
  }
  if (until !== undefined) accrue(Date.parse(until))
  return actuals
}
