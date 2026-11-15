// Recent, pins and favourites for quick notes and quick talks, kept in
// settings.json beside the favourite talks. Each names its file by path; a rename moves it with
// the file and a delete drops it. Kept under their own keys, so an older Oversay, which doesn't
// know them, keeps them untouched (Settings keeps unknown fields) rather than dropping them from
// its own list.
//
//   pins:            [{ kind, path, at, id? }]   a pin puts an item at the top of its own list (newest pin first)
//   quickFavourites: [{ kind, path, name }] starred notes and quick talks, newest first, on Favourites
//   opened:          [{ kind, path, at, id? }]   what was opened, newest first, for Recent
//
// A deck's entries also hold its id (ADR 0037): each time Decks is listed they find their
// deck by it and take its path, so a rename in Oversay or in Finder loses nothing.
//   quickSeen:       { notes, talks, decks: { known, fresh } }   the files Oversay has listed, and those that
//                    appeared since and haven't been opened: New (ADR 0034)

export const QUICK_ITEM_KINDS = ['note', 'talk', 'project', 'deck'] as const
export type QuickItemKind = (typeof QUICK_ITEM_KINDS)[number]

export interface Pin {
  kind: QuickItemKind
  path: string
  /** A deck's id, which finds it again when its path changes. */
  id?: string
  /** When it was pinned (ISO 8601): the newest pin goes first. */
  at: string
}

export interface QuickFavourite {
  /** `deck` since notes and talks became decks; a note or talk starred before then moved with its file. */
  kind: 'note' | 'talk' | 'deck'
  path: string
  /** A copy of its name, for when the file can't be read. */
  name: string
}

export interface Opened {
  kind: QuickItemKind
  path: string
  /** A deck's id, as on a pin. */
  id?: string
  at: string
}

/** How many Recent shows (John, 17 Oct). */
export const RECENT_SHOWN = 3
/** How many opened items are remembered per kind: a few more than Recent shows, for when some are deleted. */
export const OPENED_KEPT = 10

const isKind = (k: unknown): k is QuickItemKind => (QUICK_ITEM_KINDS as readonly unknown[]).includes(k)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** An entry as read, with an `id` kept only when it is a string. */
const withIdChecked = <T extends { id?: unknown }>(x: T): T => {
  if (x.id === undefined || typeof x.id === 'string') return x
  const { id: _id, ...rest } = x
  return rest as T
}

export function parsePins(value: unknown): Pin[] {
  if (!Array.isArray(value)) return []
  return value.filter((p): p is Pin => isObject(p) && isKind(p.kind) && typeof p.path === 'string' && typeof p.at === 'string').map(withIdChecked)
}

export function parseQuickFavourites(value: unknown): QuickFavourite[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (f): f is QuickFavourite => isObject(f) && (f.kind === 'note' || f.kind === 'talk' || f.kind === 'deck') && typeof f.path === 'string' && typeof f.name === 'string',
  )
}

export function parseOpened(value: unknown): Opened[] {
  if (!Array.isArray(value)) return []
  return value.filter((o): o is Opened => isObject(o) && isKind(o.kind) && typeof o.path === 'string' && typeof o.at === 'string').map(withIdChecked)
}

const same = (a: { kind: string; path: string }, b: { kind: string; path: string }) => a.kind === b.kind && a.path === b.path

export const isPinned = (pins: readonly Pin[], kind: QuickItemKind, path: string): boolean => pins.some((p) => same(p, { kind, path }))

/** Pins (as the newest pin) or unpins an item; a deck's pin keeps its id. */
export function withPin(pins: readonly Pin[], kind: QuickItemKind, path: string, on: boolean, at: string, id?: string): Pin[] {
  const rest = pins.filter((p) => !same(p, { kind, path }) && !(id && p.id === id))
  return on ? [{ kind, path, at, ...(id ? { id } : {}) }, ...rest] : rest
}

