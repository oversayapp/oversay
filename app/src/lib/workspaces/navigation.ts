// Finding your way round the Workspaces page (John, 27 Oct): its
// sidebar of All workspaces, Pinned, Recent, each tag and Untagged, and each tag's colour. These are
// the person's, not a workspace's, so they live in this computer's settings (`workspaceNav` in
// settings.json), not in workspace.json. Workspaces are kept by id, so a renamed one stays pinned.

import { hasTag, sortWorkspaces, tagCase, tagsInUse, type Workspace } from './workspaces'

/** A pinned or opened workspace, and when (ISO 8601). */
export interface Dated {
  id: string
  at: string
}

/** A colour a tag can have, from the card kinds' colours (app.css). */
export const TAG_COLOURS = ['blue', 'teal', 'orange', 'purple', 'green', 'red', 'grey'] as const
export type TagColour = (typeof TAG_COLOURS)[number]

/** The CSS colour for each, light and dark come from app.css. */
export const TAG_COLOUR_CSS: Record<TagColour, string> = {
  blue: 'var(--k-intro)',
  teal: 'var(--k-topic)',
  orange: 'var(--k-demo)',
  purple: 'var(--k-outro)',
  green: 'var(--ok)',
  red: 'var(--danger)',
  grey: 'var(--k-break)',
}

export const SORTS = ['date', 'name', 'opened'] as const
export type Sort = (typeof SORTS)[number]

/** Where the sidebar is: All, Pinned, Recent, Untagged, or a tag (`tag:research`). */
export type Place = 'all' | 'pinned' | 'recent' | 'untagged' | `tag:${string}`

export interface WorkspaceNav {
  /** Newest pin first; dragged into another order once the person reorders them. */
  pins: Dated[]
  /** Last opened first, for Recent. */
  opened: Dated[]
  /** Colours the person chose, by tag in lower case; the rest get one from their name. */
  colours: Record<string, TagColour>
  /** Tags made with + beside Tags that no workspace has yet. */
  tags: string[]
  place: Place
  sort: Sort
}

/** How many opened workspaces Recent keeps. */
export const RECENT_KEPT = 12

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const parseDated = (v: unknown): Dated[] =>
  Array.isArray(v) ? v.filter((d): d is Dated => isObject(d) && typeof d.id === 'string' && d.id !== '' && typeof d.at === 'string').map(({ id, at }) => ({ id, at })) : []
const isPlace = (v: unknown): v is Place => v === 'all' || v === 'pinned' || v === 'recent' || v === 'untagged' || (typeof v === 'string' && /^tag:./.test(v))

