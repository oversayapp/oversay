// The way back from a page (John, 26 Oct): not above the page's
// heading but at the left of the search bar's row, lined up with the page's text, so it never
// pushes the page down. A page with a way back sets it while it is showing.
import { writable } from 'svelte/store'

export interface Back {
  /** Where it goes, in a word or a name: "Workspaces", "Decks", "About". */
  label: string
  go: () => void
  /** The page's width (its max-width, in px), so the way back lines up with the page's text. */
  width: number
  /** The page's side padding narrows to 16px below 760px, as Settings' does. */
  tight?: boolean
}

/** The way back from the page showing, or null when it has none. */
export const back = writable<Back | null>(null)

/** Shows `b` as the way back; returns what takes it away again (for a `$effect`'s cleanup). */
export function showBack(b: Back): () => void {
  back.set(b)
  return () => back.update((now) => (now === b ? null : now))
}
