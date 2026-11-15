import { describe, expect, it } from 'vitest'
import { closeDeck, showAi, showWorkspace, showDeck, showDecks, showHome, showSession, showSessions, showSettings, showTemplates, showWorkspaces, start } from './nav'

describe('navigation state', () => {
  it('starts on Home', () => {
    expect(start).toEqual({ view: 'home' })
  })

  it('Home, Decks, Workspaces, Templates, Sessions, AI and Settings are their own screens', () => {
    expect(showSessions(start)).toEqual({ view: 'sessions' })
    expect(showHome(start).view).toBe('home')
    expect(showDecks(start).view).toBe('decks')
    expect(showWorkspaces(start).view).toBe('workspaces')
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

  it("a deck opened from a session's page goes back to Decks", () => {
    expect(showDeck(showSession(start, '/a/deck.md', 't'), '/a/deck.md')).toEqual({ view: 'decks', deck: '/a/deck.md' })
  })
})

describe('decks and workspaces (ADR 0039, 0040)', () => {
  it('a workspace opens on Workspaces', () => {
    expect(showWorkspace(start, 'w_appsec01')).toEqual({ view: 'workspaces', workspace: 'w_appsec01' })
    expect(showWorkspaces(showWorkspace(start, 'w_appsec01'))).toEqual({ view: 'workspaces' })
  })

  it('a deck opened from a workspace goes back to it', () => {
    const inWorkspace = showDeck(showWorkspace(start, 'w_appsec01'), '/Decks/Panel/deck.md')
    expect(inWorkspace).toEqual({ view: 'workspaces', workspace: 'w_appsec01', deck: '/Decks/Panel/deck.md' })
    expect(closeDeck(inWorkspace)).toEqual({ view: 'workspaces', workspace: 'w_appsec01', deck: undefined })
  })

  it('a deck opened from anywhere else goes back to Decks', () => {
    expect(closeDeck(showDeck(showHome(start), '/Decks/Panel/deck.md'))).toEqual({ view: 'decks', deck: undefined })
    expect(closeDeck(showDeck(showWorkspaces(start), '/Decks/Panel/deck.md'))).toEqual({ view: 'decks', deck: undefined })
  })
})
