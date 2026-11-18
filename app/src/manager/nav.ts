// Which screen the manager shows (ADR 0039, 0040, 0041; epic 036 (#54)): Home, Library (decks and
// workspaces in one place), Templates, Sessions (every deck's runs), AI and Settings. A deck opens in
// the deck editor over the Library group or workspace it was opened from, which the editor's back
// arrow returns to.

import type { SettingsSectionId } from '../lib/settings/sections'

export type View = 'home' | 'library' | 'templates' | 'sessions' | 'settings' | 'ai'

/** The groups of the Library's left pane that list decks (a workspace is `Nav.workspace`). */
export type LibraryPlace = 'recent' | 'pinned' | 'week' | 'unsorted' | 'all'

/** What the way back from a deck, and the main pane's heading, call each group. */
export const PLACE_TITLES: Record<LibraryPlace, string> = { recent: 'Recent', pinned: 'Pinned', week: 'This week', unsorted: 'Unsorted', all: 'All decks' }

export interface Nav {
  view: View
  /** On the Library, the group of the left pane shown; none means it picks Recent, or All decks while Recent is empty. */
  place?: LibraryPlace
  /** The deck open in the deck editor (its file's path), over the Library. */
  deck?: string
  /** On Sessions, the session open on its page: its deck's file and when it started (ADR 0041). */
  session?: { deck: string; startedAt: string }
  /** On the Library, the workspace open on its page, by its id (ADR 0040). */
  workspace?: string
  /** The Settings section to open at, when another screen sent you there (013/02). Cleared by every other way into Settings. */
  settingsSection?: SettingsSectionId
}

export const start: Nav = { view: 'home' }

export const showHome = (_nav: Nav): Nav => ({ view: 'home' })
/** Settings, at the top, or at the section `section` when another screen sends you to one. */
export const showSettings = (_nav: Nav, section?: SettingsSectionId): Nav => ({ view: 'settings', settingsSection: section })
/** The Library, at a group of its left pane (or at none). */
export const showLibrary = (_nav: Nav, place?: LibraryPlace): Nav => (place ? { view: 'library', place } : { view: 'library' })
/** A workspace's page, in the Library, by its id. */
export const showWorkspace = (_nav: Nav, id: string): Nav => ({ view: 'library', workspace: id })
/** A deck in the deck editor, over the group or workspace it was opened from in the Library, else over All decks. */
export const showDeck = (nav: Nav, path: string): Nav =>
  nav.view === 'library' && !nav.deck ? { ...nav, deck: path } : { view: 'library', place: 'all', deck: path }
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