/** `workspaceNav` from settings.json, anything unexpected left out. */
export function parseWorkspaceNav(value: unknown): WorkspaceNav {
  const v = isObject(value) ? value : {}
  const colours = isObject(v.colours) ? Object.fromEntries(Object.entries(v.colours).filter((e): e is [string, TagColour] => (TAG_COLOURS as readonly unknown[]).includes(e[1]))) : {}
  return {
    pins: parseDated(v.pins),
    opened: parseDated(v.opened),
    colours,
    tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(tagCase) : [],
    place: isPlace(v.place) ? (placeTag(v.place) ? `tag:${placeTag(v.place)}` : v.place) : 'all',
    sort: (SORTS as readonly unknown[]).includes(v.sort) ? (v.sort as Sort) : 'date',
  }
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Pins a workspace first, or unpins it. */
export function withPin(nav: WorkspaceNav, id: string, on: boolean, at: string): WorkspaceNav {
  const rest = nav.pins.filter((p) => p.id !== id)
  return { ...nav, pins: on ? [{ id, at }, ...rest] : rest }
}

/** The pins put in the order of `ids` (as dragged on Pinned); any pin not in it keeps its place after them. */
export function withPinOrder(nav: WorkspaceNav, ids: readonly string[]): WorkspaceNav {
  const first = ids.flatMap((id) => nav.pins.find((p) => p.id === id) ?? [])
  return {
    ...nav,
    pins: [...first, ...nav.pins.filter((p) => !ids.includes(p.id))],
  }
}

/** A workspace was opened: first in Recent, which keeps RECENT_KEPT. */
export const withOpened = (nav: WorkspaceNav, id: string, at: string): WorkspaceNav => ({
  ...nav,
  opened: [{ id, at }, ...nav.opened.filter((o) => o.id !== id)].slice(0, RECENT_KEPT),
})

/** A workspace has gone: it leaves Pinned and Recent. */
export const withoutWorkspace = (nav: WorkspaceNav, id: string): WorkspaceNav => ({
  ...nav,
  pins: nav.pins.filter((p) => p.id !== id),
  opened: nav.opened.filter((o) => o.id !== id),
})

/** A tag made with + beside Tags, before any workspace has it; the sidebar goes to it. */
export function withNewTag(nav: WorkspaceNav, tag: string): WorkspaceNav {
  const t = tagCase(tag)
  if (!t) return nav
  return {
    ...nav,
    tags: nav.tags.some((x) => same(x, t)) ? nav.tags : [...nav.tags, t],
    place: `tag:${t}`,
  }
}

/**
 * A tag renamed to `to`, or merged into it when `to` is a tag already, or deleted (`to` null): its
 * colour goes with it (unless merged into a tag that has one), and the sidebar follows it.
 */
export function withTagChanged(nav: WorkspaceNav, from: string, to: string | null): WorkspaceNav {
  const key = from.toLowerCase()
  const { [key]: colour, ...colours } = nav.colours
  if (to && colour && !colours[to.toLowerCase()]) colours[to.toLowerCase()] = colour
  const tags = nav.tags.filter((t) => !same(t, from))
  if (to && nav.tags.some((t) => same(t, from)) && !tags.some((t) => same(t, to))) tags.push(to)
  const onIt = nav.place.startsWith('tag:') && same(nav.place.slice(4), from)
  return {
    ...nav,
    colours,
    tags,
    place: onIt ? (to ? `tag:${to}` : 'all') : nav.place,
  }
}

/** `tags` with `from` renamed to `to` (merged when it is there already), or taken off when `to` is null. */
export function retagged(tags: readonly string[], from: string, to: string | null): string[] {
  const out: string[] = []
  for (const t of tags) {
    const next = same(t, from) ? to : t
    if (next && !out.some((o) => same(o, next))) out.push(next)
  }
  return out
}

/** The tags for the sidebar: those in use and those made with + that none has yet, sorted. */
export function sidebarTags(workspaces: readonly Workspace[], nav: WorkspaceNav): string[] {
  const inUse = tagsInUse(workspaces)
  const extra = nav.tags.filter((t) => !inUse.some((u) => same(u, t)))
  return [...inUse, ...extra].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** A tag's colour: the one chosen, else one picked from its name, so it doesn't change as tags come and go. */
export function tagColour(nav: WorkspaceNav, tag: string): TagColour {
  const chosen = nav.colours[tag.toLowerCase()]
  if (chosen) return chosen
  let hash = 0
  for (const c of tag.toLowerCase()) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return TAG_COLOURS[hash % 5]
}

/** The tag a place is on, or null. */
export const placeTag = (place: Place): string | null => (place.startsWith('tag:') ? tagCase(place.slice(4)) : null)

/** The workspaces in `list`, in the order `sort` says. */
export function sortedBy(list: readonly Workspace[], sort: Sort, nav: WorkspaceNav): Workspace[] {
  if (sort === 'date') return sortWorkspaces(list)
  const byName = (a: Workspace, b: Workspace) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  if (sort === 'name') return [...list].sort(byName)
  const rank = (w: Workspace) => {
    const i = nav.opened.findIndex((o) => o.id === w.id)
    return i < 0 ? Infinity : i
  }
  return [...list].sort((a, b) => rank(a) - rank(b) || byName(a, b))
}

/** The workspaces the sidebar's place lists: Pinned in pin order, Recent last opened first, the rest sorted. */
export function workspacesAt(workspaces: readonly Workspace[], nav: WorkspaceNav, place: Place = nav.place): Workspace[] {
  const byId = (list: readonly Dated[]) => list.flatMap((d) => workspaces.find((w) => w.id === d.id) ?? [])
  if (place === 'pinned') return byId(nav.pins)
  if (place === 'recent') return byId(nav.opened)
  const tag = placeTag(place)
  const list = place === 'untagged' ? workspaces.filter((w) => w.tags.length === 0) : tag ? workspaces.filter((w) => hasTag(w, tag)) : workspaces
  return sortedBy(list, nav.sort, nav)
}

/** "just now", "5 min ago", "today", "yesterday", "3 days ago", "last week", or a date: when it was opened. */
export function openedLabel(at: string, now: number): string {
  const then = Date.parse(at)
  if (Number.isNaN(then)) return ''
  const minutes = Math.floor((now - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const day = (t: number) => {
    const d = new Date(t)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  const days = Math.round((day(now) - day(then)) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  return new Date(then).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
