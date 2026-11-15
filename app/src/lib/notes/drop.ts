// Notes from any chat (ADR 0031): a note file dropped on Oversay's window, or Markdown pasted
// as a note. A chat that can't reach this computer gives the person a file or some Markdown;
// these decide what Oversay does with it.

import { parseNoteDoc, shownTopics } from './format'

export interface DropPlan {
  /** Markdown files, each copied into Decks as a deck of its own. */
  notes: string[]
  /** Everything else, with why it is left out; a project file too, since projects are gone (ADR 0039). */
  left: { path: string; why: string }[]
}

export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** What a drop of `paths` will do, shown before the person lets go. */
export function planDrop(paths: readonly string[]): DropPlan {
  const plan: DropPlan = { notes: [], left: [] }
  for (const path of paths) {
    if (/\.md$/i.test(path)) plan.notes.push(path)
    else plan.left.push({ path, why: /\.oversay\.json$/i.test(path) ? 'Projects are gone: make a deck instead' : 'Not a note' })
  }
  return plan
}

/** A pasted note's name: its `# ` title, else its first topic, else "Pasted note". */
export function nameForPasted(text: string): string {
  const title = /^#[ \t]+(.+?)[ \t#]*$/m.exec(text)?.[1]
  if (title) return title
  const topic = shownTopics(parseNoteDoc(text)).find((t) => t.name.trim() !== '')?.name
  return topic?.trim() || 'Pasted note'
}
