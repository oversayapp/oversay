import { describe, expect, it } from 'vitest'
import { WORKSPACES_CHANGED_EVENT } from './store'

describe('workspaces store', () => {
  it('listens for the event workspaces.rs sends', () => {
    expect(WORKSPACES_CHANGED_EVENT).toBe('workspaces-changed')
  })
})
