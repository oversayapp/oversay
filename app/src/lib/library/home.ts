// What Home shows (epic 036 (#54)): a few things, however much there is in the Library: where you left
// off, a handful of Recent and Pinned, and on a first run nothing but the welcome. Pure.
import type { LibraryGroups, LibraryRef } from './groups'

/** The most tiles Recent or Pinned shows on Home. */
export const HOME_TILES = 4

export interface HomeSections {
  /** The deck last opened: Pick up where you left off. */
  pickUp: LibraryRef | null
  recent: LibraryRef[]
  pinned: LibraryRef[]
  /** One deck and no workspace: a nudge to make a first workspace. */
  nudge: boolean
}

const keyOf = (r: LibraryRef) => (r.kind === 'deck' ? `d:${r.deck.path}` : `w:${r.workspace.id}`)

export function homeSections(groups: Pick<LibraryGroups, 'recent' | 'pinned'>, count: { decks: number; workspaces: number }): HomeSections {
  const pickUp = groups.recent.find((r) => r.kind === 'deck') ?? null
  const pinned = groups.pinned.slice(0, HOME_TILES)
  const shownPinned = new Set(pinned.map(keyOf))
  const recent = groups.recent.filter((r) => r !== pickUp && !shownPinned.has(keyOf(r))).slice(0, HOME_TILES)
  return { pickUp, recent, pinned, nudge: count.decks === 1 && count.workspaces === 0 }
}
