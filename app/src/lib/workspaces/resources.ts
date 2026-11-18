// A workspace's resources (ADR 0046): the pure rules around them. Resources belong to the
// workspace only; the files themselves are in resources.rs and lib/decks/resources.ts.

import { invoke } from '@tauri-apps/api/core'
import { logAction } from '../log'
import { count } from '../words'
import type { Resource } from '../decks/resources'
import { workspacesWith, type Workspace } from './workspaces'

/** Where Add resource to workspace puts a deck's resource. */
export type AddTarget = { kind: 'to'; id: string } | { kind: 'ask'; ids: string[] } | { kind: 'none' }

/**
 * A deck in one workspace goes straight to it; in several, straight to the one it was opened from,
 * and it asks which only when opened from outside (the Library); in none, the deck is offered a
 * workspace first (John, 18 Nov).
 */
export function addResourceTarget(deckWorkspaces: readonly string[], openedFrom: string | null): AddTarget {
  if (deckWorkspaces.length === 0) return { kind: 'none' }
  if (deckWorkspaces.length === 1) return { kind: 'to', id: deckWorkspaces[0] }
  if (openedFrom && deckWorkspaces.includes(openedFrom)) return { kind: 'to', id: openedFrom }
  return { kind: 'ask', ids: [...deckWorkspaces] }
}

export type ResourceType = 'file' | 'link' | 'folder'
export type TypeFilter = 'all' | ResourceType

/** What the tab sorts a resource as: an alias is a file. */
export const resourceType = (r: Resource): ResourceType => (r.kind === 'link' ? 'link' : r.kind === 'folder' ? 'folder' : 'file')

/** The resources whose name has what was typed, of the type picked. */
export function filterResources(items: readonly Resource[], query: string, type: TypeFilter): Resource[] {
  const q = query.trim().toLowerCase()
  return items.filter((r) => (type === 'all' || resourceType(r) === type) && (q === '' || r.name.toLowerCase().includes(q)))
}

/** A deck and the workspaces it is in, for the move up (`DeckPlan` in resources_move.rs). */
export interface DeckPlan {
  deckPath: string
  workspaceIds: string[]
}

/** Every deck in at least one workspace, with those workspaces in the order they are listed. */
export function movePlan(decks: readonly { id: string; path: string }[], workspaces: readonly Workspace[]): DeckPlan[] {
  return decks.flatMap((d) => {
    const ids = d.id ? workspacesWith(workspaces, d.id).map((w) => w.id).filter(Boolean) : []
    return ids.length ? [{ deckPath: d.path, workspaceIds: ids }] : []
  })
}

export interface MoveSummary {
  files: number
  decks: number
}

export const movedNote = (s: MoveSummary): string =>
  `Moved ${count(s.files, 'resource')} from ${count(s.decks, 'deck')} up to ${s.decks === 1 ? 'its workspace' : 'their workspaces'}.`

/** Runs the one-time move (once only; Rust remembers). Returns what moved, or null when nothing did. */
export async function moveDeckResources(plan: readonly DeckPlan[]): Promise<MoveSummary | null> {
  const summary = await invoke<MoveSummary | null>('move_deck_resources', { plan })
  if (summary) logAction('resources moved up', `${summary.files} files from ${summary.decks} decks`)
  return summary
}

/** Undo for the note: every moved resource back in its deck. Returns how many. */
export async function undoResourcesMove(): Promise<number> {
  const back = await invoke<number>('undo_resources_move')
  logAction('resources move undone', String(back))
  return back
}
