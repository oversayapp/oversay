// Browsing every run on Sessions (ADR 0048, spec §11; design: sessions-v2 option 3, "Filters over one
// list"): the runs a person's chips keep (workspace, deck, status, when), how they are grouped, the
// stats and trend of one deck, and the saved views that name a set of chips. Pure, so the page and its
// tests agree. Nothing here is stored in `sessions.json`: what a run has (a note, a transcript, a
// recording, a review) is read from the deck's folder, and "Needs a review" is derived from it.

import { sessionName, type DeckSession } from '../decks/sessions'
import { dateGroup, rangeStart } from '../decks/list'
import { runTimes, type Run } from './runs'

// ---- What a run has

/** What has been written about, or kept for, a run. */
export interface Marks {
  note: boolean
  transcript: boolean
  /** A recording that has not been transcribed yet. */
  recording: boolean
  review: boolean
}

/** The files a deck keeps about its sessions, by session name (lib/decks/sessions.ts). */
export interface SessionFileNames {
  transcripts: readonly string[]
  reviews: readonly string[]
  recordings: readonly string[]
}

/** A run and what it has. */
export interface MarkedRun extends Run {
  marks: Marks
  /** Under a minute, or fewer than half its cards reached: likely a check, not a real run. */
  test: boolean
  /** A note or a transcript, no review yet, and not a test run: what a review is for. */
  needsReview: boolean
}

/** Shorter than this, in seconds, is a test run. */
export const TEST_RUN_SECONDS = 60

/** A run that was stopped almost at once, or left most of its cards unseen: probably a try, not a run. */
export function isTestRun(s: DeckSession): boolean {
  const { ran } = runTimes(s)
  if (ran < TEST_RUN_SECONDS) return true
  const reached = s.cards.filter((c) => c.seconds > 0).length
  return s.cards.length > 0 && reached * 2 < s.cards.length
}

/** Marks every run with what its deck's folder holds for it. `files` is each deck's file names, by its path. */
export function markRuns(
  runs: readonly Run[],
  files: (deckPath: string) => { sessions: readonly DeckSession[]; files: SessionFileNames } | undefined,
): MarkedRun[] {
  return runs.map((r) => {
    const own = files(r.deck.path)
    const name = own ? sessionName(own.sessions, r.session) : ''
    const has = (list: readonly string[] | undefined) => !!name && !!list?.includes(name)
    const marks: Marks = {
      note: !!r.session.note?.trim(),
      transcript: has(own?.files.transcripts),
      recording: has(own?.files.recordings),
      review: has(own?.files.reviews),
    }
    const test = isTestRun(r.session)
    return { ...r, marks, test, needsReview: !test && (marks.note || marks.transcript) && !marks.review }
  })
}

// ---- Filters

export const STATUSES = [
  { id: 'review', label: 'Needs a review' },
  { id: 'ready', label: 'Review ready' },
  { id: 'rec', label: 'Has recording' },
  { id: 'nonote', label: 'No note' },
] as const
export type StatusKey = (typeof STATUSES)[number]['id']

