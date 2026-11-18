// Making things from + New, the command bar and Home (epic 036 (#54)). Looking at a workspace, a new deck goes in it.
import { get } from 'svelte/store'
import { decks, newDeck } from '../lib/decks/store'
import { quickName } from '../lib/notes/files'
import { addDeckToWorkspace } from '../lib/workspaces/store'
import { goDeck, nav } from './route'

/** Puts the deck at `path`, just made, into workspace `id`; it is found by the id it was given when made. */
export async function putInWorkspace(path: string, id: string): Promise<void> {
  const made = (get(decks) ?? []).find((d) => d.path === path)
  if (!made?.id) throw new Error(`${quickName(path)} was made, but has no id yet to add it here; add it in a moment`)
  await addDeckToWorkspace(id, made.id)
}

/** A blank deck, in the workspace being looked at if there is one, opened in the editor. */
export async function newBlankDeck(workspace: string | undefined = get(nav).workspace): Promise<void> {
  const path = await newDeck()
  if (workspace) await putInWorkspace(path, workspace)
  goDeck(path)
}
