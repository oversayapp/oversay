import { describe, expect, it } from 'vitest'
import {
  openedLabel,
  parseWorkspaceNav,
  RECENT_KEPT,
  retagged,
  sidebarTags,
  tagColour,
  TAG_COLOURS,
  withNewTag,
  withOpened,
  withoutWorkspace,
  withPin,
  withPinOrder,
  withTagChanged,
  workspacesAt,
} from './navigation'
import type { Workspace } from './workspaces'

const ws = (id: string, name: string, tags: string[] = [], when = ''): Workspace => ({ id, name, folder: name, tags, decks: [], when, where: '', notes: '', problem: null })
const ALL = [ws('w_a', 'Atlas', ['projects'], '2026-11-12'), ws('w_b', 'Beacon', ['projects'], '2026-11-03'), ws('w_c', 'Comet'), ws('w_p', 'Prompt injection', ['research', 'Talks'])]
const nav = (over = {}) => ({ ...parseWorkspaceNav(undefined), ...over })

describe('parseWorkspaceNav', () => {
  it('starts on All, by date, with nothing pinned', () => {
    expect(parseWorkspaceNav(null)).toEqual({ pins: [], opened: [], colours: {}, tags: [], place: 'all', sort: 'date' })
  })

  it('keeps what it knows and drops the rest', () => {
    const read = parseWorkspaceNav({
      pins: [{ id: 'w_a', at: '2026-10-27T10:00:00Z' }, { id: 3 }, { id: '', at: 'x' }],
      opened: 'no',
      colours: { research: 'purple', talks: 'gold' },
      tags: ['drafts', 7, ' '],
      place: 'tag:research',
      sort: 'size',
    })
    expect(read).toEqual({ pins: [{ id: 'w_a', at: '2026-10-27T10:00:00Z' }], opened: [], colours: { research: 'purple' }, tags: ['Drafts'], place: 'tag:Research', sort: 'date' })
    expect(parseWorkspaceNav({ place: 'tag:' }).place).toBe('all')
  })
})

describe('pins and Recent', () => {
  it('pins first and unpins', () => {
    const once = withPin(nav(), 'w_a', true, '1')
    const twice = withPin(once, 'w_b', true, '2')
    expect(twice.pins.map((p) => p.id)).toEqual(['w_b', 'w_a'])
    expect(withPin(twice, 'w_b', false, '3').pins.map((p) => p.id)).toEqual(['w_a'])
  })

  it('reorders the pins as dragged', () => {
    const n = nav({ pins: [{ id: 'w_a', at: '1' }, { id: 'w_b', at: '2' }, { id: 'w_c', at: '3' }] })
    expect(withPinOrder(n, ['w_c', 'w_a']).pins.map((p) => p.id)).toEqual(['w_c', 'w_a', 'w_b'])
  })

  it('puts the one opened first, once, and keeps a few', () => {
    let n = nav()
    for (let i = 0; i < RECENT_KEPT + 3; i++) n = withOpened(n, `w_${i}`, String(i))
    n = withOpened(n, 'w_5', 'again')
    expect(n.opened).toHaveLength(RECENT_KEPT)
    expect(n.opened[0]).toEqual({ id: 'w_5', at: 'again' })
    expect(n.opened.filter((o) => o.id === 'w_5')).toHaveLength(1)
  })

  it('forgets a workspace that has gone', () => {
    const n = withoutWorkspace(nav({ pins: [{ id: 'w_a', at: '1' }], opened: [{ id: 'w_a', at: '1' }, { id: 'w_b', at: '1' }] }), 'w_a')
    expect(n.pins).toEqual([])
    expect(n.opened.map((o) => o.id)).toEqual(['w_b'])
  })
})

