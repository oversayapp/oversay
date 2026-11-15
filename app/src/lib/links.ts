// oversay:// links (ADR 0032): what a link asks for, read without trusting it. Any app or web page
// can open one, so a link names a note, deck or quick talk in Oversay's own folders by name (a deck
// by its id too), never a path, and can only open or show; it never writes, deletes or starts
// a talk's clock.

import { invoke } from '@tauri-apps/api/core'

/** Same name as `LINK_EVENT` in links.rs; both sides test it. */
export const LINK_EVENT = 'oversay-link'

export type Link =
  | { kind: 'notes' }
  | { kind: 'note'; name: string; show: boolean }
  | { kind: 'talk'; name: string; ready: boolean }
  | { kind: 'decks' }
  | { kind: 'deck'; name: string; show: boolean }

/** Whether links may put a note on screen or open Get ready without asking (Settings). */
export const LINK_PERMISSIONS = ['ask', 'allow', 'never'] as const
export type LinkPermission = (typeof LINK_PERMISSIONS)[number]

export const parseLinkPermission = (value: unknown): LinkPermission =>
  (LINK_PERMISSIONS as readonly unknown[]).includes(value) ? (value as LinkPermission) : 'ask'

const SCHEME = 'oversay://'

/** What `url` asks for, or why it can't be followed. */
export function parseLink(url: string): Link | { problem: string } {
  if (url.slice(0, SCHEME.length).toLowerCase() !== SCHEME) return { problem: 'not an Oversay link' }
  const rest = url.slice(SCHEME.length).replace(/[?#].*$/, '')
  let parts: string[]
  try {
    parts = rest.split('/').map(decodeURIComponent)
  } catch {
    return { problem: 'the link is garbled' }
  }
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
  const [area, name, action, ...extra] = parts
  if (extra.length) return { problem: 'the link has more parts than Oversay knows' }
  if (area !== 'notes' && area !== 'talks' && area !== 'decks') return { problem: `Oversay has no “${area}”` }
  if (name === undefined) return area === 'notes' ? { kind: 'notes' } : area === 'decks' ? { kind: 'decks' } : { problem: 'the link names no quick talk' }
  // A name, not a path: nothing that could reach outside the folder.
  // eslint-disable-next-line no-control-regex -- control characters are what this refuses
  if (name.trim() === '' || /[/\\]|[\u0000-\u001f]/.test(name) || name === '.' || name === '..') return { problem: `the link names no ${area === 'decks' ? 'deck' : 'note'}` }
  if (area === 'decks') {
    if (action !== undefined && action !== 'show') return { problem: `a deck can't “${action}”` }
    return { kind: 'deck', name, show: action === 'show' }
  }
  if (area === 'notes') {
    if (action !== undefined && action !== 'show') return { problem: `a note can't “${action}”` }
    return { kind: 'note', name, show: action === 'show' }
  }
  if (action !== undefined && action !== 'ready') return { problem: `a quick talk can't “${action}”` }
  return { kind: 'talk', name, ready: action === 'ready' }
}

/** The file a link names: the one with exactly that name, or else the only one matching it ignoring case. */
export function findByName<T extends { name: string }>(items: readonly T[], name: string): T | null {
  const exact = items.find((i) => i.name === name)
  if (exact) return exact
  const loose = items.filter((i) => i.name.toLowerCase() === name.toLowerCase())
  return loose.length === 1 ? loose[0] : null
}

/**
 * The deck a link names: the one with that id when it is a deck id (`d_k3x9a2bq`), so the
 * link outlives a rename; otherwise by name, its title first, then its folder's name without the
 * date (`folder`), for a name whose folder lost characters.
 */
export function findDeckFor<T extends { id: string; name: string; folder: string }>(decks: readonly T[], name: string): T | null {
  if (/^d_[a-z0-9]{1,16}$/.test(name)) return decks.find((d) => d.id === name) ?? null
  return findByName(decks, name) ?? findByName(decks.map((d) => ({ deck: d, name: d.folder })), name)?.deck ?? null
}

/** The links that arrived and haven't been handled, oldest first (links.rs). */
export const takeLinks = () => invoke<string[]>('take_links')
