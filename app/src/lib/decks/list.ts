// The Decks list can hold many decks: it groups them by when they last changed and filters
// them by tags, audience, workspace (ADR 0040; the project line before it) and date range. Pure, so the page and its tests agree.

/** What the list needs of a deck to group and filter it. */
export interface Listed {
  modifiedMs: number
  audience: string
  /** The ids of the workspaces it is in (ADR 0040). */
  workspaces: readonly string[]
  tags: readonly string[]
}

export const DATE_RANGES = [
  { id: 'all', label: 'Any time' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'Last 3 months' },
] as const
export type DateRange = (typeof DATE_RANGES)[number]['id']

export interface DeckFilters {
  /** A deck with any of these tags (ignoring case); none is no filter. */
  tags: readonly string[]
  audience: string
  /** A workspace's id. */
  workspace: string
  range: DateRange
}

export const NO_FILTERS: DeckFilters = { tags: [], audience: '', workspace: '', range: 'all' }

export const isFiltered = (f: DeckFilters): boolean => f.tags.length > 0 || f.audience !== '' || f.workspace !== '' || f.range !== 'all'

const DAY = 86_400_000

/** Midnight at the start of `at`'s day, local time. */
const startOfDay = (at: number): number => {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Monday at midnight of `at`'s week, local time. */
const startOfWeek = (at: number): number => {
  const today = startOfDay(at)
  const fromMonday = (new Date(today).getDay() + 6) % 7
  return new Date(today).setDate(new Date(today).getDate() - fromMonday)
}

const startOfMonth = (at: number): number => {
  const d = new Date(startOfDay(at))
  d.setDate(1)
  return d.getTime()
}

/** The earliest change a date range keeps, or 0 for any time. */
export function rangeStart(range: DateRange, now: number): number {
  if (range === 'week') return startOfWeek(now)
  if (range === 'month') return startOfMonth(now)
  if (range === 'quarter') {
    const d = new Date(startOfDay(now))
    d.setMonth(d.getMonth() - 3)
    return d.getTime()
  }
  return 0
}

/** The decks the filters keep, in the order given. */
export function filterDecks<T extends Listed>(decks: readonly T[], f: DeckFilters, now: number): T[] {
  const tags = f.tags.map((t) => t.toLowerCase())
  const from = rangeStart(f.range, now)
  return decks.filter(
    (d) =>
      (tags.length === 0 || d.tags.some((t) => tags.includes(t.toLowerCase()))) &&
      (f.audience === '' || d.audience === f.audience) &&
      (f.workspace === '' || d.workspaces.includes(f.workspace)) &&
      d.modifiedMs >= from,
  )
}

/**
 * Every value in use for a filter, sorted, for its choices: tags (one each, ignoring case),
 * audiences, and the ids of the workspaces decks are in (the page names and orders those).
 */
export function filterChoices(decks: readonly Listed[]): { tags: string[]; audiences: string[]; workspaces: string[] } {
  const unique = (values: string[]) => {
    const seen = new Map<string, string>()
    for (const v of values) if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v)
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }
  return {
    tags: unique(decks.flatMap((d) => [...d.tags])),
    audiences: unique(decks.map((d) => d.audience)),
    workspaces: unique(decks.flatMap((d) => [...d.workspaces])),
  }
}

/**
 * The date group a deck falls in by when it last changed: Today, Yesterday, This week, Last week,
 * Earlier this month, then the month ("September 2026"). Later groups come first.
 */
export function dateGroup(modifiedMs: number, now: number): string {
  const today = startOfDay(now)
  if (modifiedMs >= today) return 'Today'
  if (modifiedMs >= today - DAY) return 'Yesterday'
  const week = startOfWeek(now)
  if (modifiedMs >= week) return 'This week'
  if (modifiedMs >= week - 7 * DAY) return 'Last week'
  if (modifiedMs >= startOfMonth(now)) return 'Earlier this month'
  return new Date(modifiedMs).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** The decks in date groups, newest first, each group's decks newest first. */
export function groupByDate<T extends Listed>(decks: readonly T[], now: number): { label: string; decks: T[] }[] {
  const groups: { label: string; decks: T[] }[] = []
  for (const d of [...decks].sort((a, b) => b.modifiedMs - a.modifiedMs)) {
    const label = dateGroup(d.modifiedMs, now)
    const last = groups.at(-1)
    if (last?.label === label) last.decks.push(d)
    else groups.push({ label, decks: [d] })
  }
  return groups
}
