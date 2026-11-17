// Workspaces in the manager (ADR 0040): the list Rust makes of Documents/Oversay/Workspaces, read
// again whenever it changes (by Oversay, the skill or Finder), and the changes the manager makes.
// Every change goes through Rust (workspaces.rs), which owns workspace.json.

import { invoke } from '@tauri-apps/api/core'
import { get, writable } from 'svelte/store'
import { logAction } from '../log'
import { changeWorkspaceNav, markProjectLinesMoved, settings } from '../settings/store'
import { retagged, withTagChanged, withoutWorkspace } from './navigation'
import { planProjectMove, type ProjectDeck } from './projects'
import { findWorkspace, parseWorkspaceResult, parseWorkspaces, tagCase, withDeck, withoutDeck, workspacesWith, type Workspace, type WorkspaceChange } from './workspaces'

/** Same name as `WORKSPACES_CHANGED_EVENT` in workspaces.rs; both sides test it. */
export const WORKSPACES_CHANGED_EVENT = 'workspaces-changed'

/** Every workspace, or null before the first load. */
export const workspaces = writable<Workspace[] | null>(null)

/** Reads the Workspaces folder again. */
export async function loadWorkspaces(): Promise<void> {
  workspaces.set(parseWorkspaces(await invoke<unknown>('list_workspaces')))
}

/** Makes a workspace and returns it. */
export async function createWorkspace(change: WorkspaceChange): Promise<Workspace> {
  const made = parseWorkspaceResult(await invoke<unknown>('create_workspace', { change }))
  logAction('new workspace', made.name)
  await loadWorkspaces()
  return made
}

/** Changes a workspace: its name (and folder), tags, decks, when, where or notes. */
export async function updateWorkspace(id: string, change: WorkspaceChange, action = 'change workspace'): Promise<Workspace> {
  const changed = parseWorkspaceResult(await invoke<unknown>('update_workspace', { id, change }))
  logAction(action, changed.name)
  await loadWorkspaces()
  return changed
}

/** Moves a workspace and its resources to the Trash; its decks stay in Decks. */
export async function deleteWorkspace(id: string): Promise<void> {
  logAction('delete workspace', findWorkspace(get(workspaces) ?? [], id)?.name ?? id)
  await invoke('trash_workspace', { id })
  await loadWorkspaces()
  await changeWorkspaceNav((nav) => withoutWorkspace(nav, id)).catch(() => {})
}

// ---- tags

/**
 * Renames a tag on every workspace that has it, merging it into `to` where that is a tag already,
 * or takes it off them when `to` is null; the workspaces stay. Each is read again first.
 */
export async function changeTag(from: string, to: string | null): Promise<void> {
  const next = (to && tagCase(to)) || null
  logAction(next ? 'rename tag' : 'delete tag', next ? `${from} → ${next}` : from)
  await loadWorkspaces()
  for (const w of get(workspaces) ?? []) {
    if (w.problem || !w.id || !w.tags.some((t) => t.toLowerCase() === from.toLowerCase())) continue
    const tags = retagged(w.tags, from, next)
    const changed = parseWorkspaceResult(await invoke<unknown>('update_workspace', { id: w.id, change: { tags } }))
    logAction('workspace tags', changed.name)
  }
  await loadWorkspaces()
  await changeWorkspaceNav((nav) => withTagChanged(nav, from, next))
}

// ---- decks in workspaces

/** The workspace's decks as they are now, read again first so a change from Finder isn't undone. */
async function decksNow(id: string): Promise<string[]> {
  await loadWorkspaces()
  const w = findWorkspace(get(workspaces) ?? [], id)
  if (!w) throw new Error('That workspace is no longer there')
  return w.decks
}

/** Adds a deck to the end of a workspace, unless it is in it already. */
export async function addDeckToWorkspace(id: string, deckId: string): Promise<void> {
  if (!deckId) throw new Error('This deck has no id yet; try again in a moment')
  await updateWorkspace(id, { decks: withDeck(await decksNow(id), deckId) }, 'add deck to workspace')
}

/** Takes a deck out of one workspace; it stays in Decks and any other workspace. */
export async function removeDeckFromWorkspace(id: string, deckId: string): Promise<void> {
  await updateWorkspace(id, { decks: withoutDeck(await decksNow(id), deckId) }, 'remove deck from workspace')
}

/** Puts a workspace's decks in a new order. */
export async function reorderWorkspace(id: string, decks: string[]): Promise<void> {
  await updateWorkspace(id, { decks }, 'reorder workspace')
}

/** Takes a deck moved to the Trash out of every workspace it was in. */
export async function forgetDeck(deckId: string): Promise<void> {
  if (!deckId) return
  await loadWorkspaces()
  for (const w of workspacesWith(get(workspaces) ?? [], deckId)) {
    if (!w.problem) await updateWorkspace(w.id, { decks: withoutDeck(w.decks, deckId) }, 'remove trashed deck from workspace')
  }
}

// ---- project lines (task 278)

/**
 * Once: every deck with a `project:` line is added to a workspace of that name, tagged
 * `projects`, made if needed. Returns how many decks were added; a deck still without an id
 * leaves it to run again on the next start.
 */
export async function moveProjectLines(decks: readonly ProjectDeck[]): Promise<number> {
  if (get(settings).projectLinesMoved) return 0
  await loadWorkspaces()
  const plan = planProjectMove(decks, get(workspaces) ?? [])
  let added = 0
  for (const move of plan.moves) {
    const before = move.existing ? (findWorkspace(get(workspaces) ?? [], move.existing)?.decks.length ?? 0) : 0
    if (move.existing) await invoke('update_workspace', { id: move.existing, change: { decks: move.decks } })
    else await invoke('create_workspace', { change: { name: move.name, tags: [move.tag], decks: move.decks } })
    added += move.decks.length - before
  }
  if (plan.moves.length) logAction('project lines moved', `${added} decks into ${plan.moves.length} workspaces`)
  await loadWorkspaces()
  if (!plan.waiting) await markProjectLinesMoved()
  return added
}
