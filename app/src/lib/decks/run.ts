// How a deck's current card is doing (ADR 0036), from the session the Rust engine
// broadcasts and the time, as every window works it out (spec §5: nothing ticks in the engine).
// A card's clock is all the time it has been shown, over every visit, less the time paused (John,
// 23 Oct, changing ADR 0036's "starts again"): Previous goes back to where the card was left, so a
// card that ran out comes back over its time, counting on in red and waiting for Next, and the
// time spent on it adds up for the look back after the deck.

import type { SessionState } from '../session/clock'
import { wholeSeconds } from '../session/clock'

/** The last seconds of a timed card, in amber. */
export const WARN_SECONDS = 10

export interface DeckRun {
  /**
   * `ready` before the start (the first card's full time); `left` counting down; `warn` its last
   * ten seconds; `over` past its time, counting on in red; `up` an untimed card counting up.
   */
  mode: 'ready' | 'left' | 'warn' | 'over' | 'up'
  /** The seconds the clock shows, rounded up: left, over, or so far. */
  seconds: number
  /**
   * The card's time ran out on this visit and Auto-advance is on: the next card should show now. A
   * card gone back to after its time ran out never moves on by itself.
   */
  due: boolean
  /** Over its time with a card after it and Auto-advance off: "Press Next for …". */
  waiting: boolean
  last: boolean
  paused: boolean
  /** How far through its time the card is, 0 to 1 (0 for an untimed card). */
  progress: number
  /** Seconds left in the deck: this card's rest and every later timed card. */
  left: number
  /** When the deck will end at this rate (ms since 1970), or null before the start. */
  endsAt: number | null
}

/**
 * Seconds each card has been shown, over all its visits, not counting pauses; and how much of the
 * current card's came before this visit. The engine logs a move only when the card changes, so the
 * events give the card at every moment: Start shows the first, Next the one after, Previous the one before.
 */
export function cardTimes(session: SessionState, now: number): { shown: number[]; before: number } {
  const shown = session.plan.map(() => 0)
  let index = -1
  let from = 0
  let pausedAt: number | null = null
  let before = 0
  const close = (t: number) => {
    if (index >= 0 && index < shown.length) shown[index] += Math.max(0, (pausedAt ?? t) - from) / 1000
  }
  for (const e of session.events) {
    const t = Date.parse(e.at)
    if (e.type === 'start' || e.type === 'next' || e.type === 'previous') {
      close(t)
      index = e.type === 'start' ? 0 : e.type === 'next' ? index + 1 : index - 1
      from = t
      pausedAt = null
      before = shown[index] ?? 0
    } else if (e.type === 'pause') {
      if (pausedAt === null) pausedAt = t
    } else if (e.type === 'resume' && pausedAt !== null) {
      from += t - pausedAt
      pausedAt = null
    } else if (e.type === 'end') now = t
  }
  close(now)
  return { shown, before }
}

/** Seconds the current card has been shown, over all its visits, not counting pauses. */
export function cardSeconds(session: SessionState, now: number): number {
  return cardTimes(session, now).shown[session.index] ?? 0
}

/** How the current card is doing; with `timing` off every card runs as untimed (it counts up, waits for Next). */
export function deckRun(session: SessionState, now: number, autoAdvance: boolean, timing = true): DeckRun {
  const index = session.status === 'ready' ? 0 : session.index
  const card = session.plan[index]
  const timed = timing && !!card && !card.openEnded && card.plannedSeconds > 0
  const last = index >= session.plan.length - 1
  const later = timing ? session.plan.slice(index + 1).reduce((sum, s) => sum + (s.openEnded ? 0 : s.plannedSeconds), 0) : 0
  const base = { last, paused: session.paused, due: false, waiting: false }
  if (session.status !== 'running' || !card) {
    const full = timed ? card.plannedSeconds : 0
    return { ...base, mode: timed || !card ? 'ready' : 'up', seconds: full, progress: 0, left: full + later, endsAt: null }
  }
  // The deck editor's preview never ticks: each card at its full time.
  const times = session.preview ? { shown: [], before: 0 } : cardTimes(session, now)
  const shown = times.shown[index] ?? 0
  if (!timed) {
    return { ...base, mode: 'up', seconds: Math.floor(shown), progress: 0, left: later, endsAt: now + later * 1000 }
  }
  const rest = card.plannedSeconds - shown
  const left = Math.max(0, rest) + later
  const run = { ...base, progress: Math.min(1, shown / card.plannedSeconds), left, endsAt: now + left * 1000 }
  if (rest > 0) return { ...run, mode: rest <= WARN_SECONDS ? 'warn' : 'left', seconds: wholeSeconds(rest) }
  // Time is up: the next card, unless this is the last one, the deck waits for Next, or the card
  // had already run out before it was gone back to.
  const ranOut = times.before >= card.plannedSeconds
  if (autoAdvance && !last && !ranOut) return { ...run, mode: 'left', seconds: 0, due: !session.paused }
  // Over by a moment is still over: never "+0:00" (ADR 0016).
  return { ...run, mode: 'over', seconds: Math.max(1, wholeSeconds(-rest)), waiting: !last }
}
