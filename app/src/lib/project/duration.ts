/** `m:ss`, with minutes unbounded (a 90 minute talk is `90:00`). */
export function formatDuration(seconds: number): string {
  const total = Math.round(Math.max(0, seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Planned total minus target, in words: positive is over target. */
export function formatDifference(seconds: number): string {
  if (seconds === 0) return 'on target'
  return seconds > 0 ? `+${formatDuration(seconds)} over` : `${formatDuration(-seconds)} under`
}

/**
 * Reads what a person types for a length: a bare number is minutes (`3` is 3:00, as talks are
 * planned in minutes; 011/04, John), and seconds are written `45s`, `1:30` or `1m30s`; also
 * `1:02:03` and `2m`.
 * Returns whole seconds, or null if the text is not a duration.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (/^\d+$/.test(t)) return Number(t) * 60

  const clock = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(t)
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3])

  const words = /^(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/.exec(t)
  if (words && (words[1] !== undefined || words[2] !== undefined)) {
    return Number(words[1] ?? 0) * 60 + Number(words[2] ?? 0)
  }
  return null
}

/** The step a segment's length moves in when dragged on the plan bar, or nudged with the arrow keys (011/05). */
export const LENGTH_STEP_SECONDS = 30

/** `seconds` changed by `delta`, snapped to the step, and never below one step. */
export function stepLength(seconds: number, delta: number): number {
  return Math.max(LENGTH_STEP_SECONDS, Math.round((seconds + delta) / LENGTH_STEP_SECONDS) * LENGTH_STEP_SECONDS)
}
