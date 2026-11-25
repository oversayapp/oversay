// The open deck's own undo and redo (ADR 0052): each step is the file's whole text before and
// after, and where the editor was. It never merges: the store drops it when text from outside
// comes into the editor.

/** Where the editor was. The editor makes and reads it; the history only keeps it. */
export interface Spot {
  view: 'cards' | 'markdown' | 'settings'
  /** The card being edited. */
  card: number
  /** The field or handle with focus, as a selector, and what was selected in it; or null. */
  focus: Focus | null
}

export interface Focus {
  field: string
  select: [number, number] | null
}

/** What a step did, for the debug log. */
export type EditKind = 'edit' | 'delete-point'

export interface Edit {
  what?: EditKind
  /** Where the editor was before the edit, and where it goes after it. */
  before?: Spot
  after?: Spot
}

/** What the card list says about a change it makes: its card, and where focus was and goes. */
export interface Change {
  what?: EditKind
  card?: number
  before?: Focus
  after?: Focus
}

export interface Side {
  text: string
  spot: Spot | null
}

export interface Step {
  what: EditKind
  before: Side
  after: Side
}

export interface History {
  past: readonly Step[]
  future: readonly Step[]
}

export const NO_HISTORY: History = { past: [], future: [] }

/** The history after an edit from `before` to `after`: a new edit leaves nothing to redo. */
export function record(history: History, before: string, after: string, edit: Edit = {}): History {
  const step: Step = {
    what: edit.what ?? 'edit',
    before: { text: before, spot: edit.before ?? null },
    after: { text: after, spot: edit.after ?? null },
  }
  return { past: [...history.past, step], future: [] }
}

export interface Travel {
  history: History
  step: Step
  /** The text and place to go to. */
  to: Side
}

/** The newest step taken back, or null when there is none. */
export function stepBack({ past, future }: History): Travel | null {
  const step = past.at(-1)
  return step ? { history: { past: past.slice(0, -1), future: [...future, step] }, step, to: step.before } : null
}

/** The step last taken back, done again, or null when there is none. */
export function stepForward({ past, future }: History): Travel | null {
  const step = future.at(-1)
  return step ? { history: { past: [...past, step], future: future.slice(0, -1) }, step, to: step.after } : null
}
