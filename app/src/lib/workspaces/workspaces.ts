// Workspaces (ADR 0040): what Rust lists from Documents/Oversay/Workspaces
// (src-tauri/src/workspaces.rs), and the pure rules for a workspace's decks and tags. A workspace
// is a group of decks, listed by id, so a deck can be in any number of workspaces or none; tags
// group workspaces (research, tutorials). Nothing here moves a deck.

import format from './workspace-format.json'

/**
 * `workspace.json` as Oversay reads and writes it: its keys, in order, and its version. One
 * definition for workspaces.rs, which tests against it, and the skill's reference (`make skills`).
 */
export const WORKSPACE_FORMAT = format

export interface Workspace {
  /** Its `w_` id, or '' while Oversay hasn't given it one or can't read it. */
  id: string
  name: string
  /** Its folder's name. */
  folder: string
  /** Words that group it with others: research, tutorials. */
  tags: string[]
  /** Its deck ids in order, including any Oversay can't find. */
  decks: string[]
  /** A date, `YYYY-MM-DD`, or ''. */
  when: string
  where: string
  notes: string
  /** Why its `workspace.json` couldn't be read; it isn't written until it can. */
  problem: string | null
}

/** What a change to a workspace sets (`WorkspaceChange` in workspaces.rs); the rest stays. */
export interface WorkspaceChange {
  name?: string
  tags?: string[]
  decks?: string[]
  when?: string
  where?: string
  notes?: string
}

const isText = (v: unknown): v is string => typeof v === 'string'

/** A tag as Oversay keeps it: spaces tidied and an initial capital (John, 27 Oct), as workspaces.rs does. */
export function tagCase(tag: string): string {
  const t = tag.trim().replace(/\s+/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function parseWorkspace(value: unknown): Workspace | null {
  if (typeof value !== 'object' || value === null) return null
  const w = value as Record<string, unknown>
  if (!isText(w.name) || !isText(w.folder)) return null
  return {
    id: isText(w.id) ? w.id : '',
    name: w.name,
    folder: w.folder,
    tags: Array.isArray(w.tags) ? w.tags.filter(isText).map(tagCase) : [],
    decks: Array.isArray(w.decks) ? w.decks.filter(isText) : [],
    when: isText(w.when) ? w.when : '',
    where: isText(w.where) ? w.where : '',
    notes: isText(w.notes) ? w.notes : '',
    problem: isText(w.problem) ? w.problem : null,
  }
}

/** The list as Rust sent it, dropping anything malformed. */
export const parseWorkspaces = (value: unknown): Workspace[] => (Array.isArray(value) ? value.flatMap((w) => parseWorkspace(w) ?? []) : [])

export function parseWorkspaceResult(value: unknown): Workspace {
  const w = parseWorkspace(value)
  if (!w) throw new Error('Oversay could not read the workspace back')
  return w
}

/** The workspace with this id, or null. */
export const findWorkspace = (workspaces: readonly Workspace[], id: string): Workspace | null => (id && workspaces.find((w) => w.id === id)) || null

/** The workspaces a deck is in. */
export const workspacesWith = (workspaces: readonly Workspace[], deckId: string): Workspace[] =>
  deckId ? workspaces.filter((w) => w.decks.includes(deckId)) : []

/** `decks` with `id` added at the end, unless it is there already. */
export const withDeck = (decks: readonly string[], id: string): string[] => (decks.includes(id) ? [...decks] : [...decks, id])

/** `decks` without `id`. */
export const withoutDeck = (decks: readonly string[], id: string): string[] => decks.filter((d) => d !== id)

/** `decks` with the one at `from` moved to `to`. */
export function movedDeck(decks: readonly string[], from: number, to: number): string[] {
  const out = [...decks]
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out
  const [id] = out.splice(from, 1)
  out.splice(to, 0, id)
  return out
}

/** "2 Jun 2026" for `2026-06-02`, or '' when there is no date. */
export function dateLabel(when: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(when)
  if (!m) return ''
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Workspaces with a date first, newest first, then by name. */
export function sortWorkspaces(workspaces: readonly Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    if (a.when !== b.when) return !a.when ? 1 : !b.when ? -1 : b.when.localeCompare(a.when)
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

/** Every tag in use, once each (ignoring case, as first written), sorted. */
export function tagsInUse(workspaces: readonly Workspace[]): string[] {
  const seen = new Map<string, string>()
  for (const t of workspaces.flatMap((w) => w.tags)) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** Whether a workspace has this tag, ignoring case. */
export const hasTag = (w: Workspace, tag: string): boolean => w.tags.some((t) => t.toLowerCase() === tag.toLowerCase())

/**
 * The Workspaces page's groups: one per tag in use, by tag, each workspace sorted; a workspace
 * with several tags is in each of their groups; Untagged last. With `tag`, only that tag's group.
 */
export function groupByTag(workspaces: readonly Workspace[], tag: string | null = null): { tag: string | null; workspaces: Workspace[] }[] {
  const tags = tag ? [tag] : tagsInUse(workspaces)
  const groups = tags.map((t) => ({ tag: t as string | null, workspaces: sortWorkspaces(workspaces.filter((w) => hasTag(w, t))) })).filter((g) => g.workspaces.length > 0)
  const untagged = workspaces.filter((w) => w.tags.length === 0)
  if (!tag && untagged.length) groups.push({ tag: null, workspaces: sortWorkspaces(untagged) })
  return groups
}

/** Tags as typed in one field ("research, talks"): split on commas, trimmed, each once. */
export function parseTags(text: string): string[] {
  const out: string[] = []
  for (const t of text.split(',').map(tagCase)) if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t)
  return out
}
