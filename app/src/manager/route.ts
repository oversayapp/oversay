import { deckPathFor } from '../lib/decks/paths'
import { writable } from 'svelte/store'
import { logAction } from '../lib/log'
import type { SettingsSectionId } from '../lib/settings/sections'
import { closeDeck, showAi, showWorkspace, showDeck, showDecks, showHome, showSession, showSessions, showSettings, showTemplates, showWorkspaces, start, type Nav } from './nav'

/** Which screen the manager is showing. The pure transitions live in nav.ts. */
export const nav = writable<Nav>(start)

function go(change: (n: Nav) => Nav): void {
  nav.update((n) => {
    const next = change(n)
    if (next.view !== n.view || next.deck !== n.deck || next.workspace !== n.workspace || next.session !== n.session || next.settingsSection !== n.settingsSection) {
      logAction(
        'screen',
        `${next.view}${next.workspace ? ` workspace ${next.workspace}` : ''}${next.session ? ' session' : ''}${next.deck ? ' deck' : ''}${next.view === 'settings' && next.settingsSection ? ` at ${next.settingsSection}` : ''}`,
      )
    }
    return next
  })
}

export const goHome = () => go(showHome)
/** Settings; with `section`, scrolled straight to that section (see lib/settings/sections.ts). */
export const goSettings = (section?: SettingsSectionId) => go((n) => showSettings(n, section))
/** The AI page (the rail's AI item, Home's card). */
export const goAi = () => go(showAi)
/** Decks (the rail's Decks item): every deck. */
export const goDecks = () => go(showDecks)
/** Workspaces (the rail's Workspaces item, ADR 0039): every workspace, by tag. */
export const goWorkspaces = () => go(showWorkspaces)
/** Sessions (the rail's Sessions item, ADR 0041): every deck's runs, by day. */
export const goSessions = () => go(showSessions)
/** A session's page: the deck's file and when the session started. */
export const goSession = (deck: string, startedAt: string) => go((n) => showSession(n, deck, startedAt))
/** A workspace's page. */
export const goWorkspace = (id: string) => go((n) => showWorkspace(n, id))
/** A deck in the deck editor. */
export const goDeck = (path: string) => go((n) => showDeck(n, path))
/** Back from the deck editor to the workspace or Decks it was opened from. */
export const goBackFromDeck = () => go(closeDeck)
/**
 * A note by its old path (a link, an arrival, a favourite from before notes became decks): the deck it became,
 * which has its name in the Decks folder beside Quick notes.
 */
export const goNote = (path: string) => go((n) => showDeck(n, deckPathFor(path)))
/** Templates for browsing (the rail, Home). */
export const goTemplates = () => go(showTemplates)
