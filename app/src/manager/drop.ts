// Notes from any chat: a note file dropped anywhere on the window, or Markdown pasted as a
// note on the Decks page, becomes a deck. What was added is shown in a banner on Decks, with Undo.
import { get, writable } from 'svelte/store'
import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { fileName, nameForPasted, planDrop, type DropPlan } from '../lib/notes/drop'
import { importNote, quickName, trashQuickFile } from '../lib/notes/files'
import { createDeck, loadDecks } from '../lib/decks/store'
import { addResources, type ResourceOwner } from '../lib/decks/resources'
import { logAction } from '../lib/log'
import { session } from '../lib/session/store'
import { forgetQuickPath } from '../lib/settings/store'
import { showBlockedBy } from '../lib/notes/show'
import { attempt, notice } from './errors'
import { goLibrary, nav } from './route'
import { openNote } from '../lib/notes/store'
import { parseNoteDoc } from '../lib/notes/format'
import { deckId } from '../lib/decks/deck'
import { workspaces } from '../lib/workspaces/store'
import { findWorkspace, workspacesWith } from '../lib/workspaces/workspaces'
import { addResourceTarget } from '../lib/workspaces/resources'

/** Files being dragged over the window, or null. */
export const dropOver = writable<DropPlan | null>(null)

export interface Added {
  /** The notes made. */
  paths: string[]
  /** Names that were taken, so the note got another: [asked for, got]. */
  renamed: [string, string][]
}

/** What the last drop or paste added, for the banner on Notes; null once closed or undone. */
export const added = writable<Added | null>(null)

/** Counts the drops that added to a workspace's resources, so its page lists them again. */
export const resourcesChanged = writable(0)

/**
 * The workspace whose resources a drop adds to (ADR 0046): the workspace open on its page, or, on
 * a deck open in the editor, the workspace Add resource to workspace would choose; null elsewhere,
 * and for a deck that has to be asked which.
 */
export function dropOwner(): ResourceOwner | null {
  const n = get(nav)
  if (n.view !== 'library') return null
  if (!n.deck) return n.workspace ? { workspace: n.workspace } : null
  const open = get(openNote)
  const id = open && open.path === n.deck ? deckId(parseNoteDoc(open.text)) : ''
  const target = addResourceTarget(id ? workspacesWith(get(workspaces) ?? [], id).map((w) => w.id) : [], n.workspace ?? null)
  return target.kind === 'to' ? { workspace: target.id } : null
}

/** The name of the workspace a drop on `owner` adds to, for the veil. */
export const dropTargetName = (owner: ResourceOwner): string =>
  ('workspace' in owner && findWorkspace(get(workspaces) ?? [], owner.workspace)?.name) || 'this workspace'

/** A transcript dropped on a session's page (ADR 0041): the page lines it up with the session. */
export const transcriptDropped = writable<string | null>(null)

/** On a session's page, a dropped file is its transcript. */
export const onSessionPage = (): boolean => get(nav).view === 'sessions' && !!get(nav).session

/** Nothing is added while a talk or a note is on screen. */
export const dropBlocked = () => (showBlockedBy(get(session)) ? 'End the session to add notes' : null)

export function handleDrop(paths: readonly string[]): void {
  dropOver.set(null)
  if (onSessionPage()) {
    logAction('drop', 'transcript')
    transcriptDropped.set(paths[0] ?? null)
    return
  }
  // On a workspace's page (or a deck with one workspace to go to), any file is one of its resources: copied into its resources folder.
  const owner = dropOwner()
  if (owner) {
    attempt(async () => {
      const said = await addResources(owner, paths, dropTargetName(owner))
      resourcesChanged.update((n) => n + 1)
      if (said) notice.set(said)
    })
    return
  }
  const blocked = dropBlocked()
  if (blocked) {
    notice.set(`${blocked}.`)
    return
  }
  const plan = planDrop(paths)
  logAction('drop', `${plan.notes.length} notes, ${plan.left.length} left out`)
  if (plan.notes.length === 0) {
    notice.set(`Oversay can only add notes (.md files): ${plan.left.map((l) => fileName(l.path)).join(', ')}.`)
    return
  }
  attempt(async () => {
    const made: string[] = []
    const renamed: [string, string][] = []
    for (const path of plan.notes) {
      const to = await importNote(path)
      made.push(to)
      const asked = fileName(path).replace(/\.md$/i, '')
      if (quickName(to) !== asked) renamed.push([asked, quickName(to)])
    }
    await loadDecks()
    added.set({ paths: made, renamed })
    goLibrary('all')
  })
}

/** New deck from clipboard (it was Paste as deck): Markdown on the clipboard becomes a deck (it was Paste as note). */
export function pasteAsNote(): void {
  attempt(async () => {
    const text = (await readText().catch(() => '')) ?? ''
    if (text.trim() === '') {
      notice.set('The clipboard has no text to make a note from.')
      return
    }
    const name = nameForPasted(text)
    logAction('paste as note')
    const path = await createDeck(name, text.endsWith('\n') ? text : text + '\n')
    await loadDecks()
    // Named as asked: two decks may share a name (ADR 0037).
    added.set({ paths: [path], renamed: [] })
  })
}

/** Moves what the last drop or paste added to the Trash. */
export function undoAdded(): void {
  const last = get(added)
  if (!last) return
  logAction('undo added notes', String(last.paths.length))
  attempt(async () => {
    for (const path of last.paths) {
      await trashQuickFile('decks', path)
      await forgetQuickPath(path)
    }
    added.set(null)
    await loadDecks()
  })
}