describe('tags', () => {
  it('lists the tags in use and those made with +, sorted', () => {
    expect(sidebarTags(ALL, nav({ tags: ['drafts', 'PROJECTS'] }))).toEqual(['drafts', 'projects', 'research', 'Talks'])
  })

  it('makes a tag once and goes to it', () => {
    const n = withNewTag(withNewTag(nav(), ' drafts '), 'Drafts')
    expect(n.tags).toEqual(['Drafts'])
    expect(n.place).toBe('tag:Drafts')
  })

  it('renames, merges or takes off a tag on a workspace', () => {
    expect(retagged(['research', 'talks'], 'Research', 'study')).toEqual(['study', 'talks'])
    expect(retagged(['research', 'talks'], 'research', 'Talks')).toEqual(['Talks'])
    expect(retagged(['research', 'talks'], 'research', null)).toEqual(['talks'])
  })

  it('carries the colour and the sidebar with a renamed tag, and drops them for a deleted one', () => {
    const n = nav({ colours: { research: 'red' }, tags: ['research'], place: 'tag:research' })
    expect(withTagChanged(n, 'research', 'study')).toMatchObject({ colours: { study: 'red' }, tags: ['study'], place: 'tag:study' })
    expect(withTagChanged(n, 'research', null)).toMatchObject({ colours: {}, tags: [], place: 'all' })
    expect(withTagChanged(nav({ colours: { research: 'red', talks: 'teal' } }), 'research', 'talks').colours).toEqual({ talks: 'teal' })
  })

  it('gives a tag the colour chosen, else the same one from its name every time', () => {
    expect(tagColour(nav({ colours: { research: 'red' } }), 'Research')).toBe('red')
    const picked = tagColour(nav(), 'tutorials')
    expect(TAG_COLOURS).toContain(picked)
    expect(tagColour(nav(), 'Tutorials')).toBe(picked)
  })
})

describe('workspacesAt', () => {
  it('lists Pinned and Recent in their own order, skipping any gone', () => {
    const n = nav({ pins: [{ id: 'w_c', at: '' }, { id: 'w_gone', at: '' }, { id: 'w_a', at: '' }], opened: [{ id: 'w_b', at: '' }, { id: 'w_p', at: '' }] })
    expect(workspacesAt(ALL, n, 'pinned').map((w) => w.name)).toEqual(['Comet', 'Atlas'])
    expect(workspacesAt(ALL, n, 'recent').map((w) => w.name)).toEqual(['Beacon', 'Prompt injection'])
  })

  it('lists a tag (ignoring case), Untagged and All, sorted as chosen', () => {
    expect(workspacesAt(ALL, nav(), 'tag:talks').map((w) => w.name)).toEqual(['Prompt injection'])
    expect(workspacesAt(ALL, nav(), 'untagged').map((w) => w.name)).toEqual(['Comet'])
    expect(workspacesAt(ALL, nav({ place: 'tag:projects' })).map((w) => w.name)).toEqual(['Atlas', 'Beacon'])
    expect(workspacesAt(ALL, nav({ sort: 'name' }), 'all').map((w) => w.name)).toEqual(['Atlas', 'Beacon', 'Comet', 'Prompt injection'])
    const opened = nav({ sort: 'opened', opened: [{ id: 'w_c', at: '' }, { id: 'w_b', at: '' }] })
    expect(workspacesAt(ALL, opened, 'all').map((w) => w.name)).toEqual(['Comet', 'Beacon', 'Atlas', 'Prompt injection'])
  })
})

describe('openedLabel', () => {
  const now = new Date(2026, 9, 27, 15, 0).getTime()
  const ago = (ms: number) => new Date(now - ms).toISOString()
  it('says when, in words', () => {
    expect(openedLabel(ago(20_000), now)).toBe('just now')
    expect(openedLabel(ago(5 * 60_000), now)).toBe('5 min ago')
    expect(openedLabel(ago(3 * 3600_000), now)).toBe('today')
    expect(openedLabel(new Date(2026, 9, 26, 22, 0).toISOString(), now)).toBe('yesterday')
    expect(openedLabel(new Date(2026, 9, 24, 9, 0).toISOString(), now)).toBe('3 days ago')
    expect(openedLabel(new Date(2026, 9, 18, 9, 0).toISOString(), now)).toBe('last week')
    expect(openedLabel('nonsense', now)).toBe('')
  })
})
