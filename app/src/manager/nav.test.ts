import { describe, expect, it } from 'vitest'
import { closeDeck, showAi, showDeck, showHome, showLibrary, showSession, showSessions, showSettings, showTemplates, showWorkspace, start } from './nav'

describe('navigation state', () => {
  it('starts on Home', () => {
    expect(start).toEqual({ view: 'home' })
  })

  it('Home, Library, Templates, Sessions, AI and Settings are their own screens', () => {
    expect(showSessions(start)).toEqual({ view: 'sessions' })
    expect(showHome(start).view).toBe('home')
    expect(showLibrary(start).view).toBe('library')
    expect(showTemplates(start).view).toBe('templates')
    expect(showAi(start).view).toBe('ai')
    expect(showSettings(start, 'shortcuts')).toEqual({ view: 'settings', settingsSection: 'shortcuts' })
  })
})

describe('sessions (ADR 0041)', () => {
  it("a session's page opens over Sessions, and Sessions closes it", () => {
    const page = showSession(start, '/Decks/Stand-up/deck.md', '2026-10-28T09:00:00.000Z')
    expect(page).toEqual({ view: 'sessions', session: { deck: '/Decks/Stand-up/deck.md', startedAt: '2026-10-28T09:00:00.000Z' } })
    expect(showSessions(page)).toEqual({ view: 'sessions' })
  })

  it("a deck opened from a session's page goes back to the Library", () => {
    expect(showDeck(showSession(start, '/a/deck.md', 't'), '/a/deck.md')).toEqual({ view: 'library', place: 'all', deck: '/a/deck.md' })
  })
})

describe('the Library (epic 036 (#54))', () => {
  it('opens on a group of the left pane, or on none so it picks Recent or All itself', () => {
    expect(showLibrary(start)).toEqual({ view: 'library' })
    expect(showLibrary(start, 'pinned')).toEqual({ view: 'library', place: 'pinned' })
  })

  it('a workspace opens in the Library, and the Library closes it', () => {
    expect(showWorkspace(start, 'w_appsec01')).toEqual({ view: 'library', workspace: 'w_appsec01' })
    expect(showLibrary(showWorkspace(start, 'w_appsec01'), 'all')).toEqual({ view: 'library', place: 'all' })
  })

  it('a deck opened from a workspace goes back to it', () => {
    const inWorkspace = showDeck(showWorkspace(start, 'w_appsec01'), '/Decks/Panel/deck.md')
    expect(inWorkspace).toEqual({ view: 'library', workspace: 'w_appsec01', deck: '/Decks/Panel/deck.md' })
    expect(closeDeck(inWorkspace)).toEqual({ view: 'library', workspace: 'w_appsec01', deck: undefined })
  })

  it('a deck opened from a group goes back to that group', () => {
    const open = showDeck(showLibrary(start, 'pinned'), '/Decks/Panel/deck.md')
    expect(closeDeck(open)).toEqual({ view: 'library', place: 'pinned', deck: undefined })
  })

  it('a deck opened from anywhere else goes back to All decks', () => {
    expect(closeDeck(showDeck(showHome(start), '/Decks/Panel/deck.md'))).toEqual({ view: 'library', place: 'all', deck: undefined })
  })
})