/**
 * Decks have pins, not favourites (John, 23 Oct): a deck or note starred before becomes a
 * pinned deck, once, and leaves the favourites; a starred quick talk stays. Null when there is none.
 */
export function starsAsPins(pins: readonly Pin[], favourites: readonly QuickFavourite[], at: string): { pins: Pin[]; quickFavourites: QuickFavourite[] } | null {
  const starred = favourites.filter((f) => f.kind === 'deck' || f.kind === 'note')
  if (starred.length === 0) return null
  let next = [...pins]
  for (const f of [...starred].reverse()) if (!next.some((p) => p.kind === 'deck' && p.path === f.path)) next = withPin(next, 'deck', f.path, true, at)
  return { pins: next, quickFavourites: favourites.filter((f) => !starred.includes(f)) }
}

export const isQuickFavourite = (list: readonly QuickFavourite[], kind: QuickFavourite['kind'], path: string): boolean =>
  list.some((f) => same(f, { kind, path }))

/** Stars an item (at the top, once) or takes it off Favourites. */
export function withQuickFavourite(list: readonly QuickFavourite[], favourite: QuickFavourite, on: boolean): QuickFavourite[] {
  const rest = list.filter((f) => !same(f, favourite))
  return on ? [favourite, ...rest] : rest
}

/** Remembers that an item was opened, newest first, keeping `OPENED_KEPT` of each kind; a deck's entry keeps its id. */
export function withOpened(list: readonly Opened[], kind: QuickItemKind, path: string, at: string, id?: string): Opened[] {
  const next = [{ kind, path, at, ...(id ? { id } : {}) }, ...list.filter((o) => !same(o, { kind, path }) && !(id && o.id === id))]
  const seen = new Map<string, number>()
  return next.filter((o) => {
    const n = (seen.get(o.kind) ?? 0) + 1
    seen.set(o.kind, n)
    return n <= OPENED_KEPT
  })
}

/** The list with `from` renamed to `to` (a renamed file); the same list when nothing had that path. */
export function withPathRenamed<T extends { path: string }>(list: readonly T[], from: string, to: string, name?: string): T[] {
  if (!list.some((x) => x.path === from)) return list as T[]
  return list.map((x) => (x.path === from ? { ...x, path: to, ...(name !== undefined && 'name' in x ? { name } : {}) } : x))
}

/** A listed deck, as `withDecksFollowed` matches it. */
export interface ListedDeck {
  path: string
  id: string
  name: string
}

/** `…/Decks/Weekly standup.md` → `Weekly standup`: the name a deck had as a lone file. */
const loneName = (path: string): string => (path.split(/[\\/]/).pop() ?? '').replace(/\.md$/i, '')

/**
 * The list with each deck's entry following its deck: found by its id, else by its path,
 * else (a deck saved before decks were folders) by its old file's name when one deck alone has it;
 * it takes the deck's path and id. An entry whose deck isn't listed stays as it is, for when it is
 * back; two entries that come to name one deck become one. The same list when nothing changed.
 */
export function withDecksFollowed<T extends { kind: string; path: string; id?: string }>(list: readonly T[], decks: readonly ListedDeck[]): T[] {
  const byId = new Map(decks.filter((d) => d.id).map((d) => [d.id, d]))
  const byPath = new Map(decks.map((d) => [d.path, d]))
  let changed = false
  const taken = new Set<string>()
  const next: T[] = []
  for (const entry of list) {
    if (entry.kind !== 'deck') {
      next.push(entry)
      continue
    }
    const named = decks.filter((d) => d.name === loneName(entry.path))
    const deck = (entry.id ? byId.get(entry.id) : undefined) ?? byPath.get(entry.path) ?? (named.length === 1 ? named[0] : undefined)
    if (!deck) {
      next.push(entry)
      continue
    }
    if (taken.has(deck.path)) {
      changed = true
      continue
    }
    taken.add(deck.path)
    const followed = deck.path === entry.path && (!deck.id || deck.id === entry.id) ? entry : { ...entry, path: deck.path, ...(deck.id ? { id: deck.id } : {}) }
    if (followed !== entry) changed = true
    next.push(followed)
  }
  return changed ? next : (list as T[])
}

