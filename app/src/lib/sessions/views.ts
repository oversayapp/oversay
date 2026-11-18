// Saved views on Sessions (ADR 0048): a person's own named sets of filters, kept in app settings
// (`sessionViews`), never in `sessions.json`. They follow the three ready-made tabs, All, This week
// and Needs a review. Parsed leniently, like the other settings lists.

import { STATUSES, WHENS, browseFilterCount, type BrowseFilters, type StatusKey, type WhenKey } from './browse'

export interface SavedView {
  id: string
  name: string
  filters: BrowseFilters
}

/**
 * The ready-made tabs. Written out rather than built from NO_BROWSE: this file is reached from the settings
 * store, which browse.ts reaches through the deck code, so a constant taken from browse.ts is not there yet.
 */
export const BUILT_IN_VIEWS: readonly { id: string; name: string; filters: BrowseFilters }[] = [
  { id: 'all', name: 'All', filters: { workspaces: [], decks: [], status: [], when: 'any' } },
  { id: 'week', name: 'This week', filters: { workspaces: [], decks: [], status: [], when: 'week' } },
  { id: 'review', name: 'Needs a review', filters: { workspaces: [], decks: [], status: ['review'], when: 'any' } },
]

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** The saved views in settings: anything unreadable is dropped, unknown statuses and times too. */
export function parseSessionViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const views: SavedView[] = []
  for (const v of value) {
    if (typeof v !== 'object' || v === null) continue
    const { id, name, filters } = v as { id?: unknown; name?: unknown; filters?: Record<string, unknown> }
    if (typeof id !== 'string' || !id || seen.has(id) || typeof name !== 'string' || !name.trim() || typeof filters !== 'object' || filters === null) continue
    seen.add(id)
    const status = strings(filters.status).filter((s): s is StatusKey => STATUSES.some((x) => x.id === s))
    const when = WHENS.find((w) => w.id === filters.when)?.id ?? 'any'
    views.push({ id, name: name.trim(), filters: { workspaces: strings(filters.workspaces), decks: strings(filters.decks), status, when: when as WhenKey } })
  }
  return views
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n')

/** The same chips, whatever their order. */
export const sameFilters = (a: BrowseFilters, b: BrowseFilters): boolean =>
  a.when === b.when && same(a.workspaces, b.workspaces) && same(a.decks, b.decks) && same(a.status, b.status)

/** The tab the chips are exactly, a ready-made one before a saved one; null when they match none. */
export function tabFor(filters: BrowseFilters, saved: readonly SavedView[]): { id: string; name: string } | null {
  return [...BUILT_IN_VIEWS, ...saved].find((v) => sameFilters(v.filters, filters)) ?? null
}

/** "+ Save this view" shows only when chips are on that match no tab. */
export const canSaveView = (filters: BrowseFilters, saved: readonly SavedView[]): boolean => browseFilterCount(filters) > 0 && tabFor(filters, saved) === null

/** A name to start from: the chips in words ("Atlas, Weekly standup · Needs a review · This week"). */
export function suggestedName(filters: BrowseFilters, names: { workspace: (id: string) => string; deck: (key: string) => string }): string {
  const parts = [
    ...filters.workspaces.map(names.workspace),
    ...filters.decks.map(names.deck),
    ...filters.status.map((s) => STATUSES.find((x) => x.id === s)?.label ?? s),
    ...(filters.when !== 'any' ? [WHENS.find((w) => w.id === filters.when)?.label ?? ''] : []),
  ]
  return parts.filter(Boolean).join(' · ').slice(0, 60)
}

/** A view added after the others; named as given (blank is not added); a name already used gets a number. */
export function withView(views: readonly SavedView[], name: string, filters: BrowseFilters, id: string): SavedView[] {
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) return [...views]
  const taken = new Set([...BUILT_IN_VIEWS, ...views].map((v) => v.name.toLowerCase()))
  let unique = trimmed
  for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${trimmed} ${n}`
  return [...views, { id, name: unique, filters: { workspaces: [...filters.workspaces], decks: [...filters.decks], status: [...filters.status], when: filters.when } }]
}

export const withoutView = (views: readonly SavedView[], id: string): SavedView[] => views.filter((v) => v.id !== id)
