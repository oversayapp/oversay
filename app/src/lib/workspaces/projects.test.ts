import { describe, expect, it } from 'vitest'
import { planProjectMove } from './projects'
import type { Workspace } from './workspaces'

const atlas: Workspace = { id: 'w_atlas001', name: 'Atlas', folder: 'Atlas', tags: [], decks: ['d_old00001'], when: '', where: '', notes: '', problem: null }

describe("a deck's project line becomes a workspace", () => {
  it('adds each deck to the workspace of its project, making the ones not there, tagged projects', () => {
    const plan = planProjectMove(
      [
        { id: 'd_standup1', project: 'atlas' },
        { id: 'd_board001', project: 'Beacon' },
        { id: 'd_review01', project: 'Atlas ' },
        { id: 'd_none0001', project: '' },
        { id: 'd_old00001', project: 'Atlas' },
      ],
      [atlas],
    )
    expect(plan).toEqual({
      waiting: false,
      moves: [
        { name: 'Atlas', tag: 'projects', existing: 'w_atlas001', decks: ['d_old00001', 'd_standup1', 'd_review01'] },
        { name: 'Beacon', tag: 'projects', existing: null, decks: ['d_board001'] },
      ],
    })
  })

  it('waits for a deck without an id', () => {
    const plan = planProjectMove([{ id: '', project: 'Atlas' }, { id: 'd_standup1', project: 'Atlas' }], [])
    expect(plan.waiting).toBe(true)
    expect(plan.moves).toEqual([{ name: 'Atlas', tag: 'projects', existing: null, decks: ['d_standup1'] }])
  })

  it('has nothing to do without project lines', () => {
    expect(planProjectMove([{ id: 'd_standup1', project: '' }], [])).toEqual({ moves: [], waiting: false })
  })
})
