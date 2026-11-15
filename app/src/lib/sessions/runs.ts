// Every deck's runs, for Sessions on the rail (ADR 0041, spec §11): each session of
// each deck, newest first, grouped by the day it started as Decks groups by when a deck changed,
// and narrowed by workspace, deck and when it ran. Pure, so the page and its tests agree.

import { formatDuration } from '../project/duration'
import { DATE_RANGES, dateGroup, rangeStart, type DateRange } from '../decks/list'
import type { DeckSession } from '../decks/sessions'

/** What a run needs of its deck. */
export interface RunDeck {
  /** Its `deck.md`. */
  path: string
  /** Its id, or '' for a deck that has none yet (then its path stands in for it). */
  id: string
  name: string
  audience: string
  /** The ids of the workspaces it is in (ADR 0040). */
  workspaces: readonly string[]
}

/** One Start of one deck. */
export interface Run {
  deck: RunDeck
  session: DeckSession
  startedMs: number
}

/** A deck's id, or its path when it has none yet: what the deck filter goes by. */
export const deckKey = (d: RunDeck): string => d.id || d.path

/** Every session of every deck, newest first. */
export function everyRun(decks: readonly { deck: RunDeck; sessions: readonly DeckSession[] }[]): Run[] {
  return decks
    .flatMap(({ deck, sessions }) => sessions.map((session) => ({ deck, session, startedMs: Date.parse(session.startedAt) })))
    .filter((r) => !Number.isNaN(r.startedMs))
    .sort((a, b) => b.startedMs - a.startedMs)
}

/**
 * A run's times, in seconds: what was planned (its timed cards), how long it ran (every card), how
 * long its timed cards took, which is what is held against the plan, and how many cards were untimed.
 */
export function runTimes(s: DeckSession): { planned: number; ran: number; timed: number; untimed: number } {
  let planned = 0
  let ran = 0
  let timed = 0
  let untimed = 0
  for (const c of s.cards) {
    ran += c.seconds
    if (c.plannedSeconds === null) untimed++
    else {
      planned += c.plannedSeconds
      timed += c.seconds
    }
  }
  return { planned, ran, timed, untimed }
}

/** Within this many seconds of the plan is on time. */
export const ON_TIME_SECONDS = 10

/** "+1:20 over", "0:40 under" or "on time", in words as well as colour; nothing with no plan. */
export function difference(planned: number, actual: number): { text: string; over: boolean | null } {
  if (planned <= 0) return { text: '', over: null }
  const d = actual - planned
  if (Math.abs(d) < ON_TIME_SECONDS) return { text: 'on time', over: null }
  return d > 0 ? { text: `+${formatDuration(d)} over`, over: true } : { text: `${formatDuration(-d)} under`, over: false }
}

/** Decks' date ranges, then any two dates. */
export const RUN_RANGES = [...DATE_RANGES, { id: 'dates', label: 'Between dates' }] as const
export type RunRange = DateRange | 'dates'

export interface SessionFilters {
  /** Workspace ids; a run of a deck in any of them. None is no filter. */
  workspaces: readonly string[]
  /** Deck keys (`deckKey`); a run of any of them. */
  decks: readonly string[]
  range: RunRange
  /** With `dates`: the first and last day, `YYYY-MM-DD`, either '' for open. */
  from: string
  to: string
}

export const NO_SESSION_FILTERS: SessionFilters = { workspaces: [], decks: [], range: 'all', from: '', to: '' }

export const sessionFilterCount = (f: SessionFilters): number => f.workspaces.length + f.decks.length + (f.range !== 'all' ? 1 : 0)

/** Midnight at the start of a `YYYY-MM-DD` day, local time; NaN for anything else. */
const dayStart = (day: string): number => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00`).getTime() : NaN)

/** The runs the filters keep, in the order given. */
export function filterRuns(runs: readonly Run[], f: SessionFilters, now: number): Run[] {
  let from = 0
  let to = Infinity
  if (f.range === 'dates') {
    if (!Number.isNaN(dayStart(f.from))) from = dayStart(f.from)
    if (!Number.isNaN(dayStart(f.to))) to = new Date(dayStart(f.to)).setDate(new Date(dayStart(f.to)).getDate() + 1)
  } else from = rangeStart(f.range, now)
  return runs.filter(
    (r) =>
      (f.workspaces.length === 0 || r.deck.workspaces.some((w) => f.workspaces.includes(w))) &&
      (f.decks.length === 0 || f.decks.includes(deckKey(r.deck))) &&
      r.startedMs >= from &&
      r.startedMs < to,
  )
}

/** The runs by the day they started (Today, Yesterday, This week, …), keeping their order. */
export function groupRunsByDay(runs: readonly Run[], now: number): { label: string; runs: Run[] }[] {
  const groups: { label: string; runs: Run[] }[] = []
  for (const r of runs) {
    const label = dateGroup(r.startedMs, now)
    const last = groups.at(-1)
    if (last?.label === label) last.runs.push(r)
    else groups.push({ label, runs: [r] })
  }
  return groups
}
