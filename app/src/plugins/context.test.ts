import { get } from 'svelte/store'
import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []
let savedLook: unknown = null
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => {
    calls.push(cmd)
    if (cmd === 'state_get' && savedLook) return { version: 1, value: savedLook }
    return null
  },
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }))
vi.mock('../lib/log', () => ({ logAction: () => {}, logProblem: () => {} }))

const { createPluginContext, SETTINGS_WAIT_MS } = await import('./context')

describe('plugin context', () => {
  it('gives plugins the session and the commands that drive it', async () => {
    const ctx = createPluginContext()
    expect(get(ctx.session)).toBeNull()
    ctx.commands.next()
    ctx.commands.previous()
    ctx.commands.end()
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(expect.arrayContaining(['session_next', 'session_previous', 'session_end']))
  })

  it('gives plugins the overlay settings, with the defaults until the manager sends them', () => {
    expect(get(createPluginContext().settings)).toEqual({ opacity: 75, solid: false, panel: 'dark', deckView: 'card' })
  })

  it('is ready as soon as the saved look arrives, with that look', async () => {
    savedLook = { panel: 'light', opacity: 60 }
    try {
      vi.useFakeTimers()
      const ctx = createPluginContext()
      await vi.advanceTimersByTimeAsync(1)
      await ctx.ready
      expect(get(ctx.settings)).toMatchObject({ panel: 'light', opacity: 60 })
    } finally {
      savedLook = null
      vi.useRealTimers()
    }
  })

  it('is ready once the look has arrived, or after a short wait when none was sent', async () => {
    vi.useFakeTimers()
    try {
      let settled = false
      void createPluginContext().ready.then(() => (settled = true))
      await vi.advanceTimersByTimeAsync(SETTINGS_WAIT_MS - 1)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(2)
      expect(settled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
