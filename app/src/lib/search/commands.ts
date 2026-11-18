// The command bar's actions (epic 036 (#54)): the search bar finds things and also does them: New deck,
// From a template, New workspace; and, on an open deck, Show, Add to …, Take out of …. Pure, so the bar
// and its tests agree.

export type CommandKind = 'blank-deck' | 'deck-from-template' | 'new-workspace' | 'show' | 'add-to' | 'take-out'

export interface Command {
  kind: CommandKind
  label: string
  /** The name typed for a new deck or workspace. */
  name?: string
  /** The workspace an add or take-out is about. */
  workspace?: string
}

export interface CommandContext {
  query: string
  /** Opened by + New or ⌘N: what you can make is listed, and what you type names it. */
  making: boolean
  /** The deck open in the editor, with the workspaces it is in. */
  deck: { name: string; id: string; canShow: boolean; inWorkspaces: { id: string; name: string }[] } | null
  workspaces: { id: string; name: string }[]
}

const words = (text: string) => text.toLowerCase().split(/[\s\-_·]+/).filter(Boolean)
/** Whether every typed word starts a word of the label or its keywords. */
const matches = (query: string, label: string, keywords: string) => {
  const have = words(`${label} ${keywords}`)
  return words(query).every((q) => have.some((w) => w.startsWith(q)))
}

export function commandsFor(c: CommandContext): Command[] {
  const query = c.query.trim()
  const named = (kind: 'blank-deck' | 'new-workspace', what: string, bare: string, name: string): Command => ({ kind, label: name ? `New ${what} “${name}”` : bare, ...(name ? { name } : {}) })

  const make: Command[] = []
  if (c.making) {
    make.push(named('blank-deck', 'deck', 'Blank deck', query), { kind: 'deck-from-template', label: 'Deck from a template…' }, named('new-workspace', 'workspace', 'Workspace…', query))
  } else {
    const typed = /^new\s+(deck|workspace)\s+(.+)$/i.exec(query)
    if (typed) {
      const kind = typed[1].toLowerCase() === 'deck' ? 'blank-deck' : 'new-workspace'
      make.push(named(kind, typed[1].toLowerCase(), '', typed[2].trim()))
    } else {
      if (matches(query, 'New deck', 'blank')) make.push({ kind: 'blank-deck', label: 'New deck' })
      if (matches(query, 'Deck from a template', 'new start')) make.push({ kind: 'deck-from-template', label: 'Deck from a template…' })
      if (matches(query, 'New workspace', '')) make.push({ kind: 'new-workspace', label: 'New workspace' })
    }
  }

  const onDeck: Command[] = []
  const d = c.deck
  if (d && !c.making) {
    const inIt = new Set(d.inWorkspaces.map((w) => w.id))
    if (d.canShow && matches(query, `Show “${d.name}”`, 'on screen')) onDeck.push({ kind: 'show', label: `Show “${d.name}”` })
    for (const w of c.workspaces) {
      if (!w.id) continue
      if (inIt.has(w.id)) {
        if (d.id && matches(query, `Take out of ${w.name}`, 'remove')) onDeck.push({ kind: 'take-out', label: `Take out of ${w.name}`, workspace: w.id })
      } else if (d.id && matches(query, `Add to ${w.name}`, '')) onDeck.push({ kind: 'add-to', label: `Add to ${w.name}`, workspace: w.id })
    }
  }
  return [...make, ...onDeck]
}
