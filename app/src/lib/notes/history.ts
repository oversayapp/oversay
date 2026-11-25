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

export type Selection = [number, number]

export interface Focus {
  field: string
  select: Selection | null
}

/** What is selected in a text field. */
export const selectionOf = (el: { value: string; selectionStart: number | null; selectionEnd: number | null }): Selection => [
  el.selectionStart ?? el.value.length,
  el.selectionEnd ?? el.value.length,
]

/** What a step did, for the debug log. */
export type EditKind = 'edit' | 'delete-point' | 'typing'

export interface Edit {
  what?: EditKind
  /** Where the editor was before the edit, and where it goes after it. */
  before?: Spot
  after?: Spot
}

/** What the card list says about a change it makes: its card (`to`, when focus goes to another), and where focus was and goes. */
export interface Change {
  what?: EditKind
  card?: number
  to?: number
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
  /** The run of typing the newest step can still grow by: its field and its last keystroke. */
  run: { field: string; at: number } | null
}

export const NO_HISTORY: History = { past: [], future: [], run: null }

/** How many steps are kept. */
export const MAX_STEPS = 100

/** A longer pause than this ends a run of typing. */
export const TYPING_PAUSE_MS = 1000

/**
 * The history after an edit from `before` to `after`, made at `now`: a new step, or the run of
 * typing in the same field grown by it. A new edit leaves nothing to redo.
 */
export function record({ past, run }: History, before: string, after: string, edit: Edit = {}, now = 0): History {
  const what = edit.what ?? 'edit'
  const field = what === 'typing' ? (edit.before?.focus?.field ?? null) : null
  const end: Side = { text: after, spot: edit.after ?? null }
  const next = field === null ? null : { field, at: now }
  const last = past.at(-1)
  if (last && run && field === run.field && now - run.at <= TYPING_PAUSE_MS) {
    // Typed and taken out again within the run: nothing to undo.
    if (last.before.text === after) return { past: past.slice(0, -1), future: [], run: null }
    return { past: [...past.slice(0, -1), { ...last, after: end }], future: [], run: next }
  }
  const step: Step = { what, before: { text: before, spot: edit.before ?? null }, after: end }
  return { past: [...past, step].slice(-MAX_STEPS), future: [], run: next }
}

/** Every step with its texts changed by `title`: what a rename writes stays through undo and redo. */
export function retitle({ past, future }: History, title: (text: string) => string): History {
  const all = (steps: readonly Step[]) =>
    steps
      .map((s) => ({ ...s, before: { ...s.before, text: title(s.before.text) }, after: { ...s.after, text: title(s.after.text) } }))
      .filter((s) => s.before.text !== s.after.text)
  return { past: all(past), future: all(future), run: null }
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
  return step ? { history: { past: past.slice(0, -1), future: [...future, step], run: null }, step, to: step.before } : null
}

/** The step last taken back, done again, or null when there is none. */
export function stepForward({ past, future }: History): Travel | null {
  const step = future.at(-1)
  return step ? { history: { past: [...past, step], future: future.slice(0, -1), run: null }, step, to: step.after } : null
}
