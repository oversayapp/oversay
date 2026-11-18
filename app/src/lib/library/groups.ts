// The Library's smart groups (epic 036 (#54)): Recent, Pinned and This week list decks and workspaces
// together; Unsorted lists the decks in no workspace. Pure: the pane and its tests agree.

import type { DeckEntry } from '../decks/store'
import type { Opened, Pin } from '../settings/quick'
import type { Dated } from '../workspaces/navigation'
import type { Workspace } from '../workspaces/workspaces'

/** A deck or a workspace, as the Library lists them. */
export type LibraryRef = { kind: 'deck'; deck: DeckEntry; at: number } | { kind: 'workspace'; workspace: Workspace; at: number }

export interface GroupInput {
  decks: readonly DeckEntry[]
  workspaces: readonly Workspace[]
  /** Pinned decks and what was opened (settings.json). */
  pins: readonly Pin[]
  opened: readonly Opened[]
  /** Pinned and opened workspaces. */
  workspaceNav: { pins: readonly Dated[]; opened: readonly Dated[] }
  now: number
}

export interface LibraryGroups {
  recent: LibraryRef[]
  pinned: LibraryRef[]
  week: LibraryRef[]
  /** Decks in no workspace; empty while there is no workspace, since then every deck is in none. */
  unsorted: DeckEntry[]
}

/** How many Recent lists. */
export const RECENT_LISTED = 10
const WEEK_MS = 7 * 86400000

export function libraryGroups(i: GroupInput): LibraryGroups {
  const readable = i.decks.filter((d) => !d.unreadable)
  const byPath = new Map(readable.map((d) => [d.path, d]))
  const byId = new Map(readable.filter((d) => d.id).map((d) => [d.id, d]))
  const spaces = new Map(i.workspaces.filter((w) => w.id).map((w) => [w.id, w]))
  const time = (at: string) => Date.parse(at) || 0

  const decksOf = (list: readonly (Pin | Opened)[]): LibraryRef[] =>
    list.flatMap((x) => {
      if (x.kind !== 'deck') return []
      const deck = (x.id && byId.get(x.id)) || byPath.get(x.path)
      return deck ? [{ kind: 'deck' as const, deck, at: time(x.at) }] : []
    })
  const spacesOf = (list: readonly Dated[]): LibraryRef[] =>
    list.flatMap((x) => {
      const workspace = spaces.get(x.id)
      return workspace ? [{ kind: 'workspace' as const, workspace, at: time(x.at) }] : []
    })
  const newestFirst = (a: LibraryRef, b: LibraryRef) => b.at - a.at

  const recent = [...decksOf(i.opened), ...spacesOf(i.workspaceNav.opened)].sort(newestFirst).slice(0, RECENT_LISTED)
  const pinned = [...decksOf(i.pins), ...spacesOf(i.workspaceNav.pins)].sort(newestFirst)
  const week: LibraryRef[] = [
    ...readable.filter((d) => i.now - d.modifiedMs < WEEK_MS).map((deck) => ({ kind: 'deck' as const, deck, at: deck.modifiedMs })),
    ...spacesOf(i.workspaceNav.opened).filter((r) => i.now - r.at < WEEK_MS),
  ].sort(newestFirst)

  const filed = new Set(i.workspaces.flatMap((w) => w.decks))
  const unsorted = i.workspaces.length ? readable.filter((d) => !d.id || !filed.has(d.id)) : []
  return { recent, pinned, week, unsorted }
}