/** The list without `path` (a deleted file). */
export const withoutPath = <T extends { path: string }>(list: readonly T[], path: string): T[] => list.filter((x) => x.path !== path)

/** The most recently opened items of `kind` that still exist, at most `RECENT_SHOWN`. */
export function recentOf<T extends { path: string }>(opened: readonly Opened[], kind: QuickItemKind, items: readonly T[]): T[] {
  const byPath = new Map(items.map((i) => [i.path, i]))
  return opened
    .filter((o) => o.kind === kind)
    .map((o) => byPath.get(o.path))
    .filter((i): i is T => i !== undefined)
    .slice(0, RECENT_SHOWN)
}

/** All items with the pinned ones first, newest pin first; the rest keep their order. Also how many are pinned. */
export function pinnedFirst<T extends { path: string }>(items: readonly T[], pins: readonly Pin[], kind: QuickItemKind): { items: T[]; pinned: number } {
  const order = new Map(pins.filter((p) => p.kind === kind).map((p, i) => [p.path, i]))
  const pinned = items.filter((i) => order.has(i.path)).sort((a, b) => order.get(a.path)! - order.get(b.path)!)
  return { items: [...pinned, ...items.filter((i) => !order.has(i.path))], pinned: pinned.length }
}

// ---- New: files that appeared outside Oversay and haven't been opened (#202, ADR 0034)

export const SEEN_KINDS = ['notes', 'talks', 'decks'] as const
export type SeenKind = (typeof SEEN_KINDS)[number]

export interface SeenFolder {
  /** Every file the folder held when Oversay last listed it. */
  known: string[]
  /** The ones that appeared since an earlier listing and haven't been opened yet, newest first. */
  fresh: string[]
}

export type QuickSeen = Partial<Record<SeenKind, SeenFolder>>

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function parseQuickSeen(value: unknown): QuickSeen {
  if (!isObject(value)) return {}
  const seen: QuickSeen = {}
  for (const kind of SEEN_KINDS) {
    const folder = value[kind]
    if (isObject(folder)) seen[kind] = { known: strings(folder.known), fresh: strings(folder.fresh) }
  }
  return seen
}

/**
 * The folder after a listing. The first listing only learns what is there, so nothing already
 * there is New; after that, a file Oversay hadn't listed is New until it is opened.
 */
export function withListed(seen: SeenFolder | undefined, listed: readonly string[]): SeenFolder {
  if (!seen) return { known: [...listed], fresh: [] }
  const added = listed.filter((p) => !seen.known.includes(p))
  return { known: [...listed], fresh: [...added, ...seen.fresh.filter((p) => listed.includes(p) && !added.includes(p))] }
}

/** A file Oversay made or renamed itself is known, never New. Before the first listing there is nothing to add to. */
export function withKnown(seen: SeenFolder | undefined, path: string): SeenFolder | undefined {
  if (!seen || seen.known.includes(path)) return seen
  return { ...seen, known: [...seen.known, path] }
}

/** A file was opened: no longer New. */
export function withoutFresh(seen: SeenFolder | undefined, path: string): SeenFolder | undefined {
  return seen && seen.fresh.includes(path) ? { ...seen, fresh: seen.fresh.filter((p) => p !== path) } : seen
}

export function seenRenamed(seen: SeenFolder | undefined, from: string, to: string): SeenFolder | undefined {
  const move = (list: string[]) => list.map((p) => (p === from ? to : p))
  return seen && { known: move(seen.known), fresh: move(seen.fresh) }
}

export const sameSeen = (a: SeenFolder | undefined, b: SeenFolder | undefined): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
