// Making things from + New, the command bar and Home (epic 036 (#54)). Looking at a workspace, a new deck goes in it.
import { get, writable } from 'svelte/store'
import { decks, newDeck, type DeckEntry } from '../lib/decks/store'
import { showDeckOnScreen } from '../lib/decks/show'
import { quickName, readQuickFile } from '../lib/notes/files'
import { parseNoteDoc } from '../lib/notes/format'
import { addDeckToWorkspace, createWorkspace } from '../lib/workspaces/store'
import type { WorkspaceChange } from '../lib/workspaces/workspaces'
import { goDeck, goWorkspace, nav } from './route'

/** + New and ⌘N ask the command bar to open on what you can make; each ask counts one. */
export const makeRequest = writable(0)
export const askToMake = () => makeRequest.update((n) => n + 1)

/** The New workspace dialog: open, and the name typed in the bar for it. */
export const workspaceDialog = writable<{ open: boolean; name: string }>({ open: false, name: '' })
export const openWorkspaceDialog = (name = '') => workspaceDialog.set({ open: true, name })
export const closeWorkspaceDialog = () => workspaceDialog.set({ open: false, name: '' })

/** Makes the workspace and opens it. */
export async function makeWorkspace(change: WorkspaceChange): Promise<void> {
  const made = await createWorkspace(change)
  closeWorkspaceDialog()
  goWorkspace(made.id)
}

/** Shows the deck on screen, as its Show button does. */
export async function showDeckEntry(d: DeckEntry): Promise<void> {
  await showDeckOnScreen(parseNoteDoc(await readQuickFile('decks', d.path)), d.name, d.path)
}

/** Puts the deck at `path`, just made, into workspace `id`; it is found by the id it was given when made. */
export async function putInWorkspace(path: string, id: string): Promise<void> {
  const made = (get(decks) ?? []).find((d) => d.path === path)
  if (!made?.id) throw new Error(`${quickName(path)} was made, but has no id yet to add it here; add it in a moment`)
  await addDeckToWorkspace(id, made.id)
}

/** A blank deck, in the workspace being looked at if there is one, opened in the editor. */
export async function newBlankDeck(workspace: string | undefined = get(nav).workspace, name?: string): Promise<void> {
  const path = await newDeck(name)
  if (workspace) await putInWorkspace(path, workspace)
  goDeck(path)
}
