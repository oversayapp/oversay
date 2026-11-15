// Which screen the manager shows (ADR 0039, 0040, 0041): Home, Decks (every deck), Workspaces
// (every workspace, by tag, and each workspace's page), Templates, Sessions (every deck's runs), AI
// and Settings. A deck opens in the deck editor over the screen it was opened from, which the
// editor's back arrow returns to.

import type { SettingsSectionId } from '../lib/settings/sections'

export type View = 'home' | 'decks' | 'workspaces' | 'templates' | 'sessions' | 'settings' | 'ai'

export interface Nav {
  view: View
  /** The deck open in the deck editor (its file's path), over Decks or a workspace's page. */
  deck?: string
  /** On Sessions, the session open on its page: its deck's file and when it started (ADR 0041). */
  session?: { deck: string; startedAt: string }
  /** On Workspaces, the workspace open on its page, by its id (ADR 0040). */
  workspace?: string
  /** The Settings section to open at, when another screen sent you there (013/02). Cleared by every other way into Settings. */
  settingsSection?: SettingsSectionId
}

export const start: Nav = { view: 'home' }

export const showHome = (_nav: Nav): Nav => ({ view: 'home' })
/** Settings, at the top, or at the section `section` when another screen sends you to one. */
export const showSettings = (_nav: Nav, section?: SettingsSectionId): Nav => ({ view: 'settings', settingsSection: section })
/** Decks: every deck. */
export const showDecks = (_nav: Nav): Nav => ({ view: 'decks' })
/** Workspaces: every workspace, by tag (ADR 0040). */
export const showWorkspaces = (_nav: Nav): Nav => ({ view: 'workspaces' })
/** A workspace's page, by its id. */
export const showWorkspace = (_nav: Nav, id: string): Nav => ({ view: 'workspaces', workspace: id })
/** A deck in the deck editor, over a workspace's page when opened from one, else over Decks. */
export const showDeck = (nav: Nav, path: string): Nav =>
  nav.view === 'workspaces' && nav.workspace ? { ...nav, deck: path } : { view: 'decks', deck: path }
/** Back from the deck editor to where it was opened from. */
export const closeDeck = (nav: Nav): Nav => ({ ...nav, deck: undefined })
/** Sessions: every deck's runs, by day (ADR 0041). */
export const showSessions = (_nav: Nav): Nav => ({ view: 'sessions' })
/** A session's page, over Sessions. */
export const showSession = (_nav: Nav, deck: string, startedAt: string): Nav => ({ view: 'sessions', session: { deck, startedAt } })
/** The AI page: install and try the Oversay skill (ADR 0033). */
export const showAi = (_nav: Nav): Nav => ({ view: 'ai' })
/** Templates, to browse and edit. */
export const showTemplates = (_nav: Nav): Nav => ({ view: 'templates' })
