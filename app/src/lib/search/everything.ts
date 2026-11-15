// One search for the whole app (John, 24 Oct): not tied to the page you are on, it finds
// decks, workspaces (ADR 0040), sessions by their deck (ADR 0041), templates, Settings sections and
// pages, and the bar takes you to the one chosen.
// Pure, so the bar and its tests agree.

export const SEARCH_KINDS = [
  { kind: 'deck', label: 'Decks' },
  { kind: 'workspace', label: 'Workspaces' },
  { kind: 'session', label: 'Sessions' },
  { kind: 'template', label: 'Templates' },
  { kind: 'setting', label: 'Settings' },
  { kind: 'page', label: 'Pages' },
] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]['kind']

export interface Searchable {
  kind: SearchKind
  /** What choosing it opens: a deck's path, a workspace's id, a session's deck path and start, a template's or section's id. */
  id: string
  label: string
  /** Other words it is found by (a deck's audience, tags and workspaces; a workspace's tags), shown under it. */
  terms: readonly string[]
}

/** The most of one kind the list shows. */
export const PER_KIND = 5

/**
 * How well `query` matches: the name starting with it (4), a word in the name starting with it (3),
 * the name holding it anywhere (2), another term holding it (1), or not at all (0).
 */
export function matchScore(query: string, label: string, terms: readonly string[]): number {
  const q = query.trim().toLowerCase()
  const name = label.toLowerCase()
  if (!q) return 0
  if (name.startsWith(q)) return 4
  if (name.split(/[\s\-_·]+/).some((w) => w.startsWith(q))) return 3
  if (name.includes(q)) return 2
  return terms.some((t) => t.toLowerCase().includes(q)) ? 1 : 0
}

/** What matches, grouped by kind in a fixed order, best first in each (then by name), at most PER_KIND each. */
export function searchEverything(query: string, items: readonly Searchable[]): { kind: SearchKind; label: string; items: Searchable[] }[] {
  if (!query.trim()) return []
  const scored = items.map((item) => ({ item, score: matchScore(query, item.label, item.terms) })).filter((s) => s.score > 0)
  return SEARCH_KINDS.map(({ kind, label }) => ({
    kind,
    label,
    items: scored
      .filter((s) => s.item.kind === kind)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
      .slice(0, PER_KIND)
      .map((s) => s.item),
  })).filter((g) => g.items.length > 0)
}
