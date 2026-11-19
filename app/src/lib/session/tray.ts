// The menu-bar / tray icon's part that only the manager knows (ADR 0051): the card's time left
// beside the icon (006/08; the tooltip on Windows), the pinned decks for Show a deck ▸, and the
// menu items that need the main window.
import { invoke } from '@tauri-apps/api/core'
import type { Pin } from '../settings/quick'
import { formatElapsed, segmentReadout, sessionClock, type SessionState } from './clock'
import type { Readable } from 'svelte/store'
import { session } from './store'

/** Short enough for the menu bar: Ready, Paused, time left, +time over, or time so far (↑). */
export function trayTitle(s: SessionState, now: number): string {
  if (s.status === 'ready') return 'Ready'
  if (s.status === 'finished') return 'Done'
  if (s.paused) return 'Paused'
  const readout = segmentReadout(sessionClock(s, now))
  if (!readout) return ''
  const time = formatElapsed(readout.seconds)
  return readout.mode === 'so-far' ? `${time} ↑` : readout.mode === 'over' ? `+${time}` : time
}

/** Updates the icon's text every second while a session is open; returns a function that stops. */
export function syncTrayTitle(source: Readable<SessionState | null> = session): () => void {
  let latest: SessionState | null = null
  let shown = ''
  const stop = source.subscribe((s) => {
    latest = s
  })
  const timer = setInterval(() => {
    // Nothing running, or only a preview (the Look card's or the editor's): no text beside the icon.
    const running = latest && latest.status !== 'finished' && !latest.preview
    const title = running ? trayTitle(latest!, Date.now()) : ''
    if (title === shown) return
    shown = title
    void invoke('set_tray_title', { title }).catch(() => {})
  }, 1000)
  return () => {
    stop()
    clearInterval(timer)
  }
}

/** Sent by Rust when a menu item needs the main window. Same name as `TRAY_EVENT` in src-tauri/src/tray.rs. */
export const TRAY_EVENT = 'tray-choice'

export type TrayChoice = { kind: 'settings' } | { kind: 'library' } | { kind: 'deck'; id: string }

/** The menu's choice, or null when the event isn't one (it is checked, not trusted). */
export function checkTrayChoice(value: unknown): TrayChoice | null {
  if (typeof value !== 'object' || value === null) return null
  const { kind, id } = value as { kind?: unknown; id?: unknown }
  if (kind === 'settings' || kind === 'library') return { kind }
  if (kind === 'deck' && typeof id === 'string' && id !== '') return { kind, id }
  return null
}

/** A pinned deck in the menu: its file (the item's id) and its name. Same shape as `PinnedDeck` in tray_menu.rs. */
export interface PinnedDeck {
  id: string
  name: string
}

/** The pinned decks, newest pin first, found by id where the deck has one (it may have moved), else by path. */
export function pinnedDecks(pins: readonly Pin[], decks: readonly { path: string; id: string; name: string }[] | null): PinnedDeck[] {
  if (!decks) return []
  const byId = new Map(decks.filter((d) => d.id).map((d) => [d.id, d]))
  const byPath = new Map(decks.map((d) => [d.path, d]))
  return pins
    .filter((p) => p.kind === 'deck')
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .flatMap((p) => {
      const deck = (p.id && byId.get(p.id)) || byPath.get(p.path)
      return deck ? [{ id: deck.path, name: deck.name }] : []
    })
}

/** Sends the pinned decks to the menu whenever they change; returns a function that stops. */
export function syncTrayDecks(source: Readable<PinnedDeck[]>): () => void {
  let sent = ''
  return source.subscribe((list) => {
    const text = JSON.stringify(list)
    if (text === sent) return
    sent = text
    void invoke('set_tray_decks', { decks: list }).catch(() => {})
  })
}