export const WHENS = [
  { id: 'any', label: 'Any time' },
  { id: 'week', label: 'This week' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 3 months' },
] as const
export type WhenKey = (typeof WHENS)[number]['id']

export interface BrowseFilters {
  /** Workspace ids: a deck in any of them. */
  workspaces: readonly string[]
  /** Deck keys (`deckKey`). */
  decks: readonly string[]
  /** A run with any of these. */
  status: readonly StatusKey[]
  when: WhenKey
}

export const NO_BROWSE: BrowseFilters = { workspaces: [], decks: [], status: [], when: 'any' }

export const browseFilterCount = (f: BrowseFilters): number => f.workspaces.length + f.decks.length + f.status.length + (f.when !== 'any' ? 1 : 0)

const DAY = 86_400_000

/** The earliest start a When choice keeps. "This week" is Monday on, as Decks groups it. */
export function whenStart(when: WhenKey, now: number): number {
  if (when === 'week') return rangeStart('week', now)
  if (when === '30') return now - 30 * DAY
  if (when === '90') return rangeStart('quarter', now)
  return 0
}

const hasStatus = (r: MarkedRun, k: StatusKey): boolean =>
  k === 'review' ? r.needsReview : k === 'ready' ? r.marks.review : k === 'rec' ? r.marks.recording : !r.marks.note && !r.test

/** The runs the filters keep, in the order given. */
export function filterMarked(runs: readonly MarkedRun[], f: BrowseFilters, now: number): MarkedRun[] {
  const from = whenStart(f.when, now)
  return runs.filter(
    (r) =>
      (f.workspaces.length === 0 || r.deck.workspaces.some((w) => f.workspaces.includes(w))) &&
      (f.decks.length === 0 || f.decks.includes(r.deck.id || r.deck.path)) &&
      (f.status.length === 0 || f.status.some((k) => hasStatus(r, k))) &&
      r.startedMs >= from,
  )
}

/** A choice for the Deck chip: every readable deck, run or not, so a deck never run can be looked at. */
export interface DeckChoice {
  key: string
  name: string
  workspaces: readonly string[]
  runs: number
}

/** The decks to choose from, scoped to the chosen workspaces and to what was typed, A-Z, at most `max`. */
export function deckChoices(all: readonly DeckChoice[], workspaces: readonly string[], query: string, max = 40): { shown: DeckChoice[]; total: number } {
  const q = query.trim().toLowerCase()
  const list = all
    .filter((d) => (workspaces.length === 0 || d.workspaces.some((w) => workspaces.includes(w))) && (!q || d.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return { shown: list.slice(0, max), total: list.length }
}

/**
 * Taking a workspace off the filters leaves a chosen deck that is no longer in any chosen workspace
 * out of place; keep the decks that are still in one, or all of them when no workspace is chosen.
 */
export function decksInScope(decks: readonly string[], all: readonly DeckChoice[], workspaces: readonly string[]): string[] {
  if (workspaces.length === 0) return [...decks]
  return decks.filter((k) => all.find((d) => d.key === k)?.workspaces.some((w) => workspaces.includes(w)))
}

// ---- Grouping

export const GROUPS = [
  { id: 'recent', label: 'Recent first' },
  { id: 'day', label: 'Day' },
  { id: 'month', label: 'Month' },
  { id: 'deck', label: 'Deck' },
  { id: 'none', label: 'None' },
] as const
export type GroupMode = (typeof GROUPS)[number]['id']

const groupLabel = (r: MarkedRun, mode: GroupMode, now: number): string => {
  if (mode === 'none') return ''
  if (mode === 'deck') return r.deck.name
  const d = new Date(r.startedMs)
  if (mode === 'day') return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
  if (mode === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return dateGroup(r.startedMs, now)
}

export interface RunGroup {
  label: string
  /** How many runs the group has in all, shown or not. */
  total: number
  runs: MarkedRun[]
}

/** A page of runs in groups: `limit` runs in all, a group's `total` counting those not shown yet. */
export function groupMarked(runs: readonly MarkedRun[], mode: GroupMode, now: number, limit: number): { groups: RunGroup[]; hidden: number } {
  const all = new Map<string, MarkedRun[]>()
  for (const r of runs) {
    const label = groupLabel(r, mode, now)
    const list = all.get(label)
    if (list) list.push(r)
    else all.set(label, [r])
  }
  const groups: RunGroup[] = []
  let left = limit
  for (const [label, list] of all) {
    if (left <= 0) break
    groups.push({ label, total: list.length, runs: list.slice(0, left) })
    left -= list.length
  }
  return { groups, hidden: Math.max(0, runs.length - limit) }
}

/** How many more runs "Show more" brings. */
export const PAGE_RUNS = 30

// ---- How a run went, for the row

export interface BarShape {
  /** Where the plan ends, as a percentage of the bar; null with no plan. */
  tick: number | null
  /** How much of the bar is ran time within the plan. */
  fill: number
  /** Where overtime starts and how wide it is (hatched); 0 wide when on plan or under. */
  over: { from: number; width: number }
}

/** Untimed runs fill their bar at this many seconds. */
const UNTIMED_FULL = 30 * 60

/** The run as one bar: the plan as a tick, the time over it hatched. Longer of the two fills the bar. */
export function barShape(planned: number, timed: number, ran: number): BarShape {
  if (planned <= 0) return { tick: null, fill: Math.min(100, (ran / UNTIMED_FULL) * 100), over: { from: 0, width: 0 } }
  const longest = Math.max(planned, timed) || 1
  const tick = (planned / longest) * 100
  const end = (timed / longest) * 100
  return { tick, fill: Math.min(tick, end), over: end > tick ? { from: tick, width: end - tick } : { from: 0, width: 0 } }
}

// ---- One deck: stats and trend

export interface DeckStats {
  runs: number
  /** When the newest run started, or null. */
  lastMs: number | null
  /** On average this many seconds over (+) or under (-) plan across its timed runs; null when none was timed. */
  average: number | null
  toReview: number
}

export function deckStats(runs: readonly MarkedRun[]): DeckStats {
  const real = runs.filter((r) => !r.test)
  const diffs = real.map((r) => runTimes(r.session)).filter((t) => t.planned > 0).map((t) => t.timed - t.planned)
  return {
    runs: runs.length,
    lastMs: runs.length ? Math.max(...runs.map((r) => r.startedMs)) : null,
    average: diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null,
    toReview: runs.filter((r) => r.needsReview).length,
  }
}

export interface TrendPoint {
  startedAt: string
  startedMs: number
  planned: number
  /** Timed cards' time, held against the plan; the whole run's time when the deck is untimed. */
  ran: number
}

/** The last `max` real runs of a deck, oldest first, for the planned-against-actual trend. */
export function trendPoints(runs: readonly MarkedRun[], max = 12): TrendPoint[] {
  return runs
    .filter((r) => !r.test)
    .slice(0, max)
    .map((r) => {
      const t = runTimes(r.session)
      return { startedAt: r.session.startedAt, startedMs: r.startedMs, planned: t.planned, ran: t.planned > 0 ? t.timed : t.ran }
    })
    .reverse()
}

/** One sentence under the trend: how the first and latest runs compare with the plan. */
export function trendCaption(points: readonly TrendPoint[], mmss: (s: number) => string): string {
  if (points.length < 2) return ''
  const first = points[0]
  const last = points[points.length - 1]
  if (last.planned <= 0) return `Runs took ${mmss(Math.min(...points.map((p) => p.ran)))} to ${mmss(Math.max(...points.map((p) => p.ran)))}. This deck is untimed, so there is no plan to compare.`
  const say = (p: TrendPoint) => {
    const d = p.ran - p.planned
    return Math.abs(d) < 10 ? `${mmss(p.ran)} (on time)` : `${mmss(p.ran)} (${d > 0 ? '+' : '-'}${mmss(Math.abs(d))} ${d > 0 ? 'over' : 'under'})`
  }
  const before = Math.abs(first.ran - first.planned)
  const after = Math.abs(last.ran - last.planned)
  const verdict = after < before ? 'Getting closer to plan.' : after > before ? 'Drifting from plan.' : 'About the same.'
  return `First run ${say(first)}, latest ${say(last)}. ${verdict}`
}
