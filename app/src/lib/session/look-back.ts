// Looking back along the waveform: while the Timeline's wave is held,
// the point looked at goes to every overlay, so Talking Points can show that segment's notes. It
// only looks: nothing about the session changes, and letting go clears it.

/** The state channel carrying it. Same name as `LOOK_BACK_CHANNEL` in overlay.rs. */
export const LOOK_BACK_CHANNEL = 'look-back'

/** The segment looked at (its place in the plan) and how far into the talk, in seconds. */
export interface LookBack {
  index: number
  seconds: number
}

/** A look back as it crosses a window boundary: anything else is no look back. */
export function parseLookBack(value: unknown): LookBack | null {
  if (typeof value !== 'object' || value === null) return null
  const { index, seconds } = value as { index?: unknown; seconds?: unknown }
  if (!Number.isInteger(index) || (index as number) < 0) return null
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null
  return { index: index as number, seconds }
}
