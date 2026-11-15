import { describe, expect, it } from 'vitest'
import { findWorkspace, groupByTag, movedDeck, parseTags, parseWorkspaces, sortWorkspaces, tagsInUse, withDeck, withoutDeck, workspacesWith, type Workspace } from './workspaces'

const w = (name: string, tags: string[], decks: string[] = [], when = ''): Workspace => ({
  id: `w_${name.toLowerCase().replace(/\W/g, '').slice(0, 8).padEnd(8, '0')}`,
  name,
  folder: name,
  tags,
  decks,
  when,
  where: '',
  notes: '',
  problem: null,
})
const injection = w('Prompt injection', ['research'], ['d_panel001', 'd_talk0001'], '2026-12-02')
const passkeys = w('Passkeys', ['Research', 'talks'], ['d_panel001'])
const svelte = w('Svelte 5 basics', ['tutorials'], [], '2026-10-06')
const atlas = w('Atlas launch', [])
const all = [injection, passkeys, svelte, atlas]

describe('workspaces', () => {
  it('reads what Rust lists, dropping anything malformed', () => {
    expect(parseWorkspaces([{ ...injection, tags: ['research', 3], decks: ['d_panel001', 7] }, { name: 3 }, 'junk'])).toEqual([{ ...injection, tags: ['Research'], decks: ['d_panel001'] }])
    expect(parseWorkspaces(null)).toEqual([])
  })

  it('finds the workspaces a deck is in', () => {
    expect(workspacesWith(all, 'd_panel001').map((x) => x.name)).toEqual(['Prompt injection', 'Passkeys'])
    expect(workspacesWith(all, '')).toEqual([])
    expect(findWorkspace(all, passkeys.id)?.name).toBe('Passkeys')
    expect(findWorkspace(all, '')).toBeNull()
  })

  it('adds a deck once, removes it, and moves it', () => {
    expect(withDeck(['d_a'], 'd_b')).toEqual(['d_a', 'd_b'])
    expect(withDeck(['d_a', 'd_b'], 'd_a')).toEqual(['d_a', 'd_b'])
    expect(withoutDeck(['d_a', 'd_b'], 'd_a')).toEqual(['d_b'])
    expect(movedDeck(['d_a', 'd_b', 'd_c'], 2, 0)).toEqual(['d_c', 'd_a', 'd_b'])
    expect(movedDeck(['d_a', 'd_b'], 0, 5)).toEqual(['d_a', 'd_b'])
  })
})

describe('tags (ADR 0040)', () => {
  it('lists each tag once, ignoring case', () => {
    expect(tagsInUse(all)).toEqual(['research', 'talks', 'tutorials'])
  })

  it('groups by tag, a workspace in each of its tags, Untagged last', () => {
    expect(groupByTag(all).map((g) => [g.tag, g.workspaces.map((x) => x.name)])).toEqual([
      ['research', ['Prompt injection', 'Passkeys']],
      ['talks', ['Passkeys']],
      ['tutorials', ['Svelte 5 basics']],
      [null, ['Atlas launch']],
    ])
    expect(groupByTag(all, 'Research').map((g) => g.workspaces.length)).toEqual([2])
  })

  it('sorts dated workspaces first, newest first', () => {
    expect(sortWorkspaces(all).map((x) => x.name)).toEqual(['Prompt injection', 'Svelte 5 basics', 'Atlas launch', 'Passkeys'])
  })

  it('reads tags typed in one field, each with an initial capital', () => {
    expect(parseTags(' research,  appSec   talks ,Research,, ')).toEqual(['Research', 'AppSec talks'])
  })
})
