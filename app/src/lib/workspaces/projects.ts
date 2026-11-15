// A deck's `project:` line gives way to workspaces (ADR 0040): once, each deck with one is
// added to a workspace of that name, tagged `projects`, made if needed. The line is then left in
// the deck as written, unused. Pure, so the move and its tests agree; store.ts carries it out.

import { withDeck, type Workspace } from './workspaces'

/** The tag a workspace made from project lines gets. */
export const PROJECT_TAG = 'projects'

/** What a deck brings to the move. */
export interface ProjectDeck {
  id: string
  project: string
}

export interface ProjectMove {
  /** The workspace's name, as the first deck with it wrote it. */
  name: string
  /** The tag a new workspace gets. */
  tag: string
  /** The workspace of that name already there, or null to make one. */
  existing: string | null
  /** Its decks after the move: the ones it had, then the new ones, in the order given. */
  decks: string[]
}

export interface ProjectPlan {
  moves: ProjectMove[]
  /** Some deck with a project line has no id yet, so the move must run again once it has. */
  waiting: boolean
}

/** What moving every deck's `project:` line into a workspace takes. */
export function planProjectMove(decks: readonly ProjectDeck[], workspaces: readonly Workspace[]): ProjectPlan {
  const moves = new Map<string, ProjectMove>()
  let waiting = false
  for (const d of decks) {
    const name = d.project.trim()
    if (!name) continue
    if (!d.id) {
      waiting = true
      continue
    }
    const key = name.toLowerCase()
    let move = moves.get(key)
    if (!move) {
      const found = workspaces.find((w) => w.name.toLowerCase() === key && w.id && !w.problem) ?? null
      move = { name: found?.name ?? name, tag: PROJECT_TAG, existing: found?.id ?? null, decks: [...(found?.decks ?? [])] }
      moves.set(key, move)
    }
    move.decks = withDeck(move.decks, d.id)
  }
  return { moves: [...moves.values()], waiting }
}
