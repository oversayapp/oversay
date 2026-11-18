import { describe, expect, it } from 'vitest'
import { commandsFor, type CommandContext } from './commands'

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({ query: '', making: false, deck: null, workspaces: [], ...over })
const labels = (c: CommandContext) => commandsFor(c).map((x) => x.label)

describe('the command bar, clicked into with nothing typed', () => {
  it('lists what you can do, so there is something to pick', () => {
    expect(commandsFor(ctx()).map((c) => c.kind)).toEqual(['blank-deck', 'deck-from-template', 'new-workspace'])
  })

  it('on an open deck, also Show and Add to / Take out of its workspaces', () => {
    const deck = { name: 'Stand-up', id: 'd_a', canShow: true, inWorkspaces: [{ id: 'w_a', name: 'Atlas' }] }
    const all = commandsFor(ctx({ deck, workspaces: [{ id: 'w_a', name: 'Atlas' }, { id: 'w_b', name: 'Bees' }] })).map((c) => c.label)
    expect(all).toEqual(['New deck', 'Deck from a template…', 'New workspace', 'Show “Stand-up”', 'Take out of Atlas', 'Add to Bees'])
  })
})

describe('the command bar: making things', () => {
  it('opened by + New with nothing typed, lists what you can make', () => {
    expect(commandsFor(ctx({ making: true })).map((c) => c.kind)).toEqual(['blank-deck', 'deck-from-template', 'new-workspace'])
    expect(labels(ctx({ making: true }))).toEqual(['Blank deck', 'Deck from a template…', 'Workspace…'])
  })

  it('opened by + New, what you type names the new deck or workspace', () => {
    const c = commandsFor(ctx({ making: true, query: ' Retro ' }))
    expect(c.map((x) => x.label)).toEqual(['New deck “Retro”', 'Deck from a template…', 'New workspace “Retro”'])
    expect(c[0].name).toBe('Retro')
    expect(c[2].name).toBe('Retro')
  })

  it('typed in the plain bar, "new deck Retro" and "new workspace Retro" make one by that name', () => {
    expect(commandsFor(ctx({ query: 'new deck Retro' }))[0]).toMatchObject({ kind: 'blank-deck', name: 'Retro' })
    expect(commandsFor(ctx({ query: 'New workspace Q1 plan' }))[0]).toMatchObject({ kind: 'new-workspace', name: 'Q1 plan' })
  })

  it('"new" alone offers the three, and a word of one finds it', () => {
    expect(commandsFor(ctx({ query: 'new' })).map((c) => c.kind)).toEqual(['blank-deck', 'deck-from-template', 'new-workspace'])
    expect(commandsFor(ctx({ query: 'templ' })).map((c) => c.kind)).toEqual(['deck-from-template'])
    expect(commandsFor(ctx({ query: 'zzz' }))).toEqual([])
  })
})

describe('the command bar: on an open deck', () => {
  const deck = { name: 'Stand-up', id: 'd_1', canShow: true, inWorkspaces: [{ id: 'w_a', name: 'Atlas' }] }
  const workspaces = [{ id: 'w_a', name: 'Atlas' }, { id: 'w_b', name: 'Beacon' }]

  it('shows the deck, adds it to a workspace it is not in, and takes it out of one it is in', () => {
    expect(labels(ctx({ deck, workspaces, query: 'show' }))).toEqual(['Show “Stand-up”'])
    expect(labels(ctx({ deck, workspaces, query: 'add' }))).toEqual(['Add to Beacon'])
    expect(labels(ctx({ deck, workspaces, query: 'take' }))).toEqual(['Take out of Atlas'])
    expect(commandsFor(ctx({ deck, workspaces, query: 'add' }))[0]).toMatchObject({ kind: 'add-to', workspace: 'w_b' })
  })

  it('does not offer Show for a deck with no cards, and offers nothing without a deck open', () => {
    expect(labels(ctx({ deck: { ...deck, canShow: false }, workspaces, query: 'show' }))).toEqual([])
    expect(labels(ctx({ workspaces, query: 'add' }))).toEqual([])
  })

  it('a workspace name finds its add or take-out', () => {
    expect(labels(ctx({ deck, workspaces, query: 'beacon' }))).toEqual(['Add to Beacon'])
  })
})
