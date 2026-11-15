import { describe, expect, it } from 'vitest'
import { findByName, findDeckFor, LINK_EVENT, parseLink, parseLinkPermission } from './links'

describe('oversay:// links', () => {
  it('names its event as links.rs does', () => {
    expect(LINK_EVENT).toBe('oversay-link')
  })

  it.each([
    ['oversay://notes', { kind: 'notes' }],
    ['oversay://notes/', { kind: 'notes' }],
    ['OVERSAY://notes', { kind: 'notes' }],
    ['oversay://notes/Catch-up%20with%20Sam', { kind: 'note', name: 'Catch-up with Sam', show: false }],
    ['oversay://notes/Catch-up%20with%20Sam/show', { kind: 'note', name: 'Catch-up with Sam', show: true }],
    ['oversay://notes/Caf%C3%A9%20plan/show/', { kind: 'note', name: 'Café plan', show: true }],
    ['oversay://notes/Standup?from=claude', { kind: 'note', name: 'Standup', show: false }],
    ['oversay://talks/Friday%20demo', { kind: 'talk', name: 'Friday demo', ready: false }],
    ['oversay://talks/Friday%20demo/ready', { kind: 'talk', name: 'Friday demo', ready: true }],
    ['oversay://decks', { kind: 'decks' }],
    ['oversay://decks/Stand-up%2023%20Oct', { kind: 'deck', name: 'Stand-up 23 Oct', show: false }],
    ['oversay://decks/Stand-up%2023%20Oct/show', { kind: 'deck', name: 'Stand-up 23 Oct', show: true }],
  ])('%s', (url, link) => {
    expect(parseLink(url)).toEqual(link)
  })

  it.each([
    'https://oversay.app/notes',
    'oversay://projects/Spring',
    'oversay://talks',
    'oversay://decks/..',
    'oversay://decks/Standup/ready',
    'oversay://decks/a%2Fb/show',
    'oversay://notes/..',
    'oversay://notes/%2E%2E',
    'oversay://notes/..%2F..%2Fsecret',
    'oversay://notes/a%5Cb',
    'oversay://notes/%20',
    'oversay://notes/x%00y',
    'oversay://notes/%E0%A4%A',
    'oversay://notes/Standup/delete',
    'oversay://talks/Demo/start',
    'oversay://notes/Standup/show/now',
  ])('refuses %s', (url) => {
    expect(parseLink(url)).toHaveProperty('problem')
  })

  it('finds a file by its exact name, or the only one matching ignoring case', () => {
    const files = [{ name: 'Standup' }, { name: 'standup' }, { name: 'Board prep' }]
    expect(findByName(files, 'standup')).toBe(files[1])
    expect(findByName(files, 'STANDUP')).toBeNull()
    expect(findByName(files, 'board PREP')).toBe(files[2])
    expect(findByName(files, 'Nothing')).toBeNull()
  })

  it('asks unless told otherwise', () => {
    expect(parseLinkPermission('allow')).toBe('allow')
    expect(parseLinkPermission('never')).toBe('never')
    expect(parseLinkPermission(undefined)).toBe('ask')
    expect(parseLinkPermission('yes')).toBe('ask')
  })
})

describe('a link to a deck', () => {
  const decks = [
    { id: 'd_aaaaaaaa', name: 'Weekly standup', folder: 'Weekly standup' },
    { id: 'd_bbbbbbbb', name: '1:1 with Priya', folder: '11 with Priya' },
  ]

  it('finds it by its id, which outlives a rename', () => {
    expect(parseLink('oversay://decks/d_bbbbbbbb/show')).toEqual({ kind: 'deck', name: 'd_bbbbbbbb', show: true })
    expect(findDeckFor(decks, 'd_bbbbbbbb')).toBe(decks[1])
    expect(findDeckFor(decks, 'd_cccccccc')).toBeNull()
  })

  it('still finds it by its name: its title, else its folder’s name', () => {
    expect(findDeckFor(decks, 'weekly standup')).toBe(decks[0])
    expect(findDeckFor(decks, '1:1 with Priya')).toBe(decks[1])
    expect(findDeckFor(decks, '11 with Priya')).toBe(decks[1])
    expect(findDeckFor(decks, 'Retro')).toBeNull()
  })
})
